#!/usr/bin/env node
/**
 * 提单跟踪队列服务（单机常驻）
 *
 * 设计目标：一次提交几十条单子 → 排队执行 → 归拢成**一份统一 JSON** 供渲染端使用。
 *
 * 启动：
 *   TRACK_TOKEN=<令牌> node scripts/serve-track.mjs
 *   可选环境变量：PORT(默认 8791) RETRY(默认 1) DATA_DIR(默认 ./service-data)
 *   浏览器任务串行执行，控制台位于 /console。
 *
 * 接口：
 *   GET  /health                     存活与积压情况
 *   GET  /events                     执行端心跳与所有作业的 SSE 更新
 *   POST /jobs                       提交一批（JSON 或 CSV 两种入参）
 *   GET  /jobs                       列出作业
 *   GET  /jobs/:id                   作业状态 + 进度 + 已完成条数
 *   GET  /jobs/:id/result            统一结构（tracking.v1，可直接渲染）★
 *   GET  /jobs/:id/result.ndjson     当前结果快照：每行一条 canonical shipment
 *   GET  /jobs/:id/events            SSE 实时进度
 *   POST /jobs/:id/cancel            取消（已完成的保留）
 *   GET  /jobs/:id/evidence/<文件>    证据文件（页面全文 / 截图）
 *
 * 数据交付形态（推荐顺序见 docs/队列服务-接口契约.md）：
 *   ① 拉取：GET /jobs/:id/result（一次一份 JSON，带 ETag）
 *   ② 推送：提交时给 callback_url，完成后 POST 同一份 JSON（带幂等键）
 *   ③ 增量读取：订阅 /events 后重新 GET result.ndjson（不是长连接结果流）
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {route, normalize, CARRIER_NAMES} from '../src/carriers/registry.mjs';
import {runItem} from '../src/carriers/run-item.mjs';
import {toCanonicalBatch, SCHEMA_VERSION} from '../src/carriers/schema.mjs';
import {buildWorkbook} from '../src/carriers/xlsx.mjs';
import {buildSingleSheetWorkbook, buildPerCarrierWorkbook} from '../src/carriers/xlsx-single.mjs';
import {parseTrackingCsv} from '../src/carriers/input.mjs';
import {TERMINAL_JOBS, needsExecution, updateProgress, settleUnfinished, requestFingerprint} from '../src/service/job-state.mjs';
import {restartManagedChrome, waitForEndpoint, isClosedBrowserPageError} from '../src/service/chrome-lifecycle.mjs';
import {createCarrierBrowserContexts} from '../src/service/carrier-browser-contexts.mjs';

const PORT = Number(process.env.PORT ?? 8791);
// 一台电脑共享已验证的 Chrome 会话，串行执行可避免标签页和验证码会话互相覆盖。
const CONCURRENCY = 1;
const RETRY = Math.max(0, Number(process.env.RETRY ?? 1));
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? 'service-data');
const TOKEN = process.env.TOKEN ?? process.env.TRACK_TOKEN ?? '';
if (process.env.REQUIRE_TRACK_TOKEN === '1' && !TOKEN.trim()) throw new Error('A nonempty TRACK_TOKEN is required');
const CHROME_PORT = Number(process.env.CHROME_PORT ?? 9333);
const STARTED_AT = new Date().toISOString();
const WORKER_NAME = process.env.WORKER_NAME || os.hostname();
const WORKER_ID = process.env.WORKER_ID || crypto.createHash('sha256').update(os.hostname() + '\0' + DATA_DIR).digest('hex').slice(0, 16);
const WEBHOOK_TIMEOUT_MS = Math.max(100, Math.min(60000, Number(process.env.WEBHOOK_TIMEOUT_MS) || 15000));

/* ---------------- 存储（每个作业一个目录，重启可续跑） ---------------- */
const jobs = new Map();          // id -> job
let browserContext = null;       // 共用的 Chrome 连接
const sseClients = new Map();    // jobId -> Set<res>
const globalSseClients = new Set();
const idempotencyJobs = new Map();
const submissionWrites = new Map();
const writes = new Map();

async function jobDir(id) { return path.join(DATA_DIR, id); }

async function saveJob(job) {
  job.updated_at = new Date().toISOString();
  const dir = await jobDir(job.id);
  await fs.mkdir(dir, {recursive: true});
  await writeJson(path.join(dir, 'job.json'), job);
}

async function writeJson(file, value) {
  const body = JSON.stringify(value, null, 2);
  const pending = (writes.get(file) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const temporary = file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
    await fs.writeFile(temporary, body, 'utf8');
    await fs.rename(temporary, file);
  });
  writes.set(file, pending);
  try { await pending; } finally {
    if (writes.get(file) === pending) writes.delete(file);
  }
}

async function loadJobs() {
  await fs.mkdir(DATA_DIR, {recursive: true});
  for (const entry of await fs.readdir(DATA_DIR, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, entry.name, 'job.json'), 'utf8');
      const job = JSON.parse(raw);
      // 重启前没跑完的，标回 queued 继续
      if (job.status === 'running') {
        job.status = 'queued';
        for (const item of job.items) if (item.status === 'running') {
          if (item.result) item.status = item.result.status === 'QUERY_COMPLETED' ? 'done' : String(item.result.status).toLowerCase();
          else {
            item.status = 'pending';
            item.phase = 'queued';
            delete item.started_at;
            delete item.finished_at;
          }
        }
      }
      if (['cancelling', 'cancelled', 'failed'].includes(job.status)) {
        if (job.status === 'cancelling') job.status = 'cancelled';
        job.finished_at ??= new Date().toISOString();
        settleUnfinished(job, job.status, job.error);
        await writeJson(path.join(DATA_DIR, entry.name, 'result.json'), snapshot(job));
        await saveJob(job);
      }
      updateProgress(job);
      jobs.set(job.id, job);
      if (job.idempotency_key && job.request_fingerprint) idempotencyJobs.set(job.idempotency_key, job);
    } catch { /* 忽略坏目录 */ }
  }
}

function emit(jobId, payload) {
  const data = {job_id: jobId, server_time: new Date().toISOString(), ...payload};
  for (const res of sseClients.get(jobId) ?? []) sendSse(res, 'progress', data);
  for (const res of globalSseClients) sendSse(res, 'job', data);
}

function sendSse(res, event, data) {
  if (res.destroyed || res.writableEnded) return;
  // A stalled dashboard must not grow an unbounded write buffer or block the worker.
  if (res.writableLength > 256 * 1024) { res.destroy(); return; }
  try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
  catch { res.destroy(); }
}

function openSse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
}

async function workerState() {
  const tabs = await ownedTabs().catch(() => ({tabs: -1}));
  const active = [...jobs.values()].find(job => ['running', 'cancelling'].includes(job.status));
  return {
    server_time: new Date().toISOString(),
    worker: {
      id: WORKER_ID, name: WORKER_NAME, status: active ? 'busy' : 'idle',
      started_at: STARTED_AT, uptime_seconds: Math.floor(process.uptime()),
      active_job_id: active?.id ?? null,
    },
    chrome: {connected: browserRef?.isConnected() ?? false, connects: connectAttempts, tabs: tabs.tabs},
    running, queued: waiting.filter(job => job.status === 'queued').length,
  };
}

async function publishWorker() {
  if (!globalSseClients.size) return;
  const state = await workerState();
  for (const res of globalSseClients) sendSse(res, 'worker', state);
}

function finishEvents(job) {
  for (const res of sseClients.get(job.id) ?? []) {
    sendSse(res, 'done', {job_id: job.id, status: job.status, progress: job.progress});
    res.end();
  }
}

/* ---------------- 浏览器 ---------------- */
async function endpoint() {
  try {
    const res = await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`, {signal: AbortSignal.timeout(1500)});
    if (res.ok) return (await res.json()).webSocketDebuggerUrl;
  } catch { /* 没起 */ }
  return '';
}

// Chrome 只连一次，长期复用：
//   · 连接活着 → 直接用（不重开窗口、不重开 profile，热会话与风控状态都保住了）
//   · 连接断了（Chrome 被关/崩）→ 懒重连，不拖垮整个作业
let browserRef = null;
let connectAttempts = 0;
const execFileAsync = promisify(execFile);

async function runChromeHelper(...args) {
  const script = fileURLToPath(new URL('./start-chrome.mjs', import.meta.url));
  await execFileAsync(process.execPath, [script, ...args], {
    windowsHide:true, timeout:60000, maxBuffer:64 * 1024,
  });
}

function isManagedEndpoint(value) {
  try {
    const target = new URL(value);
    return ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) && Number(target.port) === CHROME_PORT;
  } catch { return false; }
}

async function ensureContext() {
  if (browserRef?.isConnected() && browserContext) return browserContext;
  let ws = process.env.CDP_ENDPOINT?.trim() || await endpoint();
  if (!ws) {
    // In the Windows service deployment SCM owns Chrome and its restart policy.
    if (process.env.CHROME_SERVICE_MANAGED !== '1') {
      console.log('未发现自动化 Chrome，尝试自动启动…');
      await runChromeHelper();
    }
    ws = await waitForEndpoint(endpoint, {ready:true});
  }
  if (!ws) throw new Error('自动化 Chrome 未运行：先执行 node scripts/start-chrome.mjs');
  try {
    browserRef = await chromium.connectOverCDP(ws, {timeout: 30000});
  } catch (error) {
    // Only the configured local automation instance is managed here, never an external CDP host.
    if (!isManagedEndpoint(ws) || process.env.CHROME_SERVICE_MANAGED === '1') throw error;
    console.log('连接 Chrome 失败，重启自动化实例后重试：', String(error.message).slice(0, 80));
    browserContext = null;
    browserRef = null;
    const retryWs = await restartManagedChrome({
      stop:() => runChromeHelper('--kill'), start:() => runChromeHelper(),
      probe:endpoint, previous:ws,
    });
    browserRef = await chromium.connectOverCDP(retryWs, {timeout: 30000});
  }
  connectAttempts += 1;
  browserContext = browserRef.contexts()[0] ?? await browserRef.newContext({
    locale: 'en-US', viewport: {width: 1440, height: 1000},
  });
  const connectedBrowser = browserRef;
  connectedBrowser.on('disconnected', () => {
    if (browserRef === connectedBrowser) browserContext = null;
  });
  console.log(`Chrome 已连接（第 ${connectAttempts} 次），复用同一个实例`);
  return browserContext;
}

const carrierBrowsers=createCarrierBrowserContexts({ensureDefault:ensureContext,
  connect:(endpoint,options)=>chromium.connectOverCDP(endpoint,options),cmaEndpoint:process.env.CMA_CDP_ENDPOINT});

/** 每个条目跑完回收自己的标签页，避免几十条任务把浏览器塞满 */
async function ownedTabs() {
  if (!browserContext) return {tabs: 0};
  const pages = await browserContext.pages();
  return {tabs: pages.length};
}

/* ---------------- 队列执行 ---------------- */
let running = 0;
const waiting = [];

function schedule(job) {
  if (!waiting.includes(job)) waiting.push(job);
  emit(job.id, {status: job.status, progress: job.progress, source: job.source});
  pump();
}

function pump() {
  while (running < CONCURRENCY) {
    const job = waiting.find((x) => x.status === 'queued');
    if (!job) return;
    job.status = 'running';
    job.started_at ??= new Date().toISOString();
    running += 1;
    emit(job.id, {status: job.status, started_at: job.started_at, progress: job.progress});
    void publishWorker();
    execute(job)
      .catch(async (error) => {
        job.status = 'failed';
        job.error = String(error.message).slice(0, 300);
        job.finished_at = new Date().toISOString();
        settleUnfinished(job, 'failed', job.error);
        const canonical = snapshot(job);
        job.summary = canonical.summary;
        await writeJson(path.join(await jobDir(job.id), 'result.json'), canonical);
        await saveJob(job);
        emit(job.id, {status: job.status, progress: job.progress, error: job.error});
        finishEvents(job);
      })
      .finally(async () => {
        running -= 1;
        const index = waiting.indexOf(job);
        if (index >= 0) waiting.splice(index, 1);
        await saveJob(job).catch(() => {});
        pump();
        void publishWorker();
      }).catch(error => console.error('作业持久化失败:', String(error.message).slice(0, 160)));
  }
}

async function execute(job) {
  const dir = await jobDir(job.id);
  await fs.mkdir(dir, {recursive: true});
  await saveJob(job);
  let workPage;
  let workPageContext;
  try {
    for (const [index, item] of job.items.entries()) {
      if (job.status === 'cancelled' || job.status === 'cancelling') break;
      if (!needsExecution(item)) continue;

      item.status = 'running';
      item.started_at = new Date().toISOString();
      item.phase = 'opening';
      item.attempt = 1;
      await saveJob(job);
      emit(job.id, {index, carrier: item.carrier, reference: item.reference, status: 'running'});

      const jobCtx = {
        carrier: item.carrier,
        carrier_name: CARRIER_NAMES[item.carrier] ?? item.carrier,
        reference: item.reference,
        reference_type: item.reference_type,
        submitted: normalize(item.carrier, item.reference, item.reference_type),
        csv_label_mismatch: item.csv_label_mismatch,
      };

      let browserRecoveryUsed = false;
      const runAttempt = async () => {
        for (;;) {
          try {
            // Re-resolve the context before every normal/retry execution; Chrome
            // can disconnect between tickets or while a failed ticket is waiting.
            const context = await carrierBrowsers.forCarrier(item.carrier);
            const ownsPage = ['WAN_HAI','HAPAG_LLOYD','CMA_CGM'].includes(item.carrier);
            if (!ownsPage) {
              if (workPage && (workPage.isClosed?.() || workPageContext !== context)) {
                await workPage.close().catch(() => {});
                workPage = null;
              }
              if (!workPage) {
                workPage = await context.newPage();
                workPageContext = context;
              }
            }
            return await runItem(jobCtx, {
              // Keep a verification page available instead of clearing the shared tab.
              context, outDir: dir, page: ownsPage ? undefined : workPage, browserOnly:true,
              onProgress(phase) {
                item.phase = phase;
                job.updated_at = new Date().toISOString();
                emit(job.id, {index, phase, attempt:item.attempt, status:'running'});
              },
            });
          } catch (error) {
            if(item.carrier==='CMA_CGM'&&error.code==='CMA_BROWSER_UNAVAILABLE')return {
              carrier:item.carrier,carrier_name:CARRIER_NAMES[item.carrier],reference:item.reference,
              submitted:jobCtx.submitted,reference_type:item.reference_type,status:'FAILED',strategy:'BROWSER',
              error_code:'CARRIER_QUERY_INCOMPLETE',browser_error_code:'CMA_BROWSER_UNAVAILABLE',
              error:'CMA 查询浏览器暂不可用，请稍后重试。',containers:[],container_count:0,evidence:{},seconds:0};
            if (browserRecoveryUsed || !isClosedBrowserPageError(error)) throw error;
            browserRecoveryUsed = true;
            item.phase = 'reconnecting';
            emit(job.id, {index, phase:item.phase, attempt:item.attempt, status:'running'});
            if (workPage) await workPage.close().catch(() => {});
            workPage = null;
            workPageContext = null;
            if(!await carrierBrowsers.invalidate(item.carrier))browserContext = null;
            // ensureContext reconnects only to the configured automation endpoint.
          }
        }
      };
      let record = await runAttempt();
      // 失败重试；另外「空壳页」（网站偶尔返回还没加载出数据的页面）也会重试一次，
      // 否则会把"成功但 0 箱"的假结果直接交给服务器。
      for (let attempt = 1; attempt <= RETRY &&
          !['CARRIER_QUERY_INCOMPLETE', 'CARRIER_REFERENCE_NOT_FOUND'].includes(record.error_code) &&
          (record.status === 'FAILED' || record.status === 'NO_BUSINESS_DATA'); attempt += 1) {
        if (job.status === 'cancelling') break;
        item.attempt = attempt + 1;
        item.phase = 'retrying';
        emit(job.id, {index, phase: item.phase, attempt: item.attempt, status: 'running'});
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        record = await runAttempt();
      }

      item.status = record.status === 'QUERY_COMPLETED' ? 'done' : record.status.toLowerCase();
      item.result = item.reference_type ? {...record, reference_type: item.reference_type} : record;
      item.finished_at = new Date().toISOString();
      item.phase = item.status === 'done' ? 'completed' : item.status;

      updateProgress(job);
      emit(job.id, {index, carrier: item.carrier, reference: item.reference, status: item.status, ...job.progress});
      await saveJob(job);
    }
  } finally {
    if (workPage) await workPage.close().catch(() => {});
  }

  if (job.status === 'cancelling' || job.status === 'cancelled') {
    job.status = 'cancelled';
  } else {
    job.status = job.items.every((x) => x.status === 'done') ? 'completed' : 'completed_with_gaps';
  }
  job.finished_at = new Date().toISOString();
  if (job.status === 'cancelled') settleUnfinished(job, 'cancelled');
  updateProgress(job);
  const canonical = snapshot(job);
  await writeJson(path.join(dir, 'result.json'), canonical);
  job.summary = canonical.summary;
  await saveJob(job);

  emit(job.id, {status: job.status, ...job.progress});
  finishEvents(job);
  // Delivery is separate from browser execution; a slow receiver must not occupy the queue.
  if (job.callback_url) void pushWebhook(job, canonical).catch(error => console.error('回调记录保存失败:', String(error.message).slice(0, 160)));
}

function evidenceUrls(job, record) {
  const evidence = record?.evidence ?? {};
  const prefix = `/jobs/${encodeURIComponent(job.id)}/evidence/`;
  return {
    text_url: evidence.text ? prefix + encodeURIComponent(path.basename(evidence.text)) : null,
    screenshot_url: evidence.screenshot ? prefix + encodeURIComponent(path.basename(evidence.screenshot)) : null,
  };
}

function snapshot(job) {
  const completed = job.items.filter((item) => item.result);
  const canonical = toCanonicalBatch({
    csv: job.source ?? null, generated_at: job.updated_at ?? job.created_at,
    results: completed.map((item) => item.result),
  }, {generatedAt: job.finished_at ?? job.updated_at ?? job.created_at});
  canonical.shipments.forEach((shipment, index) => {
    Object.assign(shipment.evidence, evidenceUrls(job, completed[index].result));
    shipment.query.error = completed[index].result.error ?? null;
    shipment.query.error_code = completed[index].result.error_code ?? null;
  });
  canonical.batch = {
    id: job.id, status: job.status, submitted_at: job.created_at,
    started_at: job.started_at ?? null, finished_at: job.finished_at ?? null,
    queue: {concurrency: CONCURRENCY, retry: RETRY},
    accepted: job.items.length, completed: completed.length,
    successful: job.items.filter((item) => item.status === 'done').length,
    settled: job.items.filter(item => !needsExecution(item)).length,
    partial: !TERMINAL_JOBS.has(job.status) || completed.length < job.items.length,
  };
  return canonical;
}

async function pushWebhook(job, canonical) {
  const body = JSON.stringify(canonical);
  try {
    const res = await fetch(job.callback_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Encoding': 'identity',
      'X-Track-Schema': SCHEMA_VERSION,
      'X-Track-Job': job.id,
      'Idempotency-Key': `track:${job.id}`,
      ...(TOKEN ? {Authorization: `Bearer ${TOKEN}`} : {}),
    },
      body, signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS), redirect: 'error',
    });
    job.webhook = {at: new Date().toISOString(), status: res.status, ok: res.ok};
    await res.body?.cancel();
  } catch (error) {
    job.webhook = {at: new Date().toISOString(), status: null, ok: false, error: String(error.message).slice(0, 200)};
  }
  await saveJob(job);
  emit(job.id, {status: job.status, webhook: job.webhook});
}

/* ---------------- HTTP ---------------- */
const json = (res, status, data, extraHeaders = {}) => {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    ...extraHeaders,
  });
  res.end(body);
};

async function readBody(req, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('body too large'), {status: 413});
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** 两种入参：{items:[{carrier,reference}]} 或 {csv:"..."} */
function parseItems(payload) {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.items)) {
    return payload.items
      .map((item) => {
        if (!item || typeof item !== 'object') throw Object.assign(new Error('items 中每项必须为对象'), {status: 400, code: 'INVALID_ITEM'});
        const reference = String(item.reference ?? '').trim().toUpperCase();
        const label = String(item.carrier ?? item.label ?? '');
        const type = item.reference_type;
        if (type !== undefined && !['BILLOFLADING', 'BOOKING', 'CONTAINER'].includes(type)) {
          throw Object.assign(new Error('未知票号类型'), {status: 400, code: 'INVALID_REFERENCE_TYPE'});
        }
        // The owner of a container may differ from its operating carrier.
        const carrier = type ? route(label) : route(label, reference);
        if (type && carrier === 'UNKNOWN') {
          throw Object.assign(new Error('带类型的票号需要可识别的船司'), {status: 400, code: 'CARRIER_UNRESOLVED'});
        }
        if (type === 'CONTAINER' && !/^[A-Z]{3}[UJZ]\d{7}$/.test(reference)) {
          throw Object.assign(new Error('箱号应含四个字母及七位数字'), {status: 400, code: 'INVALID_REFERENCE'});
        }
        return {carrier, reference, ...(type && {reference_type: type}), csv_label_mismatch: route(label) !== 'UNKNOWN' && route(label) !== carrier};
      })
      .filter((item) => item.reference);
  }
  if (typeof payload.csv === 'string') {
    try { return parseTrackingCsv(payload.csv); }
    catch (error) { throw Object.assign(error, {status: 400, code: 'INVALID_CSV'}); }
  }
  return [];
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    const UI_OFF = process.env.DISABLE_UI === '1' || process.env.DISABLE_UI === 'true';
    const panelAsset = /^\/(?:console\/)?(task-network|snapshot-tree|tracking-panel)\.js$/.exec(url.pathname);
    if (req.method === 'GET' && panelAsset && !UI_OFF) {
      const source = await fs.readFile(new URL('./' + panelAsset[1] + '.js', import.meta.url));
      res.writeHead(200, {'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store'});
      return res.end(source);
    }
    if (req.method === 'GET' && ['/', '/console', '/console/'].includes(url.pathname)) {
      if (UI_OFF) return json(res, 403, {error: 'UI_DISABLED'});
      const html = await fs.readFile(new URL('./track-console.html', import.meta.url), 'utf8');
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
      return res.end(html);
    }
    if (TOKEN) {
      const auth = req.headers.authorization ?? '';
      if (auth !== `Bearer ${TOKEN}`) return json(res, 401, {error: 'UNAUTHORIZED'});
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, {
        ok: true,
        schema: SCHEMA_VERSION,
        jobs: jobs.size,
        concurrency: CONCURRENCY,
        mode: 'BROWSER',
        ...await workerState(),
      });
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      const state = await workerState();
      openSse(res);
      globalSseClients.add(res);
      sendSse(res, 'worker', state);
      res.on('close', () => globalSseClients.delete(res));
      return;
    }

    // 提交作业
    if (req.method === 'POST' && url.pathname === '/jobs') {
      const raw = await readBody(req);
      let payload;
      try { payload = JSON.parse(raw); } catch { return json(res, 400, {error: 'INVALID_JSON'}); }
      const items = parseItems(payload);
      if (!items.length) return json(res, 400, {error: 'NO_ITEMS'});
      if (items.length > 500) return json(res, 400, {error: 'TOO_MANY_ITEMS', message: '每批最多 500 票'});
      if (items.some((item) => !/^[A-Za-z0-9_-]{1,80}$/.test(item.reference))) {
        return json(res, 400, {error: 'INVALID_REFERENCE', message: '提单号仅支持字母、数字、下划线和连字符，最多 80 位'});
      }
      const unknown = items.filter((x) => x.carrier === 'UNKNOWN');
      if (unknown.length === items.length) return json(res, 400, {error: 'CARRIER_UNRESOLVED', samples: unknown.slice(0, 3)});

      const source = payload.source ?? (payload.csv ? 'csv' : 'items');
      if (typeof source !== 'string' || source.length > 500) return json(res, 400, {error: 'INVALID_SOURCE'});
      const callbackUrl = payload.callback_url ?? null;
      if (callbackUrl !== null) {
        try {
          const callback = new URL(callbackUrl);
          if (typeof callbackUrl !== 'string' || !['http:', 'https:'].includes(callback.protocol) || callback.username || callback.password) throw new Error();
        } catch { return json(res, 400, {error: 'INVALID_CALLBACK_URL'}); }
      }
      const idempotencyKey = req.headers['idempotency-key'] ?? null;
      if (idempotencyKey !== null && (typeof idempotencyKey !== 'string' || !/^[\x21-\x7e]{1,200}$/.test(idempotencyKey))) {
        return json(res, 400, {error: 'INVALID_IDEMPOTENCY_KEY'});
      }
      const fingerprint = requestFingerprint(items, source, callbackUrl);
      const previous = idempotencyKey ? idempotencyJobs.get(idempotencyKey) : null;
      if (previous) {
        if (previous.request_fingerprint !== fingerprint) return json(res, 409, {error: 'IDEMPOTENCY_CONFLICT', job_id: previous.id});
        await submissionWrites.get(previous.id);
        return json(res, 202, {
          job_id: previous.id, status: previous.status, total: previous.items.length,
          result_url: `/jobs/${previous.id}/result`, reused: true,
        }, {'Idempotency-Replayed': 'true'});
      }

      const job = {
        id: `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`,
        status: 'queued',
        created_at: new Date().toISOString(),
        callback_url: callbackUrl,
        source,
        ...(idempotencyKey ? {idempotency_key: idempotencyKey, request_fingerprint: fingerprint} : {}),
        items: items.map((item) => ({...item, status: 'pending'})),
        progress: {done: 0, failed: 0, total: items.length},
      };
      jobs.set(job.id, job);
      if (idempotencyKey) idempotencyJobs.set(idempotencyKey, job);
      const saved = saveJob(job);
      submissionWrites.set(job.id, saved);
      try { await saved; }
      catch (error) {
        jobs.delete(job.id);
        if (idempotencyKey) idempotencyJobs.delete(idempotencyKey);
        throw error;
      } finally { submissionWrites.delete(job.id); }
      schedule(job);
      return json(res, 202, {job_id: job.id, status: job.status, total: items.length, result_url: `/jobs/${job.id}/result`});
    }

    // 列表 / 详情
    if (req.method === 'GET' && parts[0] === 'jobs' && parts.length === 1) {
      return json(res, 200, {
        jobs: [...jobs.values()].sort((a,b) => b.created_at.localeCompare(a.created_at)).map((job) => ({
          id: job.id, status: job.status, created_at: job.created_at, started_at: job.started_at,
          finished_at: job.finished_at, progress: job.progress, source: job.source,
        })),
      });
    }

    if (parts[0] === 'jobs' && parts[1]) {
      const job = jobs.get(parts[1]);
      if (!job) return json(res, 404, {error: 'JOB_NOT_FOUND'});

      if (req.method === 'GET' && parts.length === 2) {
        return json(res, 200, {
          id: job.id, status: job.status, created_at: job.created_at, started_at: job.started_at,
          finished_at: job.finished_at, updated_at: job.updated_at,
          source: job.source, webhook: job.webhook ?? null,
          server_time: new Date().toISOString(), current_index: job.items.findIndex((item) => item.status === 'running'),
          progress: job.progress, summary: job.summary ?? null, error: job.error ?? null,
          snapshot: snapshot(job),
          items: job.items.map((item) => ({
            carrier: item.carrier, carrier_name: CARRIER_NAMES[item.carrier] ?? item.carrier,
            reference: item.reference, reference_type: item.reference_type, status: item.status,
            started_at: item.started_at ?? null, finished_at: item.finished_at ?? null,
            phase: item.phase ?? null, attempt: item.attempt ?? 0,
            result_status: item.result?.status ?? null,
            containers: item.result?.container_count ?? 0,
            seconds: item.result?.seconds ?? null,
            latest_event: item.result?.latest_event ?? null,
            error: item.result?.error ?? item.error ?? null, error_code: item.result?.error_code ?? null, notes: item.result?.notes ?? null,
            history_limit: item.result?.fields?.history_limit ?? null,
            evidence: evidenceUrls(job, item.result),
          })),
        });
      }

      if (req.method === 'GET' && parts[2] === 'result') {
        if (['queued', 'running', 'cancelling'].includes(job.status)) {
          return json(res, 409, {error: 'RESULT_NOT_READY', status: job.status, progress: job.progress});
        }
        const file = path.join(await jobDir(job.id), 'result.json');
        try {
          const body = await fs.readFile(file);
          const etag = `"${crypto.createHash('sha256').update(body).digest('hex').slice(0, 32)}"`;
          if (req.headers['if-none-match'] === etag) { res.writeHead(304, {ETag: etag}); return res.end(); }
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': body.length,
            ETag: etag,
            'X-Track-Schema': SCHEMA_VERSION,
            'Cache-Control': 'no-store',
          });
          return res.end(body);
        } catch {
          return json(res, 409, {error: 'RESULT_NOT_READY', status: job.status, progress: job.progress});
        }
      }

      // 导出 Excel（字段即列标题）
      if (req.method === 'GET' && parts[2] === 'result.xlsx') {
        const file = path.join(await jobDir(job.id), 'result.json');
        let canonical;
        try {
          canonical = JSON.parse(await fs.readFile(file, 'utf8'));
        } catch {
          return json(res, 409, {error: 'RESULT_NOT_READY', status: job.status, progress: job.progress});
        }
        // 默认单页（数据结果一页看完）；?sheets=multi 给需要多表拆分的场景
        const multi = url.searchParams.get('sheets') === 'multi';
        const perCarrier = url.searchParams.get('by') === 'carrier';
        const buffer = perCarrier
          ? await buildPerCarrierWorkbook(canonical)
          : multi
            ? await buildWorkbook(canonical)
            : await buildSingleSheetWorkbook(canonical);
        const name = `tracking-${job.id}.xlsx`;
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${name}"`,
          'Content-Length': buffer.length,
        });
        return res.end(buffer);
      }

      // 当前已取得结果的 NDJSON 快照；持续更新请订阅 /events 后重新读取。
      if (req.method === 'GET' && parts[2] === 'result.ndjson') {
        const body = snapshot(job).shipments.map(item => JSON.stringify(item) + '\n').join('');
        res.writeHead(200, {'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Track-Schema': SCHEMA_VERSION});
        return res.end(body);
      }

      if (req.method === 'GET' && parts[2] === 'events') {
        openSse(res);
        sendSse(res, 'snapshot', {job_id: job.id, status: job.status, progress: job.progress});
        if (TERMINAL_JOBS.has(job.status)) {
          sendSse(res, 'done', {job_id: job.id, status: job.status, progress: job.progress});
          return res.end();
        }
        const set = sseClients.get(job.id) ?? new Set();
        set.add(res);
        sseClients.set(job.id, set);
        const heartbeat = setInterval(() => sendSse(res, 'heartbeat', {server_time: new Date().toISOString()}), 15000);
        res.on('close', () => {
          clearInterval(heartbeat);
          set.delete(res);
          if (!set.size) sseClients.delete(job.id);
        });
        return;
      }

      if (req.method === 'POST' && parts[2] === 'cancel') {
        if (!['queued', 'running', 'cancelling'].includes(job.status)) return json(res, 409, {error: 'JOB_ALREADY_FINISHED'});
        job.status = job.status === 'queued' ? 'cancelled' : 'cancelling';
        if (job.status === 'cancelled') {
          job.finished_at = new Date().toISOString();
          settleUnfinished(job, 'cancelled');
          await writeJson(path.join(await jobDir(job.id), 'result.json'), snapshot(job));
        }
        await saveJob(job);
        emit(job.id, {status: job.status, progress: job.progress});
        if (job.status === 'cancelled') finishEvents(job);
        void publishWorker();
        return json(res, 200, {id: job.id, status: job.status});
      }

      if (req.method === 'GET' && parts[2] === 'evidence' && parts[3]) {
        const name = path.basename(decodeURIComponent(parts[3]));
        const allowed = job.items.flatMap((item) => Object.values(item.result?.evidence ?? {})).some((file) => path.basename(file) === name);
        if (!allowed) return json(res, 404, {error: 'EVIDENCE_NOT_FOUND'});
        const file = path.join(await jobDir(job.id), name);
        try {
          const body = await fs.readFile(file);
          const type = file.endsWith('.png') ? 'image/png' : 'text/plain; charset=utf-8';
          res.writeHead(200, {'Content-Type': type, 'Content-Length': body.length});
          return res.end(body);
        } catch { return json(res, 404, {error: 'EVIDENCE_NOT_FOUND'}); }
      }
    }

    if (UI_OFF && (url.pathname === '/' || url.pathname.startsWith('/upload') || url.pathname.startsWith('/console'))) {
      return json(res, 403, {error: 'UI_DISABLED', note: '本服务仅提供 API：POST /jobs、GET /jobs/{id}、GET /jobs/{id}/result'});
    }

    if (req.method === 'GET' && (url.pathname === '/upload' || url.pathname === '/upload/')) {
      const html = await fs.readFile(new URL('./track-ui.html', import.meta.url), 'utf8');
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      return res.end(html);
    }

    if (req.method === 'GET' && url.pathname === '/console') {
      const html = await fs.readFile(new URL('./track-console.html', import.meta.url), 'utf8');
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      return res.end(html);
    }

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(302, {Location: '/console'});
      return res.end();
    }

    return json(res, 404, {error: 'NOT_FOUND'});
  } catch (error) {
    return json(res, error.status ?? 500, {error: error.code ?? 'INTERNAL', message: String(error.message).slice(0, 300)});
  }
});

await loadJobs();
setInterval(() => { void publishWorker().catch(() => {}); }, 5000).unref();
server.listen(PORT, '127.0.0.1', () => {
  console.log(`提单跟踪队列服务 → http://127.0.0.1:${PORT}  (schema ${SCHEMA_VERSION} · 并发 ${CONCURRENCY} · 重试 ${RETRY})`);
  for (const job of [...jobs.values()]) if (job.status === 'queued') schedule(job);
});
