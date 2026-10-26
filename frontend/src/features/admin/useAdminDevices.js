// @ts-check
import { computed, ref } from "vue";
import { adminErrorText, useAdminSessionGuard } from "./useAdminSessionGuard.js";

/** @param {import("../../types/adminWorkflows").AdminDevicePorts} ports */
export function useAdminDevices({
  currentUser,
  isHostBusy,
  services,
  feedback,
  t,
  translate,
  confirmDelete
}) {
  /** @type {import("vue").Ref<import("../../types/adminWorkflows").AdminDevice[]>} */
  const devices = ref([]);
  const deviceTotal = ref(0),
    devicePage = ref(1),
    devicePageSize = ref(20);
  const pending = ref(false),
    reading = ref(0);
  const busy = computed(() => pending.value || reading.value > 0);
  let readVersion = 0;
  const session = useAdminSessionGuard({ currentUser, invalidate });
  function invalidate() {
    readVersion++;
    pending.value = false;
    reading.value = 0;
    devices.value = [];
    deviceTotal.value = 0;
    devicePage.value = 1;
    devicePageSize.value = 20;
  }
  /** @param {boolean} [afterWrite] */
  async function readPage(afterWrite = false) {
    const context = session.capture();
    if (context === null || (pending.value && !afterWrite)) return false;
    const version = ++readVersion,
      page = devicePage.value,
      size = devicePageSize.value;
    reading.value++;
    const current = () =>
      session.current(context) &&
      version === readVersion &&
      page === devicePage.value &&
      size === devicePageSize.value;
    try {
      let data = await services.fetchDevices({ page: page - 1, size });
      if (!current()) return false;
      const total = Number.isFinite(data.total) ? Math.max(0, Math.floor(data.total ?? 0)) : 0;
      const lastPage = Math.max(1, Math.ceil(total / size));
      // A deletion or another administrator may empty the last page. Correct once,
      // without letting a late response move a newer page selection backwards.
      if (page > lastPage) {
        data = await services.fetchDevices({ page: lastPage - 1, size });
        if (!current()) return false;
        devicePage.value = lastPage;
      }
      devices.value = Array.isArray(data.items) ? data.items : [];
      deviceTotal.value = Number.isFinite(data.total)
        ? Math.max(0, Math.floor(data.total ?? 0))
        : 0;
      return true;
    } catch (error) {
      feedback.handled(error);
      if (current()) throw error;
      return false;
    } finally {
      if (session.current(context)) reading.value--;
    }
  }
  async function loadDevicePage() {
    return readPage();
  }
  /** @param {number} page */
  async function changeDevicePage(page) {
    const context = session.capture();
    if (context === null || pending.value || isHostBusy() || !Number.isInteger(page) || page < 1)
      return false;
    devicePage.value = page;
    try {
      return await readPage();
    } catch (error) {
      if (session.current(context))
        await feedback.error(translate(adminErrorText(error, t("admin.employee.errorFallback"))));
      return false;
    }
  }
  /** @param {import("../../types/adminWorkflows").AdminDevice} device @param {"kick" | "delete"} action */
  async function mutate(device, action) {
    const context = session.capture();
    if (
      context === null ||
      busy.value ||
      isHostBusy() ||
      device.id == null ||
      (action === "kick" && !device.online)
    )
      return false;
    const target = Object.freeze({ ...device });
    pending.value = true;
    try {
      if (action === "delete" && !(await confirmDelete(target))) return false;
      if (!session.current(context) || isHostBusy()) return false;
      feedback.clear();
      if (action === "kick") await services.kickDevice(target.id);
      else await services.deleteDevice(target.id);
      if (!session.current(context)) return false;
      // Retain the known committed change even if the following read fails.
      if (action === "kick")
        devices.value = devices.value.map((row) =>
          String(row.id) === String(target.id) ? { ...row, online: false } : row
        );
      else {
        devices.value = devices.value.filter((row) => String(row.id) !== String(target.id));
        deviceTotal.value = Math.max(0, deviceTotal.value - 1);
      }
      try {
        await readPage(true);
      } catch (error) {
        if (session.current(context)) await feedback.error(t("adminWorkflow.savedRefreshFailed"));
        return session.current(context);
      }
      if (session.current(context))
        feedback.success(
          t(action === "kick" ? "adminWorkflow.deviceKicked" : "adminWorkflow.deviceDeleted")
        );
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
  /** @param {import("../../types/adminWorkflows").AdminDevice} device */
  function handleKickDevice(device) {
    return mutate(device, "kick");
  }
  /** @param {import("../../types/adminWorkflows").AdminDevice} device */
  function handleDeleteDevice(device) {
    return mutate(device, "delete");
  }
  return {
    devices,
    deviceTotal,
    devicePage,
    devicePageSize,
    busy,
    loadDevicePage,
    changeDevicePage,
    handleKickDevice,
    handleDeleteDevice
  };
}
