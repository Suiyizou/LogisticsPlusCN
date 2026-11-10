// Worker-local ownership only. Never enumerate or adopt a browser's existing
// tabs. A context is intentionally blocked after any unsuccessful lease;
// this module has no retry, context replacement or quarantine-reset operation.
const pools = new WeakMap();

export class HapagPagePoolError extends Error {
  constructor(code, message, state) {
    super(message);
    this.name = 'HapagPagePoolError';
    this.code = code;
    this.poolState = state;
  }
}

function snapshot(record) {
  return {
    ownership:'WORKER_CREATED_HAPAG_CONTAINER_PAGE',
    state:record ? record.quarantined ? 'QUARANTINED' : record.busy ? 'BUSY' : 'READY' : 'EMPTY',
    page_retained:Boolean(record?.page),
    reason:record?.reason ?? null,
    failure_kind:record?.failureKind ?? null,
  };
}

export function inspectHapagContainerPagePool(context) {
  return snapshot(context && (typeof context === 'object' || typeof context === 'function') ? pools.get(context) : null);
}

export async function acquireHapagContainerPage(context) {
  if (!context || (typeof context !== 'object' && typeof context !== 'function') || typeof context.newPage !== 'function')
    throw new HapagPagePoolError('HAPAG_PAGE_POOL_CONTEXT_REQUIRED',
      'An explicit existing browser context is required for the worker-owned Hapag container page', snapshot(null));
  let record = pools.get(context);
  if (record?.busy)
    throw new HapagPagePoolError('HAPAG_PAGE_POOL_BUSY', 'The worker-owned Hapag container page is already in use', snapshot(record));
  if (record?.quarantined)
    throw new HapagPagePoolError('HAPAG_PAGE_POOL_QUARANTINED',
      'The worker-owned Hapag container page is quarantined after an unsuccessful query; no new page or query was started', snapshot(record));
  if (record?.page?.isClosed?.()) {
    record.quarantined = true;
    record.reason = 'HAPAG_OWNED_PAGE_CLOSED';
    record.failureKind = 'PAGE_LIFECYCLE';
    throw new HapagPagePoolError('HAPAG_PAGE_POOL_QUARANTINED',
      'The worker-owned Hapag container page has closed; no replacement page was created', snapshot(record));
  }
  if (!record) {
    record = {page:null,busy:true,quarantined:false,reason:null,failureKind:null,lease:null};
    pools.set(context, record);
    try {
      record.page = await context.newPage();
      if (!record.page || typeof record.page !== 'object') throw new Error('No page returned');
    } catch {
      record.busy = false;
      record.quarantined = true;
      record.reason = 'HAPAG_PAGE_POOL_NEW_PAGE_FAILED';
      record.failureKind = 'PAGE_LIFECYCLE';
      throw new HapagPagePoolError('HAPAG_PAGE_POOL_NEW_PAGE_FAILED',
        'The worker-owned Hapag container page could not be created; no existing page was adopted', snapshot(record));
    }
  }
  record.busy = true;
  const token = Symbol('hapag-container-page-lease');
  record.lease = token;
  let released = false;
  return {
    page:record.page,
    release({success = false,reason = 'QUERY_NOT_COMPLETED',failureKind = 'QUERY_FAILURE'} = {}) {
      // Repeated or stale release calls cannot unlock a newer lease.
      if (released || record.lease !== token) return snapshot(record);
      released = true;
      record.lease = null;
      record.busy = false;
      if (success === true) {
        record.reason = null;
        record.failureKind = null;
      } else {
        record.quarantined = true;
        record.reason = typeof reason === 'string' ? reason.slice(0,100) : 'QUERY_NOT_COMPLETED';
        record.failureKind = typeof failureKind === 'string' ? failureKind.slice(0,100) : 'QUERY_FAILURE';
      }
      return snapshot(record);
    },
  };
}
