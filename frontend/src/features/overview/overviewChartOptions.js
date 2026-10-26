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
  return {
    color: "#667d91",
    fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif'
  };
}

export function overviewTrendOption(data, t, reducedMotion = false) {
  const createdName = t("customers.todayNewBusiness");
  const updatedName = t("customers.todayUpdatedBusiness");
  return {
    ...overviewChartAnimation(reducedMotion),
    color: ["#4389d5", "#e0a23a"],
    textStyle: overviewChartTextStyle(),
    tooltip: {
      trigger: "axis",
      confine: true,
      backgroundColor: "rgba(21, 42, 61, .94)",
      borderWidth: 0,
      textStyle: { color: "#fff", fontSize: 11 },
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(67, 137, 213, .07)" } }
    },
    legend: {
      top: 2,
      right: 4,
      itemWidth: 14,
      itemHeight: 8,
      itemGap: 16,
      textStyle: { color: "#6f8497", fontSize: 10 }
    },
    grid: { top: 42, right: 20, bottom: 12, left: 12, containLabel: true },
    xAxis: {
      type: "category",
      boundaryGap: true,
      data: data.map((day) => day.label),
      axisLine: { lineStyle: { color: "#dfe8f0" } },
      axisTick: { show: false },
      axisLabel: { color: "#7b8fa2", fontSize: 10, margin: 12 }
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "#8da0b1", fontSize: 9 },
      splitLine: { lineStyle: { color: "#edf2f6", type: "dashed" } }
    },
    series: [
      {
        name: createdName,
        type: "bar",
        barMaxWidth: 28,
        data: data.map((day) => day.created),
        itemStyle: {
          borderRadius: [7, 7, 2, 2],
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#72b7ec" },
              { offset: 1, color: "#397ec1" }
            ]
          }
        },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(57, 126, 193, .28)" } }
      },
      {
        name: updatedName,
        type: "line",
        smooth: 0.35,
        symbol: "circle",
        symbolSize: 7,
        data: data.map((day) => day.updated),
        lineStyle: { width: 3, color: "#e0a23a" },
        itemStyle: { color: "#fff", borderColor: "#e0a23a", borderWidth: 3 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(224, 162, 58, .20)" },
              { offset: 1, color: "rgba(224, 162, 58, 0)" }
            ]
          }
        }
      }
    ]
  };
}

export function overviewDonutOption(data, total, seriesName, t, reducedMotion = false) {
  return {
    ...overviewChartAnimation(reducedMotion),
    color: ["#4389d5", "#35a77a", "#e0a23a", "#7c6fd1", "#2da5ba", "#e66d75", "#8aa2b6"],
    textStyle: overviewChartTextStyle(),
    title: {
      text: String(total),
      subtext: t("customers.overviewTotal"),
      left: "34%",
      top: "35%",
      textAlign: "center",
      textStyle: { color: "#1f425d", fontSize: 24, fontWeight: 760 },
      subtextStyle: { color: "#8ba0b2", fontSize: 9, lineHeight: 18 }
    },
    tooltip: {
      trigger: "item",
      confine: true,
      backgroundColor: "rgba(21, 42, 61, .94)",
      borderWidth: 0,
      textStyle: { color: "#fff", fontSize: 11 },
      formatter: "{b}<br/>{c} · {d}%"
    },
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
      pageTextStyle: { color: "#8396a8", fontSize: 9 },
      textStyle: { color: "#647b8f", fontSize: 9, width: 112, overflow: "truncate" }
    },
    series: [
      {
        name: seriesName,
        type: "pie",
        center: ["34%", "49%"],
        radius: ["52%", "72%"],
        minAngle: 4,
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: "#fff",
          borderWidth: 3,
          borderRadius: 5
        },
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scaleSize: 7,
          label: { show: false },
          itemStyle: { shadowBlur: 16, shadowColor: "rgba(32, 65, 92, .18)" }
        },
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
    tooltip: {
      trigger: "axis",
      confine: true,
      axisPointer: { type: "shadow" },
      backgroundColor: "rgba(21, 42, 61, .94)",
      borderWidth: 0,
      textStyle: { color: "#fff", fontSize: 11 }
    },
    grid: { top: 12, right: 42, bottom: 10, left: 8, containLabel: true },
    xAxis: {
      type: "value",
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { lineStyle: { color: "#edf2f6", type: "dashed" } }
    },
    yAxis: {
      type: "category",
      data: data.map((item) => item.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: "#627b90",
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
        backgroundStyle: { color: "#f0f4f8", borderRadius: 9 },
        label: {
          show: true,
          position: "right",
          distance: 8,
          color: "#2a536f",
          fontSize: 10,
          fontWeight: 760
        },
        itemStyle: {
          borderRadius: 9,
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: "#337fbe" },
              { offset: 1, color: "#60b8ca" }
            ]
          }
        },
        data: data.map((item) => item.value)
      }
    ]
  };
}
