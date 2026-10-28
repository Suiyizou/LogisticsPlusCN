import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const start = source.indexOf("function createRelatedFileItem(file) {");
const end = source.indexOf("function normalizeRelatedFileComment", start);

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.listeners = {};
  }
  append(...children) {
    this.children.push(...children);
  }
  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }
  setAttribute(name, value) {
    this[name] = value;
  }
  querySelector(tag) {
    return this.children.find((child) => child.tagName === tag);
  }
  closest() {
    return this;
  }
  focus() {
    this.focused = true;
  }
}

function renderFile(canDelete) {
  const context = vm.createContext({
    document: { createElement: (tag) => new Element(tag) },
    readFileSession: () => ({ kind: "CUSTOMER", token: "test-session" }),
    synchronizeRelatedFilesSession() {},
    relatedFilesSessionFingerprint: "test-session",
    t: (key) => key,
    formatFileSize: (size) => `${size} bytes`,
    formatLocalDateTime: (value) => `local:${value}`,
    formatCompactLocalDateTime: (value) => `short:${value}`,
    fileCategoryLabel: (value) => `category:${value}`,
    relatedFileSharingLabel: () => "shared with this customer",
    relatedFileActionButton: (key, className) =>
      Object.assign(new Element("button"), { className, textContent: key })
  });
  vm.runInContext(source.slice(start, end), context);
  return context.createRelatedFileItem({
    id: "file-17",
    extension: "pdf",
    originalFileName: "<invoice>.pdf",
    sizeBytes: 32768,
    uploadedAt: "2026-10-28T10:30:00Z",
    uploaderDisplayName: "Actual uploader",
    category: "EXPORT_CIV_PL",
    visibilityRoles: ["SHIPPER"],
    canChangeVisibility: false,
    canDelete
  });
}

test("the real file row keeps filename, size, category and uploader/time in their presentation columns", () => {
  const row = renderFile(false);
  const [extension, content, category, uploaded, actions] = row.children;
  assert.equal(row.dataset.fileId, "file-17");
  assert.equal(extension.dataset.extension, "PDF");
  assert.equal(content.children[0].textContent, "<invoice>.pdf");
  assert.equal(
    content.children[0].innerHTML,
    undefined,
    "filenames remain text, never parsed HTML"
  );
  assert.equal(content.children[1].textContent, "32768 bytes");
  assert.equal(category.children[0].textContent, "category:EXPORT_CIV_PL");
  assert.equal(uploaded.children[0].textContent, "short:2026-10-28T10:30:00Z");
  assert.equal(uploaded.children[0].title, "local:2026-10-28T10:30:00Z · 2026-10-28T10:30:00Z");
  assert.equal(uploaded.children[0].dateTime, "2026-10-28T10:30:00Z");
  assert.equal(uploaded.children[1].textContent, "Actual uploader");
  assert.equal(uploaded.children[1].title, "Actual uploader");
  assert.deepEqual(
    actions.children.slice(0, 2).map((button) => button.className),
    ["related-file-preview", "related-file-download"]
  );
  assert.equal(actions.children.at(-1).className, "related-file-options");
});

test("compact file dates keep source time meaningful with a stable single-line label", () => {
  const start = source.indexOf("function formatCompactLocalDateTime(");
  const end = source.indexOf("function readPlatformSession", start);
  const context = vm.createContext({});
  vm.runInContext(source.slice(start, end), context);
  assert.equal(context.formatCompactLocalDateTime("2026-10-28T20:41:31"), "2026-10-28 20:41");
  assert.equal(context.formatCompactLocalDateTime(null), "—");
  assert.equal(context.formatCompactLocalDateTime("source-time-unparsed"), "source-time-unparsed");
});

test("result header suppresses only an identical single booking reference, keeping distinct bookings", () => {
  const renderStart = source.indexOf("function renderResult(payload)");
  const start = source.indexOf(
    "const bookingNumbers = bookingNumbersForSnapshot(snapshot)",
    renderStart
  );
  const end = source.indexOf('elements["summary-origin-name"]', start);
  for (const [displayed, numbers, hidden] of [
    ["UI-PREVIEW-BOOKING-001", ["UI-PREVIEW-BOOKING-001"], true],
    ["BILL-001", ["BOOKING-002"], false],
    ["BOOKING-001", ["BOOKING-001", "BOOKING-002"], false],
    ["BILL-001", [], true]
  ]) {
    const elements = {
      "result-number": { textContent: displayed },
      "summary-booking-number": {},
      "summary-booking-reference": {}
    };
    const context = vm.createContext({
      elements,
      snapshot: {},
      bookingNumbersForSnapshot: () => numbers
    });
    vm.runInContext(source.slice(start, end), context);
    assert.equal(elements["summary-booking-reference"].hidden, hidden);
    assert.equal(elements["result-number"].textContent, displayed);
    assert.equal(
      elements["summary-booking-number"].title,
      numbers.length ? numbers.join(", ") : "—"
    );
  }
});

test("the compact file row exposes deletion only when the real file permission permits it", () => {
  for (const allowed of [true, false]) {
    const actions = renderFile(allowed).children.at(-1);
    assert.equal(
      actions.children
        .at(-1)
        .children.at(-1)
        .children.some((button) => button.className === "related-file-delete"),
      allowed
    );
  }
});

test("Escape closes file options before the drawer and returns focus to the native summary", () => {
  const options = renderFile(false).children.at(-1).children.at(-1);
  options.open = true;
  let stopped = false;
  options.listeners.keydown({
    key: "Escape",
    target: options,
    preventDefault() {},
    stopPropagation() {
      stopped = true;
    }
  });
  assert.equal(options.open, false);
  assert.equal(stopped, true);
  assert.equal(options.children[0].focused, true);
});
