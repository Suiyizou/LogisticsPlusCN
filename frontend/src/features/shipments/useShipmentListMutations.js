import { onScopeDispose, ref, watch } from "vue";

// List commands own their request lifetime; submitted IDs are independent of later selections.
export function useShipmentListMutations({
  list,
  detail,
  directory,
  selectedShipmentId,
  ownerIdentity,
  canManage,
  services,
  feedback,
  formatters,
  isLocked = () => false,
  confirm = (...args) => window.confirm(...args)
}) {
  const { t, showSuccess, showError } = feedback;
  const batchDeletingShipments = ref(false);
  const batchBusinessFieldsDialogOpen = ref(false);
  /** @type {import("vue").Ref<import("../../types/businessRecords").ShipmentBusinessFieldRow[]>} */
  const batchBusinessFieldRows = ref([]);
  const batchSavingBusinessFields = ref(false);
  let disposed = false,
    identityVersion = 0,
    selectionVersion = 0,
    editorVersion = 0,
    ownedRefresh = null;
  const allowed = () => !disposed && canManage.value;
  const busy = () =>
    batchDeletingShipments.value ||
    batchSavingBusinessFields.value ||
    detail.deletingShipment.value ||
    detail.refreshingShipment.value ||
    isLocked();
  const current = (version) => allowed() && version === identityVersion;
  function invalidateIdentity() {
    identityVersion++;
    editorVersion++;
    batchBusinessFieldsDialogOpen.value = false;
    batchBusinessFieldRows.value = [];
    ownedRefresh?.abort();
  }
  watch(ownerIdentity, invalidateIdentity, { flush: "sync" });
  watch(
    canManage,
    (allowed) => {
      if (!allowed) invalidateIdentity();
    },
    { flush: "sync" }
  );
  watch(
    [
      list.selectedShipmentRows,
      list.shipmentPage,
      list.shipmentPageSize,
      list.shipmentCustomerFilter,
      list.shipmentBusinessFilter,
      list.refreshIssuesOnly
    ],
    () => selectionVersion++,
    { flush: "sync" }
  );
  function clearSubmittedSelection(version) {
    if (selectionVersion !== version) return;
    list.selectedShipmentRows.value = [];
    list.shipmentTableRef.value?.clearSelection?.();
  }
  function removeLocal(ids) {
    const deleted = new Set(ids);
    directory.shipments.value = directory.shipments.value.filter(
      (row) => !deleted.has(row.shipmentId)
    );
    list.availableShipments.value = list.availableShipments.value.filter(
      (row) => !deleted.has(row.shipmentId)
    );
    if (deleted.has(selectedShipmentId.value)) selectedShipmentId.value = "";
  }
  async function reloadAfterWrite(version, successKey, params) {
    if (!current(version)) return false;
    let loaded;
    try {
      loaded = await list.loadAvailableShipments();
    } catch (error) {
      if (current(version)) showError(error, "customers.loadAvailableShipmentsFailed");
      return false;
    }
    if (!current(version)) return false;
    // The list reports its own read error. Do not mislabel a committed write as a failed write.
    if (loaded !== false) showSuccess(successKey, params);
    return loaded !== false;
  }
  async function deleteShipmentRow(row) {
    if (!allowed() || busy() || !row?.shipmentId) return false;
    const id = row.shipmentId,
      version = identityVersion,
      selection = selectionVersion;
    if (!confirm(t("customers.deleteShipmentConfirm")) || !current(version) || busy()) return false;
    detail.deletingShipment.value = true;
    try {
      await services.deleteShipment(id);
      if (!current(version)) return false;
      clearSubmittedSelection(selection);
      removeLocal([id]);
      return await reloadAfterWrite(version, "customers.shipmentDeleted");
    } catch (error) {
      if (current(version)) showError(error, "customers.shipmentDeleteFailed");
      return false;
    } finally {
      detail.deletingShipment.value = false;
    }
  }
  function openBatchBusinessFieldsEditor() {
    if (!allowed() || busy() || !list.selectedShipmentRows.value.length) return false;
    editorVersion++;
    batchBusinessFieldRows.value = list.selectedShipmentRows.value.map((row) => ({
      shipmentId: row.shipmentId,
      referenceNo: row.referenceNo || row.shipmentId,
      carrier: row.carrier || t("customers.missingValue"),
      forwarderJobNumber: row.forwarderJobNumber || "",
      clientPoNumber: row.clientPoNumber || "",
      clientNameCode: row.clientNameCode || formatters.primaryBoundCustomerName(row)
    }));
    batchBusinessFieldsDialogOpen.value = true;
    return true;
  }
  function closeBatchBusinessFieldsEditor() {
    if (batchSavingBusinessFields.value) return false;
    editorVersion++;
    batchBusinessFieldsDialogOpen.value = false;
    batchBusinessFieldRows.value = [];
    return true;
  }
  async function saveBatchBusinessFields() {
    if (
      !allowed() ||
      busy() ||
      !batchBusinessFieldsDialogOpen.value ||
      !batchBusinessFieldRows.value.length
    )
      return false;
    const version = identityVersion,
      editor = editorVersion,
      selection = selectionVersion;
    const payload = batchBusinessFieldRows.value.map((row) => ({
      shipmentId: row.shipmentId,
      forwarderJobNumber: String(row.forwarderJobNumber || "").trim() || null,
      clientPoNumber: String(row.clientPoNumber || "").trim() || null,
      clientNameCode: String(row.clientNameCode || "").trim() || null
    }));
    batchSavingBusinessFields.value = true;
    try {
      const result = await services.updateFields(payload);
      if (!current(version)) return false;
      if (editor === editorVersion) {
        batchBusinessFieldsDialogOpen.value = false;
        batchBusinessFieldRows.value = [];
        editorVersion++;
      }
      clearSubmittedSelection(selection);
      return await reloadAfterWrite(version, "customers.batchBusinessFieldsSaved", {
        count: result?.updated || 0
      });
    } catch (error) {
      if (current(version) && editor === editorVersion)
        showError(error, "customers.batchBusinessFieldsSaveFailed");
      return false;
    } finally {
      batchSavingBusinessFields.value = false;
    }
  }
  async function batchDeleteSelectedShipments() {
    if (!allowed() || busy()) return false;
    const ids = [
      ...new Set(list.selectedShipmentRows.value.map((row) => row?.shipmentId).filter(Boolean))
    ];
    const version = identityVersion,
      selection = selectionVersion;
    if (
      !ids.length ||
      !confirm(t("customers.batchDeleteConfirm", { count: ids.length })) ||
      !current(version) ||
      busy()
    )
      return false;
    batchDeletingShipments.value = true;
    try {
      await services.deleteShipments(ids);
      if (!current(version)) return false;
      clearSubmittedSelection(selection);
      removeLocal(ids);
      return await reloadAfterWrite(version, "customers.batchDeleteSuccess", { count: ids.length });
    } catch (error) {
      if (current(version)) showError(error, "customers.batchDeleteFailed");
      return false;
    } finally {
      batchDeletingShipments.value = false;
    }
  }
  async function updateShipmentTracking(row) {
    if (!allowed() || busy()) return false;
    const reference = formatters.preferredTrackingReference(row);
    if (!row?.carrier || !reference.number) return false;
    const version = identityVersion;
    const controller = new AbortController();
    ownedRefresh = controller;
    const payload = {
      carrier: row.carrier,
      channel: services.readChannel(),
      type: reference.type,
      number: reference.number,
      forceRefresh: true
    };
    detail.refreshingShipment.value = true;
    detail.refreshAbortController.value = controller;
    try {
      const { response, data } = await services.requestTracking(payload, controller.signal);
      if (!current(version) || controller.signal.aborted) return false;
      if (!response.ok || data?.cacheSource === "MYSQL_STALE" || data?.warning)
        throw new Error(data?.warning || data?.message || `HTTP ${response.status}`);
      return await reloadAfterWrite(version, "customers.refreshSuccess");
    } catch (error) {
      if (current(version) && !controller.signal.aborted)
        showError(error, "customers.refreshFailed");
      return false;
    } finally {
      detail.refreshingShipment.value = false;
      if (detail.refreshAbortController.value === controller)
        detail.refreshAbortController.value = null;
      if (ownedRefresh === controller) ownedRefresh = null;
    }
  }
  onScopeDispose(() => {
    disposed = true;
    ownedRefresh?.abort();
    identityVersion++;
    editorVersion++;
    batchBusinessFieldRows.value = [];
    batchBusinessFieldsDialogOpen.value = false;
  });
  return {
    batchDeletingShipments,
    batchBusinessFieldsDialogOpen,
    batchBusinessFieldRows,
    batchSavingBusinessFields,
    deleteShipmentRow,
    openBatchBusinessFieldsEditor,
    closeBatchBusinessFieldsEditor,
    saveBatchBusinessFields,
    batchDeleteSelectedShipments,
    updateShipmentTracking
  };
}
