import { readTrackingPreview, createCarrierBadge, detailSections } from "./tracking-v1-adapter.mjs";
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
    containers: "Containers",
    events: "Events",
    scope: "Local JSON · read-only",
    exit: "Exit preview",
    error: "Could not preview this file",
    limit: "Select a JSON file smaller than 20 MB.",
    empty: "No tracking file selected.",
    count: "records",
    details: "Reported tracking details",
    vessel: "Vessel / voyage",
    noData: "The source reports no business data for this reference.",
    warnings: "Source warnings",
    notVerified: "Business data has not been verified by the source.",
    verified: "Source marks this record as business verified.",
    eventTitle: "Shipment events",
    additionalEvents: "Additional structured carrier history",
    time: "Reported time",
    event: "Event",
    location: "Location",
    source: "Source",
    fields: "Other source fields",
    untypedTime:
      "Reported times retain the source precision. No actual/estimated classification is inferred.",
    evidence: "The source lists local evidence paths. They are not opened by this preview.",
    unknown: "Unknown",
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
    containers: "箱数",
    events: "事件数",
    scope: "本地 JSON · 只读预览",
    exit: "退出预览",
    error: "无法预览此文件",
    limit: "请选择小于20 MB的 JSON 文件。",
    empty: "尚未选择货踪结果文件。",
    count: "条记录",
    details: "源文件返回的货踪详情",
    vessel: "船名 / 航次",
    noData: "源文件明确报告：此单号没有业务数据。",
    warnings: "源数据告警",
    notVerified: "源文件尚未验证本票业务数据。",
    verified: "源文件标记本票业务数据已验证。",
    eventTitle: "票级运输事件",
    additionalEvents: "船司补充结构化历史",
    time: "源数据时间",
    event: "事件",
    location: "地点",
    source: "来源",
    fields: "其他源字段",
    untypedTime: "时间保留源数据精度，不推断实际或预计时间类型。",
    evidence: "源文件含本地证据路径；此预览不会打开这些路径。",
    unknown: "未知",
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
export function renderReportedTrackingDetails(doc, snapshot, language) {
  const target = doc.querySelector("#reported-tracking-details");
  if (!target) return;
  target.replaceChildren();
  const details = snapshot?.sourceDetails,
    events = Array.isArray(snapshot?.events) ? snapshot.events : [];
  target.hidden = !details && !events.length;
  if (target.hidden) return;
  const l = copy(language);
  target.append(node(doc, "h3", l.details));
  if (details?.noBusinessData) target.append(node(doc, "p", l.noData, "tracking-json-notice"));
  if (details?.vessel || details?.voyage) {
    const p = node(doc, "p");
    p.append(
      node(doc, "strong", l.vessel + ": "),
      node(doc, "span", [details.vessel, details.voyage].filter(Boolean).join(" / "))
    );
    target.append(p);
  }
  if (details) {
    const status = node(doc, "p");
    status.textContent = [
      l.status + ": " + (details.queryStatus || l.unknown),
      details.businessVerified ? l.verified : l.notVerified
    ].join(" · ");
    target.append(status);
  }
  if (details?.warnings?.length) {
    const warning = node(doc, "div", undefined, "tracking-json-notice");
    warning.append(node(doc, "strong", l.warnings));
    const ul = node(doc, "ul");
    details.warnings.forEach((w) => ul.append(node(doc, "li", w)));
    warning.append(ul);
    target.append(warning);
  }
  for (const [title, entries] of [
    [l.eventTitle, events],
    [l.additionalEvents, details?.additionalEvents || []]
  ]) {
    if (!entries.length) continue;
    target.append(node(doc, "h4", `${title} (${entries.length})`), node(doc, "p", l.untypedTime));
    const { wrap, body } = table(doc, [l.time, l.event, l.location, l.source]);
    for (const event of entries) {
      const row = node(doc, "tr");
      [
        event.reportedTime || event.occurredAt || "—",
        event.name || "—",
        event.location || "—",
        event.source || "—"
      ].forEach((v) => row.append(node(doc, "td", v)));
      body.append(row);
    }
    target.append(wrap);
  }
  if (details?.fields?.length) {
    const section = node(doc, "details");
    section.append(node(doc, "summary", l.fields));
    const dl = node(doc, "dl", undefined, "tracking-json-source-fields");
    for (const field of details.fields) {
      const row = node(doc, "div");
      row.append(
        node(doc, "dt", l.fieldLabels[field.key] || field.key),
        node(doc, "dd", field.value)
      );
      dl.append(row);
    }
    section.append(dl);
    target.append(section);
  }
  if (details?.evidenceAvailable) target.append(node(doc, "p", l.evidence));
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
  const supplemental = node(doc, "section", undefined, "panel tracking-json-reported");
  supplemental.id = "reported-tracking-details";
  supplemental.hidden = true;
  results.querySelector(".shipment-summary-card")?.after(supplemental);
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
