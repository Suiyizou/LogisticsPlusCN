// @ts-check
import { inject } from "vue";

// Session and common actions are scoped to OperationsEntry, never persisted a second time.
/** @type {import("vue").InjectionKey<import("../types/workspace").WorkspaceContext>} */
export const workspaceContextKey = Symbol("operations-workspace");

// Names/preferences may change in place. Identity/role changes require fresh workflow scopes.
/** @param {Partial<import("../types/workspace").WorkspaceUser> | null | undefined} user */
export function workspaceSessionKey(user) {
  return JSON.stringify([user?.id ?? "", user?.username || "", user?.role || ""]);
}

export function useWorkspaceContext() {
  const context = inject(workspaceContextKey, null);
  if (!context) throw Error("Business modules must be mounted inside OperationsEntry");
  return context;
}
