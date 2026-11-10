// Supplementary ordinary-page capture runs only after the overview succeeded.
// Errors here must never discard an already valid shipment overview.
const nonempty = value => value !== undefined && value !== null && value !== '';
const referenceKey = value => String(value ?? '').replace(/\s+/g, '').toUpperCase();

function mergeFields(before = {}, after = {}) {
  const result = {...before};
  for (const [key,value] of Object.entries(after)) {
    if (!nonempty(value)) continue;
    if (key === 'container_details' && Array.isArray(value)) {
      const byNumber = new Map((before.container_details ?? []).map(detail => [detail.number,{...detail}]));
      for (const detail of value) {
        if (!/^[A-Z]{4}\d{7}$/.test(detail?.number ?? '')) continue;
        byNumber.set(detail.number,{...(byNumber.get(detail.number) ?? {}),
          ...Object.fromEntries(Object.entries(detail).filter(([,item]) => nonempty(item)))});
      }
      result[key] = [...byNumber.values()];
    } else if (Array.isArray(value)) result[key] = [...new Set([...(before[key] ?? []),...value])];
    else result[key] = value;
  }
  return result;
}

export function overviewCapture(overview, url = null) {
  return {
    status:'overview_only',
    reason:'DETAIL_COLLECTOR_NOT_IMPLEMENTED',
    coverage:{scope:'overview',scope_complete:false,
      declared_containers:Number(overview.fields?.declared_containers) || null,
      overview_containers:[...(overview.containers ?? [])],detailed_containers:[],
      pending_containers:[...(overview.containers ?? [])]},
    sources:[{id:'overview',kind:'PAGE_TEXT',url}],
    errors:[],
  };
}

export async function captureSupplementaryDetails({collector,page,job,overview,url = null,artifactBase,budgetMs = 25000}) {
  let metadata = overviewCapture(overview,url);
  let latestResult;
  const fallback = () => latestResult ? {...latestResult,metadata} : {extraction:overview,metadata,artifacts:[]};
  if (typeof collector !== 'function') return fallback();
  const controller = new AbortController();
  const deadline = Date.now() + Math.max(1,budgetMs);
  let timer;
  const project = details => {
    if (!details || ![job.reference,job.submitted].some(ref => referenceKey(ref) && referenceKey(ref) === referenceKey(details.reference)))
      throw Object.assign(new Error('Supplementary data does not identify the current shipment'),{code:'DETAIL_REFERENCE_MISMATCH'});
    const extra = details.extraction ?? {};
    const beforeNumbers = overview.containers ?? [];
    const extraNumbers = extra.containers ?? [];
    if (!Array.isArray(extraNumbers) || extraNumbers.some(number => !/^[A-Z]{4}\d{7}$/.test(number)))
      throw Object.assign(new Error('Supplementary container identifiers are invalid'),{code:'DETAIL_INVALID_CONTAINERS'});
    const numbers = [...new Set([...beforeNumbers,...extraNumbers])];
    const detailed = [...new Set(details.coverage?.detailed_containers ?? [])];
    if (detailed.some(number => !numbers.includes(number)))
      throw Object.assign(new Error('Detail coverage contains a container outside the captured shipment'),{code:'DETAIL_COVERAGE_MISMATCH'});
    const pending = numbers.filter(number => !detailed.includes(number));
    const declared = Number(extra.fields?.declared_containers ?? overview.fields?.declared_containers) || null;
    const complete = details.coverage?.scope_complete === true && pending.length === 0 && !(details.errors?.length) &&
      numbers.length > 0 && (!declared || declared === numbers.length);
    const fields = mergeFields(overview.fields,extra.fields);
    const extraction = {...overview,fields,containers:numbers,container_count:declared ?? numbers.length,
      events:[...new Set([...(overview.events ?? []),...(extra.events ?? [])])],
      vessel_voyage:[...new Set([...(overview.vessel_voyage ?? []),...(extra.vessel_voyage ?? [])])]};
    const next = overviewCapture(overview,url);
    next.status = complete ? 'captured' : 'partial';
    next.reason = details.reason ?? (complete ? null : 'DETAIL_SCOPE_INCOMPLETE');
    next.coverage = {scope:details.coverage?.scope ?? 'visible_container_details',scope_complete:complete,
      declared_containers:declared,overview_containers:[...beforeNumbers],
      detailed_containers:detailed,pending_containers:pending};
    next.sources.push(...(details.sources ?? []).map(source => ({id:source.id,kind:source.kind,url:source.url ?? null})));
    next.errors.push(...(details.errors ?? []).map(error => ({code:error.code ?? 'DETAIL_FAILED',message:String(error.message ?? '').slice(0,240)})));
    if (details.pdf) next.pdf = details.pdf.map(item => ({container:item.container,state:item.state,parsed:item.parsed === true}));
    // Kept outside evidence: the HTTP service publishes every evidence entry.
    return {extraction,metadata:next,artifacts:details.artifacts ?? []};
  };
  try {
    const timeout = new Promise((_,reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(Object.assign(new Error('Supplementary detail capture exceeded its time budget'),{code:'DETAIL_TIMEOUT'}));
      },Math.max(1,budgetMs));
    });
    // Each collector must bound ordinary Playwright actions with remaining().
    // onPartial preserves each already captured box if a later box times out.
    const details = await Promise.race([
      Promise.resolve().then(() => collector({page,job,overview:structuredClone(overview),
        artifactBase,signal:controller.signal,remaining:() => Math.max(0,deadline-Date.now()),
        onPartial:partial => {if (!controller.signal.aborted) latestResult = project(structuredClone(partial));}})),
      timeout,
    ]);
    return project(details);
  } catch (error) {
    controller.abort();
    if (latestResult) metadata = latestResult.metadata;
    metadata.status = 'partial';
    metadata.reason = error.code ?? 'DETAIL_CAPTURE_FAILED';
    metadata.coverage.scope_complete = false;
    metadata.errors.push({code:metadata.reason,message:String(error.message ?? error).slice(0,240)});
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}
