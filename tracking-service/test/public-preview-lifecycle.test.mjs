import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { createFilePreviewLifecycle } from "../public/file-preview-lifecycle.mjs";
const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const start = app.indexOf("async function previewRelatedFile(");
const end = app.indexOf("if (filePreviewClose)", start);
function deferred() {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { resolve, promise };
}
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
function harness({ phase = "fetch", lateStatus = 200 } = {}) {
  const pending = deferred(),
    renderWait = deferred();
  const rendered = [],
    messages = [],
    requests = [],
    disposed = [];
  let token = "same-session",
    sessionClears = 0;
  const dialog = {
    open: false,
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    }
  };
  const lifecycle = createFilePreviewLifecycle();
  const blob = (id) => ({
    arrayBuffer: () =>
      id === "A" && phase === "arrayBuffer"
        ? pending.promise
        : Promise.resolve(new Uint8Array([id.charCodeAt(0)]).buffer)
  });
  const response = (id, status = 200) => ({
    status,
    ok: status === 200,
    headers: { get: () => "application/pdf" },
    blob: () => (id === "A" && phase === "blob" ? pending.promise : Promise.resolve(blob(id))),
    json: async () => ({})
  });
  const context = vm.createContext({
    Uint8Array,
    filePreviewLifecycle: lifecycle,
    filePreviewDialog: dialog,
    filePreviewButtonRequests: new WeakMap(),
    filePreviewPdf: null,
    currentPreviewFile: null,
    filePreviewName: {},
    filePreviewContent: {},
    relatedFilesSessionFingerprint: "same-session",
    readFileSession: () => ({ token }),
    synchronizeRelatedFilesSession() {},
    isCurrentRelatedFilesSession: (fingerprint) => fingerprint === token,
    t: (key) => key,
    getFileExtension: () => "pdf",
    PREVIEW_PDF_EXTENSIONS: new Set(["pdf"]),
    clearFilePreviewContent() {
      context.filePreviewPdf?.dispose();
      context.filePreviewPdf = null;
    },
    setFilePreviewMessage: (message) => messages.push(message),
    clearFileSession() {
      sessionClears++;
      token = "";
    },
    closeFilePreviewDialog() {
      lifecycle.invalidate();
      dialog.close();
      context.currentPreviewFile = null;
    },
    fetchRelatedFilePreview: (file, session, options) => {
      requests.push(options);
      return file.id === "A" && phase === "fetch"
        ? pending.promise
        : Promise.resolve(response(file.id, file.id === "A" ? lateStatus : 200));
    },
    createPdfCanvasPreview({ data, isCurrent: _isCurrent }) {
      const id = String.fromCharCode(data[0]);
      rendered.push(id);
      return {
        ready: id === "A" && phase === "render" ? renderWait.promise : Promise.resolve(),
        dispose: () => disposed.push(id)
      };
    },
    pdfPreviewErrorKey: () => "files.pdfUnavailable",
    renderFilePreviewFallback() {},
    relatedFilesApiMessage: () => "error"
  });
  vm.runInContext(app.slice(start, end), context);
  const begin = (id) =>
    context.previewRelatedFile({ id, originalFileName: `${id}.pdf` }, { textContent: "Preview" });
  function release() {
    if (phase === "fetch") pending.resolve(response("A", lateStatus));
    if (phase === "blob") pending.resolve(blob("A"));
    if (phase === "arrayBuffer") pending.resolve(new Uint8Array([65]).buffer);
    if (phase === "render") renderWait.resolve();
  }
  return {
    context,
    begin,
    release,
    rendered,
    messages,
    requests,
    disposed,
    dialog,
    close: context.closeFilePreviewDialog,
    logout() {
      token = "new-session";
      lifecycle.invalidate();
      dialog.close();
    },
    sessionClears: () => sessionClears
  };
}

for (const phase of ["fetch", "blob", "arrayBuffer", "render"])
  test(`delayed A ${phase} cannot replace B after close/reopen with the same session`, async () => {
    const h = harness({ phase });
    const a = h.begin("A");
    await flush();
    h.close();
    await h.begin("B");
    assert.equal(h.context.currentPreviewFile.id, "B");
    assert.equal(h.requests[0].signal.aborted, true);
    const readyCount = h.messages.filter((key) => key === "files.pdfReady").length;
    h.release();
    await a;
    assert.equal(h.context.currentPreviewFile.id, "B");
    assert.equal(h.context.filePreviewName.textContent, "B.pdf");
    assert.equal(h.messages.filter((key) => key === "files.pdfReady").length, readyCount);
    assert.deepEqual(h.rendered, phase === "render" ? ["A", "B"] : ["B"]);
    if (phase === "render") assert.ok(h.disposed.includes("A"));
  });

test("a superseded same-session 401 cannot clear the newer preview or its login", async () => {
  const h = harness({ lateStatus: 401 });
  const a = h.begin("A");
  await flush();
  await h.begin("B");
  h.release();
  await a;
  assert.equal(h.sessionClears(), 0);
  assert.equal(h.dialog.open, true);
  assert.equal(h.context.currentPreviewFile.id, "B");
});

test("a current 401 closes the preview and clears its existing session", async () => {
  const h = harness({ lateStatus: 401 });
  const a = h.begin("A");
  await flush();
  h.release();
  await a;
  assert.equal(h.sessionClears(), 1);
  assert.equal(h.dialog.open, false);
  assert.deepEqual(h.rendered, []);
});

test("session invalidation prevents an in-flight authenticated PDF from filling the dialog", async () => {
  const h = harness({ phase: "arrayBuffer" });
  const a = h.begin("A");
  await flush();
  h.logout();
  h.release();
  await a;
  assert.deepEqual(h.rendered, []);
  assert.equal(h.messages.includes("files.pdfReady"), false);
  assert.equal(h.requests[0].signal.aborted, true);
});

test("image, text and Office preview branches retain ownership checks after every asynchronous read", () => {
  const body = app.slice(start, end);
  assert.match(body, /renderFilePreviewBlob\(blob, extension, contentType\)/);
  for (const read of body.matchAll(/await readBlobAsText\([^;]+;([^}]+)/g))
    assert.match(read[1], /if \(!isCurrent\(\)\) return/);
  const resetStart = app.indexOf("function resetRelatedFilesSessionState(");
  assert.match(app.slice(resetStart, resetStart + 160), /closeFilePreviewDialog\(\)/);
});
