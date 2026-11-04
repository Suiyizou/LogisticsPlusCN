const PAGE_SIZE = 100;
const emptyState = () => ({ records: [], loading: false, error: null });

function validatePage(payload, page, firstPage) {
  if (
    !Array.isArray(payload?.items) ||
    !Number.isSafeInteger(payload.page) ||
    payload.page !== page ||
    !Number.isSafeInteger(payload.total) ||
    payload.total < 0 ||
    !Number.isSafeInteger(payload.totalPages) ||
    payload.totalPages !== Math.ceil(payload.total / PAGE_SIZE) ||
    payload.items.length !==
      Math.min(PAGE_SIZE, Math.max(0, payload.total - (page - 1) * PAGE_SIZE)) ||
    (firstPage && payload.total !== firstPage.total)
  ) {
    throw new Error("The shipment list changed or returned an incomplete page.");
  }
}

export function createLogisticsMapSource({ fetchPage, onChange = () => {} }) {
  let state = emptyState();
  let scope = null;
  let request = null;
  let destroyed = false;

  function publish(nextState) {
    state = nextState;
    onChange(state);
    return nextState;
  }

  function cancelRequest() {
    const previous = request;
    request = null;
    previous?.controller.abort();
  }

  async function load(current, params) {
    const { signal } = current.controller;
    const records = [];
    const shipmentIds = new Set();
    let firstPage;
    try {
      for (let page = 1; page <= (firstPage?.totalPages ?? 1); page += 1) {
        if (signal.aborted) return null;
        const payload = await fetchPage({ ...params, page, pageSize: PAGE_SIZE }, signal);
        if (signal.aborted || request !== current) return null;
        validatePage(payload, page, firstPage);
        firstPage ??= { total: payload.total, totalPages: payload.totalPages };
        for (const item of payload.items) {
          const id = item?.shipmentId == null ? "" : String(item.shipmentId);
          if (id && shipmentIds.has(id)) {
            throw new Error("The shipment list changed while loading its pages.");
          }
          if (id) shipmentIds.add(id);
          records.push(item);
        }
      }
    } catch (error) {
      if (signal.aborted || request !== current) return null;
      return publish({
        records: [],
        loading: false,
        error: error instanceof Error ? error : new Error("Could not load shipments.")
      });
    }
    return publish({ records, loading: false, error: null });
  }

  function refresh() {
    if (destroyed || !scope) return Promise.resolve(state);
    cancelRequest();
    const current = { controller: new AbortController(), promise: null };
    const { params } = scope;
    request = current;
    current.promise = Promise.resolve().then(() => load(current, params));
    publish({ records: [], loading: true, error: null });
    return current.promise;
  }

  function setScope(key, params = {}) {
    if (destroyed) return Promise.resolve(state);
    if (key == null) {
      if (scope) {
        scope = null;
        cancelRequest();
        return Promise.resolve(publish(emptyState()));
      }
      return Promise.resolve(state);
    }
    if (scope?.key === key) return request?.promise ?? Promise.resolve(state);
    scope = { key, params: { ...params } };
    return refresh();
  }

  function destroy() {
    destroyed = true;
    scope = null;
    cancelRequest();
    state = emptyState();
  }

  return { setScope, refresh, destroy, getState: () => state };
}
