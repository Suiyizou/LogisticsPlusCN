const form = document.querySelector("#tracking-form");
const submitButton = document.querySelector("#submit-button");
const emptyState = document.querySelector("#empty-state");
const results = document.querySelector("#results");
const errorPanel = document.querySelector("#error-panel");
const errorMessage = document.querySelector("#error-message");

const elements = {
  resultNumber: document.querySelector("#result-number"),
  cacheStatus: document.querySelector("#cache-status"),
  fetchedAt: document.querySelector("#fetched-at"),
  originName: document.querySelector("#origin-name"),
  originCode: document.querySelector("#origin-code"),
  destinationName: document.querySelector("#destination-name"),
  destinationCode: document.querySelector("#destination-code"),
  latestEvent: document.querySelector("#latest-event"),
  latestLocation: document.querySelector("#latest-location"),
  latestTime: document.querySelector("#latest-time"),
  transportMode: document.querySelector("#transport-mode"),
  trafficTerm: document.querySelector("#traffic-term"),
  containerSummary: document.querySelector("#container-summary"),
  routeCount: document.querySelector("#route-count"),
  routeTimeline: document.querySelector("#route-timeline"),
  sailingSchedule: document.querySelector("#sailing-schedule"),
  rawJson: document.querySelector("#raw-json")
};

function text(value, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function formatDateTime(value, timezone) {
  if (!value) return "—";
  const normalized = String(value).replace("T", " ");
  return timezone ? `${normalized} ${timezone}` : normalized;
}

function setLoading(loading) {
  submitButton.disabled = loading;
  submitButton.classList.toggle("is-loading", loading);
}

function showError(message) {
  errorMessage.textContent = message;
  errorPanel.hidden = false;
}

function clearError() {
  errorPanel.hidden = true;
  errorMessage.textContent = "";
}

function renderTimeline(route) {
  elements.routeTimeline.replaceChildren();
  elements.routeCount.textContent = `${route.length} NODES`;

  if (route.length === 0) {
    const item = document.createElement("li");
    item.className = "timeline-item";
    item.textContent = "当前没有运输节点";
    elements.routeTimeline.append(item);
    return;
  }

  for (const node of route) {
    const item = document.createElement("li");
    item.className = `timeline-item${node.active ? " is-active" : ""}`;

    const dot = document.createElement("span");
    dot.className = "timeline-dot";
    dot.textContent = String(node.sequence).padStart(2, "0");

    const copy = document.createElement("div");
    copy.className = "timeline-copy";
    const title = document.createElement("strong");
    title.textContent = [node.city, node.countryCode].filter(Boolean).join(", ") || "未知地点";
    const event = document.createElement("span");
    event.textContent = text(node.event, "暂无事件名称");
    const detail = document.createElement("span");
    detail.textContent = [
      node.locationType,
      node.facilityCode,
      ...(node.transportModes ?? [])
    ]
      .filter(Boolean)
      .join(" · ");
    copy.append(title, event, detail);

    const time = document.createElement("div");
    time.className = "timeline-time";
    const actual = document.createElement("time");
    actual.textContent = formatDateTime(node.actualTime ?? node.estimatedTime, node.timezone);
    const status = document.createElement("span");
    status.textContent = node.actualTime ? "ACTUAL" : "ESTIMATED";
    time.append(actual, status);

    item.append(dot, copy, time);
    elements.routeTimeline.append(item);
  }
}

function renderSailingSchedule(schedule) {
  elements.sailingSchedule.replaceChildren();

  if (schedule.length === 0) {
    const empty = document.createElement("p");
    empty.className = "form-note";
    empty.textContent = "当前没有船期信息";
    elements.sailingSchedule.append(empty);
    return;
  }

  for (const sailing of schedule) {
    const item = document.createElement("div");
    item.className = "sailing-item";
    const vessel = document.createElement("strong");
    vessel.textContent = text(sailing.vesselName, "未知船舶");
    const voyage = document.createElement("span");
    voyage.textContent = [sailing.service, sailing.voyage].filter(Boolean).join(" · ");
    const route = document.createElement("span");
    route.textContent = `${text(sailing.polPort)} → ${text(sailing.podPort)}`;
    const dates = document.createElement("span");
    dates.textContent = `离港 ${formatDateTime(sailing.atd ?? sailing.etd)} · 到港 ${formatDateTime(sailing.ata ?? sailing.eta)}`;
    item.append(vessel, voyage, route, dates);
    elements.sailingSchedule.append(item);
  }
}

function renderResult(payload) {
  const snapshot = payload.snapshot;
  const summary = snapshot.summary;
  const latest = summary.latestEvent;

  elements.resultNumber.textContent = snapshot.tracking.number;
  elements.cacheStatus.textContent = payload.cached ? "CACHED" : "LIVE";
  elements.fetchedAt.textContent = new Date(snapshot.fetchedAt).toLocaleString("zh-CN", {
    hour12: false
  });
  elements.originName.textContent = text(summary.origin.name);
  elements.originCode.textContent = text(summary.origin.countryCode);
  elements.destinationName.textContent = text(summary.destination.name);
  elements.destinationCode.textContent = text(summary.destination.countryCode);
  elements.latestEvent.textContent = text(latest?.name, "暂无最新动态");
  elements.latestLocation.textContent = text(latest?.location);
  elements.latestTime.textContent = formatDateTime(latest?.occurredAt);
  elements.transportMode.textContent = text(latest?.transportMode, "运输方式未知");
  elements.trafficTerm.textContent = `运输条款 ${text(summary.trafficTerm)}`;
  elements.containerSummary.textContent =
    summary.containers.length > 0
      ? summary.containers.map((item) => `${item.cntrType} × ${item.quantity}`).join(" · ")
      : "暂无箱型摘要";

  renderTimeline(snapshot.route);
  renderSailingSchedule(snapshot.sailingSchedule);
  elements.rawJson.textContent = JSON.stringify(payload.raw, null, 2);

  emptyState.hidden = true;
  results.hidden = false;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  setLoading(true);

  const formData = new FormData(form);

  try {
    const response = await fetch("/api/track/cosco", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: formData.get("type"),
        number: formData.get("number")
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.error?.message || `查询失败（HTTP ${response.status}）`);
    }

    renderResult(payload);
  } catch (error) {
    showError(error?.message || "查询失败，请稍后重试");
  } finally {
    setLoading(false);
  }
});
