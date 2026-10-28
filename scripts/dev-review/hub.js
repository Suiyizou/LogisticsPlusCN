const $ = (id) => document.getElementById(id);
const roleNames = {
  PUBLIC: "公开",
  ADMIN: "管理员",
  BUSINESS: "业务员",
  OVERSEA_AGENT: "内部海外代理",
  EMPLOYEE: "员工",
  CUSTOMER: "客户",
  CUSTOMER_AGENT: "兼容代理客户（CUSTOMER + OVERSEA_AGENT）"
};
const availabilityNames = {
  standard: "现行入口",
  preview: "设计预览 · 未接执行后端",
  dormant: "休眠 UI · 无标准入口",
  "host-state": "宿主内部状态"
};
const statuses = [
  ["pending", "待检查"],
  ["normal", "已检查正常态"],
  ["abnormal", "已检查异常态"],
  ["missing-data", "缺数据"],
  ["missing-file", "缺文件"],
  ["issue", "有问题"],
  ["blocked", "条件不足"]
];
const kindNames = {
  page: "页面",
  detail: "详情",
  modal: "弹窗 / 抽屉",
  tab: "页内标签",
  panel: "展开区",
  state: "认证 / 状态",
  compatibility: "兼容链接"
};
const storageKey = "logisticspluscn-local-review-v2";
let catalog;
let group = "";
let saved = {};
let environmentRecords = {};
function loadEvidenceForEnvironment() {
  try {
    environmentRecords = JSON.parse(localStorage.getItem(storageKey) || "{}");
  } catch {
    environmentRecords = {};
  }
  saved = environmentRecords[baseUrl()] || {};
}
function persist() {
  try {
    environmentRecords[baseUrl()] = saved;
    localStorage.setItem(storageKey, JSON.stringify(environmentRecords));
  } catch {
    /* The current page remains usable. */
  }
}
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function baseUrl() {
  try {
    const url = new URL($("base-url").value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.username ||
      url.password
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}
function destination(item) {
  let path = item.path;
  const customer = $("customer-id").value.trim();
  const shipment = $("shipment-id").value.trim();
  if (path.includes(":customerId")) {
    if (!customer) return { path: item.listPath || "/customers/directory", list: true };
    path = path.replace(":customerId", encodeURIComponent(customer));
  }
  if (path.includes(":shipmentId")) {
    if (!shipment) return { path: item.listPath || "/customers/shipments", list: true };
    path = path.replace(":shipmentId", encodeURIComponent(shipment));
  }
  if (item.record === "tracking" && $("tracking-number").value.trim()) {
    const query = new URL(path, "http://localhost").searchParams;
    const fields = {
      number: $("tracking-number").value.trim(),
      carrier: $("tracking-carrier").value,
      type: $("tracking-type").value,
      channel: "AUTO"
    };
    for (const [key, value] of Object.entries(fields)) query.set(key, value);
    path = "/tracking/?" + query + "#tracking";
  }
  return { path, list: false };
}
function currentStatus(item) {
  if (item.availability === "dormant") return "dormant";
  const value = saved[item.id]?.status || "pending";
  return value === "checked" ? "normal" : value;
}
function stats() {
  const counts = Object.fromEntries(
    [...statuses.map(([key]) => key), "dormant"].map((key) => [key, 0])
  );
  for (const item of catalog.items) counts[currentStatus(item)]++;
  $("total").textContent = catalog.items.length;
  $("checked").textContent = counts.normal;
  $("issues").textContent = counts.issue;
  $("pending").textContent =
    counts.pending + counts.blocked + counts["missing-data"] + counts["missing-file"];
}
function render() {
  if (!catalog) return;
  const base = baseUrl();
  $("base-url").setCustomValidity(base ? "" : "请输入仅限本机的 http/https 地址");
  const login = $("open-login");
  if (base) login.href = base + "/workbenches";
  else login.removeAttribute("href");
  const query = $("search").value.trim().toLocaleLowerCase();
  const role = $("role").value;
  const kind = $("kind").value;
  const status = $("status-filter").value;
  const availability = $("availability-filter").value;
  const items = catalog.items.filter(
    (item) =>
      (!group || item.group === group) &&
      (!kind || item.kind === kind) &&
      (!role ||
        item.roles.includes(role) ||
        item.roles.includes("PUBLIC") ||
        (role === "CUSTOMER_AGENT" && item.roles.includes("CUSTOMER"))) &&
      (!status || currentStatus(item) === status) &&
      (!availability || item.availability === availability) &&
      (!query ||
        [item.name, item.path, item.steps, item.source, ...(item.matrix || []).map((row) => row.id)]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query))
  );
  const host = $("items");
  host.replaceChildren();
  let previousGroup;
  for (const groupId of Object.keys(catalog.groups)) {
    for (const item of items.filter((candidate) => candidate.group === groupId)) {
      if (previousGroup !== groupId) {
        const heading = node("h2", catalog.groups[groupId], "group-heading");
        heading.id = "group-" + groupId;
        host.append(heading);
        previousGroup = groupId;
      }
      const card = node("article", null, "review-card");
      card.dataset.status = currentStatus(item);
      const head = node("div", null, "card-head");
      const title = node("div");
      const labels = node("div", null, "labels");
      labels.append(
        node("span", kindNames[item.kind], "kind"),
        node("span", item.roles.map((key) => roleNames[key]).join(" · "), "roles")
      );
      labels.append(
        node(
          "span",
          availabilityNames[item.availability] || availabilityNames.standard,
          "availability"
        )
      );
      if (item.matrix?.length)
        labels.append(node("span", item.matrix.map((row) => row.id).join(" / "), "matrix-id"));
      title.append(labels, node("h3", item.name));
      const target = destination(item);
      const link = node(
        "a",
        item.availability === "dormant"
          ? "休眠 · 无可打开入口"
          : target.list
            ? "打开对应列表 ↗"
            : item.kind === "modal" || item.kind === "tab" || item.kind === "panel"
              ? "打开所在页面 ↗"
              : "打开真实页面 ↗",
        "button open-page"
      );
      if (base && item.availability !== "dormant") link.href = base + target.path;
      if (item.availability === "dormant") link.setAttribute("aria-disabled", "true");
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      head.append(title, link);
      card.append(head, node("code", item.path, "route"));
      card.append(node("p", item.steps, "steps"));
      if (item.prerequisite)
        card.append(node("p", "所需条件：" + item.prerequisite, "prerequisite"));
      if (target.list)
        card.append(
          node(
            "p",
            "尚未提供该环境的真实 ID。打开列表后，从对应记录进入详情；或由本地运行准备步骤提供 ID。",
            "record-note"
          )
        );
      const source = node("details", null, "source");
      source.append(node("summary", "源码依据"), node("code", item.source));
      card.append(source);
      if (item.matrix?.length) {
        const requirements = node("details", null, "requirements");
        requirements.append(node("summary", "矩阵条件与证据要求"));
        for (const row of item.matrix)
          requirements.append(node("p", row.id + " · " + row.requirement));
        card.append(requirements);
      }
      const feedback = node("div", null, "feedback");
      const statusLabel = node("label", "检查状态");
      const select = node("select");
      for (const [value, label] of item.availability === "dormant"
        ? [["dormant", "休眠 UI"]]
        : statuses) {
        const option = node("option", label);
        option.value = value;
        select.append(option);
      }
      select.value = currentStatus(item);
      select.disabled = item.availability === "dormant";
      select.addEventListener("change", () => {
        saved[item.id] = {
          ...saved[item.id],
          status: select.value,
          updatedAt: new Date().toISOString()
        };
        persist();
        render();
      });
      statusLabel.append(select);
      const noteLabel = node("label", "备注 / 待改细节");
      const input = node("textarea");
      input.rows = 2;
      input.placeholder = "例如：375px 下拉被遮挡；按钮文案未对齐";
      input.value = saved[item.id]?.note || "";
      input.addEventListener("change", () => {
        saved[item.id] = {
          ...saved[item.id],
          note: input.value,
          updatedAt: new Date().toISOString()
        };
        persist();
      });
      noteLabel.append(input);
      feedback.append(statusLabel, noteLabel);
      card.append(feedback);
      if (item.availability !== "dormant") {
        const evidence = node("details", null, "evidence");
        evidence.append(node("summary", "分别记录可达、数据、角色与桌面/窄屏证据"));
        const fields = node("div", null, "evidence-fields");
        for (const dimension of item.evidenceDimensions || []) {
          const label = node("label", dimension);
          const checkbox = node("input");
          checkbox.type = "checkbox";
          checkbox.checked = Boolean(saved[item.id]?.dimensions?.[dimension]);
          checkbox.addEventListener("change", () => {
            saved[item.id] = {
              ...saved[item.id],
              dimensions: { ...saved[item.id]?.dimensions, [dimension]: checkbox.checked }
            };
            persist();
          });
          label.prepend(checkbox);
          fields.append(label);
        }
        evidence.append(fields);
        const referenceLabel = node("label", "截图 / 录屏证据文件（本地路径或文件名）");
        const reference = node("input");
        reference.type = "text";
        reference.value = saved[item.id]?.evidence || "";
        reference.placeholder = "例如 B03-customer-a-mobile-full.png";
        reference.addEventListener("change", () => {
          saved[item.id] = { ...saved[item.id], evidence: reference.value };
          persist();
        });
        referenceLabel.append(reference);
        evidence.append(referenceLabel);
        card.append(evidence);
      }
      host.append(card);
    }
  }
  $("result-count").textContent =
    `${items.length} / ${catalog.items.length} 个检查项（含休眠说明）· 45主视图、35矩阵条件组分别映射，不按数量视作验收完成`;
  $("empty").hidden = items.length > 0;
  for (const button of $("groups").querySelectorAll("button"))
    button.setAttribute("aria-pressed", String(button.dataset.group === group));
  stats();
}
async function loadRecords() {
  loadEvidenceForEnvironment();
  for (const id of ["customer-id", "shipment-id", "tracking-number"]) $(id).value = "";
  const data = await fetch("/api/local-records").then((response) => response.json());
  const matchesEnvironment = !data.baseUrl || data.baseUrl === baseUrl();
  if (matchesEnvironment) {
    for (const [key, id] of Object.entries({
      customerId: "customer-id",
      shipmentId: "shipment-id",
      trackingNumber: "tracking-number",
      trackingCarrier: "tracking-carrier",
      trackingType: "tracking-type"
    }))
      if (data[key]) $(id).value = data[key];
  }
  $("records-summary").textContent =
    matchesEnvironment && (data.customerId || data.shipmentId || data.trackingNumber)
      ? "已载入本地真实记录，可直接进入详情"
      : "未加载该环境记录，可直接打开列表";
  render();
}
async function loadDesigns() {
  const files = await fetch("/api/designs").then((response) => response.json());
  const host = $("design-gallery");
  host.replaceChildren();
  if (!files.length) {
    host.append(
      node(
        "p",
        "整页 UI 图尚未放入 output/ui-full-design-20261028。根任务生成后，点击刷新即可显示。",
        "design-empty"
      )
    );
    return;
  }
  for (const file of files) {
    const figure = node("figure");
    const link = node("a");
    link.href = file.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const img = node("img");
    img.src = file.url;
    img.alt = file.name + " 整页UI设计构图";
    img.loading = "lazy";
    link.append(img);
    figure.append(link, node("figcaption", file.name + " · 设计参照，可点开原图"));
    host.append(figure);
  }
}
$("environment").addEventListener("change", () => {
  if ($("environment").value !== "custom") $("base-url").value = $("environment").value;
  void loadRecords();
});
$("base-url").addEventListener("change", () => {
  $("environment").value = [...$("environment").options].some(
    (option) => option.value === baseUrl()
  )
    ? baseUrl()
    : "custom";
  void loadRecords();
});
for (const id of [
  "search",
  "role",
  "kind",
  "status-filter",
  "availability-filter",
  "customer-id",
  "shipment-id",
  "tracking-number",
  "tracking-carrier",
  "tracking-type"
])
  $(id).addEventListener(id === "search" ? "input" : "change", render);
$("refresh-records").addEventListener("click", () => void loadRecords());
$("refresh-designs").addEventListener("click", () => void loadDesigns());
$("export").addEventListener("click", () => {
  const data = {
    exportedAt: new Date().toISOString(),
    environment: baseUrl(),
    note: "人工检查记录，不代表自动测试通过；不含客户/票单ID与凭据。",
    items: catalog.items.map((item) => ({
      ...Object.fromEntries(
        ["id", "name", "path", "kind", "group", "roles", "availability"].map((key) => [
          key,
          item[key]
        ])
      ),
      matrixIds: item.matrix?.map((row) => row.id) || [],
      status: currentStatus(item),
      dimensions: saved[item.id]?.dimensions || {},
      evidence: saved[item.id]?.evidence || "",
      note: saved[item.id]?.note || "",
      updatedAt: saved[item.id]?.updatedAt || null
    }))
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
  );
  const link = node("a");
  link.href = url;
  link.download = "review-export-" + new Date().toISOString().slice(0, 10) + ".json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
try {
  catalog = await fetch("/api/catalog").then((response) => {
    if (!response.ok) throw new Error("catalog");
    return response.json();
  });
  $("matrix-note").textContent = catalog.matrix?.note || "矩阵尚未加载。";
  const entries = [["", "全部入口"], ...Object.entries(catalog.groups)];
  for (const [key, name] of entries) {
    const count = key
      ? catalog.items.filter((item) => item.group === key).length
      : catalog.items.length;
    const button = node("button", name);
    button.type = "button";
    button.dataset.group = key;
    button.append(node("span", String(count)));
    button.addEventListener("click", () => {
      group = key;
      render();
      $("result-count").scrollIntoView({ block: "start", behavior: "smooth" });
    });
    $("groups").append(button);
  }
  $("disabled-modules").textContent =
    "当前未启用模块：" +
    catalog.disabledModules.map((module) => module.id).join("、") +
    "。不将示例模块作为可用业务页。";
  render();
  await Promise.all([loadRecords(), loadDesigns()]);
} catch {
  $("result-count").textContent =
    "本地检查清单读取失败。请确认此页由 node scripts/dev-review/serve.mjs 启动，再刷新。";
}
