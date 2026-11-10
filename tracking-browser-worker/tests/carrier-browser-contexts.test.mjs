import test from'node:test';import assert from'node:assert/strict';
import{createCarrierBrowserContexts}from'../src/service/carrier-browser-contexts.mjs';
function fixture(){let calls=0,defaults=0;const clients=[];const main={name:'main'};
const connect=async()=>{calls++;let live=true;const events=new Map(),context={name:'cma-'+calls};const client={context,isConnected:()=>live,contexts:()=>[context],on:(e,f)=>events.set(e,f),off:(e,f)=>{if(events.get(e)===f)events.delete(e);},close:async()=>{live=false;},disconnect:()=>{live=false;events.get('disconnected')?.();}};clients.push(client);return client;};
const factory=createCarrierBrowserContexts({ensureDefault:async()=>{defaults++;return main;},connect,cmaEndpoint:'http://127.0.0.1:19439'});return{factory,main,clients,counts:()=>({calls,defaults})};}
test('only configured CMA queries use the dedicated context and simultaneous acquisitions share one connection',async()=>{
 const f=fixture();const[a,b]=await Promise.all([f.factory.forCarrier('CMA_CGM'),f.factory.forCarrier('CMA_CGM')]);assert.equal(a,b);assert.equal(a.name,'cma-1');assert.equal(await f.factory.forCarrier('MATSON'),f.main);assert.deepEqual(f.counts(),{calls:1,defaults:1});
});
test('dedicated browser restart reconnects only CMA and retains the ordinary default connection',async()=>{
 const f=fixture();await f.factory.forCarrier('CMA_CGM');f.clients[0].disconnect();assert.equal((await f.factory.forCarrier('CMA_CGM')).name,'cma-2');assert.equal(await f.factory.forCarrier('HAPAG_LLOYD'),f.main);assert.deepEqual(f.counts(),{calls:2,defaults:1});
});
test('CMA invalidation releases its CDP client without invalidating another carrier context',async()=>{
 const f=fixture();await f.factory.forCarrier('CMA_CGM');assert.equal(await f.factory.invalidate('MATSON'),false);assert.equal(f.clients[0].isConnected(),true);assert.equal(await f.factory.invalidate('CMA_CGM'),true);assert.equal(f.clients[0].isConnected(),false);assert.equal((await f.factory.forCarrier('CMA_CGM')).name,'cma-2');
});
test('unavailable dedicated browser never falls back to the default route and omits native diagnostics',async()=>{
 let defaults=0;const f=createCarrierBrowserContexts({cmaEndpoint:'http://127.0.0.1:19439',ensureDefault:async()=>defaults++,connect:async()=>{throw Error('sensitive native endpoint diagnostic');}});
 await assert.rejects(f.forCarrier('CMA_CGM'),e=>e.code==='CMA_BROWSER_UNAVAILABLE'&&!e.message.includes('sensitive'));assert.equal(defaults,0);
});
test('an unset endpoint preserves the current shared browser for every carrier',async()=>{
 const main={};let calls=0;const f=createCarrierBrowserContexts({ensureDefault:async()=>main,connect:async()=>calls++});assert.equal(await f.forCarrier('CMA_CGM'),main);assert.equal(await f.forCarrier('MSC'),main);assert.equal(calls,0);
});
test('remote, credential-bearing, query and fragment endpoints are rejected before any connection',()=>{
 for(const endpoint of ['https://remote.example:9222','http://user:secret@127.0.0.1:9222','http://127.0.0.1:9222?secret=x','http://127.0.0.1:9222#secret'])assert.throws(()=>createCarrierBrowserContexts({cmaEndpoint:endpoint}));
});
