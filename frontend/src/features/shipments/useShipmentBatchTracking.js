import { computed, onScopeDispose, ref, watch } from "vue";
import {
  buildShipmentBatchItems,
  parseShipmentBatchWorkbook
} from "../../services/shipmentBatchImport.js";
import { useShipmentBatchTask } from "./useShipmentBatchTask.js";
import {
  presentBatchTask,
  batchTrackElapsedText as elapsedText,
  batchSubtaskLabel as subtaskLabel,
  batchStageStatusLabel as stageLabel,
  batchStageTagType,
  batchMainStageStatus,
  batchDiagnosticText
} from "./batchTrackingPresentation.js";

/** Batch import/refresh UI composition. Server task and workbook lifecycles are independent. */
export function useShipmentBatchTracking({
  owner,
  canManage = ref(true),
  selectedCustomerId,
  assignableCustomers,
  shipmentTrackingChannel,
  refreshingShipment,
  selectedShipmentRows,
  shipmentTableRef,
  createShipmentBatchTask,
  createShipmentRefreshAllTask,
  createShipmentBatchRefreshTask,
  fetchShipmentBatchTask,
  cancelShipmentBatchTask,
  inspectBusinessShipmentImportConflicts,
  loadXlsxModule,
  waitForNextPaint,
  loadAvailableShipments,
  t,
  formatDateTime,
  showSuccess,
  confirm = (...args) => window.confirm(...args),
  storage,
  scheduler,
  now
}) {
  const batchTrackDialogOpen = ref(false);
  const batchTrackDropzoneActive = ref(false);
  const batchTrackFileParsing = ref(false);
  const batchTrackCarrier = ref("COSCO");
  /** @type {import("vue").Ref<HTMLInputElement | null>} */
  const batchTrackFileInput = ref(null);
  const batchTrackFileName = ref("");
  /** @type {import("vue").Ref<NonNullable<ReturnType<typeof import("../../services/shipmentBatchImport.js").prepareSheet>>[]>} */
  const batchTrackSheets = ref([]);
  const batchTrackSelectedSheetName = ref("");
  const batchTrackSelectedColumnIndex = ref(null);
  const batchTrackCustomerId = ref("");
  const batchTrackPublishToCustomer = ref(true);
  const batchTrackProblemsOnly = ref(false);
  const requestedMode = ref("IMPORT");
  const failureKey = ref("customers.batchTrackStartFailed");
  let disposed = false;
  let fileVersion = 0;
  const job = useShipmentBatchTask({
    owner,
    fetchTask: fetchShipmentBatchTask,
    cancelTask: cancelShipmentBatchTask,
    storage,
    scheduler,
    now,
    onTerminal(snapshot) {
      const view = presentBatchTask(snapshot, job.observedAt.value, t, formatDateTime);
      batchTrackProblemsOnly.value = view.results.some((item) =>
        ["failed", "partial"].includes(item.status)
      );
      void loadAvailableShipments();
    }
  });
  const batchTrackRunning = job.running;
  const batchTrackChecking = job.starting;
  const batchTrackCancelRequested = job.cancelRequested;
  const batchTrackMode = computed(() =>
    String(job.task.value?.mode || requestedMode.value).toUpperCase()
  );
  const view = computed(() =>
    presentBatchTask(job.task.value, job.observedAt.value, t, formatDateTime)
  );
  const batchTrackProgress = computed(() => view.value.progress);
  const batchTrackResults = computed(() => {
    if (!job.error.value) return view.value.results;
    const { action, cause } = job.error.value;
    const failure = {
      index: action === "cancel" ? 0 : 1,
      number: "-",
      status: "failed",
      message:
        cause?.message ||
        t(action === "cancel" ? "customers.batchTrackCancelFailed" : failureKey.value),
      errorCode: cause?.code || "",
      failedSubtasks: []
    };
    return action === "cancel" ? [failure, ...view.value.results] : [failure];
  });
  const batchTrackProblemResults = computed(() =>
    batchTrackResults.value.filter((item) => ["failed", "partial"].includes(item.status))
  );
  const visibleBatchTrackResults = computed(() =>
    batchTrackProblemsOnly.value ? batchTrackProblemResults.value : batchTrackResults.value
  );
  const batchTrackSelectedSheet = computed(
    () =>
      batchTrackSheets.value.find((sheet) => sheet.name === batchTrackSelectedSheetName.value) ||
      null
  );
  const batchTrackItems = computed(() =>
    buildShipmentBatchItems(
      batchTrackSelectedSheet.value,
      batchTrackSelectedColumnIndex.value,
      batchTrackCarrier.value
    )
  );
  const batchTrackNumbers = computed(() => batchTrackItems.value.map((item) => item.displayNumber));
  const batchTrackTrackableCount = computed(
    () => batchTrackItems.value.filter((item) => !item.manualOnly).length
  );
  const batchTrackManualCount = computed(
    () => batchTrackItems.value.filter((item) => item.manualOnly).length
  );
  const batchTrackPreviewRows = computed(
    () => batchTrackSelectedSheet.value?.rows?.slice(1, 9) || []
  );
  const batchTrackDialogTitle = computed(() =>
    t(
      batchTrackMode.value.startsWith("REFRESH")
        ? "customers.batchRefreshTitle"
        : "customers.batchTrack"
    )
  );
  const batchTrackToolbarLabel = computed(() =>
    batchTrackRunning.value
      ? t(
          batchTrackMode.value.startsWith("REFRESH")
            ? "customers.batchRefreshToolbarProgress"
            : "customers.batchTrackToolbarProgress",
          { done: batchTrackProgress.value.done, total: batchTrackProgress.value.total }
        )
      : t("customers.batchTrack")
  );

  watch(
    job.task,
    (snapshot) => {
      const channel = String(snapshot?.channel || "").toUpperCase();
      if (["AUTO", "PROXY"].includes(channel)) shipmentTrackingChannel.value = channel;
    },
    { flush: "sync" }
  );
  watch(batchTrackDialogOpen, (open) => {
    if (open && batchTrackMode.value === "IMPORT" && !batchTrackCustomerId.value) {
      batchTrackCustomerId.value =
        selectedCustomerId.value || assignableCustomers.value[0]?.id || "";
    }
  });
  watch(
    batchTrackSelectedSheetName,
    () => {
      const sheet = batchTrackSelectedSheet.value;
      if (sheet) batchTrackSelectedColumnIndex.value = sheet.suggestedColumnIndex;
    },
    { flush: "sync" }
  );

  function busy() {
    return (
      disposed ||
      !canManage.value ||
      job.running.value ||
      job.starting.value ||
      refreshingShipment.value
    );
  }
  async function confirmExistingBatchBookings(items) {
    const shipments = items.map((item) => ({
      carrier: item.carrier,
      referenceType: "BOOKING",
      referenceNo: item.number
    }));
    const response = await inspectBusinessShipmentImportConflicts(shipments);
    if (disposed) return false;
    const conflicts = Array.isArray(response?.conflicts) ? response.conflicts : [];
    if (!conflicts.length) return true;
    return confirm(
      t("customers.batchTrackExistingConfirm", {
        count: conflicts.length,
        references: conflicts
          .slice(0, 6)
          .map((item) => item.referenceNo)
          .filter(Boolean)
          .join(", "),
        more:
          conflicts.length > 6
            ? t("customers.moreOverwriteSnapshots", { count: conflicts.length - 6 })
            : ""
      })
    );
  }
  async function startBatchTrack() {
    if (
      busy() ||
      batchTrackFileParsing.value ||
      !batchTrackCustomerId.value ||
      !batchTrackItems.value.length
    )
      return;
    // Capture the form before awaiting conflict inspection; edits must not change the approved import.
    const payload = {
      sourceFileName: batchTrackFileName.value,
      channel: shipmentTrackingChannel.value,
      items: batchTrackItems.value.map((item) => ({ ...item })),
      customerId: batchTrackCustomerId.value,
      publishToCustomer: batchTrackPublishToCustomer.value
    };
    requestedMode.value = "IMPORT";
    failureKey.value = "customers.batchTrackStartFailed";
    batchTrackProblemsOnly.value = false;
    await job.start({
      beforeCreate: () => confirmExistingBatchBookings(payload.items),
      createTask: () => createShipmentBatchTask(payload),
      initialTask: {
        mode: "IMPORT",
        status: "QUEUED",
        total: payload.items.length,
        items: payload.items.map((item) => ({ ...item, status: "PENDING" }))
      }
    });
  }
  async function startRefresh(createTask, mode, messageKey, emptyKey = "") {
    if (busy() || batchTrackFileParsing.value) return null;
    batchTrackDialogOpen.value = true;
    requestedMode.value = mode;
    failureKey.value = messageKey;
    batchTrackProblemsOnly.value = false;
    const snapshot = await job.start({
      createTask,
      initialTask: { mode, status: "QUEUED", items: [] }
    });
    if (
      !disposed &&
      !job.error.value &&
      job.task.value?.status === "COMPLETED" &&
      !job.taskId.value &&
      emptyKey
    )
      showSuccess(emptyKey);
    return snapshot;
  }
  async function startRefreshAllShipments() {
    const channel = shipmentTrackingChannel.value;
    return startRefresh(
      () => createShipmentRefreshAllTask(channel),
      "REFRESH_ALL",
      "customers.refreshAllFailed",
      "customers.refreshAllEmpty"
    );
  }
  async function startRefreshSelectedShipments() {
    const ids = [
      ...new Set(selectedShipmentRows.value.map((row) => row?.shipmentId).filter(Boolean))
    ];
    if (!ids.length) return;
    const channel = shipmentTrackingChannel.value;
    const snapshot = await startRefresh(
      () => createShipmentBatchRefreshTask(ids, channel),
      "REFRESH_SELECTED",
      "customers.batchRefreshFailed"
    );
    if (!disposed && snapshot?.taskId) {
      selectedShipmentRows.value = [];
      shipmentTableRef.value?.clearSelection?.();
    }
  }
  async function cancelBatchTrack() {
    if (
      disposed ||
      !canManage.value ||
      (!job.running.value && !job.starting.value) ||
      job.cancelRequested.value ||
      batchTrackProgress.value.status === "STOPPING"
    )
      return;
    if (confirm(t("customers.batchTrackStopConfirm"))) await job.cancel();
  }

  function clearBatchTrackFile() {
    if (busy()) return false;
    fileVersion++;
    batchTrackFileParsing.value = false;
    batchTrackFileName.value = "";
    batchTrackSheets.value = [];
    batchTrackSelectedSheetName.value = "";
    batchTrackSelectedColumnIndex.value = null;
    batchTrackProblemsOnly.value = false;
    job.reset();
    if (batchTrackFileInput.value) batchTrackFileInput.value.value = "";
    return true;
  }
  async function handleBatchTrackWorkbook(event) {
    // Read before resetting the input: resetting a native file input clears its FileList.
    const file = event.target.files?.[0];
    if (!clearBatchTrackFile()) return;
    if (!file) return;
    const version = fileVersion;
    const currentFile = () => !disposed && version === fileVersion;
    batchTrackFileParsing.value = true;
    try {
      await waitForNextPaint();
      if (!currentFile()) return;
      const xlsx = await loadXlsxModule();
      const bytes = await file.arrayBuffer();
      if (!currentFile()) return;
      const workbook = xlsx.read(bytes, { type: "array", cellDates: true });
      const sheets = parseShipmentBatchWorkbook(workbook, xlsx);
      if (!sheets.length) throw new Error(t("customers.noTrackNumbers"));
      const score = (sheet) =>
        Math.max(0, ...sheet.columns.map((column) => Number(column.score || 0)));
      const suggested = [...sheets].sort((a, b) => score(b) - score(a))[0];
      batchTrackSheets.value = sheets;
      batchTrackSelectedSheetName.value = suggested.name;
      batchTrackSelectedColumnIndex.value = suggested.suggestedColumnIndex;
      batchTrackFileName.value = file.name;
    } catch (cause) {
      if (currentFile()) {
        failureKey.value = "customers.excelReadFailed";
        job.error.value = { action: "file", cause };
      }
    } finally {
      if (currentFile()) {
        batchTrackFileParsing.value = false;
        event.target.value = "";
      }
    }
  }
  function handleBatchTrackDrop(event) {
    batchTrackDropzoneActive.value = false;
    const files = event.dataTransfer?.files;
    if (!files?.length || !/\.(xlsx|xls|csv)$/i.test(files[0].name)) return;
    return handleBatchTrackWorkbook({ target: { files } });
  }
  function toggleBatchTrackPanel() {
    if (disposed || !canManage.value) return;
    batchTrackDialogOpen.value = !batchTrackDialogOpen.value;
  }
  onScopeDispose(() => {
    disposed = true;
    fileVersion++;
  });

  return {
    batchTrackDialogOpen,
    batchTrackDropzoneActive,
    batchTrackFileParsing,
    batchTrackCarrier,
    batchTrackRunning,
    batchTrackChecking,
    batchTrackResults,
    batchTrackProgress,
    batchTrackFileInput,
    batchTrackFileName,
    batchTrackSheets,
    batchTrackSelectedSheetName,
    batchTrackSelectedColumnIndex,
    batchTrackMode,
    batchTrackCancelRequested,
    batchTrackCustomerId,
    batchTrackPublishToCustomer,
    batchTrackProblemsOnly,
    batchTrackSelectedSheet,
    batchTrackProblemResults,
    visibleBatchTrackResults,
    batchTrackNumbers,
    batchTrackTrackableCount,
    batchTrackManualCount,
    batchTrackPreviewRows,
    batchTrackDialogTitle,
    batchTrackToolbarLabel,
    startBatchTrack,
    startRefreshAllShipments,
    startRefreshSelectedShipments,
    cancelBatchTrack,
    handleBatchTrackWorkbook,
    clearBatchTrackFile,
    restoreBatchTrackTask: () => (!disposed && canManage.value ? job.restore() : false),
    toggleBatchTrackPanel,
    handleBatchTrackDrop,
    batchSubtaskLabel: (type) => subtaskLabel(type, t),
    batchStageStatusLabel: (status) => stageLabel(status, t),
    batchTrackElapsedText: (result) => elapsedText(result, job.clock.value, t),
    batchStageTagType,
    batchMainStageStatus,
    batchDiagnosticText
  };
}
