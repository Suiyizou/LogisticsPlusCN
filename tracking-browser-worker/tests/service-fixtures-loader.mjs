// Loaded only by the isolated API test process. No real Chrome or carrier requests.
export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith('/scripts/serve-track.mjs')) {
    if (specifier === 'playwright') return {url: 'service-test:browser', shortCircuit: true};
    if (specifier.endsWith('/run-item.mjs')) return {url: 'service-test:runner', shortCircuit: true};
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === 'service-test:browser') return {format: 'module', shortCircuit: true, source: `
    const context = {pages: () => [], newPage: async () => ({close: async () => {}, isClosed: () => false})};
    export const chromium = {connectOverCDP: async () => ({isConnected: () => true, contexts: () => [context], on: () => {}})};
  `};
  if (url === 'service-test:runner') return {format: 'module', shortCircuit: true, source: `
    import fs from 'node:fs/promises';
    export async function runItem(input, options) {
      await fs.appendFile(process.env.SERVICE_TEST_CALLS, input.reference + '\\n');
      if (input.reference.includes('CRASH')) throw new Error('isolated runner failure');
      options.onProgress('waiting');
      await new Promise(resolve => setTimeout(resolve, input.reference.includes('SLOW') ? 500 : 80));
      options.onProgress('extracting');
      await new Promise(resolve => setTimeout(resolve, 20));
      options.onProgress('saving');
      return {...input, status:'QUERY_COMPLETED', strategy:'BROWSER', containers:['TEST1234567'],
        container_count:1, seconds:0.1, fields:{bill_of_lading:input.reference}, evidence:{}, events:[]};
    }
  `};
  return nextLoad(url, context);
}
