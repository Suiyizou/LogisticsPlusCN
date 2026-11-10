import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {requestFingerprint, updateProgress, settleUnfinished} from '../src/service/job-state.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, predicate, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await delay(40);
  }
  throw new Error('isolated test timed out');
}

test('unfinished states settle without erasing collected results', () => {
  const job = {finished_at:'2026-11-03T10:00:00Z',items:[
    {status:'done',result:{}},{status:'human_required',result:{}},{status:'running'},{status:'pending'},
  ]};
  settleUnfinished(job,'failed','browser stopped');
  assert.deepEqual(job.items.map(item => item.status),['done','human_required','failed','cancelled']);
  assert.deepEqual(updateProgress(job),{done:1,failed:2,cancelled:1,settled:4,total:4});
  assert.equal(requestFingerprint([{carrier:'COSCO',reference:'A'}],'x',null),
    requestFingerprint([{reference:'A',carrier:'COSCO'}],'x',null));
});

test('isolated HTTP service: realtime, durable idempotency, restart, canonical results, cancellation', {timeout: 30000}, async () => {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(),'shipping-service-test-'));
  const callsFile = path.join(testDir,'calls.txt');
  const dataDir = path.join(testDir,'data');
  await fs.writeFile(callsFile,'');
  const seed = {
    id:'resume-fixture', status:'running', created_at:'2026-11-03T09:00:00Z', source:'isolated fixture',
    items:[
      {carrier:'COSCO',reference:'COSU_DONE',status:'done',result:{carrier:'COSCO',reference:'COSU_DONE',status:'QUERY_COMPLETED',containers:[],evidence:{}}},
      {carrier:'WAN_HAI',reference:'WHLC_HUMAN',status:'human_required',result:{carrier:'WAN_HAI',reference:'WHLC_HUMAN',status:'HUMAN_REQUIRED',containers:[],evidence:{}}},
      {carrier:'COSCO',reference:'COSU_RESUME',status:'running'},
    ],
  };
  await fs.mkdir(path.join(dataDir,seed.id),{recursive:true});
  await fs.writeFile(path.join(dataDir,seed.id,'job.json'),JSON.stringify(seed));
  const probe = net.createServer();
  probe.listen(0,'127.0.0.1'); await once(probe,'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const token = 'isolated-test-token';
  const base = 'http://127.0.0.1:' + port;
  const headers = {Authorization:'Bearer ' + token,'Content-Type':'application/json'};
  const get = async route => (await fetch(base + route,{headers})).json();
  const post = async (route,body,key) => {
    const response = await fetch(base + route,{method:'POST',headers:{...headers,...(key ? {'Idempotency-Key':key} : {})},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json(),headers:response.headers};
  };
  const loader = new URL('./service-fixtures-loader.mjs',import.meta.url).href;
  const registration = 'data:text/javascript,' + encodeURIComponent('import {register} from "node:module"; register(' + JSON.stringify(loader) + ');');
  let child, errors = '', streamAbort, streamRead, callbackServer;
  const start = async () => {
    child = spawn(process.execPath,['--import',registration,'scripts/serve-track.mjs'],{
      cwd:root,windowsHide:true,stdio:['ignore','ignore','pipe'],
      env:{...process.env,PORT:String(port),DATA_DIR:dataDir,TOKEN:token,TRACK_TOKEN:token,
        CDP_ENDPOINT:'ws://isolated-test.invalid',RETRY:'0',WEBHOOK_TIMEOUT_MS:'250',SERVICE_TEST_CALLS:callsFile},
    });
    child.stderr.on('data',data => {errors += data;});
    await until(async () => {try {return await get('/health');} catch {return null;}},value => value?.ok);
  };
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    const exit = once(child,'exit'); child.kill(); await exit;
  };
  try {
    await start();
    const resumed = await until(() => get('/jobs/resume-fixture'),job => job.status === 'completed_with_gaps');
    assert.deepEqual(resumed.items.map(item => item.status),['done','human_required','done']);
    assert.deepEqual((await fs.readFile(callsFile,'utf8')).trim().split('\n'),['COSU_RESUME']);
    assert.equal((await fetch(base + '/events')).status,401);
    streamAbort = new AbortController();
    const stream = await fetch(base + '/events',{headers,signal:streamAbort.signal});
    assert.equal(stream.headers.get('x-accel-buffering'),'no');
    const events = [];
    streamRead = (async () => {
      const decoder = new TextDecoder(); let buffer = '';
      for await (const bytes of stream.body) {
        buffer += decoder.decode(bytes,{stream:true});
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0,end); buffer = buffer.slice(end+2);
          const event = /^event: (.+)$/m.exec(frame)?.[1];
          const data = /^data: (.+)$/m.exec(frame)?.[1];
          if (event && data) events.push({event,data:JSON.parse(data)});
        }
      }
    })().catch(error => {if (!streamAbort.signal.aborted) throw error;});
    await until(() => events,values => values.some(value => value.event === 'worker'));
    const hello = events.find(value => value.event === 'worker').data;
    assert.equal(hello.worker.status,'idle'); assert.ok(hello.worker.id); assert.ok(hello.worker.started_at);
    const body = {source:'test-idempotency',items:[{carrier:'COSCO',reference:'COSU_IDEMPOTENT'}]};
    const [first,duplicate] = await Promise.all([post('/jobs',body,'fixture-key'),post('/jobs',body,'fixture-key')]);
    assert.equal(first.status,202); assert.equal(duplicate.status,202); assert.equal(first.body.job_id,duplicate.body.job_id);
    assert.ok(first.body.reused || duplicate.body.reused);
    const id = first.body.job_id;
    assert.equal((await post('/jobs',{...body,source:'changed'},'fixture-key')).status,409);
    await until(() => get('/jobs/'+id),job => job.status === 'completed');
    await until(() => events,values => values.some(value => value.event === 'job' && value.data.job_id === id && value.data.phase === 'extracting'));
    assert.ok(events.some(value => value.event === 'worker' && value.data.worker.active_job_id === id));
    const resultResponse = await fetch(base + '/jobs/'+id+'/result',{headers});
    const result = await resultResponse.json();
    assert.equal(result.schema,'tracking.v1'); assert.equal(result.batch.partial,false); assert.equal(result.shipments.length,1);
    const ndjson = await (await fetch(base + '/jobs/'+id+'/result.ndjson',{headers})).text();
    assert.deepEqual(JSON.parse(ndjson.trim()),result.shipments[0]);
    assert.equal((await fetch(base + '/jobs/'+id+'/result',{headers:{...headers,'If-None-Match':resultResponse.headers.get('etag')}})).status,304);
    const terminalStream = await (await fetch(base + '/jobs/'+id+'/events',{headers})).text();
    assert.match(terminalStream,/event: done/);
    // A leased box can have another carrier's prefix. Preserve the operator,
    // the full box number, and the declared type across persistence and retries.
    const typed = {items:[{carrier:'MAERSK',reference:'CSNU5895608',reference_type:'CONTAINER'}]};
    const boxJob = await post('/jobs',typed,'typed-box');
    assert.equal(boxJob.status,202);
    await until(() => get('/jobs/'+boxJob.body.job_id),job => job.status === 'completed');
    const box = (await get('/jobs/'+boxJob.body.job_id+'/result')).shipments[0];
    assert.equal(box.carrier.code,'MAERSK');
    assert.equal(box.query.reference_type,'CONTAINER');
    assert.equal(box.query.reference_submitted,'CSNU5895608');
    const changedType = {items:[{...typed.items[0],reference_type:'BOOKING'}]};
    assert.equal((await post('/jobs',changedType,'typed-box')).status,409);
    assert.equal((await post('/jobs',{items:[{...typed.items[0],reference:'bad-box'}]})).status,400);
    // Callback that never responds must time out without holding the browser queue.
    callbackServer = http.createServer((req,res) => {req.resume();});
    callbackServer.listen(0,'127.0.0.1'); await once(callbackServer,'listening');
    const callback = await post('/jobs',{source:'callback',callback_url:'http://127.0.0.1:'+callbackServer.address().port+'/receive',items:[{carrier:'COSCO',reference:'COSU_CALLBACK'}]});
    const next = await post('/jobs',{source:'after-callback',items:[{carrier:'COSCO',reference:'COSU_AFTER_CALLBACK'}]});
    await until(() => get('/jobs/'+next.body.job_id),job => job.status === 'completed');
    const delivery = await until(() => get('/jobs/'+callback.body.job_id),job => job.webhook);
    assert.equal(delivery.webhook.ok,false);
    const crashed = await post('/jobs',{items:[{carrier:'COSCO',reference:'COSU_CRASH'},{carrier:'COSCO',reference:'COSU_NOT_RUN'}]});
    const failure = await until(() => get('/jobs/'+crashed.body.job_id),job => job.status === 'failed');
    assert.deepEqual(failure.items.map(item => item.status),['failed','cancelled']);
    assert.equal(failure.snapshot.batch.partial,true); assert.equal(failure.progress.settled,2);
    const slow = await post('/jobs',{items:[{carrier:'COSCO',reference:'COSU_SLOW_CANCEL'},{carrier:'COSCO',reference:'COSU_CANCELLED'}]});
    await until(() => get('/jobs/'+slow.body.job_id),job => job.items[0].status === 'running');
    assert.equal((await post('/jobs/'+slow.body.job_id+'/cancel',{})).status,200);
    const cancelled = await until(() => get('/jobs/'+slow.body.job_id),job => job.status === 'cancelled');
    assert.deepEqual(cancelled.items.map(item => item.status),['done','cancelled']);
    assert.equal(cancelled.snapshot.batch.partial,true); assert.ok(cancelled.items[1].finished_at);
    await until(() => events,values => values.filter(value => value.event === 'worker').length >= 3,6000);
    streamAbort.abort(); await streamRead; streamRead = null;
    await stop(); await start();
    const afterRestart = await post('/jobs',body,'fixture-key');
    assert.equal(afterRestart.body.job_id,id); assert.equal(afterRestart.body.reused,true);
    const calls = (await fs.readFile(callsFile,'utf8')).trim().split('\n');
    assert.equal(calls.filter(ref => ref === 'COSU_IDEMPOTENT').length,1);
    assert.ok(!calls.includes('COSU_NOT_RUN')); assert.ok(!calls.includes('COSU_CANCELLED')); assert.ok(!calls.includes('WHLC_HUMAN'));
    assert.equal(errors,'');
  } finally {
    streamAbort?.abort(); if (streamRead) await streamRead;
    await stop(); callbackServer?.closeAllConnections(); callbackServer?.close();
    const resolved = path.resolve(testDir);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('shipping-service-test-')) throw new Error('unexpected test cleanup path');
    await fs.rm(resolved,{recursive:true,force:true});
  }
});
