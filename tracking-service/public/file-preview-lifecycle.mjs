// Ownership is independent from DOM clearing: a response may clear its own content safely.
export function createFilePreviewLifecycle() {
  let generation = 0;
  let active = null;
  function invalidate() {
    generation += 1;
    const previous = active;
    active = null;
    previous?.controller.abort();
    previous?.dispose?.();
  }
  return {
    begin() {
      invalidate();
      active = { generation, controller: new AbortController(), dispose: null };
      return active;
    },
    isCurrent(request) {
      return active === request && !request.controller.signal.aborted;
    },
    attach(request, dispose) {
      if (active === request && !request.controller.signal.aborted) request.dispose = dispose;
      else dispose();
    },
    invalidate
  };
}
