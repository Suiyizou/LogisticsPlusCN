import { computed, nextTick, onScopeDispose, ref, watch } from "vue";
import { boundedPage, pageSlice } from "../tables/pagination.js";

export function normalizeCustomer(response) {
  return response?.customer || response || {};
}

export function isTransferableCustomer(customer) {
  return customer?.status === "ACTIVE" && ["SHIPPER", "CONSIGNEE"].includes(customer?.partyRole);
}

/** Customer directory and selected customer resources share one selection context. */
export function useCustomerDirectory({
  fetchBusinessCustomers,
  fetchBusinessCustomerShipments,
  fetchOverseaAgentLinkedCustomers,
  updateOverseaAgentLinkedCustomers,
  canManage,
  clearMessage,
  showError,
  showSuccess,
  runTablePageTransition = (callback) => callback()
}) {
  /** @type {import("vue").Ref<import("../../types/businessRecords").CustomerRecord[]>} */
  const customers = ref([]);
  const customersLoaded = ref(false);
  const loadingCustomers = ref(false);
  const customerSearch = ref("");
  const customerPage = ref(1);
  const customerPageSize = ref(10);
  /** @type {import("vue").Ref<import("../../types/workspace").TableSelectionHandle<import("../../types/businessRecords").CustomerRecord> | null>} */
  const customerTableRef = ref(null);
  /** @type {import("vue").Ref<import("../../types/businessRecords").CustomerRecord[]>} */
  const selectedCustomerRows = ref([]);
  const selectedCustomerId = ref("");
  /** @type {import("vue").Ref<import("../../types/businessRecords").ShipmentRecord[]>} */
  const shipments = ref([]);
  const loadingShipments = ref(false);
  const linkedCustomerIds = ref([]);
  const loadingLinkedCustomers = ref(false);
  const savingLinkedCustomers = ref(false);
  const customerWriteBusy = ref(false);
  const selectedCustomer = computed(
    () => customers.value.find((item) => item.id === selectedCustomerId.value) || null
  );
  const filteredCustomers = computed(() => {
    const query = customerSearch.value.toLowerCase().trim();
    return !query
      ? customers.value
      : customers.value.filter((customer) =>
          [
            customer.username,
            customer.displayName,
            customer.clientCode,
            customer.contactEmail,
            customer.responsibleAgentDisplayName
          ].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(query)
          )
        );
  });
  const paginatedCustomers = computed(() =>
    pageSlice(filteredCustomers.value, customerPage.value, customerPageSize.value)
  );
  const linkableCustomers = computed(() =>
    customers.value.filter(
      (customer) => customer.id !== selectedCustomerId.value && isTransferableCustomer(customer)
    )
  );
  const assignableCustomers = computed(() => customers.value.filter(isTransferableCustomer));
  let disposed = false;
  let directoryRequest = 0;
  let shipmentRequest = 0;
  let linkedRequest = 0;
  let selectionVersion = 0;
  const captureSelection = () => ({ id: selectedCustomerId.value, version: selectionVersion });
  const isSelectionCurrent = (context) =>
    !disposed && context.id === selectedCustomerId.value && context.version === selectionVersion;

  watch(
    selectedCustomerId,
    () => {
      selectionVersion++;
      shipmentRequest++;
      linkedRequest++;
      shipments.value = [];
      linkedCustomerIds.value = [];
      loadingShipments.value = false;
      loadingLinkedCustomers.value = false;
    },
    { flush: "sync" }
  );
  watch(
    () => selectedCustomer.value?.partyRole,
    (role) => {
      if (role === "OVERSEA_AGENT") return;
      linkedRequest++;
      linkedCustomerIds.value = [];
      loadingLinkedCustomers.value = false;
    },
    { flush: "sync" }
  );
  watch(customerSearch, () => {
    customerPage.value = 1;
  });
  watch([filteredCustomers, customerPageSize], () => {
    customerPage.value = boundedPage(
      customerPage.value,
      filteredCustomers.value.length,
      customerPageSize.value
    );
  });
  watch(
    customers,
    (items) => {
      const byId = new Map(items.map((item) => [item.id, item]));
      selectedCustomerRows.value = selectedCustomerRows.value
        .map((item) => byId.get(item.id))
        .filter(Boolean);
    },
    { deep: true }
  );

  async function loadCustomers(
    preferredId = "",
    { selectFirst = true, isCurrent = () => true } = {}
  ) {
    if (disposed || !isCurrent()) return false;
    const request = ++directoryRequest;
    const selection = captureSelection();
    const valid = () => !disposed && request === directoryRequest && isCurrent();
    loadingCustomers.value = true;
    clearMessage();
    try {
      const response = await fetchBusinessCustomers();
      if (!valid()) return false;
      customers.value = Array.isArray(response?.items) ? response.items : [];
      customersLoaded.value = true;
      loadingCustomers.value = false;
      const selectionUnchanged = isSelectionCurrent(selection);
      const nextId = selectionUnchanged
        ? preferredId || selectedCustomerId.value
        : selectedCustomerId.value;
      if (nextId && customers.value.some((item) => item.id === nextId)) {
        return (await selectCustomer(nextId, { isCurrent: valid })) && valid();
      } else if (selectionUnchanged && selectFirst && !preferredId && customers.value[0]) {
        return (await selectCustomer(customers.value[0].id, { isCurrent: valid })) && valid();
      } else {
        selectedCustomerId.value = "";
        shipments.value = [];
      }
      return valid();
    } catch (error) {
      if (valid()) showError(error, "customers.loadFailed");
      return false;
    } finally {
      if (!disposed && request === directoryRequest) loadingCustomers.value = false;
    }
  }

  async function selectCustomer(customerId, { isCurrent = () => true } = {}) {
    if (disposed || !customerId || !isCurrent()) return false;
    selectedCustomerId.value = customerId;
    const context = captureSelection();
    const request = ++shipmentRequest;
    const valid = () => isSelectionCurrent(context) && request === shipmentRequest && isCurrent();
    loadingShipments.value = true;
    const linked = loadLinkedCustomers(customerId, { isCurrent });
    try {
      const response = await fetchBusinessCustomerShipments(customerId);
      if (!valid()) return false;
      shipments.value = Array.isArray(response?.items) ? response.items : [];
    } catch (error) {
      if (valid()) {
        shipments.value = [];
        showError(error, "customers.loadShipmentsFailed");
      }
      return false;
    } finally {
      if (!disposed && request === shipmentRequest) loadingShipments.value = false;
      await linked;
    }
    return valid();
  }

  async function loadLinkedCustomers(customerId, { isCurrent = () => true } = {}) {
    if (disposed || customerId !== selectedCustomerId.value || !isCurrent()) return;
    const context = captureSelection();
    const request = ++linkedRequest;
    linkedCustomerIds.value = [];
    if (selectedCustomer.value?.partyRole !== "OVERSEA_AGENT") {
      loadingLinkedCustomers.value = false;
      return;
    }
    const valid = () =>
      isSelectionCurrent(context) &&
      request === linkedRequest &&
      isCurrent() &&
      selectedCustomer.value?.partyRole === "OVERSEA_AGENT";
    loadingLinkedCustomers.value = true;
    try {
      const response = await fetchOverseaAgentLinkedCustomers(customerId);
      if (valid()) linkedCustomerIds.value = linkedIds(response);
    } catch (error) {
      if (valid()) showError(error, "customers.loadLinkedCustomersFailed");
    } finally {
      if (!disposed && request === linkedRequest) loadingLinkedCustomers.value = false;
    }
  }

  async function saveLinkedCustomers() {
    if (
      disposed ||
      !canManage.value ||
      selectedCustomer.value?.partyRole !== "OVERSEA_AGENT" ||
      customerWriteBusy.value ||
      savingLinkedCustomers.value ||
      loadingLinkedCustomers.value
    )
      return;
    const context = captureSelection();
    const request = ++linkedRequest;
    const ids = [...linkedCustomerIds.value];
    savingLinkedCustomers.value = true;
    customerWriteBusy.value = true;
    try {
      const response = await updateOverseaAgentLinkedCustomers(context.id, ids);
      if (
        isSelectionCurrent(context) &&
        request === linkedRequest &&
        selectedCustomer.value?.partyRole === "OVERSEA_AGENT"
      ) {
        linkedCustomerIds.value = linkedIds(response);
        showSuccess("customers.linkedCustomersSaved");
      }
    } catch (error) {
      if (isSelectionCurrent(context)) showError(error, "customers.saveLinkedCustomersFailed");
    } finally {
      if (!disposed) {
        savingLinkedCustomers.value = false;
        customerWriteBusy.value = false;
      }
    }
  }

  function linkedIds(response) {
    return Array.isArray(response?.items)
      ? response.items.map((item) => item.id).filter(Boolean)
      : [];
  }
  function replaceCustomer(customer) {
    if (disposed || !customer?.id) return;
    // A directory read started before this write must not restore obsolete profile data.
    directoryRequest++;
    loadingCustomers.value = false;
    const index = customers.value.findIndex((item) => item.id === customer.id);
    if (index >= 0) customers.value.splice(index, 1, { ...customers.value[index], ...customer });
    else customers.value.unshift(customer);
  }
  function removeCustomers(ids) {
    if (disposed) return;
    directoryRequest++;
    loadingCustomers.value = false;
    const removed = new Set(ids);
    customers.value = customers.value.filter((item) => !removed.has(item.id));
    selectedCustomerRows.value = selectedCustomerRows.value.filter((item) => !removed.has(item.id));
    if (removed.has(selectedCustomerId.value)) selectedCustomerId.value = "";
  }
  async function syncCustomerSelection(rows) {
    if (disposed) return;
    selectedCustomerRows.value = rows;
    await nextTick();
    if (disposed) return;
    customerTableRef.value?.clearSelection?.();
    for (const row of rows) customerTableRef.value?.toggleRowSelection?.(row, true);
    selectedCustomerRows.value = rows;
  }
  function handleCustomerSelectionChange(rows) {
    if (!disposed) selectedCustomerRows.value = Array.isArray(rows) ? rows : [];
  }
  function changeCustomerPage(page) {
    runTablePageTransition(() => {
      customerPage.value = boundedPage(
        page,
        filteredCustomers.value.length,
        customerPageSize.value
      );
      void syncCustomerSelection([]);
    });
  }
  function customerRowIndex(index) {
    return (customerPage.value - 1) * customerPageSize.value + index + 1;
  }
  onScopeDispose(() => {
    disposed = true;
    directoryRequest++;
    shipmentRequest++;
    linkedRequest++;
  });
  return {
    customers,
    customersLoaded,
    loadingCustomers,
    customerSearch,
    customerPage,
    customerPageSize,
    customerTableRef,
    selectedCustomerRows,
    selectedCustomerId,
    selectedCustomer,
    shipments,
    loadingShipments,
    linkedCustomerIds,
    loadingLinkedCustomers,
    savingLinkedCustomers,
    customerWriteBusy,
    filteredCustomers,
    paginatedCustomers,
    linkableCustomers,
    assignableCustomers,
    captureSelection,
    isSelectionCurrent,
    loadCustomers,
    selectCustomer,
    loadLinkedCustomers,
    saveLinkedCustomers,
    replaceCustomer,
    removeCustomers,
    syncCustomerSelection,
    handleCustomerSelectionChange,
    changeCustomerPage,
    customerRowIndex
  };
}
