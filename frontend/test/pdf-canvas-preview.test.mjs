import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { fileURLToPath } from "node:url";
import { pdfAppearanceFixture } from "./fixtures/pdfAppearanceFixture.mjs";
// Execute the real controller without depending on Node's optional TS loader.
const source = await readFile(
  new URL("../src/components/pdf/pdfCanvasController.ts", import.meta.url),
  "utf8"
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
});
const { createPdfCanvasController, createPdfResizeScheduler, PDF_MAX_CANVAS_PIXELS } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`
);
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
test("height-only observer notifications do not repaint; width changes coalesce before render", () => {
  let width = 500,
    renders = 0,
    next = 0;
  const pending = new Map();
  const scheduler = createPdfResizeScheduler({
    width: () => width,
    schedule: (callback) => {
      pending.set(++next, callback);
      return next;
    },
    cancel: (frame) => pending.delete(frame),
    render: () => {
      renders++;
    }
  });
  scheduler.resize();
  scheduler.resize();
  assert.equal(pending.size, 0);
  width = 600;
  scheduler.resize();
  scheduler.resize();
  assert.equal(pending.size, 1);
  for (const callback of pending.values()) callback();
  pending.clear();
  scheduler.resize();
  assert.equal(renders, 1);
  assert.equal(pending.size, 0);
  width = 650;
  scheduler.resize();
  scheduler.dispose();
  assert.equal(pending.size, 0);
});
for (const interrupted of ["page fetch", "canvas render"])
  test(`resizing during the next ${interrupted} retains the requested page`, async () => {
    const h = harness();
    const opened = h.controller.open(new Blob(["A"]));
    await tick();
    h.handles[0].pending.resolve(h.document);
    await tick();
    h.draws[0].pending.resolve();
    await opened;
    const delayedPage = deferred();
    let pageRequests = 0;
    if (interrupted === "page fetch")
      h.document.getPage = async (number) => {
        if (number === 2 && ++pageRequests === 1) return delayedPage.promise;
        return h.page(number);
      };
    const next = h.controller.render(2);
    await tick();
    const resized = h.controller.render();
    await tick();
    if (interrupted === "page fetch") delayedPage.resolve(h.page(2));
    h.draws.at(-1).pending.resolve();
    await Promise.all([next, resized]);
    assert.deepEqual(h.states.at(-1), { phase: "ready", page: 2, pages: 2 });
    h.controller.close();
  });

test("the real reader paints existing stamp and filled-widget appearances into canvas", async () => {
  const canvas = createCanvas(1, 1);
  canvas.style = {};
  let finalState;
  const controller = createPdfCanvasController({
    loadRuntime: async () => ({
      createPdfDocument(data) {
        const task = getDocument({
          data,
          useWasm: false,
          stopAtErrors: true,
          enableXfa: false,
          disableFontFace: true,
          standardFontDataUrl: fileURLToPath(
            new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url)
          ).replaceAll("\\", "/")
        });
        return {
          promise: task.promise,
          destroy() {
            void task.destroy();
          }
        };
      }
    }),
    canvas: () => canvas,
    width: () => 300,
    pixelRatio: () => 1,
    update: (state) => {
      finalState = state;
    }
  });
  try {
    await controller.open(new Blob([pdfAppearanceFixture()]));
    assert.equal(finalState.phase, "ready");
    const context = canvas.getContext("2d");
    const stamp = [...context.getImageData(40, 60, 1, 1).data];
    const filled = [...context.getImageData(40, 160, 1, 1).data];
    assert.ok(stamp[0] > 240 && stamp[1] < 20 && stamp[2] < 20, `stamp appearance lost: ${stamp}`);
    assert.ok(
      filled[0] < 20 && filled[1] > 180 && filled[2] < 20,
      `filled appearance lost: ${filled}`
    );
    const fieldPixels = context.getImageData(30, 150, 120, 50).data;
    let filledGlyphs = 0;
    for (let i = 0; i < fieldPixels.length; i += 4)
      if (fieldPixels[i] < 80 && fieldPixels[i + 1] < 80 && fieldPixels[i + 2] < 80) filledGlyphs++;
    assert.ok(filledGlyphs > 30, `filled value glyphs must be visible, got ${filledGlyphs}`);
    // Negative control proves the pixels are annotation appearances, not page content.
    const without = getDocument({
      data: pdfAppearanceFixture(),
      useWasm: false,
      stopAtErrors: true
    });
    try {
      const page = await (await without.promise).getPage(1);
      const blank = createCanvas(300, 300);
      await page.render({
        canvas: blank,
        viewport: page.getViewport({ scale: 1 }),
        annotationMode: 0
      }).promise;
      assert.deepEqual(
        [...blank.getContext("2d").getImageData(40, 60, 1, 1).data],
        [255, 255, 255, 255]
      );
      assert.deepEqual(
        [...blank.getContext("2d").getImageData(40, 160, 1, 1).data],
        [255, 255, 255, 255]
      );
    } finally {
      await without.destroy();
    }
  } finally {
    controller.close();
  }
});
function harness() {
  const states = [],
    handles = [],
    draws = [];
  const canvas = { width: 0, height: 0, style: {} };
  let width = 500;
  const page = (pageNumber) => ({
    pageNumber,
    getViewport: ({ scale }) => ({ width: 600 * scale, height: 900 * scale }),
    render(options) {
      const pending = deferred();
      const task = {
        promise: pending.promise,
        cancel() {
          task.cancelled = true;
          pending.reject(Error("cancelled"));
        },
        cancelled: false
      };
      task.promise.catch(() => {});
      draws.push({ options, task, pending });
      return task;
    }
  });
  const runtime = {
    createPdfDocument(data) {
      const pending = deferred();
      const handle = {
        data,
        promise: pending.promise,
        destroy() {
          handle.destroyed = true;
        },
        destroyed: false,
        pending
      };
      handles.push(handle);
      return handle;
    }
  };
  const ports = {
    loadRuntime: async () => runtime,
    canvas: () => canvas,
    width: () => width,
    pixelRatio: () => 3,
    update: (state) => states.push(state)
  };
  const controller = createPdfCanvasController(ports);
  return {
    controller,
    states,
    handles,
    draws,
    canvas,
    ports,
    page,
    width: (value) => {
      width = value;
    },
    document: { numPages: 2, getPage: async (number) => page(number) }
  };
}
test("PDF readiness requires canvas completion; multipage and fit retain inert bounded canvas", async () => {
  const h = harness(),
    opened = h.controller.open(new Blob(["authenticated bytes"]));
  await tick();
  h.handles[0].pending.resolve(h.document);
  await tick();
  assert.equal(h.states.at(-1).phase, "rendering");
  assert.equal(h.draws[0].options.annotationMode, 1);
  assert.equal(h.canvas.width, 1000);
  h.draws[0].pending.resolve();
  await opened;
  assert.deepEqual(h.states.at(-1), { phase: "ready", page: 1, pages: 2 });
  const next = h.controller.render(2);
  await tick();
  h.draws.at(-1).pending.resolve();
  await next;
  assert.equal(h.states.at(-1).page, 2);
  h.width(4000);
  const resized = h.controller.render();
  await tick();
  assert.ok(h.canvas.width * h.canvas.height <= PDF_MAX_CANVAS_PIXELS);
  h.draws.at(-1).pending.resolve();
  await resized;
  assert.equal(h.states.at(-1).page, 2);
  h.controller.close();
  assert.ok(h.handles[0].destroyed);
  assert.equal(h.canvas.width, 0);
});
test("closed A cannot replace B after late document load or after deferred runtime import", async () => {
  const h = harness(),
    first = h.controller.open(new Blob(["A"]));
  await tick();
  h.controller.close();
  const second = h.controller.open(new Blob(["B"]));
  await tick();
  h.handles[0].pending.resolve(h.document);
  await first;
  assert.ok(h.handles[0].destroyed);
  assert.equal(h.draws.length, 0);
  h.handles[1].pending.resolve(h.document);
  await tick();
  h.draws[0].pending.resolve();
  await second;
  assert.equal(h.states.at(-1).phase, "ready");
  h.controller.close();
  const runtime = deferred();
  h.ports.loadRuntime = () => runtime.promise;
  const late = h.controller.open(new Blob(["C"]));
  h.controller.close();
  runtime.resolve({
    createPdfDocument() {
      throw Error("must not start");
    }
  });
  await late;
  assert.equal(h.states.at(-1).phase, "idle");
});
test("resize cancels the previous canvas render and close cannot publish its completion", async () => {
  const h = harness(),
    opened = h.controller.open(new Blob(["A"]));
  await tick();
  h.handles[0].pending.resolve(h.document);
  await tick();
  const resize = h.controller.render(1);
  await tick();
  assert.ok(h.draws[0].task.cancelled);
  assert.equal(h.draws.length, 2);
  h.controller.close();
  h.draws[1].pending.resolve();
  await Promise.all([opened, resize]);
  assert.equal(h.states.at(-1).phase, "idle");
  assert.ok(h.handles[0].destroyed);
});
for (const failure of ["worker", "password", "damaged"])
  test(`${failure} failure stays explicit and disposes the owned worker`, async () => {
    const h = harness(),
      opened = h.controller.open(new Blob(["bad"]));
    await tick();
    h.handles[0].pending.reject(Error(failure));
    await opened;
    assert.equal(h.states.at(-1).phase, "error");
    assert.ok(h.handles[0].destroyed);
    assert.equal(h.draws.length, 0);
  });
