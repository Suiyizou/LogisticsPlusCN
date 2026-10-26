import { computed, onScopeDispose, ref, watch } from "vue";

/** Shipment-side association workflow. A batch keeps its original ticket and customer IDs. */
export function useShipmentCustomerBindings({
  selectedShipmentId,
  shipmentCustomerMap,
  canManage,
  services,
  commands,
  t,
  showSuccess,
  showError,
  confirm = (message) => window.confirm(message)
}) {
  const selectedCustomerIds = ref([]),
    batchBinding = ref(false),
    batchBindingProgress = ref("");
  let disposed = false,
    version = 0;
  watch(
    selectedShipmentId,
    () => {
      version++;
      selectedCustomerIds.value = [];
    },
    { flush: "sync" }
  );
  const capture = () => ({ id: selectedShipmentId.value, version });
  const current = (context) =>
    !disposed &&
    canManage.value &&
    context.id === selectedShipmentId.value &&
    context.version === version;
  const boundCustomers = computed(() => shipmentCustomerMap.value[selectedShipmentId.value] || []);
  const allowed = () =>
    !disposed && canManage.value && selectedShipmentId.value && !batchBinding.value;
  async function batchBindCustomers() {
    if (!allowed() || !selectedCustomerIds.value.length) return false;
    const context = capture(),
      ids = [...new Set(selectedCustomerIds.value)];
    batchBinding.value = true;
    let success = 0;
    const failedIds = [];
    try {
      for (const [index, id] of ids.entries()) {
        if (!current(context)) return false;
        batchBindingProgress.value = t("customers.batchBindingProgress", {
          current: index + 1,
          total: ids.length
        });
        try {
          await services.bind(id, { shipmentId: context.id });
          if (!current(context)) return false;
          success++;
          shipmentCustomerMap.value[context.id] = [
            ...new Set([...(shipmentCustomerMap.value[context.id] || []), id])
          ];
        } catch {
          failedIds.push(id);
        }
      }
      if (!current(context)) return false;
      selectedCustomerIds.value = failedIds;
      const refreshed = await commands.refreshShipmentRelations();
      if (!current(context) || refreshed === false) return false;
      const message = t("customers.batchBindingResult", { success, total: ids.length });
      if (failedIds.length) showError(new Error(message), "customers.bindFailed");
      else showSuccess(message);
      return success === ids.length;
    } catch (error) {
      if (current(context)) showError(error, "customers.bindFailed");
      return false;
    } finally {
      if (!disposed) {
        batchBinding.value = false;
        batchBindingProgress.value = "";
      }
    }
  }
  async function unbindCustomerFromShipment(id) {
    if (!allowed() || !id) return false;
    const context = capture();
    if (!confirm(t("customers.unbindConfirm")) || !current(context)) return false;
    batchBinding.value = true;
    try {
      await services.unbind(id, context.id);
      if (!current(context)) return false;
      shipmentCustomerMap.value[context.id] = (shipmentCustomerMap.value[context.id] || []).filter(
        (customerId) => customerId !== id
      );
      const refreshed = await commands.refreshShipmentRelations();
      if (!current(context) || refreshed === false) return false;
      showSuccess("customers.unboundSuccess");
      return true;
    } catch (error) {
      if (current(context)) showError(error, "customers.unbindFailed");
      return false;
    } finally {
      if (!disposed) batchBinding.value = false;
    }
  }
  onScopeDispose(() => {
    disposed = true;
    version++;
  });
  return {
    selectedCustomerIds,
    batchBinding,
    batchBindingProgress,
    boundCustomersForSelectedShipment: boundCustomers,
    batchBindCustomers,
    unbindCustomerFromShipment
  };
}
