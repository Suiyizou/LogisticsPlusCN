import { chartToken } from "./chartTheme.js";

function overviewChartAnimation(reducedMotion) {
  return {
    animation: !reducedMotion,
    animationDuration: reducedMotion ? 0 : 560,
    animationDurationUpdate: reducedMotion ? 0 : 260,
    animationEasing: "cubicOut",
    animationEasingUpdate: "cubicOut"
  };
}
function overviewChartTextStyle() {
  return { color: chartToken("--color-muted"), fontFamily: chartToken("--font-ui") };
}
function tooltipStyle() {
  return {
    confine: true,
    backgroundColor: chartToken("--color-primary"),
    borderWidth: 0,
    textStyle: { color: chartToken("--color-on-primary"), fontSize: 11 }
  };
}
export function overviewTrendOption(data, t, reducedMotion = false) {
  const createdName = t("customers.todayNewBusiness"),
    updatedName = t("customers.todayUpdatedBusiness");
  return {
    ...overviewChartAnimation(reducedMotion),
    color: [chartToken("--color-primary"), chartToken("--color-accent")],
    textStyle: overviewChartTextStyle(),
    tooltip: {
      ...tooltipStyle(),
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: chartToken("--color-border-strong") } }
    },
    legend: {
      top: 2,
      right: 4,
      itemWidth: 14,
      itemHeight: 8,
      itemGap: 16,
      textStyle: { color: chartToken("--color-muted"), fontSize: 10 }
    },
    grid: { top: 42, right: 20, bottom: 12, left: 12, containLabel: true },
    xAxis: {
      type: "category",
      boundaryGap: true,
      data: data.map((day) => day.label),
      axisLine: { lineStyle: { color: chartToken("--color-border") } },
      axisTick: { show: false },
      axisLabel: { color: chartToken("--color-muted"), fontSize: 10, margin: 12 }
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: chartToken("--color-muted"), fontSize: 9 },
      splitLine: { lineStyle: { color: chartToken("--color-border"), type: "dashed" } }
    },
    series: [
      {
        name: createdName,
        type: "bar",
        barMaxWidth: 28,
        data: data.map((day) => day.created),
        itemStyle: { borderRadius: [2, 2, 0, 0], color: chartToken("--color-primary") },
        emphasis: { itemStyle: { opacity: 0.85 } }
      },
      {
        name: updatedName,
        type: "line",
        smooth: 0.35,
        symbol: "circle",
        symbolSize: 7,
        data: data.map((day) => day.updated),
        lineStyle: { width: 2, color: chartToken("--color-accent") },
        itemStyle: {
          color: chartToken("--color-surface"),
          borderColor: chartToken("--color-accent"),
          borderWidth: 2
        }
      }
    ]
  };
}
export function overviewDonutOption(data, total, seriesName, t, reducedMotion = false) {
  return {
    ...overviewChartAnimation(reducedMotion),
    color: [
      "--color-primary",
      "--color-accent",
      "--color-success",
      "--color-warning",
      "--color-quiet",
      "--color-destructive",
      "--color-muted"
    ].map(chartToken),
    textStyle: overviewChartTextStyle(),
    title: {
      text: String(total),
      subtext: t("customers.overviewTotal"),
      left: "34%",
      top: "35%",
      textAlign: "center",
      textStyle: { color: chartToken("--color-primary"), fontSize: 24, fontWeight: 500 },
      subtextStyle: { color: chartToken("--color-muted"), fontSize: 9, lineHeight: 18 }
    },
    tooltip: { ...tooltipStyle(), trigger: "item", formatter: "{b}<br/>{c} · {d}%" },
    legend: {
      type: "scroll",
      orient: "vertical",
      right: 0,
      top: "center",
      width: "40%",
      itemWidth: 9,
      itemHeight: 9,
      itemGap: 11,
      pageIconSize: 9,
      pageTextStyle: { color: chartToken("--color-muted"), fontSize: 9 },
      textStyle: {
        color: chartToken("--color-muted"),
        fontSize: 9,
        width: 112,
        overflow: "truncate"
      }
    },
    series: [
      {
        name: seriesName,
        type: "pie",
        center: ["34%", "49%"],
        radius: ["52%", "72%"],
        minAngle: 4,
        avoidLabelOverlap: true,
        itemStyle: { borderColor: chartToken("--color-surface"), borderWidth: 2, borderRadius: 0 },
        label: { show: false },
        labelLine: { show: false },
        emphasis: { scaleSize: 4, label: { show: false } },
        data
      }
    ],
    media: [
      {
        query: { maxWidth: 390 },
        option: {
          title: { left: "50%", top: "29%" },
          legend: {
            orient: "horizontal",
            left: "center",
            right: "auto",
            top: "auto",
            bottom: 0,
            width: "92%"
          },
          series: [{ center: ["50%", "42%"], radius: ["43%", "61%"] }]
        }
      }
    ]
  };
}
export function overviewResourcesOption(resources, t, reducedMotion = false) {
  const data = [...resources].reverse();
  return {
    ...overviewChartAnimation(reducedMotion),
    textStyle: overviewChartTextStyle(),
    tooltip: { ...tooltipStyle(), trigger: "axis", axisPointer: { type: "line" } },
    grid: { top: 12, right: 42, bottom: 10, left: 8, containLabel: true },
    xAxis: {
      type: "value",
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { lineStyle: { color: chartToken("--color-border"), type: "dashed" } }
    },
    yAxis: {
      type: "category",
      data: data.map((item) => item.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: chartToken("--color-muted"),
        fontSize: 10,
        width: 108,
        overflow: "truncate",
        margin: 13
      }
    },
    series: [
      {
        name: t("customers.overviewResourceTitle"),
        type: "bar",
        barWidth: 18,
        showBackground: true,
        backgroundStyle: { color: chartToken("--color-surface-subtle"), borderRadius: 2 },
        label: {
          show: true,
          position: "right",
          distance: 8,
          color: chartToken("--color-primary"),
          fontSize: 10,
          fontWeight: 500
        },
        itemStyle: { borderRadius: 2, color: chartToken("--color-primary") },
        data: data.map((item) => item.value)
      }
    ]
  };
}
