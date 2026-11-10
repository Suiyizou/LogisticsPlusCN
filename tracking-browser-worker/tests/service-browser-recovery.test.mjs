import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {isClosedBrowserPageError} from '../src/service/chrome-lifecycle.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const delay=ms => new Promise(resolve => setTimeout(resolve,ms));
async function until(read,predicate) {
  const deadline=Date.now()+8000;
  while(Date.now()<deadline) {
    const result=await read();
    if(predicate(result)) return result;
    await delay(30);
  }
  throw new Error('recovery fixture timed out');
}

test('only closed-browser page creation errors qualify for one reconnect', () => {
  for(const message of [
    'browserContext.newPage: Protocol error (Target.createTarget): Failed to open a new tab',
    'browserContext.newPage: Target page, context or browser has been closed',
    'context.newPage: Browser is not connected',
  ]) assert.equal(isClosedBrowserPageError(new Error(message)),true,message);
  for(const message of [
    'locator.fill: Target page, context or browser has been closed',
    'browserContext.newPage: invalid argument',
    'Timeout 30000ms exceeded waiting for searchbox',
    'HUMAN_CAPTCHA',
  ]) assert.equal(isClosedBrowserPageError(new Error(message)),false,message);
});

for(const fixture of [
  {name:'shared page recovers once',mode:'newpage-once',carrier:'COSCO',status:'completed',connects:2,pages:2,runs:[2]},
  {name:'adapter-owned page recovers once',mode:'newpage-once',carrier:'HAPAG_LLOYD',status:'completed',connects:2,pages:2,runs:[2]},
  {name:'second page failure stops recovery and settles remaining tickets',mode:'newpage-always',status:'failed',items:2,connects:2,pages:2,runs:[]},
  {name:'ordinary page creation errors propagate without recovery',mode:'unrelated',status:'failed',connects:1,pages:1,runs:[]},
  {name:'ordinary retry refreshes a disconnected context and page',mode:'retry-disconnect',status:'completed',retry:1,connects:2,pages:2,runs:[1,2]},
  {name:'next ticket refreshes a disconnected context and page',mode:'between-items',status:'completed',items:2,connects:2,pages:2,runs:[1,2]},
  {name:'CMA human verification uses its own page and never enters ordinary retries',mode:'human-required',carrier:'CMA_CGM',status:'completed_with_gaps',retry:2,connects:1,pages:1,runs:[1]},
  {name:'Hapag explicit missing document is terminal and its error code reaches both API views',mode:'reference-not-found',carrier:'HAPAG_LLOYD',status:'completed_with_gaps',retry:2,connects:1,pages:1,runs:[1]},
  {name:'Hapag incomplete automatic check is terminal without pretending human verification',mode:'query-incomplete',carrier:'HAPAG_LLOYD',status:'completed_with_gaps',retry:2,connects:1,pages:1,runs:[1]},
]) test(fixture.name,{timeout:15000},async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'shipping-recovery-test-'));
  const calls=path.join(dir,'calls.jsonl');
  await fs.writeFile(calls,'');
  const probe=net.createServer(); probe.listen(0,'127.0.0.1'); await once(probe,'listening');
  const port=probe.address().port; await new Promise(resolve => probe.close(resolve));
  const token='isolated-recovery-token';
  const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  const base='http://127.0.0.1:'+port;
  const loader=new URL('./service-browser-recovery-loader.mjs',import.meta.url).href;
  const registration='data:text/javascript,'+encodeURIComponent('import {register} from "node:module"; register('+JSON.stringify(loader)+');');
  let child,errors='';
  try {
    child=spawn(process.execPath,['--import',registration,'scripts/serve-track.mjs'],{
      cwd:root,windowsHide:true,stdio:['ignore','ignore','pipe'],
      env:{...process.env,PORT:String(port),DATA_DIR:path.join(dir,'data'),TOKEN:token,TRACK_TOKEN:token,
        CDP_ENDPOINT:'ws://isolated-test.invalid',RETRY:String(fixture.retry??0),
        SERVICE_TEST_CALLS:calls,SERVICE_TEST_BROWSER_MODE:fixture.mode},
    });
    child.stderr.on('data',data => {errors+=data;});
    const get=async route => (await fetch(base+route,{headers})).json();
    await until(async () => {try{return await get('/health');}catch{return null;}},value => value?.ok);
    const submitted=await (await fetch(base+'/jobs',{method:'POST',headers,body:JSON.stringify({items:
      Array.from({length:fixture.items??1},(_,index) => ({carrier:fixture.carrier??'COSCO',reference:'RECOVERY'+index})),
    })})).json();
    assert.ok(submitted.job_id);
    const result=await until(() => get('/jobs/'+submitted.job_id),job => ['completed','completed_with_gaps','failed'].includes(job.status));
    assert.equal(result.status,fixture.status);
    if(fixture.status==='failed') {
      assert.deepEqual(result.items.map(item => item.status),fixture.items===2 ? ['failed','cancelled'] : ['failed']);
      assert.equal(result.snapshot.batch.partial,true);
    }
    const events=(await fs.readFile(calls,'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    assert.equal(events.filter(event => event.type==='connect').length,fixture.connects);
    assert.equal(events.filter(event => event.type==='page').length,fixture.pages);
    const runs=events.filter(event => event.type==='run');
    assert.deepEqual(runs.map(event => event.generation),fixture.runs);
    for(const run of runs) assert.equal(run.pageGeneration,run.generation);
    if(fixture.mode==='human-required') {
      assert.equal(runs[0].ownsPage,true);
      assert.equal(result.items[0].status,'human_required');
      assert.equal(result.items[0].attempt,1);
    }
    if(['reference-not-found','query-incomplete'].includes(fixture.mode)) {
      const code=fixture.mode==='reference-not-found' ? 'CARRIER_REFERENCE_NOT_FOUND' : 'CARRIER_QUERY_INCOMPLETE';
      assert.equal(result.items[0].error_code,code);
      assert.equal(result.snapshot.shipments[0].query.error_code,code);
      assert.equal(result.items[0].attempt,1);
    }
    assert.equal(errors,'');
  } finally {
    if(child && child.exitCode===null) {const exit=once(child,'exit');child.kill();await exit;}
    const resolved=path.resolve(dir);
    if(path.dirname(resolved)!==path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('shipping-recovery-test-')) throw new Error('unexpected cleanup path');
    await fs.rm(resolved,{recursive:true,force:true});
  }
});
