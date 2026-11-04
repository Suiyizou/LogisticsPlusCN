import { computed, onScopeDispose, ref, watch } from "vue";
import {
  createTaskEditor,
  restoreTaskEditor,
  reviewTaskRows,
  taskDraftPayload,
  taskMayPublish,
  taskRuns
} from "./shipmentTaskDraft.js";

export function useShipmentTaskPublisher({
  api,
  reportError,
  confirmDiscard,
  confirmPublish = () => true,
  onCompleted = () => {},
  scheduler = globalThis
}) {
  const tasks = ref([]);
  const selected = ref(null);
  const editor = ref(createTaskEditor());
  const baseline = ref(JSON.stringify(editor.value));
  const reviewed = ref(false);
  const busy = ref("");
  const loading = ref(false);
  const error = ref(null);
  const pollError = ref(null);
  const notice = ref("");
  const dirty = computed(() => JSON.stringify(editor.value) !== baseline.value);
  const review = computed(() => reviewTaskRows(editor.value));
  const itemCount = computed(() => review.value.filter(({ item }) => item).length);
  const issueCount = computed(() =>
    review.value.reduce((count, { errors }) => count + errors.length, 0)
  );
  const canPublish = computed(
    () =>
      !busy.value &&
      taskMayPublish(selected.value, {
        dirty: dirty.value,
        reviewed: reviewed.value,
        issues: issueCount.value,
        items: itemCount.value
      })
  );
  let disposed = false;
  let pollTimer;
  let sequence = 0;
  let listRequest = 0;
  const completed = new Set();

  watch(
    editor,
    () => {
      reviewed.value = false;
    },
    { deep: true, flush: "sync" }
  );

  function acknowledgeCompletion(task) {
    if (!task || task.mode !== "IMPORT" || taskRuns.has(task.status) || completed.has(task.taskId))
      return;
    if (task.items?.some((item) => item.shipmentId)) {
      completed.add(task.taskId);
      onCompleted(task);
    }
  }

  function remember(task) {
    const index = tasks.value.findIndex(({ taskId }) => taskId === task.taskId);
    if (index < 0) tasks.value.unshift(task);
    else tasks.value[index] = task;
    acknowledgeCompletion(task);
  }

  function apply(task) {
    remember(task);
    selected.value = task;
    editor.value = task.status === "DRAFT" ? restoreTaskEditor(task) : createTaskEditor();
    baseline.value = JSON.stringify(editor.value);
    reviewed.value = false;
  }

  function reset() {
    selected.value = null;
    editor.value = createTaskEditor();
    baseline.value = JSON.stringify(editor.value);
    reviewed.value = false;
  }

  function discardAllowed() {
    return !dirty.value || confirmDiscard();
  }

  function startNew() {
    if (busy.value || !discardAllowed()) return false;
    sequence++;
    error.value = null;
    pollError.value = null;
    notice.value = "";
    reset();
    return true;
  }

  async function list() {
    const request = ++listRequest;
    const before = sequence;
    loading.value = true;
    try {
      const result = await api.list();
      if (disposed || request !== listRequest || !Array.isArray(result)) return;
      if (before === sequence) {
        tasks.value = result;
      } else {
        const seen = new Set(tasks.value.map(({ taskId }) => taskId));
        tasks.value.push(...result.filter(({ taskId }) => !seen.has(taskId)));
      }
      if (error.value?.action === "list") error.value = null;
    } catch (cause) {
      reportError(cause);
      if (!disposed && request === listRequest && before === sequence && !error.value)
        error.value = { action: "list", cause };
    } finally {
      if (!disposed && request === listRequest) loading.value = false;
    }
  }

  async function run(action, work) {
    if (busy.value || disposed) return false;
    const current = ++sequence;
    const valid = () => !disposed && current === sequence;
    busy.value = action;
    error.value = null;
    pollError.value = null;
    notice.value = "";
    try {
      return await work(valid);
    } catch (cause) {
      reportError(cause);
      if (valid()) {
        const validationErrors = cause?.details?.validationErrors;
        if (
          action === "publish" &&
          validationErrors?.length &&
          selected.value?.status === "DRAFT"
        ) {
          selected.value = { ...selected.value, validationErrors };
          reviewed.value = false;
        }
        error.value = { action, cause };
      }
      return false;
    } finally {
      if (valid()) busy.value = "";
    }
  }

  function saveInput(valid) {
    const task = selected.value;
    const payload = taskDraftPayload(editor.value, review.value);
    const request = task
      ? api.update(task.taskId, { ...payload, expectedRevision: task.revision })
      : api.create(payload);
    return request.then((response) => {
      if (!valid()) return false;
      apply(response);
      return true;
    });
  }

  function save() {
    if (
      !editor.value.rows.length ||
      !dirty.value ||
      (selected.value && selected.value.status !== "DRAFT")
    )
      return false;
    return run("save", saveInput);
  }

  function importFile(load) {
    if (!discardAllowed()) return false;
    return run("file", async (valid) => {
      const input = await load();
      if (!valid() || !input) return false;
      reset();
      Object.assign(editor.value, input);
      return saveInput(valid);
    });
  }

  function open(taskId) {
    if (!discardAllowed()) return false;
    return run("open", async (valid) => {
      const task = await api.get(taskId);
      if (!valid()) return false;
      apply(task);
      return true;
    });
  }

  function publish() {
    if (!canPublish.value) return false;
    const { taskId, revision } = selected.value;
    return run("publish", async (valid) => {
      const approved = await confirmPublish(selected.value);
      if (
        !valid() ||
        !approved ||
        !taskMayPublish(selected.value, {
          dirty: dirty.value,
          reviewed: reviewed.value,
          issues: issueCount.value,
          items: itemCount.value
        })
      )
        return false;
      const task = await api.publish(taskId, revision);
      if (!valid()) return false;
      apply(task);
      notice.value = "published";
      return true;
    });
  }

  function cancel() {
    const task = selected.value;
    if (!taskRuns.has(task?.status) || task.status === "STOPPING") return false;
    return run("cancel", async (valid) => {
      const result = await api.cancel(task.taskId);
      if (!valid()) return false;
      apply(result);
      return true;
    });
  }

  function retry() {
    const task = selected.value;
    if (task?.status !== "COMPLETED" || !task.items?.some(({ status }) => status === "FAILED"))
      return false;
    return run("retry", async (valid) => {
      const result = await api.retry(task.taskId);
      if (!valid()) return false;
      completed.delete(task.taskId);
      apply(result);
      return true;
    });
  }

  async function poll() {
    const task = selected.value;
    if (disposed || busy.value || !taskRuns.has(task?.status)) return;
    const before = sequence;
    try {
      const fresh = await api.get(task.taskId);
      if (disposed || before !== sequence) return;
      remember(fresh);
      selected.value = fresh;
      if (fresh.status !== "QUEUED") notice.value = "";
      pollError.value = null;
    } catch (cause) {
      reportError(cause);
      if (!disposed && before === sequence) pollError.value = cause;
    }
  }

  function schedulePoll() {
    if (!disposed)
      pollTimer = scheduler.setTimeout(async () => {
        await poll();
        schedulePoll();
      }, 3000);
  }
  schedulePoll();
  onScopeDispose(() => {
    disposed = true;
    scheduler.clearTimeout(pollTimer);
  });

  return {
    tasks,
    selected,
    editor,
    dirty,
    reviewed,
    busy,
    loading,
    error,
    pollError,
    notice,
    review,
    itemCount,
    issueCount,
    canPublish,
    list,
    startNew,
    importFile,
    open,
    save,
    publish,
    cancel,
    retry
  };
}
