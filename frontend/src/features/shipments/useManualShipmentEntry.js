import { computed, onScopeDispose, ref, watch } from "vue";
import { supportsShipmentReference } from "../../services/trackingCarriers.js";
import {
  buildManualShipmentImportResultWorkbook,
  buildManualShipmentImportTemplate,
  parseManualShipmentImportWorkbook
} from "../../services/manualShipmentExcelImport.js";
import {
  buildManualShipmentPayload,
  createManualShipmentEntryModel,
  shipmentImportIdentity
} from "./manualShipmentEntryModel.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const emptyPreview = (globalErrors = []) => ({
  rows: [],
  items: [],
  globalErrors,
  total: 0,
  valid: 0,
  invalid: 0,
  warningCount: 0
});
const emptyProgress = () => ({ total: 0, done: 0, succeeded: 0, failed: 0, skipped: 0 });

/** Owns manual entry and workbook sessions. Disposal stops queued writes, not submitted writes. */
export function useManualShipmentEntry({
  canManage,
  selectedCustomerId,
  assignableCustomers,
  shipmentPage,
  loadAvailableShipments,
  createBusinessShipment,
  inspectBusinessShipmentImportConflicts,
  loadXlsxModule,
  waitForNextPaint = async () => {},
  t,
  showSuccess,
  showError,
  markApiErrorHandled = () => {},
  confirm,
  ownerIdentity = ref(""),
  entryWriteBusy = ref(false)
}) {
  const model = createManualShipmentEntryModel(t);
  watch(() => model.shipmentCreateForm.carrier, (carrier) => {
    if (!supportsShipmentReference(carrier, model.shipmentCreateForm.referenceType))
      model.shipmentCreateForm.referenceType = "BOOKING";
  }, { flush: "sync" });
  const shipmentCreateDialogOpen = ref(false);
  const shipmentCreateCustomerId = ref("");
  const shipmentCreatePublishToCustomer = ref(true);
  const creatingShipment = ref(false);
  const shipmentExcelImportDialogOpen = ref(false);
  const shipmentExcelCustomerId = ref("");
  const shipmentExcelPublishToCustomer = ref(true);
  const shipmentExcelImportFileInput = ref(null);
  const shipmentExcelImportFileName = ref("");
  const shipmentExcelImportDropzoneActive = ref(false);
  const shipmentExcelImportParsing = ref(false);
  const shipmentExcelImporting = ref(false);
  const shipmentExcelImportPreview = ref(emptyPreview());
  const shipmentExcelImportResults = ref([]);
  const shipmentExcelImportProgress = ref(emptyProgress());
  const shipmentExcelExporting = ref(false);
  let disposed = false,
    manualSession = 0,
    excelSession = 0,
    parseVersion = 0,
    exportVersion = 0;
  let manualRevision = 0;
  const allowed = () => !disposed && canManage.value;
  const idle = () => allowed() && !entryWriteBusy.value;
  const customerAllowed = (id) =>
    !!id && assignableCustomers.value.some((item) => String(item.id) === String(id));
  const defaultCustomer = () =>
    customerAllowed(selectedCustomerId.value)
      ? selectedCustomerId.value
      : assignableCustomers.value[0]?.id || "";
  watch(model.shipmentCreateForm, () => manualRevision++, { deep: true, flush: "sync" });
  watch(
    shipmentCreateDialogOpen,
    (open) => {
      manualSession++;
      if (open && !customerAllowed(shipmentCreateCustomerId.value))
        shipmentCreateCustomerId.value = defaultCustomer();
    },
    { flush: "sync" }
  );
  function clearExcelInput() {
    parseVersion++;
    exportVersion++;
    shipmentExcelImportParsing.value = false;
    shipmentExcelExporting.value = false;
    shipmentExcelImportFileName.value = "";
    shipmentExcelImportDropzoneActive.value = false;
    shipmentExcelImportPreview.value = emptyPreview();
    shipmentExcelImportResults.value = [];
    shipmentExcelImportProgress.value = emptyProgress();
    if (shipmentExcelImportFileInput.value) shipmentExcelImportFileInput.value.value = "";
  }
  watch(
    shipmentExcelImportDialogOpen,
    (open) => {
      excelSession++;
      if (open && !customerAllowed(shipmentExcelCustomerId.value))
        shipmentExcelCustomerId.value = defaultCustomer();
      if (!open) clearExcelInput();
    },
    { flush: "sync" }
  );
  watch(
    ownerIdentity,
    () => {
      manualSession++;
      excelSession++;
      shipmentCreateDialogOpen.value = false;
      shipmentExcelImportDialogOpen.value = false;
      shipmentCreateCustomerId.value = "";
      shipmentExcelCustomerId.value = "";
      model.resetShipmentCreateForm();
      clearExcelInput();
    },
    { flush: "sync" }
  );
  watch(
    canManage,
    (permitted) => {
      if (permitted) return;
      manualSession++;
      excelSession++;
      shipmentCreateDialogOpen.value = false;
      shipmentExcelImportDialogOpen.value = false;
      model.resetShipmentCreateForm();
      clearExcelInput();
    },
    { flush: "sync" }
  );
  const canStartShipmentExcelImport = computed(() => {
    const preview = shipmentExcelImportPreview.value;
    return (
      idle() &&
      shipmentExcelImportDialogOpen.value &&
      !shipmentExcelImportParsing.value &&
      !shipmentExcelImporting.value &&
      !shipmentExcelImportResults.value.length &&
      preview.valid > 0 &&
      preview.items.length <= 300 &&
      preview.invalid === 0 &&
      !preview.globalErrors.length &&
      customerAllowed(shipmentExcelCustomerId.value)
    );
  });
  const entryBusy = computed(() => entryWriteBusy.value);
  function openShipmentCreateDialog() {
    if (idle()) shipmentCreateDialogOpen.value = true;
  }
  function closeShipmentCreateDialog() {
    if (disposed || creatingShipment.value) return;
    shipmentCreateDialogOpen.value = false;
    model.resetShipmentCreateForm();
  }
  function openShipmentExcelImport() {
    if (idle()) shipmentExcelImportDialogOpen.value = true;
  }
  function closeShipmentExcelImport() {
    if (disposed || shipmentExcelImporting.value) return;
    shipmentExcelImportDialogOpen.value = false;
    clearExcelInput();
  }
  function shipmentExcelRowClassName({ row }) {
    return row?.errors?.length ? "is-invalid" : row?.warnings?.length ? "has-warning" : "";
  }
  async function downloadShipmentExcelTemplate() {
    if (!allowed()) return;
    try {
      const XLSX = await loadXlsxModule();
      if (allowed())
        XLSX.writeFile(
          buildManualShipmentImportTemplate(XLSX),
          `shipment-import-template-${new Date().toISOString().slice(0, 10)}.xlsx`
        );
    } catch (error) {
      if (!disposed) showError(error, "customers.shipmentExcelTemplateFailed");
    }
  }
  async function handleShipmentExcelImportWorkbook(event) {
    const file = event?.target?.files?.[0];
    if (event?.target) event.target.value = "";
    await parseShipmentExcelImportFile(file);
  }
  async function handleShipmentExcelImportDrop(event) {
    shipmentExcelImportDropzoneActive.value = false;
    await parseShipmentExcelImportFile(event?.dataTransfer?.files?.[0]);
  }
  async function parseShipmentExcelImportFile(file) {
    if (!idle() || !shipmentExcelImportDialogOpen.value || shipmentExcelImporting.value) return;
    clearExcelInput();
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name || "")) {
      shipmentExcelImportPreview.value = emptyPreview([
        t("customers.shipmentExcelUnsupportedFile")
      ]);
      return;
    }
    if (Number(file.size || 0) > 10 * 1024 * 1024) {
      shipmentExcelImportPreview.value = emptyPreview([t("customers.shipmentExcelFileTooLarge")]);
      return;
    }
    const version = parseVersion,
      session = excelSession;
    const current = () =>
      allowed() &&
      shipmentExcelImportDialogOpen.value &&
      version === parseVersion &&
      session === excelSession;
    shipmentExcelImportParsing.value = true;
    shipmentExcelImportFileName.value = file.name;
    try {
      await waitForNextPaint();
      if (!current()) return;
      const XLSX = await loadXlsxModule();
      if (!current()) return;
      const data = await file.arrayBuffer();
      if (!current()) return;
      const workbook = XLSX.read(data, { type: "array", cellDates: true });
      shipmentExcelImportPreview.value = parseManualShipmentImportWorkbook(workbook, XLSX);
    } catch (error) {
      if (current())
        shipmentExcelImportPreview.value = emptyPreview([
          error?.message || t("customers.excelReadFailed")
        ]);
    } finally {
      if (current()) shipmentExcelImportParsing.value = false;
    }
  }
  async function prepareShipmentOverwriteReview(shipments, options = {}, current = allowed) {
    const response = await inspectBusinessShipmentImportConflicts(clone(shipments));
    const conflicts = Array.isArray(response?.conflicts) ? response.conflicts : [];
    const existingIdentities = new Set(conflicts.map(shipmentImportIdentity));
    const snapshots = conflicts.filter((item) => item?.hasCurrentSnapshot);
    const abort = () => ({ approved: false, action: "ABORT", existingIdentities });
    if (!current()) return abort();
    if (options.allowSkipExisting && conflicts.length) {
      const total = Number(response?.checked) || shipments.length;
      const newCount = Math.max(0, total - conflicts.length);
      try {
        await confirm(
          t("customers.shipmentExcelConflictSummary", {
            total,
            existing: conflicts.length,
            snapshots: snapshots.length,
            newCount
          }),
          t("customers.shipmentExcelConflictTitle"),
          {
            type: "warning",
            distinguishCancelAndClose: true,
            closeOnClickModal: false,
            confirmButtonText: newCount
              ? t("customers.importNewOnly", { count: newCount })
              : t("customers.keepExistingSnapshots"),
            cancelButtonText: t("customers.importAllAndUpdateExisting", {
              count: conflicts.length
            }),
            cancelButtonClass: "shipment-overwrite-danger-button"
          }
        );
        return current()
          ? { approved: newCount > 0, action: "SKIP_EXISTING", existingIdentities }
          : abort();
      } catch (action) {
        return current() && action === "cancel"
          ? { approved: true, action: "OVERWRITE_EXISTING", existingIdentities }
          : abort();
      }
    }
    if (snapshots.length) {
      try {
        await confirm(
          t("customers.confirmOverwriteSnapshots", {
            count: snapshots.length,
            references: snapshots
              .slice(0, 5)
              .map((item) => item.referenceNo)
              .filter(Boolean)
              .join("、"),
            more:
              snapshots.length > 5
                ? t("customers.moreOverwriteSnapshots", { count: snapshots.length - 5 })
                : ""
          }),
          t("customers.shipmentExcelConflictTitle"),
          {
            type: "warning",
            closeOnClickModal: false,
            confirmButtonText: t("customers.confirmOverwrite"),
            cancelButtonText: t("customers.cancel")
          }
        );
      } catch {
        return abort();
      }
    }
    return current()
      ? {
          approved: true,
          action: conflicts.length ? "OVERWRITE_EXISTING" : "CREATE_ONLY",
          existingIdentities
        }
      : abort();
  }
  async function createShipment() {
    if (
      !idle() ||
      !shipmentCreateDialogOpen.value ||
      !customerAllowed(shipmentCreateCustomerId.value)
    )
      return;
    const customerId = shipmentCreateCustomerId.value,
      publish = shipmentCreatePublishToCustomer.value;
    const payload = clone(buildManualShipmentPayload(model.shipmentCreateForm));
    const session = manualSession,
      revision = manualRevision;
    const owner = ownerIdentity.value;
    const current = () => !disposed && session === manualSession && shipmentCreateDialogOpen.value;
    entryWriteBusy.value = true;
    creatingShipment.value = true;
    let saved = false;
    try {
      const review = await prepareShipmentOverwriteReview(
        [payload],
        {},
        () => current() && canManage.value && customerAllowed(customerId)
      );
      if (!review.approved || !current() || !canManage.value || !customerAllowed(customerId))
        return false;
      await createBusinessShipment(
        payload,
        customerId,
        publish,
        review.existingIdentities.has(shipmentImportIdentity(payload))
      );
      saved = true;
      if (!current()) return true;
      // A submitted write succeeded even if the subsequent list refresh fails.
      if (revision === manualRevision) {
        model.resetShipmentCreateForm();
        shipmentCreateDialogOpen.value = false;
      }
      showSuccess("customers.shipmentCreated");
      shipmentPage.value = 1;
      await loadAvailableShipments();
      return true;
    } catch (error) {
      if (!disposed && owner === ownerIdentity.value && canManage.value && (current() || saved))
        showError(
          error,
          saved ? "customers.loadAvailableShipmentsFailed" : "customers.shipmentCreateFailed"
        );
      return saved;
    } finally {
      creatingShipment.value = false;
      entryWriteBusy.value = false;
    }
  }
  async function startShipmentExcelImport() {
    if (!canStartShipmentExcelImport.value) return;
    const items = clone(shipmentExcelImportPreview.value.items);
    const customerId = shipmentExcelCustomerId.value,
      publish = shipmentExcelPublishToCustomer.value;
    const session = excelSession;
    const current = () =>
      !disposed && session === excelSession && shipmentExcelImportDialogOpen.value;
    entryWriteBusy.value = true;
    shipmentExcelImporting.value = true;
    try {
      let review;
      try {
        review = await prepareShipmentOverwriteReview(
          items.map((item) => item.payload),
          { allowSkipExisting: true },
          () => current() && canManage.value && customerAllowed(customerId)
        );
      } catch (error) {
        if (current()) showError(error, "customers.shipmentExcelImportConflictCheckFailed");
        return;
      }
      if (!review.approved || !current() || !canManage.value || !customerAllowed(customerId))
        return;
      const work = items
        .map((item, resultIndex) => ({
          item,
          resultIndex,
          existing: review.existingIdentities.has(shipmentImportIdentity(item.payload))
        }))
        .filter(({ existing }) => review.action === "OVERWRITE_EXISTING" || !existing);
      const progress = {
        ...emptyProgress(),
        total: work.length,
        skipped: items.length - work.length
      };
      const results = items.map((item) => {
        const skipped =
          review.action === "SKIP_EXISTING" &&
          review.existingIdentities.has(shipmentImportIdentity(item.payload));
        return {
          importKey: item.importKey,
          carrier: item.carrier,
          referenceType: item.referenceType,
          referenceNo: item.referenceNo,
          status: skipped ? "SKIPPED" : "PENDING",
          message: t(skipped ? "customers.importSkippedExisting" : "customers.importPending")
        };
      });
      shipmentExcelImportResults.value = results;
      shipmentExcelImportProgress.value = progress;
      let cursor = 0;
      const worker = async () => {
        while (
          current() &&
          canManage.value &&
          customerAllowed(customerId) &&
          cursor < work.length
        ) {
          const { item, resultIndex, existing } = work[cursor++];
          try {
            const response = await createBusinessShipment(
              item.payload,
              customerId,
              publish,
              review.action === "OVERWRITE_EXISTING" && existing
            );
            results[resultIndex] = {
              ...results[resultIndex],
              status: response?.overwritten === true ? "UPDATED" : "CREATED",
              message: t(
                response?.overwritten === true
                  ? "customers.importUpdated"
                  : "customers.importCreated"
              )
            };
            progress.succeeded++;
          } catch (error) {
            markApiErrorHandled(error);
            results[resultIndex] = {
              ...results[resultIndex],
              status: "FAILED",
              message: error?.message || t("customers.shipmentExcelImportItemFailed")
            };
            progress.failed++;
          } finally {
            progress.done++;
            if (current()) {
              shipmentExcelImportResults.value = [...results];
              shipmentExcelImportProgress.value = { ...progress };
            }
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, work.length) }, worker));
      if (!current()) return;
      if (progress.done < progress.total) {
        // Submitted writes have settled; these rows were never sent to the server.
        progress.notSubmitted = results.filter((row) => row.status === "PENDING").length;
        shipmentExcelImportResults.value = results.map((row) =>
          row.status === "PENDING"
            ? { ...row, status: "NOT_SUBMITTED", message: t("customers.manualImportNotSubmitted") }
            : row
        );
        shipmentExcelImportProgress.value = { ...progress };
        showError(
          new Error(t("customers.manualImportStopped", { count: progress.notSubmitted })),
          "customers.manualImportStopped"
        );
        return { ...progress, stopped: true };
      }
      showSuccess(
        !work.length
          ? "customers.shipmentExcelNoNewShipments"
          : progress.skipped
            ? "customers.shipmentExcelImportFinishedWithSkipped"
            : "customers.shipmentExcelImportFinished",
        { count: progress.skipped, ...progress }
      );
      if (work.length) {
        shipmentPage.value = 1;
        try {
          await loadAvailableShipments();
        } catch (error) {
          if (current()) showError(error, "customers.loadAvailableShipmentsFailed");
        }
      }
      return { ...progress };
    } catch (error) {
      if (current()) showError(error, "customers.shipmentExcelImportItemFailed");
    } finally {
      shipmentExcelImporting.value = false;
      entryWriteBusy.value = false;
    }
  }
  async function downloadShipmentExcelImportResults() {
    if (
      !allowed() ||
      shipmentExcelImporting.value ||
      shipmentExcelExporting.value ||
      !shipmentExcelImportResults.value.length
    )
      return;
    const rows = clone(shipmentExcelImportResults.value),
      session = excelSession,
      version = ++exportVersion;
    const current = () => allowed() && session === excelSession && version === exportVersion;
    shipmentExcelExporting.value = true;
    try {
      const XLSX = await loadXlsxModule();
      if (!current()) return;
      XLSX.writeFile(
        buildManualShipmentImportResultWorkbook(rows, XLSX),
        `shipment-import-results-${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch (error) {
      if (current()) showError(error, "customers.shipmentExcelResultsFailed");
    } finally {
      if (current()) shipmentExcelExporting.value = false;
    }
  }
  onScopeDispose(() => {
    disposed = true;
    manualSession++;
    excelSession++;
    clearExcelInput();
    model.resetShipmentCreateForm();
  });
  return {
    ...model,
    entryBusy,
    shipmentCreateDialogOpen,
    shipmentCreateCustomerId,
    shipmentCreatePublishToCustomer,
    creatingShipment,
    shipmentExcelImportDialogOpen,
    shipmentExcelCustomerId,
    shipmentExcelPublishToCustomer,
    shipmentExcelImportFileInput,
    shipmentExcelImportFileName,
    shipmentExcelImportDropzoneActive,
    shipmentExcelImportParsing,
    shipmentExcelImporting,
    shipmentExcelImportPreview,
    shipmentExcelImportResults,
    shipmentExcelImportProgress,
    shipmentExcelExporting,
    canStartShipmentExcelImport,
    openShipmentCreateDialog,
    closeShipmentCreateDialog,
    createShipment,
    openShipmentExcelImport,
    closeShipmentExcelImport,
    shipmentExcelRowClassName,
    downloadShipmentExcelTemplate,
    handleShipmentExcelImportWorkbook,
    onShipmentExcelImportFileChange: handleShipmentExcelImportWorkbook,
    handleShipmentExcelImportDrop,
    parseShipmentExcelImportFile,
    startShipmentExcelImport,
    downloadShipmentExcelImportResults,
    prepareShipmentOverwriteReview
  };
}
