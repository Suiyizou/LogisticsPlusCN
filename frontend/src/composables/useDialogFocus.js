import { nextTick, onScopeDispose, watch } from "vue";

// All dialogs share the document. Closing one must not unlock another overlay.
const documentScrollLocks = new WeakMap();
function lockDocumentScroll(document) {
  const body = document?.body;
  if (!body) return () => {};
  let lock = documentScrollLocks.get(body);
  if (!lock) {
    lock = {
      count: 0,
      value: body.style.getPropertyValue("overflow"),
      priority: body.style.getPropertyPriority("overflow")
    };
    documentScrollLocks.set(body, lock);
    body.style.setProperty("overflow", "hidden");
  }
  lock.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--lock.count) return;
    if (lock.value) body.style.setProperty("overflow", lock.value, lock.priority);
    else body.style.removeProperty("overflow");
    documentScrollLocks.delete(body);
  };
}

// UI-only modal lifecycle. Business state, validation and writes belong to the
// supplied workflow. A pending confirmation must remain free to own the focus.
export function useDialogFocus({ dialogElement, isOpen, isBusy, close }) {
  let previousFocus = null;
  let focusVersion = 0;
  let unlockScroll = () => {};

  function restoreFocus() {
    const dialog = dialogElement.value;
    const active = globalThis.document?.activeElement;
    if (
      previousFocus?.isConnected &&
      (!active || active === globalThis.document?.body || dialog?.contains(active))
    ) {
      previousFocus.focus({ preventScroll: true });
    }
    previousFocus = null;
  }

  function focusableElements(dialog) {
    return Array.from(
      dialog.querySelectorAll(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'
      )
    ).filter(
      (element) =>
        !element.matches(":disabled") &&
        element.tabIndex >= 0 &&
        !element.closest('[hidden], [aria-hidden="true"], [aria-disabled="true"]') &&
        element.getClientRects().length > 0
    );
  }

  function onDialogKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!isBusy()) close();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogElement.value;
    if (!dialog) return;
    const elements = focusableElements(dialog);
    const active = globalThis.document?.activeElement;
    const first = elements[0];
    const last = elements.at(-1);
    if (!first) {
      event.preventDefault();
      dialog.focus({ preventScroll: true });
    } else if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  watch(
    isOpen,
    async (open) => {
      const version = ++focusVersion;
      if (!open) {
        unlockScroll();
        restoreFocus();
        return;
      }
      previousFocus = globalThis.document?.activeElement || null;
      unlockScroll();
      unlockScroll = lockDocumentScroll(globalThis.document);
      await nextTick();
      if (version === focusVersion && isOpen()) {
        const dialog = dialogElement.value;
        // Workflows may already focus their primary action while opening a modal.
        if (dialog && !dialog.contains(globalThis.document?.activeElement))
          dialog.focus({ preventScroll: true });
      }
    },
    { immediate: true, flush: "post" }
  );

  onScopeDispose(() => {
    focusVersion += 1;
    unlockScroll();
    restoreFocus();
  });

  return { onDialogKeydown };
}
