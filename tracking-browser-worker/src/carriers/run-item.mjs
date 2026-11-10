// 单条提单查询的执行单元
//
// 从 scripts/track.mjs 抽出来，供 CLI 与队列服务共用：
//   · 队列可使用 ONE 接口，CSV CLI 显式使用浏览器
//   · 其余走浏览器自动化（调用方传入已连接的 browser context）
//
// 返回一条「原始抽取记录」（registry.toRecord 产物）；
// 统一结构（tracking.v1）由 src/carriers/schema.mjs 负责，不在这里做。

import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {CARRIERS} from './adapters.mjs';
import {extract, toRecord, CARRIER_NAMES} from './registry.mjs';
import {captureSupplementaryDetails} from './detail-capture.mjs';
import {acquireHapagContainerPage, HapagPagePoolError} from './hapag-page-pool.mjs';
import {runHapagNavigatorItem} from './hapag-navigator.mjs';

// 「页面是空壳」的文案。
// 踩过的坑：COSCO 的 expect 里含「集装箱信息」这种**标签文字**，页面骨架（表格还没加载、
// 正文写着「暂无数据」）也会命中 → 3 秒就判定成功、0 个箱号、状态还是 QUERY_COMPLETED。
// 所以命中 expect 之外，还要排除「空壳页」：页面没数据时绝不当成成功。
const EMPTY_PAGE_MARKERS = /暂无数据|暂无信息|无数据|暂无记录|没有找到|未查询到|no\s+data\s+(found|available)|no\s+records?\s+found|not\s+found/i;

// 船司 → 上次成功的查询模式（落盘记忆，重启后仍然优先生效）
const VARIANT_HINTS = new Map();
const HINT_FILE = path.resolve('.variant-hints.json');

async function loadHints() {
  try {
    const raw = JSON.parse(await fs.readFile(HINT_FILE, 'utf8'));
    for (const [carrier, variant] of Object.entries(raw)) VARIANT_HINTS.set(carrier, variant);
  } catch { /* 首次运行没有文件 */ }
}
async function saveHint(carrier, variant) {
  try {
    const raw = JSON.parse(await fs.readFile(HINT_FILE, 'utf8').catch(() => '{}'));
    raw[carrier] = variant;
    await fs.writeFile(HINT_FILE, JSON.stringify(raw, null, 2), 'utf8');
  } catch { /* 记不住也不影响正确性 */ }
}
await loadHints();

async function runItemApi(job) {
  // 有公开接口的船司优先走接口：零浏览器、字段最全、最快（目前只有 ONE）
  const started = Date.now();
  const {trackOne} = await import('../specialists/one-tracking.mjs');
  const searchType = job.reference_type === 'CONTAINER' ? 'CNTR_NO' : job.reference_type ? 'BKG_NO' : undefined;
  const api = await trackOne(job.reference, {searchType});
  const first = api.records?.[0] ?? {};
  const f = first.fields ?? {};
  const events = String(f.cargo_events ?? '').split(String.fromCharCode(10)).filter(Boolean);
  return {
    carrier: job.carrier,
    carrier_name: CARRIER_NAMES[job.carrier] ?? job.carrier,
    reference: job.reference,
    submitted: job.submitted,
    status: api.execution_status === 'COMPLETED' ? 'QUERY_COMPLETED' : api.execution_status,
    containers: f.container_number ? [f.container_number] : [],
    container_count: f.container_number ? 1 : 0,
    vessel_voyage: f.vessel_voyage ? [f.vessel_voyage] : [],
    fields: {
      booking_number: f.booking_number,
      container_type_size: f.container_type_size,
      weight: f.weight,
      por: f.place_of_receipt,
      pod: f.place_of_delivery,
      latest_event: f.latest_event,
    },
    latest_event: f.latest_event ?? null,
    events,
    dates: [],
    evidence: null,
    seconds: Math.round((Date.now() - started) / 1000),
    url: api.api_call?.endpoint ?? null,
    strategy: 'PUBLIC_API',
    business_verified: false,
  };
}

const FAILURE_KINDS = new Set(['APPLICATION_SESSION_EXPIRED','INPUT_NOT_RETAINED','FRESH_QUERY_NOT_CONFIRMED','BUDGET_EXHAUSTED',
  'ORDINARY_FORM_NOT_READY','VERIFICATION_PENDING','INVALID_CONTAINER_REFERENCE']);
function failureKind(error) {
  if (FAILURE_KINDS.has(error?.failure_kind)) return error.failure_kind;
  if (error?.code === 'HUMAN_CAPTCHA') return 'VERIFICATION';
  if (error?.code === 'CARRIER_QUERY_INCOMPLETE') return 'QUERY_INCOMPLETE';
  if (error?.code === 'CARRIER_REFERENCE_NOT_FOUND') return 'REFERENCE_NOT_FOUND';
  return 'QUERY_FAILURE';
}
function queryLifecycle(value) {
  if (!value || typeof value !== 'object') return undefined;
  const result = {};
  if (typeof value.sessionRecoveryUsed === 'boolean') result.sessionRecoveryUsed = value.sessionRecoveryUsed;
  for (const key of ['normalFindActionsStarted','initialEntryLoads'])
    if (Number.isSafeInteger(value[key]) && value[key] >= 0) result[key] = value[key];
  return Object.keys(result).length ? result : undefined;
}

export async function runItem(job, options = {}) {
  const navigatorOptIn = options.hapagNavigator === true ||
    (options.hapagNavigator !== false && process.env.HAPAG_NAVIGATOR_UI === '1');
  if (job.carrier === 'HAPAG_LLOYD' && navigatorOptIn) return runHapagNavigatorItem(job, options);
  if (job.carrier !== 'HAPAG_LLOYD' || job.reference_type !== 'CONTAINER') return runBrowserItem(job, options);
  let lease;
  try {
    lease = await acquireHapagContainerPage(options.context);
  } catch (error) {
    const typed = error instanceof HapagPagePoolError;
    return {carrier:job.carrier,carrier_name:CARRIER_NAMES[job.carrier],reference:job.reference,
      submitted:job.submitted,reference_type:'CONTAINER',status:'FAILED',strategy:'BROWSER',seconds:0,
      // Preserve the existing service terminal guard. No automatic retry should
      // treat a local page-pool refusal as a carrier no-data response.
      error_code:'CARRIER_QUERY_INCOMPLETE',pool_error_code:typed ? error.code : 'HAPAG_PAGE_POOL_ACQUIRE_FAILED',
      failure_kind:error?.code === 'HAPAG_PAGE_POOL_BUSY' ? 'PAGE_POOL_BUSY' : 'PAGE_POOL_ISOLATION',
      page_pool:typed ? error.poolState : {state:'QUARANTINED',page_retained:false,reason:'ACQUIRE_FAILED'},
      error:typed ? `${error.name}: ${error.message}` : 'Hapag page pool could not acquire its own page; no existing tab was adopted'};
  }
  try {
    // An explicitly supplied old page is also ignored here: only the page
    // created and leased by this pool can be controlled by this branch.
    const record = await runBrowserItem(job, {...options,page:lease.page}, {poolOwned:true});
    record.page_pool = lease.release({success:record.status === 'QUERY_COMPLETED',
      reason:record.failure_kind ?? record.error_code ?? record.status,
      failureKind:record.failure_kind ?? 'QUERY_FAILURE'});
    return record;
  } catch {
    const pagePool = lease.release({success:false,reason:'LOCAL_QUERY_SETUP_FAILED',failureKind:'PAGE_LIFECYCLE'});
    return {carrier:job.carrier,carrier_name:CARRIER_NAMES[job.carrier],reference:job.reference,
      submitted:job.submitted,reference_type:'CONTAINER',status:'FAILED',strategy:'BROWSER',
      error_code:'CARRIER_QUERY_INCOMPLETE',failure_kind:'PAGE_LIFECYCLE',page_pool:pagePool,
      error:'Hapag worker-owned page could not complete local query setup; the page was retained and isolated'};
  } finally {
    lease.release({success:false,reason:'UNFINISHED_LEASE',failureKind:'PAGE_LIFECYCLE'});
  }
}

async function runBrowserItem(job, {context, outDir, page: reusablePage, browserOnly = false, onProgress = () => {}} = {}, {poolOwned = false} = {}) {
  if (job.carrier === 'ONE' && !browserOnly) return runItemApi(job);
  const spec = CARRIERS[job.carrier];
  const started = Date.now();
  // 复用同一个工作标签（省掉每单新建标签的冷启动；标签由调用方负责回收）
  let verifiedPage;
  if (!poolOwned && browserOnly && spec?.canReusePage && context?.pages) {
    for (const candidate of context.pages()) {
      if (await spec.canReusePage(candidate, job).catch(() => false)) {
        verifiedPage = candidate;
        break;
      }
    }
  }
  const ownsPage = !poolOwned && !verifiedPage && !reusablePage;
  const page = verifiedPage ?? reusablePage ?? await context.newPage();
  page.setDefaultTimeout(15000);
  const base = {carrier: job.carrier, carrier_name: CARRIER_NAMES[job.carrier] ?? job.carrier, reference: job.reference, submitted: job.submitted,
    ...(job.carrier === 'HAPAG_LLOYD' && job.reference_type === 'CONTAINER' ? {reference_type:'CONTAINER'} : {})};
  if (!spec) {
    if (ownsPage) await page.close().catch(() => {});
    return {...base, status: 'CARRIER_NOT_IMPLEMENTED', notes: `未实现 ${job.carrier} 的适配器`};
  }
  const evidence = {};
  const evidenceBase = path.join(outDir, `${job.carrier}-${job.reference}`);
  // Repeated samples in one batch must not overwrite earlier PDF/JSON sources.
  const detailArtifactBase = `${evidenceBase}.capture-${randomUUID()}`;
  const saveEvidence = async (target, text) => {
    onProgress('saving');
    const textPath = `${evidenceBase}.txt`;
    const screenshotPath = `${evidenceBase}.png`;
    await fs.writeFile(textPath, text, 'utf8').then(() => { evidence.text = textPath; }, () => {});
    await target.screenshot({path: screenshotPath, fullPage: false, timeout: 5000})
      .then(() => { evidence.screenshot = screenshotPath; }, () => {});
  };
  const hasBusiness = (text, probe) => {
    if (job.reference_type === 'CONTAINER') {
      // An echoed container number on an empty search form is not a shipment result.
      return probe.containers.includes(job.submitted) &&
        (probe.events.length > 0 || (probe.dates.length > 0 && probe.vessel_voyage?.length > 0) ||
          (Array.isArray(probe.fields.container_details) && probe.fields.container_details.some(detail =>
            detail.number === job.submitted && (detail.status_time || detail.latest_status))));
    }
    if (browserOnly && spec.hasBusiness) return spec.hasBusiness(text, job.submitted);
    const hasBoxes = probe.containers.length || Number(probe.container_count) > 0;
    return hasBoxes || (spec.expect.test(text) && !EMPTY_PAGE_MARKERS.test(text));
  };
  let resultPage = page;
  let keepChallengeOpen = false;
  const probeOverview = async (target, text) => {
    const overview = extract(job.carrier, text, job.reference);
    return spec.probeOverview ? await spec.probeOverview({page:target,job,text,overview}) : overview;
  };
  try {
    // 有的船司有多个查询模式（提单号/订舱号/箱号）。逐个尝试，谁先出业务数据就用谁。
    // 上一次成功过的模式优先（VARIANT_HINTS），避免每次都先试错的那一个。
    // A printed COSU bill can be indexed by the line under its booking number.
    // Keep that existing fallback for bills, and keep explicit container/booking lookups exact.
    const tryBillAndBooking = !job.reference_type ||
      (job.reference_type === 'BILLOFLADING' && job.carrier === 'COSCO');
    const allAttempts = spec.variants
      ? spec.variants.filter(attempt => tryBillAndBooking ? attempt.label !== 'CONTAINER' : attempt.label === job.reference_type)
      : [{label: 'DEFAULT', run: (p, r) => spec.steps(p, r, job.reference_type)}];
    const hint = !job.reference_type && VARIANT_HINTS.get(job.carrier);
    const attempts = hint
      ? [...allAttempts].sort((a, b) => (a.label === hint ? -1 : b.label === hint ? 1 : 0))
      : allAttempts;

    let usedVariant = null;
    let text = '';

    // 统一的"等到有业务数据"：500ms 轮询，出现就立刻返回（不再死等固定秒数）
    const waitForBusiness = async (target, budgetMs) => {
      const end = Date.now() + budgetMs;
      let seen = '';
      while (Date.now() < end) {
        const verification = await spec.checkVerification?.(target);
        if (verification?.pending) {
          await target.waitForTimeout(500);
          continue;
        }
        seen = await target.locator('body').innerText().catch(() => '');
        const probe = await probeOverview(target, seen);
        if (hasBusiness(seen, probe)) return seen;
        await target.waitForTimeout(500);
      }
      await spec.checkVerification?.(target, {final: true});
      return seen;
    };

    for (const attempt of attempts) {
      onProgress('opening');
      resultPage = (await attempt.run(page, job.submitted)) ?? page;
      onProgress('waiting');
      text = await waitForBusiness(resultPage, attempt === attempts[0] ? 15000 : 12000);
      const probe = await probeOverview(resultPage, text);
      if (hasBusiness(text, probe)) {
        usedVariant = attempt.label;
        if (!job.reference_type) {
          VARIANT_HINTS.set(job.carrier, attempt.label);
          await saveHint(job.carrier, attempt.label);
        }
        break;
      }
      if (attempt !== attempts[attempts.length - 1]) {
        if (resultPage !== page) await resultPage.close().catch(() => {});
        else await page.goto('about:blank').catch(() => {});
        resultPage = page;
      }
    }
    const variantUsed = allAttempts.length > 1 ? usedVariant : null;
    if (!text) text = await resultPage.locator('body').innerText().catch(() => '');

    onProgress('extracting');
    let extraction = await probeOverview(resultPage, text);
    await saveEvidence(resultPage, text);

    // Preserve the confirmed overview even if a supplementary page/export fails.
    const matched = hasBusiness(text, extraction);
    const detail = matched ? await captureSupplementaryDetails({
      collector:spec.collectDetails,page:resultPage,job,overview:extraction,
      url:resultPage.url(),artifactBase:detailArtifactBase,
      budgetMs:spec.detailBudgetMs,
    }) : null;
    if (detail) extraction = detail.extraction;

    const boxes = extraction.containers.length > 0 || Number(extraction.container_count) > 0;
    // 空壳页一律不算业务数据（否则服务器会拿到「成功但 0 箱」的假结果）
    const emptyShell = EMPTY_PAGE_MARKERS.test(text) && !boxes;
    const record = toRecord(job.carrier, job.reference, resultPage.url(), extraction, {
      evidence, seconds: Math.round((Date.now() - started) / 1000),
    });
    if (detail) {
      record.detail_capture = detail.metadata;
      record.detail_artifacts = detail.artifacts;
    }
    record.status = matched && extraction.ok ? 'QUERY_COMPLETED' : matched ? 'MATCHED_NO_STRUCTURE' : 'NO_BUSINESS_DATA';
    record.submitted = job.submitted;
    if (base.reference_type) record.reference_type = base.reference_type;
    record.strategy = 'BROWSER';
    if (variantUsed) record.variant = variantUsed;
    record.csv_label_mismatch = job.csv_label_mismatch;
    record.notes = [
      job.csv_label_mismatch ? `CSV 标注的船司与实际单号前缀不符（按前缀路由到 ${job.carrier}）` : null,
      emptyShell && !matched ? '页面停在空壳状态（暂无数据），按未取到业务数据处理，可重试' : null,
    ].filter(Boolean).join('；') || undefined;
    return record;
  } catch (error) {
    // An explicit not-found reply is terminal. An incomplete query can instead
    // be a security check still visible at the end of its existing wait budget.
    const terminalReply = error.code === 'CARRIER_REFERENCE_NOT_FOUND';
    if (!terminalReply && error.code !== 'HUMAN_CAPTCHA' && spec.checkVerification) {
      try {
        await spec.checkVerification(resultPage, {final: true});
      } catch (verificationError) {
        if (verificationError.code === 'HUMAN_CAPTCHA') error = verificationError;
      }
    }
    const status = error.code === 'HUMAN_CAPTCHA' ? 'HUMAN_REQUIRED' :
      error.code === 'CARRIER_REFERENCE_NOT_FOUND' ? 'NO_BUSINESS_DATA' :
      error.code === 'UNSUPPORTED_REFERENCE_TYPE' ? 'UNSUPPORTED_REFERENCE_TYPE' : 'FAILED';
    keepChallengeOpen = browserOnly && (status === 'HUMAN_REQUIRED' || error.code === 'CARRIER_QUERY_INCOMPLETE');
    const text = error.verificationText || await resultPage.locator('body').innerText({timeout: 3000}).catch(() => '');
    await saveEvidence(resultPage, text);
    const lifecycle = poolOwned ? queryLifecycle(error.query_lifecycle) : undefined;
    return {...base, status, evidence, strategy: 'BROWSER', url: resultPage.url(),
      ...(poolOwned ? {failure_kind:failureKind(error),...(lifecycle ? {query_lifecycle:lifecycle} : {})} : {}),
      ...(['CARRIER_ACCESS_DENIED', 'HUMAN_CAPTCHA', 'CARRIER_QUERY_INCOMPLETE', 'CARRIER_REFERENCE_NOT_FOUND'].includes(error.code) ? {error_code: error.code} : {}),
      error: `${error.name}: ${error.message}`.slice(0, 240), seconds: Math.round((Date.now() - started) / 1000)};
  } finally {
    if (!poolOwned && resultPage !== page && !keepChallengeOpen) await resultPage.close().catch(() => {});
    if (poolOwned) {
      // The lease owner keeps its page and decides READY vs QUARANTINED.
      // Do not close, clear, navigate or reset it here, including on failures.
    } else if (ownsPage) {
      if (!keepChallengeOpen) await page.close().catch(() => {});
    } else if (!verifiedPage && !keepChallengeOpen) await page.goto('about:blank').catch(() => {});
  }
}
