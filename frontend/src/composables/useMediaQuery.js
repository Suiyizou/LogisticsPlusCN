import { onScopeDispose, readonly, ref } from "vue";

/** Media queries share the component lifetime, including callbacks queued before disposal. */
export function useMediaQuery(expression, target = globalThis.window) {
  const query = target?.matchMedia?.(expression);
  const matches = ref(Boolean(query?.matches));
  let disposed = false;
  const update = (event) => {
    if (!disposed) matches.value = Boolean(event.matches);
  };
  query?.addEventListener?.("change", update);
  onScopeDispose(() => {
    disposed = true;
    query?.removeEventListener?.("change", update);
  });
  return readonly(matches);
}
