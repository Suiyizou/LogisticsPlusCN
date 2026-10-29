import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPackingReportModel, reportNumber } from "../src/services/packingReportModel.js";
import { renderDetailedPackingPages } from "../src/services/exportReportPages.js";

const container = { name: "20GP", lengthCm: 600, widthCm: 240, heightCm: 240, payloadKg: 20000 };
const cargo = { id: "a", name: "Sample", lengthCm: 100, widthCm: 80, heightCm: 50, quantity: 6 };
const placement = (extra = {}) => ({
  cargoId: "a",
  cargoIndex: 0,
  xCm: 0,
  yCm: 0,
  zCm: 0,
  lengthCm: 102,
  widthCm: 82,
  heightCm: 50,
  weightKg: 500,
  groupQuantity: 2,
  ...extra
});

test("planner metrics keep Vue-owned values outside legacy DOM translation", () => {
  const source = readFileSync(new URL("../src/App.vue", import.meta.url), "utf8");
  const metrics = source.match(
    /<div class="planner-metrics" data-i18n-ignore>([\s\S]*?)<\/div>/
  )?.[1];
  assert.ok(metrics);
  assert.equal((metrics.match(/:title="(?:tr|wt|ui)\(/g) || []).length, 4);
  assert.equal((metrics.match(/<el-statistic/g) || []).length, 4);
  assert.ok(metrics.includes(':value="cargoTypeCount"'));
  assert.ok(metrics.includes(':value="cargoTotalQuantity"'));
  assert.ok(metrics.includes(':value="cargoTotalWeightKg / 1000"'));
  assert.ok(metrics.includes(':value="cargoTotalVolumeM3"'));
});

test("report totals count grouped pieces once, preserve per-box payloads and missing data", () => {
  const model = buildPackingReportModel({ cargos: [cargo] }, [
    { index: 1, container, placements: [placement()] },
    {
      index: 2,
      container: { ...container, payloadKg: 9000 },
      placements: [placement({ xCm: 100, loadingOrder: 3 })]
    }
  ]);
  assert.equal(model.quantity, 4);
  assert.equal(model.weightKg, 1000);
  assert.equal(model.volumeM3, 1.6);
  assert.equal(model.boxes[0].remainingPayloadKg, 19500);
  assert.equal(model.boxes[1].remainingPayloadKg, 8500);
  assert.equal(model.boxes[0].rows[0].loadingOrder, null);
  assert.equal(model.boxes[1].rows[0].loadingOrder, 3);
  assert.equal(model.boxes[0].rows[0].axes[0], undefined);
  assert.deepEqual(model.boxes[0].rows[0].coordinates, [0, 0, 0]);
  assert.equal(model.boxes[0].balance.center.xCm, 51);
  assert.equal(model.requestedQuantity, 6);
  const incomplete = buildPackingReportModel({}, [
    { index: 1, container, placements: [{ name: "Unknown" }] }
  ]);
  assert.equal(incomplete.weightKg, null);
  assert.equal(incomplete.volumeM3, null);
  assert.equal(incomplete.boxes[0].balance, null);
  assert.equal(incomplete.boxes[0].rows[0].cargoNo, null);
  assert.deepEqual(incomplete.boxes[0].rows[0].placedDimensions, [null, null, null]);
  assert.equal(reportNumber(0), 0);
  for (const unknown of [undefined, null, "", "bad", Infinity])
    assert.equal(reportNumber(unknown), null);
});

test("50+ cargo types and long names paginate with every character and record retained", () => {
  const previous = globalThis.document;
  const calls = [];
  globalThis.document = {
    createElement: () => {
      const texts = [];
      const ctx = {
        fillRect() {},
        fillText(text, x, y) {
          texts.push({ text: String(text), x, y });
        },
        measureText: (text) => ({ width: String(text).length * 14 })
      };
      const canvas = { getContext: () => ctx, texts };
      calls.push(canvas);
      return canvas;
    }
  };
  try {
    const name = "Long cargo name / ".repeat(70) + "NAME-END-MARKER";
    const cargos = Array.from({ length: 55 }, (_, index) => ({
      ...cargo,
      id: `cargo-${index}`,
      name: index === 0 ? name : `Cargo-${index}`,
      quantity: 1
    }));
    const boxes = [1, 2].map((index) => ({
      index,
      container,
      placements: cargos.slice(index === 1 ? 0 : 28, index === 1 ? 28 : 55).map((item) =>
        placement({
          name: item.name,
          cargoIndex: cargos.indexOf(item),
          cargoId: item.id,
          groupQuantity: 1
        })
      )
    }));
    const pages = renderDetailedPackingPages(
      { cargos, locale: "en-US", generatedAt: new Date("2026-10-29T00:00:00Z") },
      boxes,
      () => {}
    );
    const texts = pages.flatMap((page) => page.texts.map((call) => call.text));
    assert.ok(pages.length > 10);
    assert.ok(texts.join("").includes("NAME-END-MARKER"));
    assert.ok(texts.includes("P028"));
    assert.ok(texts.includes("P027"));
    assert.ok(texts.includes("Cargo-54"));
    for (const page of pages) {
      assert.equal(page.height, 2480);
      assert.deepEqual(page.__reportPageBreaks, [0, 2480]);
      assert.ok(
        page.texts.every(({ y }) => y < 2440),
        "text must stay above the PDF page footer"
      );
    }
  } finally {
    globalThis.document = previous;
  }
});
