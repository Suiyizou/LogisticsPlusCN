import { computed, onScopeDispose, ref, watch } from "vue";

export function useCustomerSummary({ read, user }) {
  const items = ref([]),
    query = ref(""),
    loading = ref(false),
    error = ref("");
  let disposed = false,
    version = 0;
  const allowed = () => ["ADMIN", "BUSINESS"].includes(user.value?.role);
  const identity = () => JSON.stringify([user.value?.id, user.value?.role]);
  const rows = computed(() =>
    items.value.filter((item) =>
      [item.displayName, item.username, item.clientCode].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query.value.trim().toLowerCase())
      )
    )
  );
  async function refresh() {
    if (disposed || !allowed()) return false;
    const request = ++version,
      owner = identity();
    const current = () => !disposed && request === version && owner === identity() && allowed();
    loading.value = true;
    error.value = "";
    try {
      const response = await read();
      if (!current()) return false;
      items.value = response;
      return true;
    } catch (failure) {
      if (current()) error.value = failure?.message || String(failure);
      return false;
    } finally {
      if (current()) loading.value = false;
    }
  }
  watch(
    identity,
    () => {
      version++;
      items.value = [];
      loading.value = false;
      error.value = "";
      query.value = "";
    },
    { flush: "sync" }
  );
  onScopeDispose(() => {
    disposed = true;
    version++;
  });
  return { rows, query, loading, error, refresh };
}
