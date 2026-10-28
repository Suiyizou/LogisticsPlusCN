import test from "node:test";
import assert from "node:assert/strict";
import {
  createPdfCanvasPreview,
  pdfCanvasDimensions,
  pdfPreviewErrorKey,
  PDFJS_WORKER_URL
} from "../public/pdf-canvas-preview.mjs";
import { createFilePreviewLifecycle } from "../public/file-preview-lifecycle.mjs";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush() {
  for (let i = 0; i < 16; i++) await Promise.resolve();
}
class Element {
  constructor(tag, doc) {
    this.tagName = tag;
    this.ownerDocument = doc;
    this.children = [];
    this.style = {};
    this.clientWidth = 600;
    this.listeners = {};
    this.classList = { add() {}, remove() {} };
  }
  append(...items) {
    this.children.push(...items);
  }
  replaceChildren(...items) {
    this.children = items;
  }
  setAttribute(name, value) {
    this[name] = value;
  }
  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }
  getContext() {
    return {};
  }
}
function fixture({ loadError, workerError, delayedImport, delayedDocument, delayedPage } = {}) {
  const doc = {
    createElement(tag) {
      return new Element(tag, doc);
    }
  };
  const container = new Element("div", doc);
  const renders = [],
    pages = [],
    errors = [],
    configs = [];
  let active = true,
    destroyed = 0,
    terminated = 0,
    cancelled = 0,
    observing;
  const documentWait = delayedDocument || { promise: Promise.resolve(null) };
  const pdf = {
    numPages: 2,
    async getPage(pageNumber) {
      pages.push(pageNumber);
      if (delayedPage) await delayedPage.promise;
      return {
        getViewport: ({ scale }) => ({ width: 612 * scale, height: 792 * scale }),
        render(options) {
          const task = deferred();
          renders.push({ ...task, options, pageNumber });
          return {
            promise: task.promise,
            cancel() {
              cancelled += 1;
              task.reject(
                Object.assign(new Error("cancelled"), { name: "RenderingCancelledException" })
              );
            }
          };
        }
      };
    }
  };
  const library = {
    getDocument(options) {
      configs.push(options);
      return {
        promise: loadError
          ? Promise.reject(loadError)
          : delayedDocument
            ? documentWait.promise
            : Promise.resolve(pdf),
        destroy() {
          destroyed += 1;
        }
      };
    }
  };
  class Observer {
    constructor(callback) {
      observing = callback;
    }
    observe() {}
    disconnect() {
      observing = null;
    }
  }
  const view = createPdfCanvasPreview({
    container,
    data: new Uint8Array([1, 2, 3]),
    t: (key, values) => (values ? `${key}:${values.page}/${values.total}` : key),
    isCurrent: () => active,
    onError: (error) => errors.push(error),
    loadPdfJs: () => (delayedImport ? delayedImport.promise : Promise.resolve(library)),
    createWorker: () => {
      if (workerError) throw workerError;
      return {
        worker: { destroy() {} },
        port: {
          terminate() {
            terminated += 1;
          }
        }
      };
    },
    ResizeObserverClass: Observer,
    devicePixelRatio: () => 3
  });
  const [toolbar, status, stage] = container.children[0].children;
  const [previous, pageLabel, next] = toolbar.children;
  return {
    view,
    container,
    stage,
    status,
    previous,
    next,
    pageLabel,
    renders,
    pages,
    configs,
    errors,
    library,
    pdf,
    cancel() {
      active = false;
      view.dispose();
    },
    counts: () => ({ destroyed, terminated, cancelled }),
    resize(width) {
      stage.clientWidth = width;
      observing?.();
    }
  };
}

test("canvas DPR and total pixels are capped without dropping document images", () => {
  const size = pdfCanvasDimensions(600, 800, 1200, 4);
  assert.equal(size.pixelRatio, 2);
  const large = pdfCanvasDimensions(100, 100_000, 1200, 4);
  assert.ok(large.cssWidth * large.cssHeight * large.pixelRatio ** 2 <= 8_000_001);
});

test("preview readiness waits for rendered pixels; navigation and resize serialize canvas work", async () => {
  const h = fixture();
  let ready = false;
  h.view.ready.then(() => {
    ready = true;
  });
  await flush();
  assert.equal(ready, false);
  assert.equal(h.renders.length, 1);
  assert.equal(
    h.renders[0].options.annotationMode,
    1,
    "existing static appearances must be painted"
  );
  assert.equal(h.next.disabled, true);
  h.renders[0].resolve();
  await h.view.ready;
  assert.equal(h.status.hidden, true);
  const renderedTags = [];
  const collectTags = (element) => {
    renderedTags.push(element.tagName);
    element.children.forEach(collectTags);
  };
  collectTags(h.container);
  assert.equal(
    renderedTags.some((tag) => ["a", "form", "input", "iframe", "object", "embed"].includes(tag)),
    false,
    "static appearance painting must not create interactive annotation/form layers"
  );
  assert.equal(h.next.disabled, false);
  assert.match(h.pageLabel.textContent, /1\/2$/);
  const config = h.configs[0];
  for (const key of ["useWasm", "isEvalSupported", "enableXfa"])
    assert.equal(config[key], false, key);
  assert.equal(config.stopAtErrors, true);
  assert.equal(config.disableFontFace, false);
  assert.ok(config.data instanceof Uint8Array);
  assert.equal(config.url, undefined);
  assert.equal(config.maxImageSize, undefined);
  for (const key of ["cMapUrl", "standardFontDataUrl", "wasmUrl", "iccUrl"])
    assert.match(config[key], /\/vendor\/pdfjs\/6\.4\.299\//);
  assert.match(
    PDFJS_WORKER_URL.href,
    /\/vendor\/pdfjs\/6\.4\.299\/legacy\/build\/pdf\.worker\.mjs$/
  );
  h.next.listeners.click();
  await flush();
  assert.equal(h.renders.length, 2);
  h.resize(500);
  await flush();
  assert.equal(h.counts().cancelled, 1);
  assert.equal(h.renders.length, 3);
  assert.deepEqual(h.pages, [1, 2, 2]);
  h.renders[2].resolve();
  await flush();
  assert.match(h.pageLabel.textContent, /2\/2$/);
  assert.equal(h.previous.disabled, false);
  assert.equal(h.next.disabled, true);
  h.cancel();
  assert.equal(h.counts().terminated, 1);
  assert.equal(h.counts().destroyed, 1);
});

test("closing during a delayed module import cannot create a worker or paint content", async () => {
  const pending = deferred();
  const h = fixture({ delayedImport: pending });
  const rejection = assert.rejects(h.view.ready, { name: "AbortError" });
  h.cancel();
  pending.resolve(h.library);
  await rejection;
  assert.equal(h.configs.length, 0);
  assert.equal(h.renders.length, 0);
});

test("closing while loading the document or page destroys resources and prevents later rendering", async () => {
  for (const phase of ["document", "page"]) {
    const pending = deferred();
    const h = fixture(
      phase === "document" ? { delayedDocument: pending } : { delayedPage: pending }
    );
    const rejection = assert.rejects(h.view.ready, { name: "AbortError" });
    await flush();
    h.cancel();
    pending.resolve(h.pdf);
    await rejection;
    assert.equal(h.renders.length, 0);
    assert.equal(h.counts().destroyed, 1);
    assert.equal(h.counts().terminated, 1);
  }
});

for (const name of ["PasswordException", "InvalidPDFException", "WorkerFailure"])
  test(`PDF ${name} has an explicit failure and never announces a ready canvas`, async () => {
    const error = Object.assign(new Error("fixture"), { name });
    const h = fixture(name === "WorkerFailure" ? { workerError: error } : { loadError: error });
    await assert.rejects(h.view.ready, { name });
    assert.equal(h.status.textContent, pdfPreviewErrorKey(error));
    assert.equal(h.renders.length, 0);
    assert.equal(h.stage.children[0].hidden, true);
    h.cancel();
  });

test("preview ownership aborts old requests and disposes late resources without invalidating DOM clears", () => {
  const lifecycle = createFilePreviewLifecycle();
  let disposed = 0;
  const a = lifecycle.begin();
  lifecycle.attach(a, () => disposed++);
  const b = lifecycle.begin();
  assert.equal(a.controller.signal.aborted, true);
  assert.equal(disposed, 1);
  assert.equal(lifecycle.isCurrent(a), false);
  assert.equal(lifecycle.isCurrent(b), true);
  lifecycle.attach(a, () => disposed++);
  assert.equal(disposed, 2);
  assert.equal(lifecycle.isCurrent(b), true);
  lifecycle.invalidate();
  assert.equal(b.controller.signal.aborted, true);
  assert.equal(lifecycle.isCurrent(b), false);
});
