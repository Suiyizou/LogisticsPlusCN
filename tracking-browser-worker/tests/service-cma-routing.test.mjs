import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import path from'node:path';import os from'node:os';import net from'node:net';import{once}from'node:events';import{spawn}from'node:child_process';import{fileURLToPath}from'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const failed of[false,true])test('HTTP queue isolates CMA browser '+(failed?'failure and continues later carriers':'from the default carrier browser'),{timeout:20000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cma-routing-')),calls=path.join(dir,'calls.jsonl');await fs.writeFile(calls,'');
 const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
 const loader=new URL('./service-browser-recovery-loader.mjs',import.meta.url).href,registration='data:text/javascript,'+encodeURIComponent('import{register}from"node:module";register('+JSON.stringify(loader)+');');
 const child=spawn(process.execPath,['--import',registration,'scripts/serve-track.mjs'],{cwd:root,windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,PORT:String(port),DATA_DIR:path.join(dir,'data'),TOKEN:'fixture-only-token',TRACK_TOKEN:'fixture-only-token',RETRY:'0',CDP_ENDPOINT:'ws://default.fixture.invalid',CMA_CDP_ENDPOINT:'http://127.0.0.1:19439',SERVICE_TEST_CALLS:calls,SERVICE_TEST_BROWSER_MODE:failed?'cma-dedicated-failed':'cma-dedicated'}});
 let errors='';child.stderr.on('data',d=>errors+=d);const headers={Authorization:'Bearer fixture-only-token','Content-Type':'application/json'},base='http://127.0.0.1:'+port;
 const get=async url=>fetch(base+url,{headers}).then(r=>r.json());const until=async(fn,p)=>{for(let i=0;i<80;i++){let v;try{v=await fn();}catch{}if(v&&p(v))return v;if(child.exitCode!==null)throw Error('Fixture exited: '+errors);await new Promise(r=>setTimeout(r,75));}throw Error('Fixture timeout: '+errors);};
 try{
  await until(()=>get('/health'),v=>v.ok);
  const created=await fetch(base+'/jobs',{method:'POST',headers,body:JSON.stringify({items:[{carrier:'CMA_CGM',reference:'TJNTEST0001',reference_type:'BOOKING'},{carrier:'MATSON',reference:'MATSTEST0001',reference_type:'BILLOFLADING'}]})}).then(r=>r.json());assert.ok(created.job_id);
  const job=await until(()=>get('/jobs/'+created.job_id),v=>['completed','completed_with_gaps','failed'].includes(v.status));
  assert.deepEqual(job.items.map(i=>i.status),[failed?'failed':'done','done']);assert.equal(job.status,failed?'completed_with_gaps':'completed');
  const records=(await fs.readFile(calls,'utf8')).trim().split('\n').map(v=>JSON.parse(v)),connects=records.filter(v=>v.type==='connect');assert.deepEqual(connects.map(v=>v.route),['cma','default']);
  if(failed){const stored=JSON.parse(await fs.readFile(path.join(dir,'data',created.job_id,'job.json'),'utf8'));assert.equal(stored.items[0].result.browser_error_code,'CMA_BROWSER_UNAVAILABLE');assert.equal(JSON.stringify(stored).includes('sensitive native'),false);}
 }finally{if(child.exitCode===null){const exit=once(child,'exit');child.kill();await exit;}assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));await fs.rm(dir,{recursive:true,force:true});}
});
