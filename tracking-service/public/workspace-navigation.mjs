const labels = {
  zh: {
    tracking: "运输跟踪",
    planning: "装箱工具",
    business: "业务协同",
    admin: "系统管理",
    cargos: "货物清单",
    smartImport: "智能导入",
    results: "装箱结果与导出",
    config: "装箱设置",
    customers: "客户管理",
    shipments: "运单管理",
    handover: "业务交接",
    overview: "管理总览",
    employees: "员工管理",
    platform: "客户与权限",
    tickets: "全局运单",
    devices: "设备与会话",
    files: "运单文件",
    announcements: "公告管理",
    system: "系统配置",
    navigation: "工作台导航",
    mobileNavigation: "工作区导航"
  },
  en: {
    tracking: "Shipment tracking",
    planning: "Load planning",
    business: "Business operations",
    admin: "Administration",
    cargos: "Cargo list",
    smartImport: "Smart import",
    results: "Results & export",
    config: "Planning settings",
    customers: "Customers",
    shipments: "Shipments",
    handover: "Business handovers",
    overview: "Admin overview",
    employees: "Employees",
    platform: "Customers & access",
    tickets: "Global shipments",
    devices: "Devices & sessions",
    files: "Shipment documents",
    announcements: "Announcements",
    system: "System settings",
    navigation: "Workspace navigation",
    mobileNavigation: "Workspace navigation"
  }
};
const icons = {
  tracking: '<path d="M3 17h18l-3 4H6l-3-4Zm3 0V8h12v9M9 8V3h6v5M3 12l3 2m15-2-3 2"/>',
  planning: '<path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 5 9-5M12 12v9M7 5l10 5"/>',
  business: '<path d="M4 7h16v14H4V7Zm4 0V3h8v4M4 12h16M9 12v3h6v-3"/>',
  admin: '<path d="M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm-4 9 3 3 5-6"/>'
};
function createGroup(document, key) {
  const section = document.createElement("section");
  section.className = "workspace-nav-group";
  section.dataset.workspaceGroup = key;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "workspace-nav-trigger";
  button.dataset.workspaceToggle = key;
  button.setAttribute("aria-controls", `workspace-nav-${key}`);
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[key]}</svg><span data-workspace-label="${key}"></span><svg class="workspace-nav-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 5 5-5 5"/></svg>`;
  const children = document.createElement("div");
  children.className = "workspace-nav-children";
  children.id = `workspace-nav-${key}`;
  children.hidden = true;
  section.append(button, children);
  return section;
}
function setExpanded(group, expanded) {
  group.querySelector(".workspace-nav-trigger").setAttribute("aria-expanded", String(expanded));
  group.querySelector(".workspace-nav-children").hidden = !expanded;
}
function addLink(document, children, key, href) {
  const link = document.createElement("a");
  link.className = "nav-item workspace-nav-destination";
  link.href = href;
  link.dataset.workspaceLabel = key;
  children.append(link);
}

function mountMobileNavigation(nav) {
  const document = nav.ownerDocument;
  const content = document.createElement("div");
  content.id = "workspace-navigation-content";
  content.className = "workspace-nav-content";
  // Keep every existing node and listener, including portal and carrier controls.
  content.append(...nav.childNodes);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "workspace-nav-mobile-toggle";
  toggle.setAttribute("aria-controls", content.id);
  toggle.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span data-workspace-label="mobileNavigation"></span><svg class="workspace-nav-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 5 5-5 5"/></svg>';
  nav.append(toggle, content);
  nav.parentElement.classList.add("has-workspace-navigation");
  const media = document.defaultView?.matchMedia?.("(max-width: 760px)");
  let open = false;
  function setOpen(value) {
    open = value;
    const expanded = !media?.matches || open;
    toggle.setAttribute("aria-expanded", String(expanded));
    content.hidden = !expanded;
  }
  setOpen(false);
  media?.addEventListener("change", () => setOpen(false));
  toggle.addEventListener("click", () => setOpen(!open));
  nav.addEventListener("click", (event) => {
    if (media?.matches && event.target.closest("a")) setOpen(false);
  });
  nav.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && media?.matches && open) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      toggle.focus();
    }
  });
}

/** Enhance the existing navigation in place. Existing app DOM references remain valid. */
export function renderTrackingWorkspaceNavigation(
  { kind = "", role = "", partyRole = "", language = "en", activeView = "overview" } = {},
  root = document
) {
  const nav = root.querySelector(".sidebar > nav");
  if (!nav) return;
  const document = nav.ownerDocument;
  if (!nav.dataset.workspaceNavigation) {
    nav.dataset.workspaceNavigation = "true";
    nav.classList.add("workspace-navigation");
    const tracking = createGroup(document, "tracking");
    nav.append(tracking);
    // Move, never clone or replace: app.js captures these nodes before mounting.
    nav
      .querySelectorAll("a[data-view-target]")
      .forEach((link) => tracking.lastElementChild.append(link));
    const destinations = {
      planning: [
        ["cargos", "/planner/cargos"],
        ["smartImport", "/planner/cargos?import=smart"],
        ["results", "/planner/results"],
        ["config", "/planner/config"]
      ],
      business: [
        ["customers", "/customers/directory"],
        ["shipments", "/customers/shipments"],
        ["handover", "/customers/handover"]
      ],
      admin: [
        ["overview", "/admin/overview"],
        ["employees", "/admin/employees"],
        ["platform", "/admin/platform"],
        ["tickets", "/admin/tickets"],
        ["devices", "/admin/devices"],
        ["files", "/admin/files"],
        ["announcements", "/admin/announcements"],
        ["system", "/admin/system"]
      ]
    };
    for (const [key, links] of Object.entries(destinations)) {
      const group = createGroup(document, key);
      for (const [label, href] of links) addLink(document, group.lastElementChild, label, href);
      nav.append(group);
    }
    mountMobileNavigation(nav);
    nav.addEventListener("click", (event) => {
      const button = event.target.closest("[data-workspace-toggle]");
      if (!button || !nav.contains(button)) return;
      setExpanded(
        button.closest(".workspace-nav-group"),
        button.getAttribute("aria-expanded") !== "true"
      );
    });
    nav.addEventListener("keydown", (event) => {
      const group = event.target.closest(".workspace-nav-group");
      if (!group) return;
      const button = group.querySelector(".workspace-nav-trigger");
      if (event.key === "Escape" || (event.key === "ArrowLeft" && event.target === button)) {
        event.preventDefault();
        setExpanded(group, false);
        button.focus();
      } else if (event.key === "ArrowRight" && event.target === button) {
        event.preventDefault();
        setExpanded(group, true);
        [...group.querySelectorAll("a")].find((link) => !link.hidden)?.focus();
      }
    });
  }
  const copy = labels[String(language).startsWith("zh") ? "zh" : "en"];
  nav.setAttribute("aria-label", copy.navigation);
  nav.querySelectorAll("[data-workspace-label]").forEach((node) => {
    node.textContent = copy[node.dataset.workspaceLabel];
  });
  const internal = kind === "INTERNAL" && ["ADMIN", "BUSINESS", "OVERSEA_AGENT"].includes(role);
  const business = internal && ["ADMIN", "BUSINESS", "OVERSEA_AGENT"].includes(role);
  for (const group of nav.querySelectorAll(".workspace-nav-group")) {
    const key = group.dataset.workspaceGroup;
    group.hidden =
      key === "planning"
        ? !internal
        : key === "business"
          ? !business
          : key === "admin"
            ? !(internal && role === "ADMIN")
            : false;
  }
  const agent = kind === "CUSTOMER" && partyRole === "OVERSEA_AGENT";
  const agentLink = nav.querySelector("#agent-shipments-nav-item");
  const trackingLink = nav.querySelector("#tracking-nav-item");
  if (agentLink) agentLink.hidden = !agent;
  if (trackingLink) trackingLink.hidden = agent;
  const trackingGroup = nav.querySelector('[data-workspace-group="tracking"]');
  const previousView = nav.dataset.activeWorkspaceView;
  nav.querySelectorAll("a[data-view-target]").forEach((link) => {
    const current = link.dataset.viewTarget === activeView && !link.hidden;
    link.classList.toggle("is-active", current);
    if (current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  trackingGroup.classList.add("is-current");
  if (previousView !== activeView || !nav.dataset.activeWorkspaceView)
    setExpanded(trackingGroup, true);
  nav.dataset.activeWorkspaceView = activeView;
  return nav;
}
