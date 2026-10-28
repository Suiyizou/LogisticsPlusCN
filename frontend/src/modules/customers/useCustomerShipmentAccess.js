import { computed, onScopeDispose, reactive, ref, watch } from "vue";
import { supportsShipmentReference } from "../../services/trackingCarriers.js";

/** Customer-side ticket associations and publication, with a fixed mutation target. */
export function useCustomerShipmentAccess({
  directory,
  availableShipments,
  canManage,
  services,
  commands,
  clearMessage,
  showSuccess,
  showError,
  t,
  confirm = (message) => window.confirm(message)
}) {
  const { selectedCustomer, selectedCustomerId, shipments } = directory;
  const bindingShipment = ref(false);
  const selectedCandidateShipmentIds = ref([]);
  const unbindingShipmentId = ref("");
  const publishingShipmentId = ref("");
  const publishingAllShipments = ref(false);
  const bindMode = ref("reference");
  const bindForm = reactive({
    shipmentId: "",
    carrier: "COSCO",
    referenceType: "BOOKING",
    referenceNo: ""
  });
  watch(() => bindForm.carrier, (carrier) => {
    if (!supportsShipmentReference(carrier, bindForm.referenceType)) bindForm.referenceType = "BOOKING";
  }, { flush: "sync" });
  let disposed = false,
    version = 0;
  watch(
    selectedCustomerId,
    () => {
      version++;
      selectedCandidateShipmentIds.value = [];
      bindForm.shipmentId = "";
      bindForm.referenceNo = "";
    },
    { flush: "sync" }
  );
  const capture = () => ({ id: selectedCustomerId.value, version });
  const current = (context) =>
    !disposed &&
    canManage.value &&
    context.id === selectedCustomerId.value &&
    context.version === version;
  const busy = () =>
    bindingShipment.value ||
    unbindingShipmentId.value ||
    publishingShipmentId.value ||
    publishingAllShipments.value;
  const allowed = () => !disposed && canManage.value && selectedCustomer.value && !busy();
  const draftShipments = computed(() =>
    shipments.value.filter((item) => item.publicationStatus !== "PUBLISHED")
  );
  const unboundAvailableShipments = computed(() => {
    const bound = new Set(shipments.value.map((item) => item.shipmentId));
    const role = selectedCustomer.value?.partyRole;
    return availableShipments.value.filter(
      (item) =>
        !bound.has(item.shipmentId) &&
        (!["SHIPPER", "CONSIGNEE"].includes(role) || !item.boundRoles?.includes(role))
    );
  });
  watch(unboundAvailableShipments, (items) => {
    const ids = new Set(items.map((item) => item.shipmentId));
    selectedCandidateShipmentIds.value = selectedCandidateShipmentIds.value.filter((id) =>
      ids.has(id)
    );
  });
  function toggleCandidateShipment(id, checked) {
    if (!allowed()) return;
    const selected = new Set(selectedCandidateShipmentIds.value);
    if (checked && unboundAvailableShipments.value.some((item) => item.shipmentId === id))
      selected.add(id);
    else selected.delete(id);
    selectedCandidateShipmentIds.value = [...selected];
  }
  async function bind(payload, batch = false) {
    if (!allowed()) return false;
    const context = capture();
    bindingShipment.value = true;
    clearMessage();
    try {
      const result = batch
        ? await services.batchBind(context.id, payload)
        : await services.bind(context.id, payload);
      if (!current(context)) return false;
      bindForm.shipmentId = "";
      bindForm.referenceNo = "";
      selectedCandidateShipmentIds.value = [];
      const refreshed = await commands.refreshShipmentRelations();
      if (!current(context) || refreshed === false) return false;
      showSuccess(
        batch ? "customers.batchBoundSuccess" : "customers.boundSuccess",
        batch
          ? {
              bound: result?.bound ?? payload.length,
              skipped: result?.skipped ?? 0
            }
          : undefined
      );
      return true;
    } catch (error) {
      if (current(context))
        showError(error, batch ? "customers.batchBindFailed" : "customers.bindFailed");
      return false;
    } finally {
      if (!disposed) bindingShipment.value = false;
    }
  }
  function bindShipment() {
    const payload =
      bindMode.value === "shipmentId"
        ? { shipmentId: bindForm.shipmentId }
        : {
            carrier: bindForm.carrier,
            referenceType: bindForm.referenceType,
            referenceNo: bindForm.referenceNo
          };
    return bind(payload);
  }
  function quickBindShipment(shipment) {
    return shipment?.shipmentId ? bind({ shipmentId: shipment.shipmentId }) : false;
  }
  function batchBindSelectedShipments() {
    const ids = [...new Set(selectedCandidateShipmentIds.value)];
    return ids.length ? bind(ids, true) : false;
  }
  async function unbindShipment(shipment) {
    if (!allowed() || !shipment?.shipmentId) return false;
    const context = capture(),
      id = shipment.shipmentId;
    if (!confirm(t("customers.unbindConfirm")) || !current(context)) return false;
    unbindingShipmentId.value = id;
    try {
      await services.unbind(context.id, id);
      if (!current(context)) return false;
      shipments.value = shipments.value.filter((item) => item.shipmentId !== id);
      const refreshed = await commands.refreshShipmentRelations();
      if (!current(context) || refreshed === false) return false;
      showSuccess("customers.unboundSuccess");
      return true;
    } catch (error) {
      if (current(context)) showError(error, "customers.unbindFailed");
      return false;
    } finally {
      if (!disposed) unbindingShipmentId.value = "";
    }
  }
  async function togglePublication(shipment) {
    if (!allowed() || !shipment?.shipmentId) return false;
    const context = capture(),
      id = shipment.shipmentId;
    const published = shipment.publicationStatus !== "PUBLISHED";
    if (
      !confirm(t(published ? "customers.publishConfirm" : "customers.withdrawConfirm")) ||
      !current(context)
    )
      return false;
    publishingShipmentId.value = id;
    try {
      const updated = await services.publish(context.id, id, published);
      if (!current(context)) return false;
      shipments.value = shipments.value.map((item) => (item.shipmentId === id ? updated : item));
      showSuccess(published ? "customers.publishedSuccess" : "customers.withdrawnSuccess");
      return true;
    } catch (error) {
      if (current(context))
        showError(error, published ? "customers.publishFailed" : "customers.withdrawFailed");
      return false;
    } finally {
      if (!disposed) publishingShipmentId.value = "";
    }
  }
  async function publishAllDraftShipments() {
    if (!allowed() || !draftShipments.value.length) return false;
    const context = capture(),
      pending = draftShipments.value.map((item) => item.shipmentId);
    if (
      !confirm(t("customers.publishAllDraftsConfirm", { count: pending.length })) ||
      !current(context)
    )
      return false;
    publishingAllShipments.value = true;
    clearMessage();
    let published = 0,
      failed = 0;
    try {
      for (const id of pending) {
        if (!current(context)) return false;
        try {
          const updated = await services.publish(context.id, id, true);
          if (!current(context)) return false;
          shipments.value = shipments.value.map((item) =>
            item.shipmentId === id ? updated : item
          );
          published++;
        } catch {
          failed++;
        }
      }
      if (!current(context)) return false;
      if (failed)
        showError(
          new Error(t("customers.publishAllDraftsPartial", { published, failed })),
          "customers.publishFailed"
        );
      else showSuccess("customers.publishAllDraftsSuccess", { count: published });
      return failed === 0;
    } finally {
      if (!disposed) publishingAllShipments.value = false;
    }
  }
  onScopeDispose(() => {
    disposed = true;
    version++;
  });
  return {
    bindingShipment,
    selectedCandidateShipmentIds,
    unbindingShipmentId,
    publishingShipmentId,
    publishingAllShipments,
    bindMode,
    bindForm,
    draftShipments,
    unboundAvailableShipments,
    bindShipment,
    quickBindShipment,
    batchBindSelectedShipments,
    unbindShipment,
    toggleCandidateShipment,
    togglePublication,
    publishAllDraftShipments
  };
}
