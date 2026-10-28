export const PDFJS_VENDOR_BASE = new URL("./vendor/pdfjs/6.4.299/", import.meta.url);
export const PDFJS_LIBRARY_URL = new URL("legacy/build/pdf.mjs", PDFJS_VENDOR_BASE);
export const PDFJS_WORKER_URL = new URL("legacy/build/pdf.worker.mjs", PDFJS_VENDOR_BASE);

export function pdfPreviewErrorKey(error) {
  if (error?.name === "PasswordException") return "files.pdfPassword";
  if (["InvalidPDFException", "FormatError"].includes(error?.name)) return "files.pdfInvalid";
  return "files.pdfUnavailable";
}

export function pdfCanvasDimensions(width, height, availableWidth, devicePixelRatio = 1) {
  if (!(width > 0 && height > 0)) throw new Error("Invalid page dimensions");
  const scale = Math.max(1, availableWidth) / width;
  const cssWidth = width * scale;
  const cssHeight = height * scale;
  const pixelRatio = Math.min(
    Math.max(1, devicePixelRatio || 1),
    2,
    Math.sqrt(8_000_000 / (cssWidth * cssHeight))
  );
  return { scale, pixelRatio, cssWidth, cssHeight };
}

// Canvas only. Existing annotation/widget appearances are painted; no interactive DOM layer is constructed.
export function createPdfCanvasPreview({
  container,
  data,
  t,
  isCurrent,
  onError = () => {},
  onRendered = () => {},
  loadPdfJs = () => import(PDFJS_LIBRARY_URL.href),
  createWorker = (library) => {
    const port = new Worker(PDFJS_WORKER_URL, { type: "module" });
    try {
      return { port, worker: new library.PDFWorker({ port }) };
    } catch (error) {
      port.terminate();
      throw error;
    }
  },
  ResizeObserverClass = globalThis.ResizeObserver,
  devicePixelRatio = () => globalThis.devicePixelRatio || 1
}) {
  const doc = container.ownerDocument;
  const root = doc.createElement("section");
  root.className = "pdf-canvas-preview";
  const toolbar = doc.createElement("div");
  toolbar.className = "pdf-preview-toolbar";
  const previous = doc.createElement("button");
  previous.type = "button";
  previous.textContent = t("files.pdfPrevious");
  const next = doc.createElement("button");
  next.type = "button";
  next.textContent = t("files.pdfNext");
  const pageLabel = doc.createElement("span");
  pageLabel.className = "pdf-preview-page-label";
  pageLabel.setAttribute("aria-live", "polite");
  const fit = doc.createElement("span");
  fit.className = "pdf-preview-fit";
  fit.textContent = t("files.pdfFit");
  toolbar.append(previous, pageLabel, next, fit);
  const status = doc.createElement("p");
  status.className = "pdf-preview-status";
  status.setAttribute("role", "status");
  const stage = doc.createElement("div");
  stage.className = "pdf-preview-stage";
  const canvas = doc.createElement("canvas");
  canvas.setAttribute("role", "img");
  stage.append(canvas);
  root.append(toolbar, status, stage);
  container.replaceChildren(root);

  let disposed = false,
    loadingTask = null,
    pdf = null,
    renderTask = null;
  let worker = null,
    port = null,
    observer = null,
    pageNumber = 1,
    desiredPage = 1,
    busy = true;
  let renderSequence = 0,
    renderChain = Promise.resolve(),
    lastWidth = 0;
  const current = () => !disposed && isCurrent();
  function ensureCurrent() {
    if (!current()) throw new DOMException("Preview superseded", "AbortError");
  }
  function updateControls() {
    previous.disabled = busy || !pdf || pageNumber <= 1;
    next.disabled = busy || !pdf || pageNumber >= pdf.numPages;
    pageLabel.textContent = t("files.pdfPage", {
      page: pdf ? pageNumber : "—",
      total: pdf?.numPages ?? "—"
    });
    canvas.setAttribute("aria-label", pageLabel.textContent);
  }
  function showError(error) {
    if (!current() || error?.name === "RenderingCancelledException" || error?.name === "AbortError")
      return;
    status.textContent = t(pdfPreviewErrorKey(error));
    status.classList.add("is-error");
    status.hidden = false;
    canvas.hidden = true;
    onError(error);
  }
  function requestRender(targetPage) {
    desiredPage = targetPage;
    const sequence = ++renderSequence;
    renderTask?.cancel();
    const work = renderChain
      .catch(() => {})
      .then(async () => {
        ensureCurrent();
        if (sequence !== renderSequence) return false;
        busy = true;
        updateControls();
        status.textContent = t("files.pdfLoading");
        status.classList.remove("is-error");
        status.hidden = false;
        canvas.hidden = true;
        const page = await pdf.getPage(targetPage);
        ensureCurrent();
        if (sequence !== renderSequence) return false;
        const base = page.getViewport({ scale: 1 });
        const available = Math.max(1, stage.clientWidth || container.clientWidth || 800);
        const size = pdfCanvasDimensions(base.width, base.height, available, devicePixelRatio());
        const viewport = page.getViewport({ scale: size.scale * size.pixelRatio });
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        canvas.style.width = `${size.cssWidth}px`;
        canvas.style.height = `${size.cssHeight}px`;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas is unavailable");
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          annotationMode: 1, // PDF.js AnnotationMode.ENABLE: retain static stamp/form appearances.
          background: "rgb(255,255,255)"
        });
        try {
          await renderTask.promise;
        } finally {
          renderTask = null;
        }
        ensureCurrent();
        if (sequence !== renderSequence) return false;
        pageNumber = targetPage;
        busy = false;
        lastWidth = available;
        canvas.hidden = false;
        status.hidden = true;
        updateControls();
        onRendered({ page: pageNumber, total: pdf.numPages });
        return true;
      });
    renderChain = work;
    return work;
  }
  function navigate(delta) {
    if (!current() || busy || !pdf) return;
    const target = Math.min(pdf.numPages, Math.max(1, pageNumber + delta));
    if (target !== pageNumber) void requestRender(target).catch(showError);
  }
  previous.addEventListener("click", () => navigate(-1));
  next.addEventListener("click", () => navigate(1));
  updateControls();
  status.textContent = t("files.pdfLoading");

  function dispose() {
    if (disposed) return;
    disposed = true;
    renderSequence += 1;
    observer?.disconnect();
    renderTask?.cancel();
    try {
      Promise.resolve(loadingTask?.destroy()).catch(() => {});
    } catch {}
    try {
      worker?.destroy();
    } catch {}
    port?.terminate();
  }
  const ready = (async () => {
    try {
      const library = await loadPdfJs();
      ensureCurrent();
      ({ worker, port } = createWorker(library));
      loadingTask = library.getDocument({
        data,
        worker,
        cMapUrl: new URL("cmaps/", PDFJS_VENDOR_BASE).href,
        cMapPacked: true,
        standardFontDataUrl: new URL("standard_fonts/", PDFJS_VENDOR_BASE).href,
        wasmUrl: new URL("wasm/", PDFJS_VENDOR_BASE).href,
        iccUrl: new URL("iccs/", PDFJS_VENDOR_BASE).href,
        useWorkerFetch: true,
        useWasm: false,
        isEvalSupported: false,
        disableFontFace: false,
        enableXfa: false,
        stopAtErrors: true
      });
      pdf = await loadingTask.promise;
      ensureCurrent();
      if (!pdf.numPages) throw new Error("PDF has no pages");
      await requestRender(1);
      ensureCurrent();
      if (ResizeObserverClass) {
        observer = new ResizeObserverClass(() => {
          if (!current() || Math.abs(stage.clientWidth - lastWidth) < 1) return;
          void requestRender(desiredPage).catch(showError);
        });
        observer.observe(stage);
      }
    } catch (error) {
      showError(error);
      throw error;
    }
  })();
  return { ready, dispose };
}
