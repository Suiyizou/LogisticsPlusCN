/** Owns chart instances, resize listeners and queued frames, without depending on Vue or ECharts. */
export function createChartGroup({
  initChart,
  target = globalThis.window,
  Observer = globalThis.ResizeObserver,
  requestFrame = (callback) => target.requestAnimationFrame(callback),
  cancelFrame = (id) => target.cancelAnimationFrame(id)
}) {
  const charts = new Map();
  let observer = null;
  let frame = null;
  let listening = false;
  let disposed = false;

  function resize() {
    if (disposed || frame !== null) return;
    frame = requestFrame(() => {
      frame = null;
      if (!disposed) charts.forEach((chart) => chart.resize());
    });
  }

  function mount(elements) {
    if (disposed) return;
    observer?.disconnect();
    const next = new Map(Object.entries(elements).filter(([, element]) => element));
    for (const [key, chart] of charts) {
      if (chart.getDom() !== next.get(key)) {
        chart.dispose();
        charts.delete(key);
      }
    }
    try {
      for (const [key, element] of next) {
        if (!charts.has(key)) charts.set(key, initChart(element));
      }
      if (!listening) {
        target?.addEventListener("resize", resize, { passive: true });
        listening = true;
      }
      if (Observer) {
        observer = new Observer(resize);
        next.forEach((element) => observer.observe(element));
      }
      resize();
    } catch (error) {
      dispose();
      throw error;
    }
  }

  function render(key, option) {
    if (disposed) return;
    const chart = charts.get(key);
    if (option) chart?.setOption(option, true);
    else chart?.clear();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (frame !== null) cancelFrame(frame);
    frame = null;
    if (listening) target?.removeEventListener("resize", resize);
    observer?.disconnect();
    observer = null;
    charts.forEach((chart) => chart.dispose());
    charts.clear();
  }

  return { mount, render, resize, dispose };
}
