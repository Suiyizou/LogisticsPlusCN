/** Progressive presentation only: native controls remain the form/state owners. */
const controllers = new Set();
let activeControl = null;

export function nextOptionIndex(index, delta, length) {
  if (!length) return -1;
  return (index + delta + length) % length;
}

export function typeaheadIndex(options, text, start = -1) {
  const needle = String(text).normalize("NFKC").toLocaleLowerCase();
  if (!needle || !options.length) return -1;
  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (start + offset + options.length) % options.length;
    if (options[index].label.normalize("NFKC").toLocaleLowerCase().startsWith(needle)) return index;
  }
  return -1;
}

export function refreshTrackingControls() {
  for (const controller of controllers) controller.refresh();
}

let pendingConfirmation = null;
let confirmationSequence = 0;

/** Native modal semantics and a boolean result preserve each caller's cancellation gate. */
export function requestTrackingConfirmation(
  { title, message, confirmLabel, cancelLabel, danger = true },
  doc = document
) {
  if (pendingConfirmation) return Promise.resolve(false);
  const dialog = doc.createElement("dialog");
  const sequence = ++confirmationSequence;
  dialog.className = "tracking-confirm-dialog";
  dialog.setAttribute("aria-labelledby", `tracking-confirm-title-${sequence}`);
  dialog.setAttribute("aria-describedby", `tracking-confirm-message-${sequence}`);
  dialog.dataset.variant = danger ? "danger" : "action";
  const heading = doc.createElement("h2");
  heading.id = `tracking-confirm-title-${sequence}`;
  heading.textContent = title;
  const body = doc.createElement("p");
  body.id = `tracking-confirm-message-${sequence}`;
  body.textContent = message;
  const footer = doc.createElement("footer");
  const cancel = doc.createElement("button");
  cancel.type = "button";
  cancel.className = "secondary-dialog-button";
  cancel.textContent = cancelLabel;
  const confirm = doc.createElement("button");
  confirm.type = "button";
  confirm.className = "primary-dialog-button";
  confirm.textContent = confirmLabel;
  footer.append(cancel, confirm);
  dialog.append(heading, body, footer);
  doc.body.append(dialog);
  pendingConfirmation = dialog;
  return new Promise((resolve) => {
    const finish = () => {
      pendingConfirmation = null;
      resolve(dialog.returnValue === "confirm");
      doc.defaultView.setTimeout(() => dialog.remove(), 220);
    };
    cancel.addEventListener("click", () => dialog.close("cancel"));
    confirm.addEventListener("click", () => dialog.close("confirm"));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      dialog.close("cancel");
    });
    dialog.addEventListener("close", finish, { once: true });
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") event.stopPropagation();
    });
    dialog.showModal();
    cancel.focus({ preventScroll: true });
  });
}

function optionRecords(select) {
  return Array.from(select.options)
    .map((option, index) => ({
      value: option.value,
      label: option.label || option.textContent.trim(),
      nativeIndex: index,
      disabled: option.disabled || Boolean(option.closest("optgroup[disabled]")),
      hidden: option.hidden || Boolean(option.closest("optgroup[hidden]"))
    }))
    .filter((option) => !option.hidden);
}

function labelFor(select) {
  if (select.getAttribute("aria-label")) return select.getAttribute("aria-label");
  const explicit = select.labels?.[0];
  if (explicit)
    return explicit.querySelector("span")?.textContent.trim() || explicit.textContent.trim();
  return select.name || select.id;
}

function installSelect(select, win) {
  if (select.multiple || select.size > 1 || !select.id) return;
  const doc = select.ownerDocument;
  const nativeTabIndex = select.getAttribute("tabindex");
  const coarse = win.matchMedia("(pointer: coarse)");
  const wrapper = doc.createElement("div");
  wrapper.className = "tracking-select";
  const trigger = doc.createElement("button");
  trigger.type = "button";
  trigger.className = "tracking-select-trigger";
  trigger.id = `${select.id}-combobox`;
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const value = doc.createElement("span");
  value.className = "tracking-select-value";
  const arrow = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  arrow.setAttribute("viewBox", "0 0 20 20");
  arrow.setAttribute("aria-hidden", "true");
  const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "m5 7.5 5 5 5-5");
  arrow.append(path);
  trigger.append(value, arrow);
  select.before(wrapper);
  wrapper.append(select, trigger);
  const popup = doc.createElement("div");
  popup.className = "tracking-select-popup";
  popup.id = `${select.id}-listbox`;
  popup.setAttribute("role", "listbox");
  popup.setAttribute("aria-hidden", "true");
  popup.inert = true;
  popup.setAttribute("popover", "manual");
  if (typeof popup.showPopover !== "function") popup.removeAttribute("popover");
  popup.hidden = true;
  (select.closest("dialog") || doc.body).append(popup);
  trigger.setAttribute("aria-controls", popup.id);
  let options = [];
  let activeIndex = -1;
  let opened = false;
  let signature = "";
  let typed = "";
  let typedAt = 0;

  const enabled = () => options.filter((option) => !option.disabled);
  const currentIndex = () =>
    enabled().findIndex((option) => option.nativeIndex === select.selectedIndex);
  function paintActive() {
    const active = enabled()[activeIndex];
    for (const row of popup.children) {
      row.classList.toggle("is-focused", Number(row.dataset.nativeIndex) === active?.nativeIndex);
    }
    if (active) {
      const id = `${select.id}-option-${active.nativeIndex}`;
      trigger.setAttribute("aria-activedescendant", id);
      doc.getElementById(id)?.scrollIntoView({ block: "nearest" });
    } else trigger.removeAttribute("aria-activedescendant");
  }
  function position() {
    if (!opened) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 12;
    const below = win.innerHeight - rect.bottom - margin;
    const above = rect.top - margin;
    const height = Math.min(288, Math.max(120, Math.max(below, above) - 8));
    const width = Math.min(Math.max(rect.width, 220), win.innerWidth - margin * 2);
    popup.style.width = `${width}px`;
    popup.style.maxHeight = `${height}px`;
    popup.style.left = `${Math.max(margin, Math.min(rect.left, win.innerWidth - width - margin))}px`;
    popup.style.top =
      below >= Math.min(220, height)
        ? `${rect.bottom + 6}px`
        : `${Math.max(margin, rect.top - Math.min(popup.scrollHeight, height) - 6)}px`;
  }
  function renderOptions() {
    popup.replaceChildren();
    for (const option of options) {
      const row = doc.createElement("button");
      row.type = "button";
      row.className = "tracking-select-option";
      row.id = `${select.id}-option-${option.nativeIndex}`;
      row.tabIndex = -1;
      row.disabled = option.disabled;
      row.dataset.nativeIndex = String(option.nativeIndex);
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(option.nativeIndex === select.selectedIndex));
      row.setAttribute("aria-disabled", String(option.disabled));
      const label = doc.createElement("span");
      label.textContent = option.label;
      const mark = doc.createElement("span");
      mark.className = "tracking-select-check";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = "✓";
      row.append(label, mark);
      row.addEventListener("pointerdown", (event) => event.preventDefault());
      row.addEventListener("pointermove", () => {
        if (!option.disabled) {
          activeIndex = enabled().findIndex((item) => item.nativeIndex === option.nativeIndex);
          paintActive();
        }
      });
      row.addEventListener("click", () => commit(option));
      popup.append(row);
    }
    paintActive();
  }
  function close({ focus = false } = {}) {
    if (!opened) return;
    opened = false;
    activeControl = null;
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-activedescendant");
    wrapper.classList.remove("is-open");
    popup.setAttribute("aria-hidden", "true");
    popup.inert = true;
    if (typeof popup.hidePopover === "function" && popup.matches(":popover-open"))
      popup.hidePopover();
    popup.hidden = true;
    if (focus && !trigger.disabled) trigger.focus({ preventScroll: true });
  }
  function commit(option) {
    if (!option || option.disabled || select.disabled) return;
    const changed = select.selectedIndex !== option.nativeIndex;
    select.selectedIndex = option.nativeIndex;
    if (changed) {
      select.dispatchEvent(new win.Event("input", { bubbles: true }));
      select.dispatchEvent(new win.Event("change", { bubbles: true }));
    }
    refreshTrackingControls();
    close({ focus: true });
  }
  function open() {
    refresh();
    if (select.disabled || coarse.matches || !enabled().length || select.closest("[hidden]"))
      return;
    activeControl?.close();
    opened = true;
    activeControl = controller;
    activeIndex = Math.max(0, currentIndex());
    trigger.setAttribute("aria-expanded", "true");
    wrapper.classList.add("is-open");
    popup.hidden = false;
    popup.setAttribute("aria-hidden", "false");
    popup.inert = false;
    renderOptions();
    if (typeof popup.showPopover === "function") popup.showPopover();
    position();
  }
  function refresh() {
    const enhanced = !coarse.matches;
    select.classList.toggle("tracking-native-enhanced", enhanced);
    trigger.hidden = !enhanced;
    if (enhanced) {
      select.setAttribute("aria-hidden", "true");
      select.tabIndex = -1;
    } else {
      select.removeAttribute("aria-hidden");
      if (nativeTabIndex === null) select.removeAttribute("tabindex");
      else select.setAttribute("tabindex", nativeTabIndex);
      close();
    }
    trigger.disabled = select.disabled;
    const name = labelFor(select);
    trigger.setAttribute("aria-label", name);
    popup.setAttribute("aria-label", name);
    if (select.getAttribute("aria-describedby"))
      trigger.setAttribute("aria-describedby", select.getAttribute("aria-describedby"));
    trigger.setAttribute("aria-required", String(select.required));
    const selectedLabel = select.selectedOptions[0]?.label || "—";
    if (value.textContent !== selectedLabel) value.textContent = selectedLabel;
    trigger.title = selectedLabel;
    options = optionRecords(select);
    const next = JSON.stringify([options, select.selectedIndex]);
    if (opened && (select.disabled || select.closest("[hidden]"))) close();
    if (opened && next !== signature) {
      activeIndex = Math.max(0, Math.min(activeIndex, enabled().length - 1));
      renderOptions();
      position();
    }
    signature = next;
  }
  trigger.addEventListener("click", () => (opened ? close() : open()));
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && opened) {
      event.preventDefault();
      event.stopPropagation();
      close({ focus: true });
      return;
    }
    if (event.key === "Tab") {
      close();
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (event.altKey && event.key === "ArrowUp") {
        close();
        return;
      }
      const wasOpen = opened;
      if (!opened) open();
      if (event.key === "Home") activeIndex = 0;
      else if (event.key === "End") activeIndex = enabled().length - 1;
      else if (wasOpen)
        activeIndex = nextOptionIndex(
          activeIndex,
          event.key === "ArrowDown" ? 1 : -1,
          enabled().length
        );
      paintActive();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (opened) commit(enabled()[activeIndex]);
      else open();
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      typed = now - typedAt > 800 ? event.key : typed + event.key;
      typedAt = now;
      const repeated = Array.from(typed).every((letter) => letter === typed[0]);
      const index = typeaheadIndex(
        enabled(),
        repeated ? typed[0] : typed,
        repeated ? activeIndex : -1
      );
      if (index >= 0) {
        activeIndex = index;
        if (opened) paintActive();
        else commit(enabled()[index]);
      }
    }
  });
  select.addEventListener("change", refresh);
  select.addEventListener("focus", () => {
    if (!coarse.matches) trigger.focus({ preventScroll: true });
  });
  for (const label of select.labels || []) {
    label.addEventListener("click", (event) => {
      if (!coarse.matches && !trigger.contains(event.target)) {
        event.preventDefault();
        trigger.focus({ preventScroll: true });
      }
    });
  }
  select.addEventListener("invalid", (event) => {
    if (!coarse.matches) {
      event.preventDefault();
      trigger.setAttribute("aria-invalid", "true");
      trigger.focus();
    }
  });
  select.addEventListener("change", () => trigger.removeAttribute("aria-invalid"));
  select.form?.addEventListener("reset", () => win.setTimeout(refresh, 0));
  const observer = new win.MutationObserver(refresh);
  observer.observe(select, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["disabled", "hidden", "selected", "label", "value", "aria-label"]
  });
  coarse.addEventListener("change", refresh);
  doc.addEventListener(
    "pointerdown",
    (event) => {
      if (opened && !wrapper.contains(event.target) && !popup.contains(event.target)) close();
    },
    true
  );
  doc.addEventListener("focusin", (event) => {
    if (opened && !wrapper.contains(event.target) && !popup.contains(event.target)) close();
  });
  doc.addEventListener(
    "scroll",
    (event) => {
      if (opened && !popup.contains(event.target)) position();
    },
    true
  );
  win.addEventListener("resize", position);
  const controller = { refresh, close };
  controllers.add(controller);
  refresh();
}

function installExistingMenu(trigger, menu) {
  if (!trigger || !menu) return;
  let focusRequest = 0;
  trigger.setAttribute("aria-controls", menu.id);
  const items = () =>
    Array.from(menu.querySelectorAll("[role=option], [role=menuitem]")).filter(
      (item) => !item.disabled && !item.hidden && !item.closest("[hidden]")
    );
  const close = (focus) => {
    focusRequest += 1;
    if (trigger.getAttribute("aria-expanded") === "true") trigger.click();
    menu.inert = true;
    if (focus) trigger.focus({ preventScroll: true });
  };
  trigger.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    if (trigger.getAttribute("aria-expanded") !== "true") trigger.click();
    if (trigger.getAttribute("aria-expanded") !== "true") return;
    // MutationObserver runs after this handler; keyboard focus needs the menu now.
    menu.inert = false;
    // Resolve visibility before focus; its entrance must not wait for a CSS frame.
    menu.getBoundingClientRect?.();
    const available = items();
    const target =
      event.key === "ArrowUp"
        ? available.at(-1)
        : available.find((item) => item.getAttribute("aria-selected") === "true") || available[0];
    const request = ++focusRequest;
    target?.focus({ preventScroll: true });
    // If a browser still defers visibility, retry once after styles enter a frame.
    // Never steal focus if the user has already moved elsewhere or closed the menu.
    menu.ownerDocument.defaultView.requestAnimationFrame?.(() => {
      if (
        request === focusRequest &&
        trigger.getAttribute("aria-expanded") === "true" &&
        menu.ownerDocument.activeElement === trigger
      ) {
        target?.focus({ preventScroll: true });
      }
    });
  });
  let typed = "";
  let typedAt = 0;
  menu.addEventListener("keydown", (event) => {
    const available = items();
    const index = available.indexOf(menu.ownerDocument.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") close(false);
    else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? available.length - 1
            : nextOptionIndex(index, event.key === "ArrowDown" ? 1 : -1, available.length);
      available[next]?.focus();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== " ") {
      typed = Date.now() - typedAt > 800 ? event.key : typed + event.key;
      typedAt = Date.now();
      const next = typeaheadIndex(
        available.map((item) => ({ label: item.textContent.trim() })),
        typed
      );
      if (next >= 0) {
        event.preventDefault();
        available[next].focus();
      }
    }
  });
  const sync = () => {
    menu.inert = menu.getAttribute("aria-hidden") === "true";
  };
  new menu.ownerDocument.defaultView.MutationObserver(sync).observe(menu, {
    attributes: true,
    attributeFilter: ["aria-hidden"]
  });
  sync();
}

function installDrawerFocus(drawer, layer, isOpen) {
  if (!drawer || !layer) return;
  const doc = drawer.ownerDocument;
  let origin = null;
  let opened = false;
  const sync = () => {
    const next = isOpen();
    if (!layer.hidden && !opened && !drawer.contains(doc.activeElement)) origin = doc.activeElement;
    if (next === opened) return;
    opened = next;
    drawer.inert = !next;
    if (next) {
      if (!drawer.contains(doc.activeElement)) origin = doc.activeElement;
      drawer.setAttribute("aria-modal", "true");
      drawer.setAttribute("role", "dialog");
      if (!drawer.hasAttribute("tabindex")) drawer.tabIndex = -1;
    } else if (
      drawer.contains(doc.activeElement) &&
      origin?.isConnected &&
      !origin.closest("[hidden]")
    ) {
      origin.focus({ preventScroll: true });
    }
  };
  new doc.defaultView.MutationObserver(sync).observe(layer, {
    attributes: true,
    attributeFilter: ["class", "hidden"]
  });
  drawer.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || !opened || doc.querySelector("dialog[open]")) return;
    const targets = Array.from(
      drawer.querySelectorAll("button, a[href], input, select, textarea, summary, [tabindex='0']")
    ).filter(
      (item) =>
        !item.disabled &&
        !item.inert &&
        !item.closest("[hidden], [inert]") &&
        item.getClientRects().length
    );
    if (!targets.length) {
      event.preventDefault();
      drawer.focus();
      return;
    }
    if (event.shiftKey && (doc.activeElement === targets[0] || doc.activeElement === drawer)) {
      event.preventDefault();
      targets.at(-1).focus();
    } else if (
      !event.shiftKey &&
      (doc.activeElement === targets.at(-1) || doc.activeElement === drawer)
    ) {
      event.preventDefault();
      targets[0].focus();
    }
  });
  sync();
}

export function installTrackingPresentation(doc = document) {
  const win = doc.defaultView;
  for (const select of doc.querySelectorAll("select")) installSelect(select, win);
  installExistingMenu(
    doc.getElementById("related-files-category-trigger"),
    doc.getElementById("related-files-category-menu")
  );
  installExistingMenu(
    doc.getElementById("tracking-account-trigger"),
    doc.getElementById("tracking-account-menu")
  );
  const files = doc.getElementById("related-files-drawer");
  installDrawerFocus(files, files, () => !files.hidden && files.classList.contains("is-open"));
  const documents = doc.getElementById("document-drawer");
  const documentLayer = doc.getElementById("document-drawer-layer");
  installDrawerFocus(
    documents,
    documentLayer,
    () => !documentLayer.hidden && documentLayer.classList.contains("is-open")
  );
  doc.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") return;
      const expanded = doc.activeElement?.closest("details[open]");
      if (expanded) {
        event.preventDefault();
        event.stopPropagation();
        expanded.open = false;
        expanded.querySelector("summary")?.focus();
      }
    },
    true
  );
  new win.MutationObserver(refreshTrackingControls).observe(doc.documentElement, {
    attributes: true,
    attributeFilter: ["lang"]
  });
  for (const dialog of doc.querySelectorAll("dialog")) {
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") event.stopPropagation();
    });
    new win.MutationObserver(() => {
      if (dialog.open) {
        activeControl?.close();
        refreshTrackingControls();
      }
    }).observe(dialog, { attributes: true, attributeFilter: ["open"] });
    dialog.addEventListener("close", () => activeControl?.close());
  }
}
