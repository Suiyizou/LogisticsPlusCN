import { onScopeDispose, ref } from "vue";

export function useTablePageTransition({ reducedMotion, scheduler = globalThis }) {
  const tablePageTransitioning = ref(false);
  let timer;
  let disposed = false;
  function runTablePageTransition(callback) {
    if (disposed) return;
    scheduler.clearTimeout(timer);
    tablePageTransitioning.value = true;
    callback();
    timer = scheduler.setTimeout(
      () => {
        if (!disposed) tablePageTransitioning.value = false;
      },
      reducedMotion.value ? 0 : 160
    );
  }
  onScopeDispose(() => {
    disposed = true;
    scheduler.clearTimeout(timer);
  });
  return { tablePageTransitioning, runTablePageTransition };
}
