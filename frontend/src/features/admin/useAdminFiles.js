// @ts-check
import { computed, ref } from "vue";
import { adminErrorText, useAdminSessionGuard } from "./useAdminSessionGuard.js";
import { adminShipmentFileDeleted, adminShipmentFileId } from "./adminFileRules.js";

/** @param {import("../../types/adminFiles").AdminFilePorts} ports */
export function useAdminFiles({
  currentUser,
  isHostBusy,
  services,
  feedback,
  t,
  translate,
  confirmDelete,
  onDeleted
}) {
  /** @template T */
  function list(/** @type {T[]} */ rows) {
    return {
      rows: /** @type {import("vue").Ref<T[]>} */ (ref(rows)),
      total: ref(0),
      page: ref(1),
      size: ref(20),
      loaded: ref(false),
      version: 0
    };
  }
  const workspace = list(/** @type {import("../../types/adminFiles").AdminWorkspaceFile[]} */ ([]));
  const shipment = list(/** @type {import("../../types/adminFiles").AdminShipmentFile[]} */ ([]));
  const includeExpiredFiles = ref(false),
    activeAdminFileSection = ref(/** @type {"workspace" | "shipment"} */ ("shipment"));
  const pending = ref(false),
    reading = ref(0);
  const busy = computed(() => pending.value || reading.value > 0);
  const adminFilesLoaded = computed(() => workspace.loaded.value && shipment.loaded.value);
  const session = useAdminSessionGuard({ currentUser, invalidate });
  function invalidate() {
    for (const state of [workspace, shipment]) {
      state.version++;
      state.rows.value = [];
      state.total.value = 0;
      state.page.value = 1;
      state.size.value = 20;
      state.loaded.value = false;
    }
    includeExpiredFiles.value = false;
    activeAdminFileSection.value = "shipment";
    pending.value = false;
    reading.value = 0;
  }
  /** @param {"workspace" | "shipment"} kind @param {boolean} [afterWrite] */
  async function read(kind, afterWrite = false) {
    const context = session.capture();
    if (context === null || (pending.value && !afterWrite)) return false;
    const state = kind === "workspace" ? workspace : shipment;
    const version = ++state.version,
      page = state.page.value,
      size = state.size.value,
      expired = includeExpiredFiles.value;
    const current = () =>
      session.current(context) &&
      version === state.version &&
      page === state.page.value &&
      size === state.size.value &&
      (kind !== "workspace" || expired === includeExpiredFiles.value);
    const fetchPage = (/** @type {number} */ index) =>
      kind === "workspace"
        ? services.fetchWorkspaceFiles({ page: index - 1, size, includeExpired: expired })
        : services.fetchShipmentFiles({ page: index - 1, size, includeDeleted: true });
    reading.value++;
    try {
      let data = await fetchPage(page);
      if (!current()) return false;
      const total = Number.isFinite(data.total)
        ? Math.max(0, Math.floor(data.total ?? 0))
        : (data.items?.length ?? 0);
      const lastPage = Math.max(1, Math.ceil(total / size));
      if (page > lastPage) {
        data = await fetchPage(lastPage);
        if (!current()) return false;
        state.page.value = lastPage;
      }
      // The source kind owns the row type even when both lists are refreshed together.
      if (kind === "workspace")
        workspace.rows.value =
          /** @type {import("../../types/adminFiles").AdminWorkspaceFile[]} */ (
            Array.isArray(data.items) ? data.items : []
          );
      else
        shipment.rows.value = /** @type {import("../../types/adminFiles").AdminShipmentFile[]} */ (
          Array.isArray(data.items) ? data.items : []
        );
      state.total.value = Number.isFinite(data.total)
        ? Math.max(0, Math.floor(data.total ?? 0))
        : (data.items?.length ?? 0);
      state.loaded.value = true;
      return true;
    } catch (error) {
      feedback.handled(error);
      if (current()) throw error;
      return false;
    } finally {
      if (session.current(context)) reading.value--;
    }
  }
  async function loadAdminFileListsWithoutLoading() {
    const results = await Promise.allSettled([read("workspace"), read("shipment")]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    return results.every((result) => result.status === "fulfilled" && result.value);
  }
  const allowed = () => session.authorized() && !pending.value && !isHostBusy();
  /** @param {"workspace" | "shipment"} kind */
  async function refresh(kind) {
    const context = session.capture();
    if (!allowed()) return false;
    try {
      return await read(kind);
    } catch (error) {
      if (session.current(context))
        await feedback.error(translate(adminErrorText(error, t("admin.employee.errorFallback"))));
      return false;
    }
  }
  /** @param {"workspace" | "shipment"} kind @param {number} page */
  async function changePage(kind, page) {
    if (!allowed() || !Number.isInteger(page) || page < 1) return false;
    (kind === "workspace" ? workspace : shipment).page.value = page;
    return refresh(kind);
  }
  async function handleWorkspaceExpiredToggle() {
    if (!allowed()) return false;
    workspace.page.value = 1;
    return refresh("workspace");
  }
  /** @param {import("../../types/adminFiles").AdminWorkspaceFile | import("../../types/adminFiles").AdminShipmentFile} file @param {"workspace" | "shipment"} kind */
  async function download(file, kind) {
    const context = session.capture();
    if (!allowed() || busy.value) return false;
    const id = kind === "workspace" ? file.id : adminShipmentFileId(file);
    if (
      id == null ||
      id === "" ||
      (kind === "workspace" && "expired" in file && file.expired) ||
      (kind === "shipment" && adminShipmentFileDeleted(file))
    )
      return false;
    const name =
      file.originalFileName || ("fileName" in file && file.fileName) || `${kind}-file-${id}`;
    pending.value = true;
    feedback.clear();
    try {
      if (kind === "workspace") await services.downloadWorkspaceFile(id, name);
      else await services.downloadShipmentFile(id, name);
      return session.current(context);
    } catch (error) {
      feedback.handled(error);
      if (session.current(context))
        await feedback.error(translate(adminErrorText(error, t("admin.employee.errorFallback"))));
      return false;
    } finally {
      if (session.current(context)) pending.value = false;
    }
  }
  /** @param {import("../../types/adminFiles").AdminShipmentFile} file */
  async function handleDeleteShipmentFile(file) {
    const context = session.capture(),
      id = adminShipmentFileId(file);
    if (!allowed() || busy.value || id === "" || adminShipmentFileDeleted(file)) return false;
    const target = Object.freeze({ ...file });
    pending.value = true;
    try {
      if (!(await confirmDelete(target)) || !session.current(context) || isHostBusy()) return false;
      feedback.clear();
      await services.deleteShipmentFile(id);
      if (!session.current(context)) return false;
      // includeDeleted=true retains soft-deleted rows rather than removing audit history.
      shipment.rows.value = shipment.rows.value.map((row) =>
        String(adminShipmentFileId(row)) === String(id) ? { ...row, status: "DELETED" } : row
      );
      onDeleted(id);
      try {
        await read("shipment", true);
      } catch {
        if (session.current(context)) await feedback.error(t("adminWorkflow.savedRefreshFailed"));
        return session.current(context);
      }
      if (session.current(context)) feedback.success(t("admin.files.deleteSuccess"));
      return session.current(context);
    } catch (error) {
      feedback.handled(error);
      if (session.current(context))
        await feedback.error(translate(adminErrorText(error, t("admin.employee.errorFallback"))));
      return false;
    } finally {
      if (session.current(context)) pending.value = false;
    }
  }
  return {
    adminWorkspaceFiles: workspace.rows,
    adminWorkspaceFileTotal: workspace.total,
    adminWorkspaceFilePage: workspace.page,
    adminWorkspaceFilePageSize: workspace.size,
    adminShipmentFiles: shipment.rows,
    adminShipmentFileTotal: shipment.total,
    adminShipmentFilePage: shipment.page,
    adminShipmentFilePageSize: shipment.size,
    adminFilesLoaded,
    includeExpiredFiles,
    activeAdminFileSection,
    busy,
    loadAdminFileListsWithoutLoading,
    loadAdminWorkspaceFiles: () => refresh("workspace"),
    loadAdminShipmentFiles: () => refresh("shipment"),
    changeAdminWorkspaceFilePage: (/** @type {number} */ page) => changePage("workspace", page),
    changeAdminShipmentFilePage: (/** @type {number} */ page) => changePage("shipment", page),
    handleWorkspaceExpiredToggle,
    handleDownloadWorkspaceFile: (
      /** @type {import("../../types/adminFiles").AdminWorkspaceFile} */ file
    ) => download(file, "workspace"),
    handleDownloadShipmentFile: (
      /** @type {import("../../types/adminFiles").AdminShipmentFile} */ file
    ) => download(file, "shipment"),
    handleDeleteShipmentFile
  };
}
