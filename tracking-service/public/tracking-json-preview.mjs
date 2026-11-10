import { sourceBusinessFields } from "./tracking-source-fields.mjs?v=20261110-compact";
import { readTrackingPreview, createCarrierBadge, reportedTrackingHistory } from "./tracking-v1-adapter.mjs?v=20261108-carrier-details-r4";
import { sanitizeTrackingData, eventVesselLabel, eventTerminalLabel, eventLoadLabel, reportedTimeLabel } from "./tracking-detail-data.mjs?v=20261108-carrier-details-r4";
const labels = {
  en: {
    title: "Preview tracking JSON",
    hint: "Open a local tracking.v1 file to compare carriers and inspect reported fields. Temporary display only; no shipment is created or changed.",
    choose: "Choose JSON file",
    all: "All carriers",
    clear: "Clear local preview",
    open: "View details",
    carrier: "Carrier",
    reference: "Reference",
    status: "Query status",
    containers: "Returned container details",
    declaredContainers: "Declared containers",
    returnedContainers: "Returned container details",
    notProvided: "Not provided",
    events: "Source entries",
    scope: "Local JSON · read-only",
    exit: "Exit preview",
    error: "Could not preview this file",
    limit: "Select a JSON file smaller than 20 MB.",
    empty: "No tracking file selected.",
    count: "records",
    details: "View carrier source data",
    vessel: "Vessel / voyage",
    noData: "The source reports no business data for this reference.",
    warnings: "Source warnings",
    notVerified: "Business data has not been verified by the source.",
    verified: "Source marks this record as business verified.",
    eventTitle: "Carrier raw records",
    additionalEvents: "History reported by the carrier",
    time: "Reported time",
    event: "Source entry",
    location: "Location",
    transport: "Transport mode",
    source: "Source",
    sourceDetails: "Source details",
    historyHint: "Original times, locations and descriptions as reported by the carrier.",
    fields: "Original fields and extensions",
    expandSource: "Expand source value",
    sourceLimited:
      "Source value exceeds the display depth or size limit; displayed text is incomplete.",
    untypedTime:
      "Source entries may contain page labels, summaries or transport descriptions. They do not establish that an event occurred or completed. Original order and reported times are retained.",
    evidence: "The source lists local evidence paths. They are not opened by this preview.",
    unknown: "Unknown",
    verificationNeeded: "The carrier requires verification before this query can finish.",
    queryIncomplete: "This carrier query has not completed.",
    fieldLabels: {
      bill_of_lading: "Bill of lading",
      booking: "Booking",
      origin: "Origin",
      destination: "Destination",
      vessel: "Vessel",
      voyage: "Voyage",
      service: "Service",
      container_type: "Container type",
      container_count_declared: "Declared containers",
      container_count_extracted: "Extracted containers",
      etd: "ETD",
      eta: "ETA",
      atd: "ATD",
      ata: "ATA",
      milestone_pickup: "Pickup statement",
      milestone_departure: "Departure statement",
      milestone_arrival: "Arrival statement",
      milestone_delivery: "Delivery statement",
      weight: "Weight",
      commodity: "Commodity",
      state: "Transport state",
      latest_event: "Latest event",
      latest_event_at: "Latest event time"
    }
  },
  zh: {
    title: "本地货踪 JSON 预览",
    hint: "选择 tracking.v1 文件，按船司查看实际返回字段。仅临时显示，不创建或更改现有票单。",
    choose: "选择 JSON 文件",
    all: "全部船司",
    clear: "清除本地预览",
    open: "查看详情",
    carrier: "船司",
    reference: "查询单号",
    status: "查询状态",
    containers: "返回箱明细数",
    declaredContainers: "声明箱数",
    returnedContainers: "返回箱明细",
    notProvided: "未提供",
    events: "源条目数",
    scope: "本地 JSON · 只读预览",
    exit: "退出预览",
    error: "无法预览此文件",
    limit: "请选择小于20 MB的 JSON 文件。",
    empty: "尚未选择货踪结果文件。",
    count: "条记录",
    details: "查看船司原始资料",
    vessel: "船名 / 航次",
    noData: "源文件明确报告：此单号没有业务数据。",
    warnings: "源数据告警",
    notVerified: "源文件尚未验证本票业务数据。",
    verified: "源文件标记本票业务数据已验证。",
    eventTitle: "船司原始记录",
    additionalEvents: "船司报告的历史",
    time: "源数据时间",
    event: "源条目",
    location: "地点",
    transport: "运输方式",
    source: "来源",
    sourceDetails: "来源详情",
    historyHint: "保留船司报告的原始时间、地点与描述。",
    fields: "原始字段与扩展字段",
    expandSource: "展开源值",
    sourceLimited: "源值超过展示深度或大小限制，当前文字并非完整内容。",
    untypedTime:
      "源条目可能包含页面标签、摘要或运输描述，不代表事件已发生或已完成；保留原始顺序与源数据时间。",
    evidence: "源文件含本地证据路径；此预览不会打开这些路径。",
    unknown: "未知",
    verificationNeeded: "船司要求完成验证后才能继续查询。",
    queryIncomplete: "本次船司查询尚未完成。",
    fieldLabels: {
      bill_of_lading: "提单号",
      booking: "订舱号",
      origin: "起运地",
      destination: "目的地",
      vessel: "船名",
      voyage: "航次",
      service: "航线服务",
      container_type: "箱型",
      container_count_declared: "声明箱数",
      container_count_extracted: "提取箱数",
      etd: "预计离港",
      eta: "预计到港",
      atd: "实际离港",
      ata: "实际到港",
      milestone_pickup: "提箱原始描述",
      milestone_departure: "离港原始描述",
      milestone_arrival: "到港原始描述",
      milestone_delivery: "交付原始描述",
      weight: "重量",
      commodity: "品名",
      state: "运输状态",
      latest_event: "最新事件",
      latest_event_at: "最新事件时间"
    }
  }
};
const copy = (language) => labels[language === "zh" || language?.startsWith("zh") ? "zh" : "en"];
function node(doc, tag, text, className) {
  const n = doc.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
}
function buildOnOpen(details, build) {
  function onToggle() {
    if (!details.open) return;
    details.removeEventListener("toggle", onToggle);
    build();
  }
  details.addEventListener("toggle", onToggle);
}

function rawSourceText(value) {
  return typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? String(value));
}

function table(doc, headers) {
  const wrap = node(doc, "div", undefined, "tracking-json-table-wrap"),
    t = node(doc, "table"),
    head = node(doc, "thead"),
    row = node(doc, "tr"),
    body = node(doc, "tbody");
  headers.forEach((h) => row.append(node(doc, "th", h)));
  head.append(row);
  t.append(head, body);
  wrap.append(t);
  return { wrap, body };
}
export function trackingSourceSummary(snapshot, language) {
  if (!snapshot?.sourceDetails) return "";
  const l = copy(language);
  const declared = snapshot.summary?.containerCount?.declared;
  const declaredText =
    typeof declared === "number" || typeof declared === "string" ? String(declared) : l.notProvided;
  const returned = Array.isArray(snapshot.containers) ? snapshot.containers.length : 0;
  return [
    l.declaredContainers + ": " + declaredText,
    l.returnedContainers + ": " + returned,
    snapshot.sourceDetails.businessVerified === true ? l.verified : l.notVerified
  ]
    .filter(Boolean)
    .join(" · ");
}
function eventTable(doc, entries, l) {
  const hasTransport = entries.some((entry) => entry?.transportMode);
  const hasContainer = entries.some((entry) => entry?.containerNumber);
  const hasDetails = entries.some((entry) => entry?.sourceKind === "PAGE_DETAILS" || entry?.sourceKind === "PAGE_DETAIL");
  const en = l === labels.en;
  const hasLoadStatus = entries.some((entry) => eventLoadLabel(entry, en ? "en" : "zh"));
  const { wrap, body } = table(doc, [
    ...(hasContainer ? [en ? "Container" : "箱号"] : []),
    ...(hasDetails ? [en ? "Time type" : "时间性质"] : []),
    l.time, l.event, ...(hasLoadStatus ? [en ? "Empty / laden" : "空重状态"] : []), l.location,
    ...(hasDetails ? [en ? "Terminal / depot" : "码头 / 堆场", en ? "Vessel / voyage" : "船名 / 航次"] : []),
    ...(hasTransport ? [l.transport] : [])
  ]);
  for (const event of entries) {
    if (!event) continue;
    const row = node(doc, "tr");
    const description = node(doc, "td", event.name || "—");
    if (!hasDetails && (event.raw != null || event.source)) {
      const original = node(doc, "details");
      original.append(node(doc, "summary", l.expandSource));
      buildOnOpen(original, () => {
        if (event.source) original.append(node(doc, "p", event.source));
        if (event.raw != null) {
          const text = rawSourceText(event.raw);
          original.append(node(doc, "pre", text.slice(0, 65536)));
          if (text.length > 65536) original.append(node(doc, "small", l.sourceLimited));
        }
      });
      description.append(original);
    }
    if (hasContainer) row.append(node(doc, "td", event.containerNumber || "—"));
    if (hasDetails) row.append(node(doc, "td", event.timeType === "ACTUAL" ? (en ? "Actual" : "实际") : event.timeType === "ESTIMATED" ? (en ? "Estimated" : "预计") : (en ? "Reported" : "船司报告")));
    const time = event.reportedTime || event.occurredAt || event.estimatedAt || "—";
    row.append(
      node(doc, "td", reportedTimeLabel(time, event.timezone)),
      description
    );
    if (hasLoadStatus) row.append(node(doc, "td", eventLoadLabel(event, en ? "en" : "zh") || "—"));
    row.append(node(doc, "td", event.location || "—"));
    if (hasDetails) row.append(node(doc, "td", eventTerminalLabel(event) || "—"), node(doc, "td", eventVesselLabel(event, en ? "en" : "zh") || "—"));
    if (hasTransport) row.append(node(doc, "td", event.transportMode || "—"));
    body.append(row);
  }
  return wrap;
}

export function renderTrackingHistory(doc, snapshot, language) {
  const target = doc.querySelector("#snapshot-reported-history");
  const history = reportedTrackingHistory(snapshot);
  const panel = doc.querySelector("#reported-history-panel");
  if (panel) panel.hidden = history.length === 0;
  if (target) {
    target.replaceChildren();
    target.hidden = history.length === 0;
    if (history.length) {
      const l = copy(language);
      const section = node(doc, "div", undefined, "tracking-json-history");
      section.append(
        node(doc, "h4", l.additionalEvents),
        node(doc, "p", l.historyHint)
      );
      const content = node(doc, "div");
      const numbers = [...new Set(history.map((entry) => entry.containerNumber).filter(Boolean))];
      if (numbers.length > 1) {
        const filter = node(doc, "div", undefined, "tracking-detail-filter");
        const label = node(doc, "label", l === labels.zh ? "按箱号查看记录" : "Filter records by container");
        const select = node(doc, "select");
        const all = node(doc, "option", l === labels.zh ? "全部箱号" : "All containers");
        all.value = "";
        select.append(all);
        for (const number of numbers) {
          const option = node(doc, "option", number);
          option.value = number;
          select.append(option);
        }
        const count = node(doc, "span");
        const update = () => {
          const shown = select.value ? history.filter((event) => event.containerNumber === select.value) : history;
          count.textContent = l === labels.zh ? `显示 ${shown.length}/${history.length} 条记录` : `${shown.length}/${history.length} records`;
          content.replaceChildren(eventTable(doc, shown, l));
        };
        select.addEventListener("change", update);
        label.append(select);
        filter.append(label, count);
        section.append(filter);
        update();
      } else content.append(eventTable(doc, history, l));
      section.append(content);
      target.append(section);
    }
  }
  return history.length;
}

export function renderReportedTrackingDetails(doc, snapshot, language) {
  snapshot = sanitizeTrackingData(snapshot);
  const target = doc.querySelector("#reported-tracking-details");
  if (!target) return;
  target.replaceChildren();
  const details = snapshot?.sourceDetails,
    events = Array.isArray(snapshot?.events) ? snapshot.events : [];
  target.hidden = !details && !events.length;
  if (target.hidden) return;
  const l = copy(language);
  if (details?.noBusinessData) target.append(node(doc, "p", l.noData, "tracking-json-notice"));
  const criticalStatus = /HUMAN_REQUIRED|NO_BUSINESS_DATA|ERROR|FAILED|BLOCKED/.test(
    details?.queryStatus || ""
  );
  if (criticalStatus && !(details.noBusinessData && details.queryStatus === "NO_BUSINESS_DATA")) {
    target.append(node(doc, "p", details.queryStatus === "HUMAN_REQUIRED" ? l.verificationNeeded : l.queryIncomplete, "tracking-json-notice"));
  }
  const archive = node(doc, "details", undefined, "tracking-source-archive");
  archive.append(node(doc, "summary", l.details));
  const archiveBody = node(doc, "div", undefined, "tracking-source-archive-body");
  archive.append(archiveBody);
  target.append(archive);
  if (details?.warnings?.length) {
    const critical = details.warnings.filter((warning) =>
      /HUMAN_REQUIRED|NO_BUSINESS_DATA|ERROR|FAILED|BLOCKED/.test(warning)
    );
    const ordinary = details.warnings.filter((warning) => !critical.includes(warning));
    for (const [warnings, blocking] of [
      [critical, true],
      [ordinary, false]
    ]) {
      if (!warnings.length) continue;
      const warning = node(
        doc,
        blocking ? "div" : "details",
        undefined,
        blocking ? "tracking-json-notice" : "tracking-json-disclosure"
      );
      warning.append(
        node(doc, blocking ? "strong" : "summary", `${l.warnings} (${warnings.length})`)
      );
      const ul = node(doc, "ul");
      warnings.forEach((w) => ul.append(node(doc, "li", w)));
      warning.append(ul);
      archiveBody.append(warning);
    }
  }
  if (events.length) {
    const section = node(doc, "details", undefined, "tracking-json-disclosure");
    section.append(node(doc, "summary", `${l.eventTitle} (${events.length})`));
    buildOnOpen(section, () =>
      section.append(node(doc, "p", l.untypedTime), eventTable(doc, events, l))
    );
    archiveBody.append(section);
  }
  const usefulFields = sourceBusinessFields(snapshot, language);
  if (usefulFields.length) {
    const section = node(doc, "section", undefined, "tracking-business-fields");
    section.append(node(doc, "h3", l === labels.zh ? "补充业务信息" : "Additional shipment facts"));
    const { wrap, body } = table(doc, l === labels.zh ? ["项目", "船司报告值"] : ["Field", "Carrier-reported value"]);
    for (const field of usefulFields) {
      const row = node(doc, "tr");
      row.append(node(doc, "th", field.label), node(doc, "td", field.value));
      body.append(row);
    }
    section.append(wrap);
    // Business facts remain visible; technical provenance stays in the archive.
    target.append(section);
  }
  if (details?.fields?.length) {
    const section = node(doc, "details", undefined, "tracking-json-disclosure tracking-technical-fields");
    section.append(node(doc, "summary", l === labels.zh ? "原始字段（核对用）" : "Original fields (for reference)"));
    buildOnOpen(section, () => {
      const original = details.fields.map(field => `${field.source ? field.source + "." : ""}${field.key}: ${field.rawText ?? rawSourceText(field.value)}`).join("\n");
      section.append(node(doc, "pre", original.slice(0, 120000)));
      if (original.length > 120000) section.append(node(doc, "small", l.sourceLimited));
    });
    archiveBody.append(section);
  }

  if (details) {
    const section = node(doc, "details", undefined, "tracking-json-disclosure");
    section.append(node(doc, "summary", l.sourceDetails));
    const metadata = node(doc, "dl", undefined, "tracking-json-source-fields");
    for (const key of ["queryStatus", "schema", "strategy", "confidence", "jobId"]) {
      if (!details[key]) continue;
      const row = node(doc, "div");
      const names = {queryStatus: "查询状态", schema: "数据格式", strategy: "采集方式", confidence: "来源标记", jobId: "查询批次"};
      row.append(node(doc, "dt", l === labels.zh ? names[key] : key), node(doc, "dd", String(details[key])));
      metadata.append(row);
    }
    const history = Array.isArray(details.additionalEvents) ? details.additionalEvents : [];
    const sources = [
      ...new Set([...events, ...history].map((event) => event?.source).filter(Boolean))
    ];
    if (sources.length) {
      const row = node(doc, "div");
      row.append(node(doc, "dt", l.source), node(doc, "dd", sources.join(" · ")));
      metadata.append(row);
    }
    section.append(node(doc, "p", trackingSourceSummary(snapshot, language)), metadata);
    if (details.evidenceAvailable) section.append(node(doc, "p", l.evidence));
    archiveBody.append(section);
  }
}
export function installLocalTrackingPreview({
  doc = document,
  language = () => doc.documentElement.lang,
  onOpen,
  onExit
}) {
  const host = doc.querySelector("#overview-view"),
    results = doc.querySelector("#results");
  if (!host || !results) return null;
  let records = [],
    fileName = "",
    version = 0,
    selectedCarrier = "",
    activeIndex = null;
  const panel = node(doc, "section", undefined, "panel tracking-json-preview");
  panel.id = "tracking-json-preview";
  const heading = node(doc, "h2"),
    hint = node(doc, "p"),
    controls = node(doc, "div", undefined, "tracking-json-controls");
  const choose = node(doc, "button"),
    input = node(doc, "input"),
    filter = node(doc, "select"),
    clear = node(doc, "button"),
    status = node(doc, "p"),
    list = node(doc, "div"),
    carriers = node(doc, "div", undefined, "tracking-json-carriers");
  choose.type = clear.type = "button";
  input.type = "file";
  input.accept = ".json,application/json";
  input.id = "tracking-json-input";
  input.hidden = true;
  filter.id = "tracking-json-carrier";
  status.setAttribute("role", "status");
  controls.append(choose, input, filter, clear);
  panel.append(heading, hint, controls, status, carriers, list);
  host.querySelector(".overview-hero")?.after(panel);
  const banner = node(doc, "div", undefined, "tracking-json-banner");
  banner.id = "tracking-json-preview-banner";
  banner.hidden = true;
  const bannerLabel = node(doc, "strong"),
    exit = node(doc, "button");
  exit.type = "button";
  banner.append(bannerLabel, exit);
  results.prepend(banner);
  function open(index) {
    activeIndex = index;
    banner.hidden = false;
    onOpen(records[index]);
    render();
  }
  function reset() {
    const wasActive = activeIndex !== null;
    version++;
    records = [];
    activeIndex = null;
    fileName = "";
    selectedCarrier = "";
    input.value = "";
    banner.hidden = true;
    if (wasActive) onExit();
    render();
  }
  function render() {
    status.setAttribute("role", "status");
    const l = copy(language());
    heading.textContent = l.title;
    hint.textContent = l.hint;
    choose.textContent = l.choose;
    clear.textContent = l.clear;
    exit.textContent = l.exit;
    bannerLabel.textContent = l.scope;
    filter.setAttribute("aria-label", l.carrier);
    filter.replaceChildren();
    const all = node(doc, "option", l.all);
    all.value = "";
    filter.append(all);
    const codes = [...new Set(records.map((p) => p.snapshot.provider?.code || "UNKNOWN"))];
    for (const code of codes) {
      const option = node(doc, "option", code);
      option.value = code;
      filter.append(option);
    }
    filter.value = selectedCarrier;
    filter.hidden = clear.hidden = !records.length;
    status.textContent = records.length
      ? `${fileName} · ${records.length} ${l.count} · ${codes.length} ${l.carrier}`
      : l.empty;
    carriers.replaceChildren();
    for (const code of codes) {
      const button = node(doc, "button");
      button.type = "button";
      button.append(
        createCarrierBadge(doc, code),
        node(doc, "b", String(records.filter((p) => p.snapshot.provider?.code === code).length))
      );
      button.setAttribute("aria-pressed", String(selectedCarrier === code));
      button.addEventListener("click", () => {
        selectedCarrier = selectedCarrier === code ? "" : code;
        render();
      });
      carriers.append(button);
    }
    list.replaceChildren();
    if (!records.length) return;
    const { wrap, body } = table(doc, [
      l.carrier,
      l.reference,
      l.status,
      l.containers,
      l.events,
      ""
    ]);
    records.forEach((p, index) => {
      const s = p.snapshot;
      if (selectedCarrier && s.provider?.code !== selectedCarrier) return;
      const row = node(doc, "tr");
      row.dataset.previewRecord = String(index);
      const carrier = node(doc, "td");
      carrier.append(createCarrierBadge(doc, s.provider?.code, s.provider?.name));
      row.append(carrier);
      [
        s.tracking?.originalNumber || s.tracking?.number || "—",
        s.sourceDetails?.queryStatus || s.summary?.status || "—",
        String(s.containers?.length || 0),
        String(s.events?.length || 0)
      ].forEach((v) => row.append(node(doc, "td", v)));
      const action = node(doc, "td"),
        button = node(doc, "button", l.open);
      button.type = "button";
      button.dataset.previewOpen = String(index);
      button.addEventListener("click", () => open(index));
      action.append(button);
      row.append(action);
      body.append(row);
    });
    list.append(wrap);
    if (activeIndex !== null) {
      const p = records[activeIndex];
      bannerLabel.textContent = `${l.scope} · ${p.snapshot.provider?.name || p.snapshot.provider?.code}`;
    }
  }
  choose.addEventListener("click", () => input.click());
  filter.addEventListener("change", () => {
    selectedCarrier = filter.value;
    render();
  });
  clear.addEventListener("click", reset);
  exit.addEventListener("click", () => {
    activeIndex = null;
    banner.hidden = true;
    onExit();
    render();
  });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    const generation = ++version;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error(copy(language()).limit);
      const parsed = readTrackingPreview(JSON.parse(await file.text()));
      if (generation !== version) return;
      if (activeIndex !== null) onExit();
      records = parsed;
      fileName = file.name;
      activeIndex = null;
      selectedCarrier = "";
      banner.hidden = true;
      render();
    } catch (error) {
      if (generation === version) {
        status.textContent = `${copy(language()).error}: ${error.message}`;
        status.setAttribute("role", "alert");
      }
    } finally {
      input.value = "";
    }
  });
  render();
  return {
    refresh: render,
    exit: reset,
    renderDetails: (snapshot) => renderReportedTrackingDetails(doc, snapshot, language())
  };
}
