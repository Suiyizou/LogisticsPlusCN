import { onScopeDispose, ref, watch } from "vue";

const TERMINAL = new Set(["COMPLETED", "STOPPED", "FAILED", "PAUSED"]);
const STORAGE_PREFIX = "business-shipment-batch-task-id";

/** Owns a server task, not the dialog. Closing the scope stops observation, not the server job. */
export function useShipmentBatchTask({
  owner,
  fetchTask,
  cancelTask,
  onTerminal = () => {},
  storage = () => globalThis.localStorage,
  scheduler = globalThis,
  now = Date.now
}) {
  const task = ref(null);
  const taskId = ref("");
  const running = ref(false);
  const starting = ref(false);
  const cancelRequested = ref(false);
  const error = ref(null);
  const observedAt = ref(now());
  const clock = ref(now());
  const storageKey = `${STORAGE_PREFIX}:${owner}`;
  let disposed = false;
  let generation = 0;
  let requestSequence = 0;
  let pollTimer;
  let clockTimer;
  let terminalHandled = false;

  function readRemembered() {
    try {
      return storage()?.getItem(storageKey) || "";
    } catch {
      return "";
    }
  }
  function remember(id, replace = true) {
    try {
      // A create response can arrive after leaving. Do not overwrite a newer page's task.
      if (replace || !readRemembered() || readRemembered() === id)
        storage()?.setItem(storageKey, id);
    } catch {
      /* Backend work does not depend on browser storage. */
    }
  }
  function forget(id) {
    try {
      if (readRemembered() === id) storage()?.removeItem(storageKey);
    } catch {
      /* Persistence is best effort. */
    }
  }
  function clearPoll() {
    scheduler.clearTimeout(pollTimer);
    pollTimer = undefined;
  }
  function current(version, id = taskId.value) {
    return !disposed && version === generation && id === taskId.value;
  }
  function schedulePoll(id, delay = 1500) {
    clearPoll();
    if (disposed || !running.value || terminalHandled || id !== taskId.value) return;
    pollTimer = scheduler.setTimeout(() => void poll(id), delay);
  }
  function apply(snapshot) {
    if (!snapshot?.taskId || snapshot.taskId !== taskId.value || terminalHandled) return false;
    task.value = snapshot;
    observedAt.value = now();
    clock.value = observedAt.value;
    running.value = !TERMINAL.has(String(snapshot.status || "").toUpperCase());
    if (!running.value) {
      terminalHandled = true;
      cancelRequested.value = false;
      clearPoll();
      requestSequence++;
      forget(snapshot.taskId);
      onTerminal(snapshot);
    }
    return true;
  }
  async function poll(id) {
    if (disposed || !id || id !== taskId.value || !running.value || terminalHandled) return;
    const version = generation;
    const sequence = ++requestSequence;
    try {
      const snapshot = await fetchTask(id);
      if (!current(version, id) || sequence !== requestSequence) return;
      apply(snapshot);
      schedulePoll(id);
    } catch (cause) {
      if (!current(version, id) || sequence !== requestSequence) return;
      if (cause?.status === 403 || cause?.status === 404) {
        forget(id);
        taskId.value = "";
        running.value = false;
        cancelRequested.value = false;
        error.value = { action: "poll", cause };
        clearPoll();
        return;
      }
      schedulePoll(id, 3000);
    }
  }
  async function sendCancel(id, version) {
    try {
      const snapshot = await cancelTask(id);
      if (!current(version, id)) return;
      error.value = null;
      apply(snapshot);
      schedulePoll(id, 500);
    } catch (cause) {
      if (!current(version, id) || terminalHandled) return;
      cancelRequested.value = false;
      error.value = { action: "cancel", cause };
      schedulePoll(id, 500);
    }
  }
  async function cancel() {
    if (disposed || (!running.value && !starting.value) || cancelRequested.value || terminalHandled)
      return false;
    cancelRequested.value = true;
    requestSequence++;
    clearPoll();
    // The creation response is needed before the cancellation endpoint can be called.
    if (taskId.value) await sendCancel(taskId.value, generation);
    return true;
  }
  async function start({ createTask, beforeCreate, initialTask = null }) {
    if (disposed || running.value || starting.value) return null;
    const version = ++generation;
    requestSequence++;
    clearPoll();
    starting.value = true;
    cancelRequested.value = false;
    terminalHandled = false;
    taskId.value = "";
    task.value = null;
    error.value = null;
    try {
      if (beforeCreate) {
        const approved = await beforeCreate();
        if (!current(version) || !approved || cancelRequested.value) return null;
      }
      if (!current(version)) return null;
      task.value = initialTask;
      running.value = true;
      const snapshot = await createTask();
      if (snapshot?.taskId) {
        const terminal = TERMINAL.has(String(snapshot.status || "").toUpperCase());
        if (!terminal) remember(snapshot.taskId, current(version));
        // Honor a pending stop even if the page was closed during creation.
        if (!current(version)) {
          if (cancelRequested.value) {
            try {
              const stopped = await cancelTask(snapshot.taskId);
              if (TERMINAL.has(String(stopped?.status || "").toUpperCase()))
                forget(snapshot.taskId);
            } catch {
              /* Keep the ID so another visit can recover and stop the task. */
            }
          }
          return null;
        }
        taskId.value = snapshot.taskId;
        const stopPending = cancelRequested.value;
        apply(snapshot);
        if (stopPending && running.value) await sendCancel(snapshot.taskId, version);
        else schedulePoll(snapshot.taskId, 800);
        return snapshot;
      }
      if (current(version)) {
        running.value = false;
        task.value = { ...initialTask, status: "COMPLETED", items: [] };
      }
      return null;
    } catch (cause) {
      if (current(version)) {
        running.value = false;
        cancelRequested.value = false;
        error.value = { action: "start", cause };
      }
      return null;
    } finally {
      if (current(version)) {
        starting.value = false;
        if (!running.value) cancelRequested.value = false;
      }
    }
  }
  async function restore() {
    if (disposed || running.value || starting.value) return;
    const id = readRemembered();
    if (!id) return;
    generation++;
    terminalHandled = false;
    taskId.value = id;
    error.value = null;
    running.value = true;
    await poll(id);
  }
  function reset() {
    if (disposed || running.value || starting.value) return false;
    generation++;
    requestSequence++;
    clearPoll();
    task.value = null;
    taskId.value = "";
    error.value = null;
    terminalHandled = false;
    return true;
  }
  watch(
    running,
    (active) => {
      scheduler.clearInterval(clockTimer);
      clockTimer = undefined;
      if (active && !disposed) {
        clock.value = now();
        clockTimer = scheduler.setInterval(() => {
          if (!disposed) clock.value = now();
        }, 1000);
      }
    },
    { flush: "sync" }
  );
  onScopeDispose(() => {
    disposed = true;
    generation++;
    requestSequence++;
    clearPoll();
    scheduler.clearInterval(clockTimer);
  });
  return {
    task,
    taskId,
    running,
    starting,
    cancelRequested,
    error,
    observedAt,
    clock,
    start,
    cancel,
    restore,
    reset
  };
}
