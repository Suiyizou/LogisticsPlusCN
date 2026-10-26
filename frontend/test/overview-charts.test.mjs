import assert from "node:assert/strict";
import test from "node:test";
import { effectScope } from "vue";
import { useReducedMotion } from "../src/composables/useReducedMotion.js";
import { createChartGroup } from "../src/features/overview/chartGroup.js";
import {
  overviewTrendOption,
  overviewResourcesOption,
  overviewDonutOption
} from "../src/features/overview/overviewChartOptions.js";

function fixture() {
  const instances = [];
  const listeners = new Map();
  const frames = new Map();
  const cancelled = [];
  const observers = [];
  let serial = 0;
  const group = createChartGroup({
    initChart(element) {
      const chart = {
        element,
        resizes: 0,
        disposals: 0,
        options: [],
        clears: 0,
        getDom: () => element,
        resize() {
          this.resizes++;
        },
        dispose() {
          this.disposals++;
        },
        setOption(...args) {
          this.options.push(args);
        },
        clear() {
          this.clears++;
        }
      };
      instances.push(chart);
      return chart;
    },
    target: {
      addEventListener: (name, callback) => listeners.set(name, callback),
      removeEventListener: (name) => listeners.delete(name)
    },
    Observer: class {
      constructor(callback) {
        this.callback = callback;
        this.elements = [];
        this.disconnected = false;
        observers.push(this);
      }
      observe(element) {
        this.elements.push(element);
      }
      disconnect() {
        this.disconnected = true;
      }
    },
    requestFrame(callback) {
      frames.set(++serial, callback);
      return serial;
    },
    cancelFrame(id) {
      cancelled.push(id);
      frames.delete(id);
    }
  });
  return { group, instances, listeners, frames, cancelled, observers };
}

test("resize bursts share a frame, and unmount cancels it and releases every resource", () => {
  const h = fixture();
  h.group.mount({ trend: {}, status: {} });
  h.listeners.get("resize")();
  h.observers[0].callback();
  assert.equal(h.frames.size, 1);
  const lateCallback = [...h.frames.values()][0];
  h.group.dispose();
  h.group.dispose();
  assert.equal(h.cancelled.length, 1);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.observers[0].disconnected, true);
  lateCallback();
  h.group.mount({ trend: {} });
  h.group.render("trend", { series: [] });
  assert.deepEqual(
    h.instances.map((c) => [c.resizes, c.disposals, c.options.length]),
    [
      [0, 1, 0],
      [0, 1, 0]
    ]
  );
});

test("DOM replacement disposes only replaced charts and rebinds observation", () => {
  const h = fixture();
  const trend = {};
  h.group.mount({ trend, status: {} });
  h.group.mount({ trend, status: {} });
  assert.deepEqual(
    h.instances.map((c) => c.disposals),
    [0, 1, 0]
  );
  assert.equal(h.observers[0].disconnected, true);
  h.group.render("trend", { series: [1] });
  h.group.render("status", null);
  assert.deepEqual(h.instances[0].options, [[{ series: [1] }, true]]);
  assert.equal(h.instances[2].clears, 1);
  for (const callback of h.frames.values()) callback();
  assert.deepEqual(
    h.instances.map((c) => c.resizes),
    [1, 0, 1]
  );
  h.group.dispose();
});

test("failed renderer initialization releases charts already created", () => {
  let disposals = 0;
  const group = createChartGroup({
    initChart(element) {
      if (element === "bad") throw new Error("canvas unavailable");
      return { getDom: () => element, dispose: () => disposals++ };
    },
    target: null,
    Observer: null
  });
  assert.throws(() => group.mount({ first: "good", second: "bad" }), /canvas unavailable/);
  assert.equal(disposals, 1);
});

test("chart builders keep data order, translations, and reduced-motion settings", () => {
  const t = (key) => `translated:${key}`;
  const trend = overviewTrendOption([{ label: "Monday", created: 2, updated: 3 }], t, true);
  assert.deepEqual(trend.xAxis.data, ["Monday"]);
  assert.deepEqual(
    trend.series.map((s) => s.data),
    [[2], [3]]
  );
  assert.match(trend.series[0].name, /^translated:/);
  assert.equal(trend.animation, false);
  assert.equal(trend.animationDurationUpdate, 0);
  const data = [
    { name: "A", value: 2 },
    { name: "B", value: 1 }
  ];
  const resources = overviewResourcesOption(data, t);
  assert.deepEqual(resources.yAxis.data, ["B", "A"]);
  assert.deepEqual(
    data.map((item) => item.name),
    ["A", "B"]
  );
  const donut = overviewDonutOption(data, 3, "Status", t);
  assert.equal(donut.title.text, "3");
  assert.equal(donut.series[0].data, data);
  assert.equal(donut.animation, true);
});

test("reduced motion follows preference changes and unregisters on scope disposal", () => {
  let callback;
  let removed;
  const query = {
    matches: true,
    addEventListener: (_, cb) => {
      callback = cb;
    },
    removeEventListener: (_, cb) => {
      removed = cb;
    }
  };
  const scope = effectScope();
  const reduced = scope.run(() => useReducedMotion({ matchMedia: () => query }));
  assert.equal(reduced.value, true);
  callback({ matches: false });
  assert.equal(reduced.value, false);
  scope.stop();
  assert.equal(removed, callback);
});
