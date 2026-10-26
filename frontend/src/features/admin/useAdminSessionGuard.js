// @ts-check
import { computed, onScopeDispose, watch } from "vue";
import { workspaceSessionKey } from "../../modules/workspaceContext.js";

/**
 * Account identity/role owns the workflow lifetime. A display-name update does
 * not invalidate it; switching away and back does invalidate all old responses.
 * @param {{ currentUser: import("../../types/adminWorkflows").AdminWorkflowPorts["currentUser"], invalidate: () => void }} ports
 */
export function useAdminSessionGuard({ currentUser, invalidate }) {
  let revision = 0;
  let disposed = false;
  const identity = computed(() => workspaceSessionKey(currentUser.value));
  function authorized() {
    return (
      !disposed &&
      currentUser.value?.role === "ADMIN" &&
      currentUser.value.id != null &&
      currentUser.value.id !== ""
    );
  }
  function capture() {
    return authorized() ? revision : null;
  }
  /** @param {number | null} captured */
  function current(captured) {
    return captured !== null && captured === revision && authorized();
  }
  watch(
    identity,
    () => {
      revision++;
      invalidate();
    },
    { flush: "sync" }
  );
  onScopeDispose(() => {
    disposed = true;
    revision++;
    invalidate();
  });
  return { authorized, capture, current };
}

/** @param {unknown} error @param {string} fallback */
export function adminErrorText(error, fallback) {
  return error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
    ? error.message || fallback
    : fallback;
}
