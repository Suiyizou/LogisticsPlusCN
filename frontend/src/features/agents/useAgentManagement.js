import { computed, onScopeDispose, reactive, ref, watch } from "vue";
import { boundedPage, pageSlice } from "../tables/pagination.js";
import {
  isValidAgentUsername,
  isValidAgentDisplayName,
  isStrongAgentPassword,
  parseAgentImportWorkbook
} from "./agentImport.js";

/** Agent reads, writes and import sessions share one operation gate with customer assignments. */
export function useAgentManagement({
  directory,
  canManage,
  fetchCustomerTransferAgents,
  createOverseaAgentEmployee,
  batchCreateOverseaAgentEmployees,
  updateOverseaAgent,
  resetOverseaAgentPassword,
  deleteOverseaAgent,
  loadXlsxModule,
  runTablePageTransition = (action) => action(),
  markApiErrorHandled,
  openPasswordResetResult,
  t,
  showSuccess,
  showError,
  confirm = (message) => window.confirm(message),
  prompt = (message, value) => window.prompt(message, value)
}) {
  const agentPage = ref(1);
  const agentPageSize = ref(10);
  const transferAgentsLoaded = ref(false);
  /** @type {import("vue").Ref<import("../../types/businessRecords").AgentRecord[]>} */
  const transferAgents = ref([]);
  const loadingTransferAgents = ref(false);
  const agentCreateDialogOpen = ref(false);
  const creatingAgent = ref(false);
  const mutatingAgent = ref(false);
  const agentCreateError = ref("");
  const agentCreateForm = reactive({ username: "", displayName: "", password: "" });
  const agentBatchDialogOpen = ref(false);
  /** @type {import("vue").Ref<HTMLInputElement | null>} */
  const agentBatchFileInput = ref(null);
  const agentBatchFileName = ref("");
  const agentBatchDropzoneActive = ref(false);
  const parsingAgentFile = ref(false);
  const importingAgents = ref(false);
  const agentBatchRows = ref([]);
  const agentBatchError = ref("");
  let disposed = false;
  let listVersion = 0;
  let parseVersion = 0;
  const agentWriteBusy = computed(
    () =>
      creatingAgent.value ||
      importingAgents.value ||
      mutatingAgent.value ||
      directory.customerWriteBusy.value
  );
  const allowed = () => !disposed && canManage.value && !agentWriteBusy.value;
  const agentPasswordChecks = computed(() => {
    const password = agentCreateForm.password;
    return [
      {
        key: "length",
        valid: password.length >= 8 && password.length <= 128,
        label: t("customers.agentPasswordLength")
      },
      { key: "letter", valid: /[A-Za-z]/.test(password), label: t("customers.agentPasswordCase") },
      { key: "number", valid: /\d/.test(password), label: t("customers.agentPasswordNumber") }
    ];
  });
  const canCreateAgent = computed(
    () =>
      allowed() &&
      isValidAgentUsername(agentCreateForm.username) &&
      isValidAgentDisplayName(agentCreateForm.displayName) &&
      isStrongAgentPassword(agentCreateForm.password)
  );
  const agentBatchReadyCount = computed(
    () =>
      agentBatchRows.value.filter((row) => row.status === "READY" && row.errors.length === 0).length
  );
  const agentBatchInvalidCount = computed(
    () => agentBatchRows.value.filter((row) => row.errors.length > 0).length
  );
  const agentBatchCreatedCount = computed(
    () => agentBatchRows.value.filter((row) => row.status === "CREATED").length
  );
  const activeTransferAgents = computed(() =>
    transferAgents.value.filter((agent) => agent.status === "ACTIVE")
  );
  const activeAgentCount = computed(() => activeTransferAgents.value.length);
  const paginatedTransferAgents = computed(() =>
    pageSlice(transferAgents.value, agentPage.value, agentPageSize.value)
  );
  watch([transferAgents, agentPageSize], () => {
    agentPage.value = boundedPage(
      agentPage.value,
      transferAgents.value.length,
      agentPageSize.value
    );
  });
  watch(
    agentCreateDialogOpen,
    (open) => {
      if (!open) agentCreateForm.password = "";
    },
    { flush: "sync" }
  );
  watch(
    agentBatchDialogOpen,
    (open) => {
      if (!open) clearBatch();
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
  function agentRowIndex(index) {
    return (agentPage.value - 1) * agentPageSize.value + index + 1;
  }
  function changeAgentPage(page) {
    if (!disposed)
      runTablePageTransition(() => {
        agentPage.value = boundedPage(page, transferAgents.value.length, agentPageSize.value);
      });
  }
  function selectedAgentOptionLabel(value) {
    const agent = transferAgents.value.find((item) => String(item.id) === String(value));
    return agent ? agent.displayName + " (@" + agent.username + ")" : "";
  }
  async function loadTransferAgents() {
    if (disposed) return false;
    const version = ++listVersion;
    const current = () => !disposed && version === listVersion;
    loadingTransferAgents.value = true;
    try {
      const response = await fetchCustomerTransferAgents();
      if (!current()) return false;
      transferAgents.value = Array.isArray(response?.items) ? response.items : [];
      transferAgentsLoaded.value = true;
      return true;
    } catch (error) {
      if (current()) showError(error, "customers.loadTransferAgentsFailed");
      return false;
    } finally {
      if (current()) loadingTransferAgents.value = false;
    }
  }
  function openAgentCreateDialog() {
    if (!allowed()) return;
    Object.assign(agentCreateForm, { username: "", displayName: "", password: "" });
    agentCreateError.value = "";
    agentCreateDialogOpen.value = true;
  }
  function closeAgentCreateDialog() {
    if (creatingAgent.value) return;
    agentCreateDialogOpen.value = false;
  }
  async function submitAgentCreate() {
    if (!allowed() || !agentCreateDialogOpen.value) return;
    agentCreateError.value = "";
    if (!canCreateAgent.value) {
      agentCreateError.value = t("customers.createOverseaAgentValidation");
      return;
    }
    const payload = {
      username: agentCreateForm.username.trim(),
      displayName: agentCreateForm.displayName.trim(),
      password: agentCreateForm.password
    };
    beginWrite(creatingAgent);
    try {
      await createOverseaAgentEmployee(payload);
      if (disposed) return;
      agentCreateDialogOpen.value = false;
      await loadTransferAgents();
      if (!disposed) showSuccess("customers.createOverseaAgentSuccess");
    } catch (error) {
      if (!disposed)
        agentCreateError.value = error?.message || t("customers.createOverseaAgentFailed");
    } finally {
      payload.password = "";
      finishWrite(creatingAgent);
    }
  }
  function clearBatch() {
    parseVersion++;
    parsingAgentFile.value = false;
    agentBatchRows.value.forEach((row) => {
      row.password = "";
    });
    agentBatchRows.value = [];
    agentBatchFileName.value = "";
    agentBatchDropzoneActive.value = false;
    if (agentBatchFileInput.value) agentBatchFileInput.value.value = "";
  }
  function openAgentBatchImport() {
    if (!allowed()) return;
    clearBatch();
    agentBatchError.value = "";
    agentBatchDialogOpen.value = true;
  }
  function closeAgentBatchImport() {
    if (importingAgents.value || disposed) return;
    agentBatchDialogOpen.value = false;
    agentBatchError.value = "";
  }
  async function downloadAgentImportTemplate() {
    if (disposed || !canManage.value) return;
    try {
      const XLSX = await loadXlsxModule();
      if (disposed) return;
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([
        [
          t("customers.agentImportUsernameHeader") + "*",
          t("customers.agentImportDisplayNameHeader") + "*",
          t("customers.agentImportPasswordHeader") + "*"
        ],
        ["oversea-agent-01", "Oversea Agent 01", "StrongPass#2026"]
      ]);
      worksheet["!cols"] = [{ wch: 26 }, { wch: 30 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(workbook, worksheet, "OVERSEA AGENTS");
      XLSX.writeFile(
        workbook,
        "oversea-agent-import-" + new Date().toISOString().slice(0, 10) + ".xlsx"
      );
    } catch (error) {
      if (!disposed) agentBatchError.value = error?.message || t("customers.agentTemplateFailed");
    }
  }
  async function processAgentWorkbook(file) {
    if (
      disposed ||
      !canManage.value ||
      importingAgents.value ||
      !agentBatchDialogOpen.value ||
      !file
    )
      return;
    clearBatch();
    const version = parseVersion;
    const current = () => !disposed && version === parseVersion && agentBatchDialogOpen.value;
    agentBatchError.value = "";
    if (!/\.(xlsx|xls|csv)$/i.test(file.name || "")) {
      agentBatchError.value = t("customers.agentWorkbookUnsupported");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      agentBatchError.value = t("customers.agentWorkbookTooLarge");
      return;
    }
    parsingAgentFile.value = true;
    try {
      const XLSX = await loadXlsxModule();
      if (!current()) return;
      const buffer = await file.arrayBuffer();
      if (!current()) return;
      agentBatchRows.value = parseAgentImportWorkbook(
        XLSX.read(buffer, { type: "array" }),
        XLSX,
        t
      );
      agentBatchFileName.value = file.name;
    } catch (error) {
      if (current())
        agentBatchError.value = error?.message || t("customers.agentWorkbookParseFailed");
    } finally {
      if (current()) parsingAgentFile.value = false;
    }
  }
  function handleAgentWorkbook(event) {
    const file = event?.target?.files?.[0];
    if (event?.target) event.target.value = "";
    return processAgentWorkbook(file);
  }
  function handleAgentBatchDrop(event) {
    agentBatchDropzoneActive.value = false;
    return processAgentWorkbook(event?.dataTransfer?.files?.[0]);
  }
  function agentBatchRowClass({ row }) {
    if (row.status === "CREATED") return "is-created";
    return row.status === "FAILED" || row.errors.length ? "is-invalid" : "";
  }
  async function submitAgentBatchImport() {
    if (
      !allowed() ||
      parsingAgentFile.value ||
      !agentBatchDialogOpen.value ||
      agentBatchInvalidCount.value
    )
      return;
    const rows = agentBatchRows.value.filter((row) => row.status === "READY" && !row.errors.length);
    if (!rows.length || rows.length > 200) return;
    const payload = rows.map((row) => ({
      username: row.username,
      displayName: row.displayName,
      password: row.password
    }));
    beginWrite(importingAgents);
    agentBatchError.value = "";
    try {
      try {
        await batchCreateOverseaAgentEmployees(payload);
        if (disposed) return;
        rows.forEach((row) => {
          row.status = "CREATED";
          row.password = "";
        });
      } catch (error) {
        if (disposed) return;
        // Only an absent batch endpoint permits the legacy per-account fallback.
        if (![404, 405].includes(Number(error?.status))) throw error;
        markApiErrorHandled(error);
        let cursor = 0;
        const worker = async () => {
          while (!disposed && cursor < rows.length) {
            const index = cursor++;
            const row = rows[index];
            row.status = "IMPORTING";
            try {
              await createOverseaAgentEmployee({ ...payload[index] });
              if (!disposed) {
                row.status = "CREATED";
                row.password = "";
              }
            } catch (itemError) {
              markApiErrorHandled(itemError);
              if (!disposed) {
                row.status = "FAILED";
                row.resultMessage = itemError?.message || t("customers.createOverseaAgentFailed");
                row.password = "";
              }
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(3, rows.length) }, () => worker()));
      }
      if (disposed) return;
      await loadTransferAgents();
      if (!disposed)
        showSuccess("customers.agentBatchFinished", {
          created: rows.filter((row) => row.status === "CREATED").length,
          failed: rows.filter((row) => row.status === "FAILED").length
        });
    } catch (error) {
      markApiErrorHandled(error);
      if (!disposed)
        agentBatchError.value = error?.message || t("customers.agentBatchCreateFailed");
    } finally {
      payload.forEach((row) => {
        row.password = "";
      });
      finishWrite(importingAgents);
    }
  }
  async function mutateAgent(agent, action, successKey, errorKey) {
    if (!agent?.id || !allowed()) return;
    beginWrite(mutatingAgent);
    try {
      await action();
      if (disposed) return;
      await loadTransferAgents();
      if (!disposed) showSuccess(successKey);
    } catch (error) {
      if (!disposed) showError(error, errorKey);
    } finally {
      finishWrite(mutatingAgent);
    }
  }
  async function editAgentDisplayName(agent) {
    if (!agent?.id || !allowed()) return;
    const id = agent.id;
    const displayName = prompt(t("customers.displayName"), agent.displayName || "");
    if (displayName == null) return;
    if (!isValidAgentDisplayName(displayName)) {
      showError(new Error(t("customers.agentDisplayNameRule")), "customers.saveFailed");
      return;
    }
    await mutateAgent(
      agent,
      () => updateOverseaAgent(id, { displayName: displayName.trim() }),
      "customers.saved",
      "customers.saveFailed"
    );
  }
  async function resetAgentPassword(agent) {
    if (
      !agent?.id ||
      !allowed() ||
      !confirm(
        t("customers.confirmDefaultPasswordReset", { name: agent.displayName || agent.username })
      )
    )
      return;
    const id = agent.id,
      username = agent.username;
    beginWrite(mutatingAgent);
    try {
      const response = await resetOverseaAgentPassword(id);
      if (!disposed)
        openPasswordResetResult(
          response?.username || username,
          response?.temporaryPassword || username + "!@#2026"
        );
    } catch (error) {
      if (!disposed) showError(error, "customers.resetPasswordFailed");
    } finally {
      finishWrite(mutatingAgent);
    }
  }
  async function toggleAgentStatus(agent) {
    if (
      !agent?.id ||
      !allowed() ||
      !confirm(
        t("customers.confirmAgentStatusChange", { name: agent.displayName || agent.username })
      )
    )
      return;
    const id = agent.id,
      status = agent.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    await mutateAgent(
      agent,
      () => updateOverseaAgent(id, { status }),
      "customers.saved",
      "customers.saveFailed"
    );
  }
  async function deleteAgent(agent) {
    if (
      !agent?.id ||
      !allowed() ||
      !confirm(t("customers.confirmDeleteAgent", { name: agent.displayName || agent.username }))
    )
      return;
    const id = agent.id;
    await mutateAgent(
      agent,
      () => deleteOverseaAgent(id),
      "customers.agentDeleted",
      "customers.deleteAgentFailed"
    );
  }
  onScopeDispose(() => {
    disposed = true;
    listVersion++;
    clearBatch();
    agentCreateForm.password = "";
  });
  return {
    agentPage,
    agentPageSize,
    transferAgentsLoaded,
    transferAgents,
    loadingTransferAgents,
    agentCreateDialogOpen,
    creatingAgent,
    mutatingAgent,
    agentWriteBusy,
    agentCreateError,
    agentBatchDialogOpen,
    agentBatchFileInput,
    agentBatchFileName,
    agentBatchDropzoneActive,
    parsingAgentFile,
    importingAgents,
    agentBatchRows,
    agentBatchError,
    agentCreateForm,
    agentPasswordChecks,
    canCreateAgent,
    agentBatchReadyCount,
    agentBatchInvalidCount,
    agentBatchCreatedCount,
    activeTransferAgents,
    activeAgentCount,
    paginatedTransferAgents,
    agentRowIndex,
    changeAgentPage,
    selectedAgentOptionLabel,
    openAgentCreateDialog,
    closeAgentCreateDialog,
    submitAgentCreate,
    openAgentBatchImport,
    closeAgentBatchImport,
    downloadAgentImportTemplate,
    handleAgentWorkbook,
    handleAgentBatchDrop,
    agentBatchRowClass,
    submitAgentBatchImport,
    loadTransferAgents,
    editAgentDisplayName,
    resetAgentPassword,
    toggleAgentStatus,
    deleteAgent
  };
}
