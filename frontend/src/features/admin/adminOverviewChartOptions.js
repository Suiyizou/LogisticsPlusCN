// @ts-check
import { adminOverviewCopy } from "./adminOverviewCopy.js";
import { adminOverviewEmptyMessages } from "../../i18n/adminOverviewMessages.js";
import {
  adminCount,
  createAdminOverviewPresentation,
  formatAdminOverviewDate
} from "./adminOverviewPresentation.js";
/** @typedef {import("../../types/adminOverviewTypes").AdminOverviewData} Overview */
/** @typedef {import("echarts/core").EChartsCoreOption} ChartOption */
/** @param {Overview | null} overview @param {string} locale @param {boolean} [reducedMotion] */
export function adminOverviewChartOptions(overview, locale, reducedMotion = false) {
  const copy = adminOverviewCopy(locale);
  const animation = { animation: !reducedMotion, animationDuration: reducedMotion ? 0 : 450 };
  const trend = Array.isArray(overview?.activityTrend) ? overview.activityTrend : [];
  const displayOperations =
    Array.isArray(overview?.operationTypes) && overview.operationTypes.length
      ? [...overview.operationTypes].reverse()
      : [{ code: "EMPTY", value: 0 }];
  const presentation = createAdminOverviewPresentation(() => locale);
  /** @type {ChartOption} */
  const activity = {
    ...animation,
    color: [chartColor("--color-primary"), chartColor("--color-accent")],
    tooltip: { trigger: "axis", renderMode: "richText", confine: true },
    legend: {
      bottom: 0,
      itemWidth: 18,
      textStyle: { color: chartColor("--color-muted"), fontSize: 11 }
    },
    grid: { left: 58, right: 58, top: 36, bottom: 48 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: trend.map((day) => formatAdminOverviewDate(day.date)),
      axisLine: { lineStyle: { color: chartColor("--color-border") } },
      axisLabel: { color: chartColor("--color-muted") }
    },
    yAxis: [
      {
        type: "value",
        name: copy.businessActions,
        position: "left",
        minInterval: 1,
        nameTextStyle: { color: chartColor("--color-primary"), fontSize: 10 },
        axisLabel: { color: chartColor("--color-muted") },
        splitLine: { lineStyle: { color: chartColor("--color-border") } }
      },
      {
        type: "value",
        name: copy.managementActions,
        position: "right",
        minInterval: 1,
        nameTextStyle: { color: chartColor("--color-accent"), fontSize: 10 },
        axisLabel: { color: chartColor("--color-muted") },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: copy.businessActions,
        type: "line",
        smooth: true,
        symbolSize: 7,
        yAxisIndex: 0,
        areaStyle: { color: chartColor("--color-primary"), opacity: 0.08 },
        data: trend.map((day) => adminCount(day.businessActions))
      },
      {
        name: copy.managementActions,
        type: "line",
        smooth: true,
        symbolSize: 7,
        yAxisIndex: 1,
        lineStyle: { width: 2, type: "dashed" },
        data: trend.map((day) => adminCount(day.managementActions))
      }
    ]
  };
  const users = donut(
    (Array.isArray(overview?.userComposition) ? overview.userComposition : []).map((item) => ({
      name: copy.roles[item.code] || item.code,
      value: adminCount(item.value)
    })),
    [
      chartColor("--color-primary"),
      chartColor("--color-quiet"),
      chartColor("--color-accent"),
      chartColor("--color-success")
    ],
    locale,
    animation
  );
  const status = donut(
    (Array.isArray(overview?.accountStatus) ? overview.accountStatus : []).map((item) => ({
      name:
        item.code === "ACTIVE" ? copy.active : item.code === "DISABLED" ? copy.disabled : item.code,
      value: adminCount(item.value)
    })),
    [chartColor("--color-success"), chartColor("--color-border-strong")],
    locale,
    animation
  );
  /** @type {ChartOption} */
  const operations = {
    ...animation,
    color: [chartColor("--color-primary")],
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      renderMode: "richText",
      confine: true
    },
    grid: { left: 12, right: 28, top: 16, bottom: 28, containLabel: true },
    xAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: chartColor("--color-border") } },
      axisLabel: { color: chartColor("--color-quiet") }
    },
    yAxis: {
      type: "category",
      data: displayOperations.map((item) => presentation.action(item.code)),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: chartColor("--color-muted"), fontSize: 11 }
    },
    series: [
      {
        type: "bar",
        barMaxWidth: 22,
        itemStyle: { borderRadius: [0, 2, 2, 0] },
        data: displayOperations.map((item) => adminCount(item.value))
      }
    ]
  };
  return { activity, users, status, operations };
}
/** @param {{name:string,value:number}[]} data @param {string[]} colors @param {string} locale @param {{animation:boolean,animationDuration:number}} animation @returns {ChartOption} */
function donut(data, colors, locale, animation) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return {
    ...animation,
    color: colors,
    tooltip: { trigger: "item", renderMode: "richText", confine: true },
    legend: {
      bottom: 0,
      left: "center",
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { color: chartColor("--color-muted"), fontSize: 10 }
    },
    graphic: total
      ? []
      : [
          {
            type: "text",
            left: "center",
            top: "40%",
            style: {
              text: adminOverviewEmptyMessages[locale === "en-US" ? "en-US" : "zh-CN"],
              fill: chartColor("--color-quiet"),
              fontSize: 13
            }
          }
        ],
    series: [
      {
        type: "pie",
        radius: ["49%", "70%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: "#fff", borderWidth: 3, borderRadius: 4 },
        label: { color: chartColor("--color-muted"), show: total > 0, formatter: "{b}\n{c}" },
        labelLine: { length: 10, length2: 8 },
        data
      }
    ]
  };
}

/** Read the shared theme at render time so chart palettes follow the active application theme.
 * @param {string} name
 * @returns {string}
 */
function chartColor(name) {
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined")
    return "currentColor";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "currentColor";
}
