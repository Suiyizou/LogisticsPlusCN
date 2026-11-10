// Isolated recovery fixtures: no real browser, helper process or carrier access.
export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith('/scripts/serve-track.mjs')) {
    if (specifier === 'playwright') return {url:'recovery-test:browser',shortCircuit:true};
    if (specifier.endsWith('/run-item.mjs')) return {url:'recovery-test:runner',shortCircuit:true};
  }
  return nextResolve(specifier,context);
}

export async function load(url, context, nextLoad) {
  if (url === 'recovery-test:browser') return {format:'module',shortCircuit:true,source:`
    import fs from 'node:fs/promises';
    const state = globalThis.__recoveryFixture = {
      connects:0, pages:0, runs:0, mode:process.env.SERVICE_TEST_BROWSER_MODE,
      log:async value => fs.appendFile(process.env.SERVICE_TEST_CALLS,JSON.stringify(value)+'\\n'),
    };
    export const chromium = {connectOverCDP:async endpoint => {
      const generation = ++state.connects;
      const route=String(endpoint).includes('19439')?'cma':'default';
      if(state.mode==='cma-dedicated-failed'&&route==='cma'){
        await state.log({type:'connect',generation,route,failed:true});throw new Error('sensitive native connection diagnostic');
      }
      let connected = true;
      const listeners = [];
      const context = {
        generation, route, pages:() => [],
        disconnect() {connected=false; for (const listener of listeners) listener();},
        newPage:async () => {
          state.pages++;
          await state.log({type:'page',generation});
          if (state.mode==='newpage-always' || (state.mode==='newpage-once' && state.pages===1))
            throw new Error('browserContext.newPage: Protocol error (Target.createTarget): Failed to open a new tab');
          if (state.mode==='unrelated') throw new Error('browserContext.newPage: invalid fixture argument');
          return {generation,close:async () => {},isClosed:() => !connected};
        },
      };
      await state.log({type:'connect',generation,route});
      return {isConnected:() => connected,contexts:() => [context],on:(event,listener) => listeners.push(listener)};
    }};
  `};
  if (url === 'recovery-test:runner') return {format:'module',shortCircuit:true,source:`
    export async function runItem(input,options) {
      const state=globalThis.__recoveryFixture;
      if(state.mode.startsWith('cma-dedicated')&&options.context.route!==(input.carrier==='CMA_CGM'?'cma':'default'))throw new Error('carrier browser route mismatch');
      const page=options.page ?? await options.context.newPage();
      state.runs++;
      await state.log({type:'run',generation:options.context.generation,pageGeneration:page.generation,ownsPage:!options.page});
      if (state.runs===1 && ['retry-disconnect','between-items'].includes(state.mode)) options.context.disconnect();
      const terminal = state.mode==='reference-not-found' ? {status:'NO_BUSINESS_DATA',error_code:'CARRIER_REFERENCE_NOT_FOUND'} :
        state.mode==='query-incomplete' ? {status:'FAILED',error_code:'CARRIER_QUERY_INCOMPLETE'} : {};
      return {...input,status:state.mode==='human-required' ? 'HUMAN_REQUIRED' : state.mode==='retry-disconnect' && state.runs===1 ? 'FAILED' : 'QUERY_COMPLETED',...terminal,
        strategy:'BROWSER',containers:['TEST1234567'],container_count:1,seconds:0.1,
        fields:{bill_of_lading:input.reference},evidence:{},events:[]};
    }
  `};
  return nextLoad(url,context);
}
