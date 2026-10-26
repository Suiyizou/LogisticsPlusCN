import { onScopeDispose, ref } from "vue";

/** A reactive media preference whose listener lives only as long as its Vue scope. */
export function useReducedMotion(target = globalThis.window) {
  const query = target?.matchMedia?.("(prefers-reduced-motion: reduce)");
  const reduced = ref(Boolean(query?.matches));
  const update = (event) => {
    reduced.value = event.matches;
  };
  query?.addEventListener?.("change", update);
  onScopeDispose(() => query?.removeEventListener?.("change", update));
  return reduced;
}
