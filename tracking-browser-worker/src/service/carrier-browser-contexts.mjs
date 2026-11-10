function unavailable(){return Object.assign(new Error('CMA 查询浏览器暂不可用，请稍后重试。'),{code:'CMA_BROWSER_UNAVAILABLE'});}

export function createCarrierBrowserContexts({ensureDefault,connect,cmaEndpoint=''}){
  const endpoint=String(cmaEndpoint).trim();
  if(endpoint){
    const url=new URL(endpoint);
    if(!['http:','https:','ws:','wss:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||
       !url.port||url.username||url.password||url.search||url.hash)throw new Error('CMA_CDP_ENDPOINT must name a dedicated local browser');
  }
  let browser=null,context=null,pending=null,generation=0,attempts=0,disconnectHandler=null;
  const selected=carrier=>carrier==='CMA_CGM'&&!!endpoint;
  async function dedicated(){
    if(browser?.isConnected()&&context)return context;
    if(pending)return pending;
    const epoch=generation;
    const task=(async()=>{
      attempts++;
      const connected=await connect(endpoint,{timeout:30000});
      const contexts=connected.contexts();
      if(contexts.length!==1||epoch!==generation){await connected.close?.().catch(()=>{});throw unavailable();}
      browser=connected;context=contexts[0];
      disconnectHandler=()=>{if(browser===connected){browser=null;context=null;}};
      connected.on('disconnected',disconnectHandler);return context;
    })();
    pending=task;
    try{return await task;}catch{throw unavailable();}finally{if(pending===task)pending=null;}
  }
  return {
    forCarrier:carrier=>selected(carrier)?dedicated():ensureDefault(),
    async invalidate(carrier){
      if(!selected(carrier))return false;
      generation++;const old=browser;browser=null;context=null;pending=null;
      if(old&&disconnectHandler)old.off?.('disconnected',disconnectHandler);
      // This releases this worker's CDP client, without managing a Chrome process.
      await old?.close?.().catch(()=>{});return true;
    },
    status:()=>({enabled:!!endpoint,connected:!!browser?.isConnected()&&!!context,connectionAttempts:attempts}),
  };
}
