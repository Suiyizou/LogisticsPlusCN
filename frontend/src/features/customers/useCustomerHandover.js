import { computed, onScopeDispose, reactive, ref, watch } from "vue";
import { isTransferableCustomer } from "./useCustomerDirectory.js";
import { positiveInteger } from "../tables/pagination.js";

/** Direct business handover and overseas-agent assignment retain separate API contracts. */
export function useCustomerHandover({
  directory,
  canManage,
  isOverseaAgent,
  canRequestBusinessHandover,
  agentManagement,
  fetchBusinessHandoverAgents,
  fetchBusinessHandoverRequests,
  handoverBusinessCustomers,
  transferBusinessCustomers,
  loadAvailableShipments,
  t,
  showSuccess,
  showError
}) {
  const handoverAgentsLoaded = ref(false);
  const businessHandoverAgents = ref([]);
  const loadingBusinessHandoverAgents = ref(false);
  const businessHandoverRequests = ref([]);
  const loadingBusinessHandoverRequests = ref(false);
  const businessHandoverRequestStatus = ref("");
  const businessHandoverRequestPage = ref(0);
  const businessHandoverRequestPageSize = ref(10);
  const businessHandoverRequestTotal = ref(0);
  const businessHandoverDialogOpen = ref(false);
  /** @type {import("vue").Ref<import("../../types/businessRecords").AgentRecord | null>} */
  const businessHandoverTarget = ref(null);
  const submittingBusinessHandover = ref(false);
  const businessHandoverForm = reactive({ customerIds: [], reason: "" });
  const transferDialogOpen = ref(false);
  const transferringCustomers = ref(false);
  const overseaTransferCustomerIds = ref([]);
  const transferCustomerIds = ref([]);
  const transferForm = reactive({ targetAgentId: null });
  const handoverEligibleCustomers = computed(() =>
    directory.customers.value.filter(isTransferableCustomer)
  );
  const handoverWriteBusy = computed(
    () =>
      submittingBusinessHandover.value ||
      transferringCustomers.value ||
      directory.customerWriteBusy.value
  );
  let disposed = false;
  let agentsVersion = 0;
  let requestsVersion = 0;
  let dialogVersion = 0;
  const allowed = () => !disposed && !handoverWriteBusy.value;
  const requestQuery = () => ({
    status: businessHandoverRequestStatus.value,
    page: businessHandoverRequestPage.value,
    size: businessHandoverRequestPageSize.value
  });
  function selectedIds(ids, max) {
    const eligible = new Set(
      handoverEligibleCustomers.value.map((customer) => String(customer.id))
    );
    const unique = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
    return unique.length && unique.length <= max && unique.every((id) => eligible.has(id))
      ? unique
      : [];
  }
  function activeBusinessTarget(id) {
    return businessHandoverAgents.value.find(
      (agent) => String(agent.id) === String(id) && agent.status === "ACTIVE" && !agent.current
    );
  }
  function activeOverseaTarget(id) {
    return agentManagement.activeTransferAgents.value.find(
      (agent) => String(agent.id) === String(id) && !agent.current
    );
  }
  watch(handoverEligibleCustomers, (customers) => {
    const ids = new Set(customers.map((customer) => String(customer.id)));
    overseaTransferCustomerIds.value = overseaTransferCustomerIds.value.filter((id) =>
      ids.has(String(id))
    );
    if (!submittingBusinessHandover.value)
      businessHandoverForm.customerIds = businessHandoverForm.customerIds.filter((id) =>
        ids.has(String(id))
      );
  });
  watch(
    businessHandoverDialogOpen,
    (open) => {
      if (!open && !submittingBusinessHandover.value) resetBusinessHandoverForm();
    },
    { flush: "sync" }
  );
  watch(
    transferDialogOpen,
    (open) => {
      if (!open) {
        dialogVersion++;
        if (!transferringCustomers.value) {
          transferCustomerIds.value = [];
          transferForm.targetAgentId = null;
        }
      }
    },
    { flush: "sync" }
  );
  watch(
    [businessHandoverRequestStatus, businessHandoverRequestPageSize],
    () => {
      requestsVersion++;
      businessHandoverRequests.value = [];
      businessHandoverRequestTotal.value = 0;
      loadingBusinessHandoverRequests.value = false;
    },
    { flush: "sync" }
  );
  function beginWrite(flag) {
    flag.value = true;
    directory.customerWriteBusy.value = true;
  }
  function finishWrite(flag) {
    directory.customerWriteBusy.value = false;
    if (!disposed) flag.value = false;
  }
  async function loadBusinessHandoverAgents() {
    if (disposed || !canManage.value) return false;
    const version = ++agentsVersion;
    const current = () => !disposed && version === agentsVersion;
    loadingBusinessHandoverAgents.value = true;
    try {
      const response = await fetchBusinessHandoverAgents();
      if (!current()) return false;
      businessHandoverAgents.value = Array.isArray(response?.items) ? response.items : [];
      handoverAgentsLoaded.value = true;
      return true;
    } catch (error) {
      if (current()) showError(error, "customers.loadBusinessHandoverAgentsFailed");
      return false;
    } finally {
      if (current()) loadingBusinessHandoverAgents.value = false;
    }
  }
  async function loadBusinessHandoverRequests() {
    if (disposed || !canRequestBusinessHandover.value) return false;
    const version = ++requestsVersion;
    const query = requestQuery();
    const current = () =>
      !disposed &&
      version === requestsVersion &&
      JSON.stringify(query) === JSON.stringify(requestQuery());
    loadingBusinessHandoverRequests.value = true;
    try {
      const response = await fetchBusinessHandoverRequests({ ...query });
      if (!current()) return false;
      const total = Math.max(0, Number(response?.total) || 0);
      const size = positiveInteger(response?.size, query.size);
      const page = Math.max(
        0,
        Math.min(Math.floor(Number(response?.page) || 0), Math.max(0, Math.ceil(total / size) - 1))
      );
      businessHandoverRequestPageSize.value = size;
      businessHandoverRequestPage.value = page;
      businessHandoverRequests.value = Array.isArray(response?.items) ? response.items : [];
      businessHandoverRequestTotal.value = total;
      return true;
    } catch (error) {
      if (current()) {
        businessHandoverRequests.value = [];
        businessHandoverRequestTotal.value = 0;
        showError(error, "customers.loadBusinessHandoverRequestsFailed");
      }
      return false;
    } finally {
      if (!disposed && version === requestsVersion) loadingBusinessHandoverRequests.value = false;
    }
  }
  async function refreshBusinessHandoverData() {
    if (disposed) return;
    const jobs = isOverseaAgent.value
      ? [agentManagement.loadTransferAgents(), directory.loadCustomers("", { selectFirst: false })]
      : [loadBusinessHandoverAgents()];
    if (canRequestBusinessHandover.value) jobs.push(loadBusinessHandoverRequests());
    await Promise.all(jobs);
  }
  function changeBusinessHandoverRequestStatus() {
    businessHandoverRequestPage.value = 0;
    return loadBusinessHandoverRequests();
  }
  function changeBusinessHandoverRequestPage(page) {
    businessHandoverRequestPage.value = positiveInteger(page, 1) - 1;
    return loadBusinessHandoverRequests();
  }
  function changeBusinessHandoverRequestPageSize(size) {
    businessHandoverRequestPageSize.value = positiveInteger(size, 10);
    businessHandoverRequestPage.value = 0;
    return loadBusinessHandoverRequests();
  }
  function businessHandoverStatusLabel(status) {
    const key = {
      PENDING: "customers.handoverStatusPending",
      APPROVED: "customers.handoverStatusApproved",
      REJECTED: "customers.handoverStatusRejected"
    }[String(status || "").toUpperCase()];
    return key ? t(key) : status || "—";
  }
  /** @returns {"warning" | "success" | "danger" | "info"} */
  function businessHandoverStatusType(status) {
    return (
      { PENDING: "warning", APPROVED: "success", REJECTED: "danger" }[
        String(status || "").toUpperCase()
      ] || "info"
    );
  }
  function openBusinessHandover(agent) {
    if (!allowed() || !canRequestBusinessHandover.value || !activeBusinessTarget(agent?.id)) return;
    businessHandoverTarget.value = { ...activeBusinessTarget(agent.id) };
    businessHandoverForm.customerIds = [];
    businessHandoverForm.reason = "";
    businessHandoverDialogOpen.value = true;
  }
  function resetBusinessHandoverForm() {
    if (submittingBusinessHandover.value || businessHandoverDialogOpen.value) return;
    businessHandoverTarget.value = null;
    businessHandoverForm.customerIds = [];
    businessHandoverForm.reason = "";
  }
  function closeBusinessHandover() {
    if (submittingBusinessHandover.value) return;
    businessHandoverDialogOpen.value = false;
    resetBusinessHandoverForm();
  }
  async function submitBusinessHandover() {
    if (!allowed() || !canRequestBusinessHandover.value || !businessHandoverDialogOpen.value)
      return;
    const target = activeBusinessTarget(businessHandoverTarget.value?.id);
    const ids = selectedIds(businessHandoverForm.customerIds, 200);
    const reason = businessHandoverForm.reason.trim();
    if (
      !target ||
      !ids.length ||
      !reason ||
      reason.length > 500 ||
      !Number.isSafeInteger(Number(target.id)) ||
      Number(target.id) <= 0
    )
      return;
    const payload = { customerIds: ids, targetBusinessUserId: Number(target.id), reason };
    const targetName = target.displayName || target.username;
    beginWrite(submittingBusinessHandover);
    try {
      const response = await handoverBusinessCustomers(payload);
      if (disposed) return;
      // Direct handover has completed on the server: drop the source operator's ownership now.
      directory.removeCustomers(ids);
      businessHandoverDialogOpen.value = false;
      await Promise.all([
        directory.loadCustomers("", { selectFirst: false }),
        loadAvailableShipments(),
        loadBusinessHandoverAgents(),
        loadBusinessHandoverRequests()
      ]);
      if (!disposed)
        showSuccess("customers.businessHandoverSuccess", {
          requestId: response?.requestId,
          count: Number(response?.customerCount ?? ids.length),
          agent: response?.targetBusinessUserName || targetName
        });
    } catch (error) {
      if (!disposed) showError(error, "customers.businessHandoverFailed");
    } finally {
      finishWrite(submittingBusinessHandover);
      if (!disposed && !businessHandoverDialogOpen.value) resetBusinessHandoverForm();
    }
  }
  async function openCustomerTransfer(customer, preserveSelection = false) {
    if (!allowed() || !canManage.value || !customer?.id) return;
    const ids = selectedIds(
      preserveSelection ? directory.selectedCustomerRows.value.map((row) => row.id) : [customer.id],
      500
    );
    if (!ids.length) return;
    if (!preserveSelection) directory.selectedCustomerRows.value = [customer];
    const version = ++dialogVersion;
    transferCustomerIds.value = ids;
    transferDialogOpen.value = true;
    transferForm.targetAgentId =
      customer.overseaAgentUserId == null ? null : String(customer.overseaAgentUserId);
    const loaded = await agentManagement.loadTransferAgents();
    if (disposed || version !== dialogVersion || !transferDialogOpen.value) return;
    if (!loaded) closeCustomerTransfer();
    else if (!activeOverseaTarget(transferForm.targetAgentId)) transferForm.targetAgentId = null;
  }
  function closeCustomerTransfer() {
    if (transferringCustomers.value) return;
    transferDialogOpen.value = false;
    transferCustomerIds.value = [];
    transferForm.targetAgentId = null;
  }
  async function transferCustomers(ids, targetId, overseas) {
    const targetName = activeOverseaTarget(targetId)?.displayName || "-";
    const payload = { customerIds: [...ids], targetAgentId: String(targetId) };
    beginWrite(transferringCustomers);
    transferForm.targetAgentId = payload.targetAgentId;
    try {
      const response = await transferBusinessCustomers(payload);
      if (disposed) return;
      const submitted = new Set(ids);
      if (overseas) directory.removeCustomers(ids);
      transferDialogOpen.value = false;
      transferCustomerIds.value = [];
      overseaTransferCustomerIds.value = overseaTransferCustomerIds.value.filter(
        (id) => !submitted.has(String(id))
      );
      await directory.syncCustomerSelection(
        directory.selectedCustomerRows.value.filter((row) => !submitted.has(String(row.id)))
      );
      if (disposed) return;
      await Promise.all([
        directory.loadCustomers("", { selectFirst: false }),
        agentManagement.loadTransferAgents(),
        loadAvailableShipments()
      ]);
      if (!disposed)
        showSuccess("customers.transferSuccess", {
          count: response?.transferred ?? ids.length,
          agent: response?.targetAgentName || targetName,
          shipments: response?.relatedShipments || 0
        });
    } catch (error) {
      if (!disposed) showError(error, "customers.transferFailed");
    } finally {
      finishWrite(transferringCustomers);
      if (!disposed && !transferDialogOpen.value) transferForm.targetAgentId = null;
    }
  }
  async function submitCustomerTransfer() {
    if (
      !allowed() ||
      !canManage.value ||
      !transferDialogOpen.value ||
      agentManagement.loadingTransferAgents.value
    )
      return;
    const ids = selectedIds(transferCustomerIds.value, 500);
    const target = activeOverseaTarget(transferForm.targetAgentId);
    if (!ids.length || !target) return;
    await transferCustomers(ids, target.id, false);
  }
  async function submitOverseaAgentTransfer(agent) {
    if (!allowed() || !isOverseaAgent.value || agentManagement.loadingTransferAgents.value) return;
    const ids = selectedIds(overseaTransferCustomerIds.value, 500);
    const target = activeOverseaTarget(agent?.id);
    if (!ids.length || !target) return;
    await transferCustomers(ids, target.id, true);
  }
  onScopeDispose(() => {
    disposed = true;
    agentsVersion++;
    requestsVersion++;
    dialogVersion++;
  });
  return {
    handoverAgentsLoaded,
    businessHandoverAgents,
    loadingBusinessHandoverAgents,
    businessHandoverRequests,
    loadingBusinessHandoverRequests,
    businessHandoverRequestStatus,
    businessHandoverRequestPage,
    businessHandoverRequestPageSize,
    businessHandoverRequestTotal,
    businessHandoverDialogOpen,
    businessHandoverTarget,
    submittingBusinessHandover,
    businessHandoverForm,
    transferDialogOpen,
    transferringCustomers,
    overseaTransferCustomerIds,
    transferCustomerIds,
    transferForm,
    handoverEligibleCustomers,
    handoverWriteBusy,
    loadBusinessHandoverAgents,
    loadBusinessHandoverRequests,
    refreshBusinessHandoverData,
    changeBusinessHandoverRequestStatus,
    changeBusinessHandoverRequestPage,
    changeBusinessHandoverRequestPageSize,
    businessHandoverStatusLabel,
    businessHandoverStatusType,
    openBusinessHandover,
    closeBusinessHandover,
    resetBusinessHandoverForm,
    submitBusinessHandover,
    openCustomerTransfer,
    closeCustomerTransfer,
    submitCustomerTransfer,
    submitOverseaAgentTransfer
  };
}
