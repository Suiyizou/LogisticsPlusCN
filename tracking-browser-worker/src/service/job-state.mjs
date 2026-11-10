import crypto from 'node:crypto';

export const TERMINAL_JOBS = new Set(['completed', 'completed_with_gaps', 'cancelled', 'failed']);
const UNFINISHED = new Set(['pending', 'queued', 'running']);

export function needsExecution(item) {
  return !item.result && UNFINISHED.has(item.status);
}

export function updateProgress(job) {
  job.progress = {
    done: job.items.filter(item => item.status === 'done').length,
    failed: job.items.filter(item => !UNFINISHED.has(item.status) && !['done', 'cancelled'].includes(item.status)).length,
    cancelled: job.items.filter(item => item.status === 'cancelled').length,
    settled: job.items.filter(item => !UNFINISHED.has(item.status)).length,
    total: job.items.length,
  };
  return job.progress;
}

export function settleUnfinished(job, status, error = null) {
  for (const item of job.items) {
    if (!needsExecution(item)) continue;
    item.status = status === 'failed' && item.status === 'running' ? 'failed' : 'cancelled';
    item.phase = item.status;
    item.finished_at = job.finished_at;
    if (error) item.error = error;
  }
  updateProgress(job);
}

export function requestFingerprint(items, source, callbackUrl) {
  // Hash normalized semantic input; object key order and irrelevant fields do not matter.
  return crypto.createHash('sha256').update(JSON.stringify({
    items: items.map(item => {
      const identity = [item.carrier, item.reference, !!item.csv_label_mismatch];
      if (item.reference_type) identity.push(item.reference_type);
      return identity;
    }),
    source, callback_url: callbackUrl,
  })).digest('hex');
}
