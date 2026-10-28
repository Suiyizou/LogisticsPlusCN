// @ts-check
import { computed, onScopeDispose, reactive, ref, watch } from "vue";
import { workspaceSessionKey } from "../../modules/workspaceContext.js";
import { adminErrorText, useAdminSessionGuard } from "./useAdminSessionGuard.js";

/** @param {import("../../types/adminConsole").AdminConsolePorts} ports */
export function useAdminConsole(ports) {
  const { currentUser, services, feedback, t, translate } = ports;
  const loginForm = reactive({ username: "admin", password: "" });
  /** @type {import("vue").Ref<import("../../types/adminOverviewTypes").AdminOverviewData | null>} */
  const systemOverview = ref(null);
  /** @type {import("vue").Ref<import("../../types/adminWorkflows").AdminSystemMonitoring | null>} */
  const monitoring = ref(null);
  /** @type {import("vue").Ref<import("../../types/adminOverviewTypes").AdminAuditRecord[]>} */
  const apiAuditRows = ref([]);
  /** @type {import("vue").Ref<import("../../types/adminOverviewTypes").AdminAuditRecord[]>} */
  const recentAuditRows = ref([]);
  const recentAuditLoading = ref(false),
    recentAuditLoaded = ref(false),
    recentAuditError = ref("");
  const apiAuditPage = ref(1),
    apiAuditPageSize = ref(20),
    apiAuditTotal = ref(0);
  const reading = ref(0),
    refreshing = ref(false),
    signingIn = ref(false);
  const busy = computed(() => reading.value > 0 || refreshing.value || signingIn.value);
  let readVersions = { overview: 0, monitoring: 0, audit: 0, recentAudit: 0 };
  let epoch = 0,
    disposed = false;
  const session = useAdminSessionGuard({ currentUser, invalidate });
  function invalidate() {
    readVersions = {
      overview: readVersions.overview + 1,
      monitoring: readVersions.monitoring + 1,
      audit: readVersions.audit + 1,
      recentAudit: readVersions.recentAudit + 1
    };
    reading.value = 0;
    refreshing.value = false;
    signingIn.value = false;
    systemOverview.value = null;
    monitoring.value = null;
    apiAuditRows.value = [];
    recentAuditRows.value = [];
    recentAuditLoading.value = false;
    recentAuditLoaded.value = false;
    recentAuditError.value = "";
    apiAuditPage.value = 1;
    apiAuditPageSize.value = 20;
    apiAuditTotal.value = 0;
    loginForm.password = "";
  }
  watch(
    () => workspaceSessionKey(currentUser.value),
    () => {
      epoch++;
    },
    { flush: "sync" }
  );
  onScopeDispose(() => {
    disposed = true;
    epoch++;
  });
  /** @template T @param {keyof typeof readVersions} kind @param {(isCurrent: () => boolean) => Promise<T>} request @param {(data: T) => void} apply */
  async function read(kind, request, apply) {
    const context = session.capture();
    if (context === null) return false;
    const version = ++readVersions[kind];
    reading.value++;
    try {
      const data = await request(() => session.current(context) && readVersions[kind] === version);
      if (!session.current(context) || readVersions[kind] !== version) return false;
      apply(data);
      return true;
    } catch (error) {
      feedback.handled(error);
      if (session.current(context) && readVersions[kind] === version) throw error;
      return false;
    } finally {
      if (session.current(context)) reading.value--;
    }
  }
  const loadOverview = () =>
    read("overview", services.fetchOverview, (data) => {
      systemOverview.value = data;
    });
  const loadMonitoring = () =>
    read("monitoring", services.fetchMonitoring, (data) => {
      monitoring.value = data;
    });
  function loadAudit() {
    const page = apiAuditPage.value,
      size = apiAuditPageSize.value;
    return read(
      "audit",
      async (isCurrent) => {
        let data = await services.fetchAudit({ page: page - 1, size });
        let effectivePage = page;
        const count = Number(data.total ?? data.items?.length ?? 0);
        const lastPage = Math.max(
          1,
          Math.ceil((Number.isFinite(count) ? Math.max(0, count) : 0) / size)
        );
        if (
          page > lastPage &&
          isCurrent() &&
          apiAuditPage.value === page &&
          apiAuditPageSize.value === size
        ) {
          data = await services.fetchAudit({ page: lastPage - 1, size });
          effectivePage = lastPage;
        }
        return { ...data, effectivePage };
      },
      (data) => {
        if (page !== apiAuditPage.value || size !== apiAuditPageSize.value) return;
        apiAuditRows.value = Array.isArray(data.items) ? data.items : [];
        apiAuditTotal.value = Math.max(0, Number(data.total ?? apiAuditRows.value.length) || 0);
        apiAuditPage.value = data.effectivePage;
      }
    );
  }
  // Overview owns a fixed first-page read; the audit list owns its separate pagination.
  async function loadRecentAudit() {
    const context = session.capture();
    if (context === null) return false;
    const version = readVersions.recentAudit + 1;
    recentAuditRows.value = [];
    recentAuditLoading.value = true;
    recentAuditLoaded.value = false;
    recentAuditError.value = "";
    try {
      return await read(
        "recentAudit",
        () => services.fetchAudit({ page: 0, size: 5 }),
        (data) => {
          recentAuditRows.value = Array.isArray(data.items) ? data.items.slice(0, 5) : [];
          recentAuditLoaded.value = true;
        }
      );
    } catch (error) {
      if (session.current(context) && readVersions.recentAudit === version)
        recentAuditError.value = translate(
          adminErrorText(error, t("admin.employee.errorFallback"))
        );
      throw error;
    } finally {
      if (session.current(context) && readVersions.recentAudit === version)
        recentAuditLoading.value = false;
    }
  }
  /** @param {unknown} error */
  async function report(error) {
    await feedback.error(translate(adminErrorText(error, t("admin.employee.errorFallback"))));
  }
  async function refreshDashboard(showSuccess = true, refreshUser = true) {
    const context = session.capture();
    if (context === null || busy.value || ports.isHostBusy()) return false;
    refreshing.value = true;
    feedback.clear();
    try {
      if (refreshUser) {
        const user = await services.fetchMe();
        if (!session.current(context)) return false;
        if (user.role !== "ADMIN" || String(user.id) !== String(currentUser.value?.id)) {
          ports.updateUser(user);
          return false;
        }
        ports.updateUser(user);
      }
      const results = await Promise.allSettled([
        loadOverview(),
        loadMonitoring(),
        loadAudit(),
        loadRecentAudit(),
        ...ports.refreshOther()
      ]);
      if (!session.current(context)) return false;
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") {
        feedback.handled(failure.reason);
        await feedback.error(ports.copy().partialFailure);
        return false;
      }
      if (showSuccess) feedback.success(ports.copy().refreshed);
      return true;
    } catch (error) {
      feedback.handled(error);
      if (session.current(context)) await report(error);
      return false;
    } finally {
      if (session.current(context)) refreshing.value = false;
    }
  }
  async function refreshAudit() {
    if (!session.authorized() || busy.value || ports.isHostBusy()) return false;
    feedback.clear();
    const context = session.capture();
    try {
      return await loadAudit();
    } catch (error) {
      if (session.current(context)) await report(error);
      return false;
    }
  }
  /** @param {number} page */
  async function changeAuditPage(page) {
    if (
      busy.value ||
      ports.isHostBusy() ||
      !session.authorized() ||
      !Number.isInteger(page) ||
      page < 1 ||
      page === apiAuditPage.value
    )
      return false;
    apiAuditRows.value = [];
    apiAuditPage.value = page;
    return refreshAudit();
  }
  async function handleLogin() {
    if (disposed || currentUser.value || busy.value || ports.isHostBusy()) return false;
    const version = epoch,
      username = loginForm.username,
      password = loginForm.password;
    signingIn.value = true;
    feedback.clear();
    try {
      const response = await services.login(username, password);
      if (disposed || epoch !== version || currentUser.value) return false;
      if (response.user?.role !== "ADMIN" || response.user.id == null || response.user.id === "")
        throw new Error(ports.copy().notAdmin);
      ports.commitLogin(response);
      signingIn.value = false;
      loginForm.password = "";
      ports.updateUser(response.user);
      const loaded = await refreshDashboard(false, false);
      if (loaded) feedback.success(ports.copy().loginSuccess);
      return true;
    } catch (error) {
      feedback.handled(error);
      if (!disposed && epoch === version) await report(error);
      return false;
    } finally {
      if (!disposed && epoch === version) signingIn.value = false;
    }
  }
  function handleLogout() {
    epoch++;
    invalidate();
    ports.loggedOut();
    ports.clearSession();
    ports.updateUser(null);
  }
  return {
    busy,
    loginForm,
    systemOverview,
    monitoring,
    apiAuditRows,
    recentAuditRows,
    recentAuditLoading,
    recentAuditLoaded,
    recentAuditError,
    loadRecentAudit,
    apiAuditPage,
    apiAuditPageSize,
    apiAuditTotal,
    loadOverview,
    loadMonitoring,
    loadAudit,
    refreshAudit,
    changeAuditPage,
    refreshDashboard,
    handleLogin,
    handleLogout
  };
}
