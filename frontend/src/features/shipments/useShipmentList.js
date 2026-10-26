import { computed, onScopeDispose, ref, watch } from "vue";
import { positiveInteger } from "../tables/pagination.js";

/** Server-side paging, filter state and visible row selection belong to the ticket list. */
export function useShipmentList({
  customers,
  customersLoaded,
  customerFilterOptionLabel,
  fetchAvailableBusinessShipments,
  normalizeBusinessShipment,
  showError,
  runTablePageTransition = (callback) => callback()
}) {
  const availableShipments = ref([]);
  const loadingAvailableShipments = ref(false);
  const shipmentsLoaded = ref(false);
  const selectedShipmentRows = ref([]);
  /** @type {import("vue").Ref<import("../../types/workspace").TableSelectionHandle<import("../../types/businessRecords").ShipmentRecord> | null>} */
  const shipmentTableRef = ref(null);
  const shipmentCustomerFilter = ref("");
  const shipmentBusinessFilter = ref("");
  const refreshIssuesOnly = ref(false);
  const shipmentPage = ref(1);
  const shipmentPageSize = ref(20);
  const shipmentTotal = ref(0);
  const shipmentRefreshIssueTotal = ref(0);
  const shipmentCustomerMap = ref({});
  const shipmentFilterCustomers = computed(() =>
    customers.value
      .filter((customer) => Number(customer.shipmentCount || 0) > 0)
      .sort((left, right) =>
        customerFilterOptionLabel(left).localeCompare(customerFilterOptionLabel(right))
      )
  );
  const refreshIssueCount = computed(() => shipmentRefreshIssueTotal.value);
  const displayedAvailableShipments = computed(() => availableShipments.value);
  let requestSequence = 0;
  let disposed = false;
  const query = () => ({
    page: shipmentPage.value,
    pageSize: shipmentPageSize.value,
    customerId: shipmentCustomerFilter.value,
    refreshIssuesOnly: refreshIssuesOnly.value,
    businessFilter: shipmentBusinessFilter.value
  });
  const clearSelection = () => {
    selectedShipmentRows.value = [];
    shipmentTableRef.value?.clearSelection?.();
  };

  watch([shipmentFilterCustomers, customersLoaded], () => {
    if (
      customersLoaded.value &&
      shipmentCustomerFilter.value &&
      !shipmentFilterCustomers.value.some((item) => item.id === shipmentCustomerFilter.value)
    )
      shipmentCustomerFilter.value = "";
  });
  watch([shipmentCustomerFilter, shipmentBusinessFilter, refreshIssuesOnly], () => {
    shipmentPage.value = 1;
    clearSelection();
    void loadAvailableShipments();
  });
  watch(availableShipments, (items) => {
    const byId = new Map(items.map((item) => [item.shipmentId, item]));
    selectedShipmentRows.value = selectedShipmentRows.value
      .map((item) => byId.get(item.shipmentId))
      .filter(Boolean);
  });

  function buildShipmentCustomerMap() {
    if (disposed) return;
    const map = {};
    for (const shipment of availableShipments.value) {
      if (!shipment?.shipmentId) continue;
      const boundCustomers = Array.isArray(shipment.boundCustomers) ? shipment.boundCustomers : [];
      const ids = boundCustomers
        .map((customer) => (typeof customer === "string" ? customer : customer?.id))
        .filter(Boolean);
      if (ids.length) map[shipment.shipmentId] = [...new Set(ids)];
    }
    shipmentCustomerMap.value = map;
  }
  async function loadAvailableShipments() {
    if (disposed) return false;
    const request = ++requestSequence;
    const parameters = query();
    const queryKey = JSON.stringify(parameters);
    const valid = () =>
      !disposed && request === requestSequence && queryKey === JSON.stringify(query());
    loadingAvailableShipments.value = true;
    try {
      const response = await fetchAvailableBusinessShipments(parameters);
      if (!valid()) return false;
      availableShipments.value = Array.isArray(response?.items)
        ? response.items.map(normalizeBusinessShipment).filter(Boolean)
        : [];
      shipmentTotal.value = Math.max(0, Number(response?.total) || 0);
      shipmentRefreshIssueTotal.value = Math.max(0, Number(response?.refreshIssueTotal) || 0);
      // The server clamps the page when deletion reduces the total page count.
      shipmentPage.value = positiveInteger(response?.page, parameters.page);
      shipmentPageSize.value = positiveInteger(response?.pageSize, parameters.pageSize);
      shipmentsLoaded.value = true;
      buildShipmentCustomerMap();
      return true;
    } catch (error) {
      if (valid()) showError(error, "customers.loadAvailableShipmentsFailed");
      return false;
    } finally {
      if (!disposed && request === requestSequence) loadingAvailableShipments.value = false;
    }
  }
  function changeShipmentPage(page) {
    if (disposed) return;
    runTablePageTransition(() => {
      shipmentPage.value = positiveInteger(page);
      clearSelection();
    });
    void loadAvailableShipments();
  }
  function changeShipmentPageSize(size) {
    if (disposed) return;
    runTablePageTransition(() => {
      shipmentPageSize.value = positiveInteger(size, 20);
      shipmentPage.value = 1;
      clearSelection();
    });
    void loadAvailableShipments();
  }
  function shipmentRowIndex(index) {
    return (shipmentPage.value - 1) * shipmentPageSize.value + index + 1;
  }
  function handleShipmentSelectionChange(rows) {
    if (disposed) return;
    const visible = new Map(availableShipments.value.map((item) => [item.shipmentId, item]));
    selectedShipmentRows.value = Array.isArray(rows)
      ? [...new Set(rows.map((row) => row.shipmentId))].map((id) => visible.get(id)).filter(Boolean)
      : [];
  }
  onScopeDispose(() => {
    disposed = true;
    requestSequence++;
  });
  return {
    availableShipments,
    loadingAvailableShipments,
    shipmentsLoaded,
    selectedShipmentRows,
    shipmentTableRef,
    shipmentCustomerFilter,
    shipmentBusinessFilter,
    refreshIssuesOnly,
    shipmentPage,
    shipmentPageSize,
    shipmentTotal,
    shipmentRefreshIssueTotal,
    shipmentCustomerMap,
    shipmentFilterCustomers,
    refreshIssueCount,
    displayedAvailableShipments,
    buildShipmentCustomerMap,
    loadAvailableShipments,
    changeShipmentPage,
    changeShipmentPageSize,
    shipmentRowIndex,
    handleShipmentSelectionChange
  };
}
