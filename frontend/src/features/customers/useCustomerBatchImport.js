import { computed, onScopeDispose, ref, watch } from "vue";
import {
  buildCustomerImportTemplate,
  parseCustomerImportWorkbook,
  validateCustomerImportRows
} from "../../services/customerExcelImport.js";

/** @returns {import("../../types/businessRecords").CustomerImportPreview} */
function emptyCustomerBatchPreview() {
  return { rows: [], items: [], globalErrors: [], total: 0, valid: 0, invalid: 0, warningCount: 0 };
}

/** Owns the import session, immutable submission and short-lived credential results. */
export function useCustomerBatchImport({
  directory,
  canManage,
  batchCreateBusinessCustomers,
  loadXlsxModule,
  waitForNextPaint = async () => {},
  t
}) {
  const batchImportDialogOpen = ref(false);
  const batchImportMode = ref("quick");
  const quickImportText = ref("");
  const batchFileName = ref("");
  const customerBatchPreview = ref(emptyCustomerBatchPreview());
  const batchPreviewError = ref("");
  /** @type {import("vue").Ref<HTMLInputElement | null>} */
  const batchFileInput = ref(null);
  const batchDropzoneActive = ref(false);
  const customerFileParsing = ref(false);
  const importingCustomers = ref(false);
  /** @type {import("vue").Ref<import("../../types/businessRecords").CustomerCredentialRow[]>} */
  const batchCredentialRows = ref([]);
  const exportingCredentials = ref(false);
  const credentialExportError = ref("");
  let pendingExportRows = null;
  let disposed = false;
  let parseVersion = 0;
  let exportVersion = 0;
  const allowed = () => !disposed && canManage.value && !directory.customerWriteBusy.value;
  const quickCustomerBatchPreview = computed(() => {
    const preview = validateCustomerImportRows(quickImportSourceRows());
    if (preview.total > 500) preview.globalErrors.push({ code: "TOO_MANY_ROWS", max: 500 });
    return preview;
  });
  const activeCustomerBatchPreview = computed(() =>
    batchImportMode.value === "quick" ? quickCustomerBatchPreview.value : customerBatchPreview.value
  );
  const canSubmitCustomerBatchImport = computed(() => {
    const preview = activeCustomerBatchPreview.value;
    return (
      allowed() &&
      batchImportDialogOpen.value &&
      !customerFileParsing.value &&
      !importingCustomers.value &&
      preview.valid > 0 &&
      preview.invalid === 0 &&
      preview.globalErrors.length === 0
    );
  });
  const batchCredentialSummary = computed(() => {
    const rows = batchCredentialRows.value;
    return {
      total: rows.length,
      created: rows.filter((row) => row.status === "CREATED").length,
      failed: rows.filter((row) => row.status !== "CREATED").length
    };
  });
  function cancelParsing() {
    parseVersion++;
    customerFileParsing.value = false;
    batchDropzoneActive.value = false;
    if (batchFileInput.value) batchFileInput.value.value = "";
  }
  function clearInput() {
    cancelParsing();
    quickImportText.value = "";
    customerBatchPreview.value = emptyCustomerBatchPreview();
    batchFileName.value = "";
  }
  watch(
    batchImportDialogOpen,
    (open) => {
      if (!open) clearInput();
    },
    { flush: "sync" }
  );
  function openBatchImport() {
    if (!allowed() || importingCustomers.value || batchCredentialRows.value.length) return;
    batchPreviewError.value = "";
    batchImportDialogOpen.value = true;
  }
  function closeBatchImport() {
    if (disposed || importingCustomers.value) return;
    batchImportDialogOpen.value = false;
    batchPreviewError.value = "";
  }
  function selectCustomerBatchMode(mode) {
    if (disposed || importingCustomers.value || !["quick", "excel"].includes(mode)) return;
    cancelParsing();
    batchImportMode.value = mode;
    batchPreviewError.value = "";
  }
  function quickImportSourceRows() {
    return quickImportText.value
      .split(/\r?\n/)
      .map((line, index) => {
        const [username = "", clientCode = ""] = line
          .split(/[,，\t]/, 2)
          .map((value) => value.trim());
        return { rowNumber: index + 1, username, clientCode };
      })
      .filter((row) => row.username);
  }
  async function downloadCustomerImportTemplate() {
    if (disposed || !canManage.value) return;
    try {
      const XLSX = await loadXlsxModule();
      if (disposed) return;
      XLSX.writeFile(
        buildCustomerImportTemplate(XLSX),
        "customer-import-template-" + new Date().toISOString().slice(0, 10) + ".xlsx"
      );
    } catch (error) {
      if (!disposed)
        batchPreviewError.value = error?.message || t("customers.customerTemplateFailed");
    }
  }
  async function processCustomerWorkbook(file) {
    if (
      disposed ||
      !canManage.value ||
      importingCustomers.value ||
      !batchImportDialogOpen.value ||
      batchImportMode.value !== "excel" ||
      !file
    )
      return;
    const version = ++parseVersion;
    const current = () =>
      !disposed &&
      version === parseVersion &&
      batchImportDialogOpen.value &&
      batchImportMode.value === "excel";
    customerBatchPreview.value = emptyCustomerBatchPreview();
    batchFileName.value = "";
    batchPreviewError.value = "";
    customerFileParsing.value = false;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name || "") || file.size > 10 * 1024 * 1024) {
      batchPreviewError.value = t("customers.excelReadFailed");
      return;
    }
    customerFileParsing.value = true;
    try {
      await waitForNextPaint();
      if (!current()) return;
      const XLSX = await loadXlsxModule();
      if (!current()) return;
      const buffer = await file.arrayBuffer();
      if (!current()) return;
      const workbook = XLSX.read(buffer, { type: "array" });
      customerBatchPreview.value = parseCustomerImportWorkbook(workbook, XLSX);
      batchFileName.value = file.name;
    } catch (error) {
      if (current()) batchPreviewError.value = error?.message || t("customers.excelReadFailed");
    } finally {
      if (current()) customerFileParsing.value = false;
    }
  }
  function handleCustomerWorkbook(event) {
    // Capture before clearing the native FileList, including when the same file is chosen again.
    const file = event?.target?.files?.[0];
    if (event?.target) event.target.value = "";
    return processCustomerWorkbook(file);
  }
  function handleBatchDrop(event) {
    batchDropzoneActive.value = false;
    return processCustomerWorkbook(event?.dataTransfer?.files?.[0]);
  }
  async function submitBatchImport() {
    if (
      !allowed() ||
      importingCustomers.value ||
      customerFileParsing.value ||
      !batchImportDialogOpen.value
    )
      return;
    const preview = activeCustomerBatchPreview.value;
    if (!preview.items.length) {
      batchPreviewError.value = t("customers.noImportRows");
      return;
    }
    if (preview.invalid || preview.globalErrors.length) {
      batchPreviewError.value = t("customers.fixInvalidRowsBeforeImport");
      return;
    }
    const payload = {
      sourceFileName: batchImportMode.value === "excel" ? batchFileName.value : "quick-entry",
      items: preview.items.map((row) => ({ ...row }))
    };
    importingCustomers.value = true;
    directory.customerWriteBusy.value = true;
    batchPreviewError.value = "";
    try {
      const response = await batchCreateBusinessCustomers(payload);
      if (disposed) return;
      batchCredentialRows.value = Array.isArray(response?.items)
        ? response.items.map((row) => ({ ...row }))
        : [];
      batchImportDialogOpen.value = false;
      await directory.loadCustomers();
    } catch (error) {
      if (!disposed) batchPreviewError.value = error?.message || t("customers.importFailed");
    } finally {
      directory.customerWriteBusy.value = false;
      if (!disposed) importingCustomers.value = false;
    }
  }
  async function downloadCredentialWorkbook() {
    if (disposed || exportingCredentials.value || !batchCredentialRows.value.length) return;
    const version = ++exportVersion;
    const current = () =>
      !disposed && version === exportVersion && batchCredentialRows.value.length > 0;
    exportingCredentials.value = true;
    credentialExportError.value = "";
    // Capture translated headers and data together; a locale or result change cannot mix exports.
    const rows = batchCredentialRows.value.map((row) => ({
      [t("customers.excelRow")]: row.rowNumber,
      [t("customers.createAccount")]: row.username,
      [t("customers.createDisplayName")]: row.displayName || row.username,
      [t("customers.clientCode")]: row.customerCode || row.clientCode || "",
      [t("customers.initialPassword")]: row.password || "",
      [t("customers.importStatus")]:
        row.status === "CREATED" ? t("customers.importCreated") : t("customers.importFailedStatus"),
      [t("customers.failureReason")]:
        row.status === "CREATED" ? "" : localizeCustomerImportResult(row.message)
    }));
    pendingExportRows = rows;
    try {
      await waitForNextPaint();
      if (!current()) return;
      const XLSX = await loadXlsxModule();
      if (!current()) return;
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet["!cols"] = [10, 24, 28, 22, 24, 16, 58].map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(workbook, worksheet, "Customer credentials");
      XLSX.writeFile(
        workbook,
        "customer-credentials-" + new Date().toISOString().slice(0, 10) + ".xlsx"
      );
    } catch (error) {
      if (current())
        credentialExportError.value = error?.message || t("customers.exportCredentialsFailed");
    } finally {
      if (!disposed && version === exportVersion) exportingCredentials.value = false;
      wipeExportRows(rows);
      if (pendingExportRows === rows) pendingExportRows = null;
    }
  }
  function closeBatchCredentials() {
    exportVersion++;
    exportingCredentials.value = false;
    credentialExportError.value = "";
    wipeExportRows(pendingExportRows);
    pendingExportRows = null;
    batchCredentialRows.value.forEach((row) => {
      row.password = "";
    });
    batchCredentialRows.value = [];
  }
  function wipeExportRows(rows) {
    rows?.forEach((row) => {
      for (const key of Object.keys(row)) row[key] = "";
    });
  }
  onScopeDispose(() => {
    disposed = true;
    clearInput();
    closeBatchCredentials();
  });
  function customerImportIssueText(problem) {
    const keys = {
      EMPTY_WORKBOOK: "customers.customerImportEmptyWorkbook",
      WRONG_TEMPLATE: "customers.customerImportWrongTemplate",
      MISSING_CUSTOMER_SHEET: "customers.customerImportMissingSheet",
      MISSING_USERNAME_COLUMN: "customers.customerImportMissingUsernameColumn",
      NO_ROWS: "customers.noImportRows",
      TOO_MANY_ROWS: "customers.customerImportTooManyRows",
      USERNAME_REQUIRED: "customers.customerImportUsernameRequired",
      USERNAME_FORMAT: "customers.usernameRule",
      PASSWORD_LENGTH: "customers.customerImportPasswordLength",
      PASSWORD_COMPLEXITY: "customers.customerImportPasswordComplexity",
      DISPLAY_NAME_LENGTH: "customers.displayNameRule",
      CLIENT_CODE_FORMAT: "customers.customerImportClientCodeFormat",
      PARTY_ROLE_FORMAT: "customers.roleRule",
      REMARK_LENGTH: "customers.customerImportRemarkLength",
      DUPLICATE_USERNAME: "customers.customerImportDuplicateUsername",
      DUPLICATE_CLIENT_CODE: "customers.customerImportDuplicateClientCode",
      PASSWORD_WILL_GENERATE: "customers.customerImportPasswordGenerated",
      CLIENT_CODE_WILL_GENERATE: "customers.customerImportClientCodeGenerated"
    };
    return t(keys[problem?.code] || "customers.importFailed", problem || {});
  }
  function customerImportFieldLabel(field) {
    const keys = {
      username: "customers.createAccount",
      password: "customers.initialPassword",
      displayName: "customers.createDisplayName",
      clientCode: "customers.clientCode",
      partyRole: "customers.createPartyRole",
      remark: "customers.remark"
    };
    return field && keys[field] ? `${t(keys[field])}：` : "";
  }
  function customerPartyRoleLabel(role) {
    const keys = {
      SHIPPER: "customers.roleShipper",
      CONSIGNEE: "customers.roleConsignee",
      OVERSEA_AGENT: "customers.roleOverseaAgent"
    };
    return keys[role] ? t(keys[role]) : role || "—";
  }
  function localizeCustomerImportResult(message) {
    const value = String(message || "");
    if (/username or client code already exists/i.test(value)) {
      return t("customers.customerImportDuplicateServer");
    }
    if (/password must contain (uppercase|at least one letter)/i.test(value)) {
      return t("customers.customerImportPasswordComplexity");
    }
    if (/password must contain 8-128/i.test(value)) {
      return t("customers.customerImportPasswordLength");
    }
    if (/customer name must contain/i.test(value)) {
      return t("customers.usernameRule");
    }
    if (/display name must contain/i.test(value)) {
      return t("customers.displayNameRule");
    }
    if (/client code must contain/i.test(value)) {
      return t("customers.customerImportClientCodeFormat");
    }
    if (/party role/i.test(value)) {
      return t("customers.roleRule");
    }
    return value || t("customers.importFailed");
  }

  return {
    batchImportDialogOpen,
    batchImportMode,
    quickImportText,
    batchFileName,
    customerBatchPreview,
    batchPreviewError,
    batchFileInput,
    batchDropzoneActive,
    customerFileParsing,
    importingCustomers,
    batchCredentialRows,
    exportingCredentials,
    credentialExportError,
    quickCustomerBatchPreview,
    activeCustomerBatchPreview,
    canSubmitCustomerBatchImport,
    batchCredentialSummary,
    openBatchImport,
    closeBatchImport,
    selectCustomerBatchMode,
    downloadCustomerImportTemplate,
    handleBatchDrop,
    handleCustomerWorkbook,
    submitBatchImport,
    downloadCredentialWorkbook,
    closeBatchCredentials,
    customerImportIssueText,
    customerImportFieldLabel,
    customerPartyRoleLabel,
    localizeCustomerImportResult
  };
}
