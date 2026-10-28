import { watchEffect } from "vue";

/** Keep the current business page visible in browser tabs and shared window titles. */
export function useWorkspaceTitle(readTitle: () => string) {
  watchEffect(() => {
    const title = readTitle();
    if (typeof document !== "undefined") document.title = `${title} | logisticspluscn`;
  });
}
