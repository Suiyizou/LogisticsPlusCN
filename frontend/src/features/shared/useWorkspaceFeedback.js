import { onScopeDispose, ref } from "vue";

/** Feedback belongs to the active workspace; replaced or disposed notices cannot reappear. */
export function useWorkspaceFeedback({ t, markApiErrorHandled, scheduler = globalThis }) {
  const pageMessage = ref("");
  const messageIsError = ref(false);
  const toastMessage = ref("");
  let timer;
  let toastVersion = 0;
  let disposed = false;

  function clearMessage() {
    if (disposed) return;
    pageMessage.value = "";
    messageIsError.value = false;
  }
  function showInfo(key) {
    if (disposed) return;
    pageMessage.value = t(key);
    messageIsError.value = false;
  }
  function showSuccess(key, params) {
    if (disposed) return;
    clearMessage();
    const version = ++toastVersion;
    scheduler.clearTimeout(timer);
    toastMessage.value = t(key, params);
    timer = scheduler.setTimeout(() => {
      if (!disposed && version === toastVersion) toastMessage.value = "";
    }, 2600);
  }
  function showError(error, fallbackKey) {
    if (disposed) return;
    markApiErrorHandled(error);
    const message = String(error?.message || "");
    if (/operational data|last valid snapshot was kept/i.test(message)) {
      pageMessage.value = t("customers.refreshReturnedNoData");
    } else if (/Tracked shipment not found|Shipment not found/i.test(message)) {
      pageMessage.value = t("customers.trackedShipmentNotFound");
    } else if (/explicit operator access|permission|forbidden/i.test(message)) {
      pageMessage.value = t("customers.shipmentAccessRequired");
    } else if (
      /\b(?:HTTP|403|Playwright|browser|channel|timeout|ECONN|network interface)\b/i.test(message)
    ) {
      pageMessage.value = t("customers.friendlyError");
    } else {
      pageMessage.value = message || t(fallbackKey);
    }
    messageIsError.value = true;
  }
  onScopeDispose(() => {
    disposed = true;
    toastVersion++;
    scheduler.clearTimeout(timer);
    pageMessage.value = "";
    toastMessage.value = "";
    messageIsError.value = false;
  });
  return {
    pageMessage,
    messageIsError,
    toastMessage,
    clearMessage,
    showInfo,
    showSuccess,
    showError
  };
}
