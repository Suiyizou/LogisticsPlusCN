import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
export interface PdfCanvasState {
  phase: "idle" | "loading" | "rendering" | "ready" | "error";
  page: number;
  pages: number;
}
type DocumentHandle = { promise: Promise<PDFDocumentProxy>; destroy: () => void };
export interface PdfCanvasPorts {
  loadRuntime: () => Promise<{ createPdfDocument: (data: Uint8Array) => DocumentHandle }>;
  canvas: () => HTMLCanvasElement | null;
  width: () => number;
  pixelRatio: () => number;
  update: (state: PdfCanvasState) => void;
}
export const PDF_MAX_CANVAS_PIXELS = 8_000_000;
/** Only available-width changes affect fit. Loading text may change height during a render. */
export function createPdfResizeScheduler(ports: {
  width: () => number;
  schedule: (callback: () => void) => number;
  cancel: (frame: number) => void;
  render: () => void;
}) {
  let lastWidth = ports.width(),
    frame = 0;
  return {
    resize() {
      const width = ports.width();
      if (width === lastWidth) return;
      lastWidth = width;
      ports.cancel(frame);
      frame = ports.schedule(() => {
        frame = 0;
        ports.render();
      });
    },
    dispose() {
      ports.cancel(frame);
      frame = 0;
    }
  };
}
export function createPdfCanvasController(ports: PdfCanvasPorts) {
  let generation = 0,
    renderVersion = 0;
  let handle: DocumentHandle | null = null,
    document: PDFDocumentProxy | null = null;
  let renderTask: RenderTask | null = null;
  let desiredPage = 0;
  let state: PdfCanvasState = { phase: "idle", page: 0, pages: 0 };
  function update(next: Partial<PdfCanvasState>) {
    state = { ...state, ...next };
    ports.update({ ...state });
  }
  function close() {
    generation++;
    renderVersion++;
    renderTask?.cancel();
    handle?.destroy();
    handle = null;
    document = null;
    desiredPage = 0;
    const canvas = ports.canvas();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    update({ phase: "idle", page: 0, pages: 0 });
  }
  async function render(pageNumber = desiredPage || 1) {
    const currentDocument = document,
      token = generation,
      request = ++renderVersion;
    renderTask?.cancel();
    if (!currentDocument) return;
    desiredPage = Math.min(Math.max(1, pageNumber), state.pages);
    const current = () => token === generation && request === renderVersion;
    update({ phase: "rendering" });
    try {
      const page = await currentDocument.getPage(desiredPage);
      if (!current()) return;
      const previous = renderTask;
      if (previous) {
        previous.cancel();
        await previous.promise.catch(() => {});
      }
      if (!current()) return;
      const canvas = ports.canvas();
      if (!canvas) throw Error("Canvas unavailable");
      const original = page.getViewport({ scale: 1 });
      const fit = Math.max(1, ports.width()) / original.width;
      const ratio = Math.min(
        2,
        Math.max(1, ports.pixelRatio()),
        Math.sqrt(PDF_MAX_CANVAS_PIXELS / (original.width * original.height * fit * fit))
      );
      const viewport = page.getViewport({ scale: fit * ratio });
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      canvas.style.width = `${original.width * fit}px`;
      canvas.style.height = `${original.height * fit}px`;
      // Paint existing annotation/widget appearances into the inert canvas.
      const task = page.render({ canvas, viewport, annotationMode: 1 });
      renderTask = task;
      await task.promise;
      if (current()) update({ phase: "ready", page: page.pageNumber });
    } catch {
      if (current()) {
        handle?.destroy();
        handle = null;
        document = null;
        update({ phase: "error" });
      }
    }
  }
  async function open(blob: Blob) {
    close();
    const token = generation;
    update({ phase: "loading" });
    try {
      const [runtime, bytes] = await Promise.all([ports.loadRuntime(), blob.arrayBuffer()]);
      if (token !== generation) return;
      const owned = runtime.createPdfDocument(new Uint8Array(bytes));
      handle = owned;
      const loaded = await owned.promise;
      if (token !== generation) {
        owned.destroy();
        return;
      }
      document = loaded;
      update({ pages: loaded.numPages });
      await render(1);
    } catch {
      if (token === generation) {
        handle?.destroy();
        handle = null;
        document = null;
        update({ phase: "error" });
      }
    }
  }
  return { open, close, render };
}
