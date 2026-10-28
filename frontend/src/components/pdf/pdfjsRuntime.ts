import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export function createPdfDocument(data: Uint8Array) {
  const worker = new pdfjs.PDFWorker();
  const base = `${import.meta.env.BASE_URL}pdfjs/6.4.299/`;
  let task: pdfjs.PDFDocumentLoadingTask;
  try {
    task = pdfjs.getDocument({
      data,
      worker,
      cMapUrl: `${base}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${base}standard_fonts/`,
      wasmUrl: `${base}wasm/`,
      iccUrl: `${base}iccs/`,
      useWasm: false,
      enableXfa: false,
      stopAtErrors: true
    });
  } catch (error) {
    worker.destroy();
    throw error;
  }
  let disposed = false;
  return {
    promise: task.promise,
    destroy() {
      if (disposed) return;
      disposed = true;
      void task
        .destroy()
        .catch(() => {})
        .finally(() => worker.destroy());
    }
  };
}
