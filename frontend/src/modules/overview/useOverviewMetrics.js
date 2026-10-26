import { computed, onScopeDispose, ref, watch } from "vue";
import { buildOverviewModel } from "./overviewModel.js";

export function useOverviewMetrics({
  fetchStats,
  readFallback,
  currentUser,
  t,
  locale,
  now = () => new Date()
}) {
  const stats = ref(null),
    snapshot = ref({}),
    loading = ref(false),
    error = ref("");
  const clock = ref(now());
  const usingCache = ref(false);
  let version = 0,
    disposed = false;
  const owner = () => `${currentUser()?.id || ""}:${currentUser()?.role || ""}`;
  const allowed = () => !disposed && ["ADMIN", "BUSINESS"].includes(currentUser()?.role);
  function clear() {
    version++;
    stats.value = null;
    snapshot.value = {};
    error.value = "";
    loading.value = false;
    usingCache.value = false;
  }
  async function reload() {
    if (!allowed()) return false;
    const requestVersion = ++version,
      identity = owner();
    const current = () => allowed() && version === requestVersion && owner() === identity;
    loading.value = true;
    error.value = "";
    try {
      const result = await fetchStats();
      if (!current()) return false;
      if (!result || typeof result !== "object" || Array.isArray(result))
        throw Error(t("customers.overviewLoadFailed"));
      stats.value = result;
      snapshot.value = readFallback();
      usingCache.value = false;
      clock.value = now();
      return true;
    } catch (failure) {
      if (current()) {
        stats.value = null;
        const denied = [401, 403].includes(Number(failure?.status));
        snapshot.value = denied ? {} : readFallback();
        usingCache.value = !denied;
        clock.value = now();
        error.value = failure?.message || t("customers.overviewLoadFailed");
      }
      return false;
    } finally {
      if (current()) loading.value = false;
    }
  }
  watch(
    owner,
    () => {
      clear();
      if (allowed()) void reload();
    },
    { flush: "sync" }
  );
  onScopeDispose(() => {
    disposed = true;
    clear();
  });
  const model = computed(() =>
    buildOverviewModel({
      stats: stats.value,
      snapshot: snapshot.value,
      t,
      locale: locale.value,
      now: clock.value
    })
  );
  return { loading, error, model, reload, usingCache };
}
