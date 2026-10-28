import { readdir, readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { configuredPlatformModules } from "../../frontend/src/modules/configuredRegistry.js";
import { platformModuleCatalog } from "../../frontend/src/modules/registry.js";
import { publicServices } from "../../frontend/src/public/serviceCatalog.js";
import { getPublicCopy } from "../../frontend/src/i18n/publicSiteMessages.js";
import { rawAdminPages } from "../../frontend/src/modules/admin/definitions.js";
import { manualChecks } from "./checks.mjs";
import { applyReviewMatrix } from "./reviewMatrix.mjs";

export const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
export const hubDirectory = fileURLToPath(new URL("./", import.meta.url));
export const designDirectory = resolve(root, "output/ui-full-design-20261028");
export const roles = [
  "PUBLIC",
  "ADMIN",
  "BUSINESS",
  "OVERSEA_AGENT",
  "EMPLOYEE",
  "CUSTOMER",
  "CUSTOMER_AGENT"
];
const hostSources = {
  public: "frontend/src/components/PublicLandingPage.vue",
  planner: "frontend/src/App.vue",
  auth: "frontend/src/components/LoginPage.vue",
  workspace: "frontend/src/components/WorkbenchPortal.vue"
};
const moduleSources = {
  overview: "frontend/src/modules/overview/pages/BusinessOverviewPage.vue",
  "update-schedule-preview":
    "frontend/src/modules/update-schedule-preview/pages/UpdateSchedulePreviewPage.vue",
  customers: "frontend/src/modules/customers/pages/CustomerWorkspacePage.vue",
  shipments: "frontend/src/modules/shipments/pages/ShipmentWorkspacePage.vue",
  agents: "frontend/src/modules/agents/pages/AgentDirectoryPage.vue",
  handover: "frontend/src/modules/handover/pages/CustomerHandoverPage.vue",
  "service-catalog": "frontend/src/modules/service-catalog/pages/ServiceCatalogPage.vue",
  "customer-shipments": "frontend/src/modules/customer-space/CustomerShipmentsPage.vue"
};
const businessNames = {
  overview: "业务概览",
  "update-schedule-preview": "定时更新 · 设计预览",
  customers: "客户目录",
  shipments: "票单管理",
  agents: "海外代理",
  handover: "业务交接",
  "service-catalog": "服务目录管理",
  "customer-shipments": "客户绑定票单"
};

function page(id, group, name, path, roleList, source, extra = {}) {
  return {
    id,
    group,
    name,
    path,
    roles: roleList,
    source,
    kind: "page",
    steps: "打开页面后检查标题、内容、下拉、空态、分页及适用操作。",
    ...extra
  };
}

export async function createCatalog() {
  const staff = ["ADMIN", "BUSINESS", "OVERSEA_AGENT", "EMPLOYEE"];
  const items = [
    page("public-home", "public", "官网首页", "/", ["PUBLIC"], hostSources.public, {
      steps: "检查首屏、船司/单号类型下拉、查询入口、服务分区、页脚及语言切换。"
    }),
    page(
      "public-services",
      "public",
      "全部服务",
      "/services",
      ["PUBLIC"],
      "frontend/src/components/public/ServiceIndexPage.vue"
    ),
    ...publicServices.map((service) =>
      page(
        "service-" + service.id,
        "public",
        getPublicCopy("zh-CN").services[service.id].title,
        service.detailPath,
        ["PUBLIC"],
        "frontend/src/components/public/ServiceDetailPage.vue",
        { steps: "检查该服务的介绍结构、步骤、相关服务及实际业务入口；业务入口仍按账号权限登录。" }
      )
    ),
    page("auth-employee", "auth", "员工登录门禁", "/workbenches", ["PUBLIC"], hostSources.auth, {
      kind: "state",
      steps: "未登录窗口打开此入口 → 员工登录。已登录时直接显示工作台；索引不会清理会话。"
    }),
    page(
      "auth-customer",
      "auth",
      "统一登录 · 客户方式",
      "/workbenches",
      ["PUBLIC"],
      hostSources.auth,
      {
        kind: "tab",
        steps: "未登录窗口 → 登录卡片顶部切换客户方式，检查账号、密码、客户代码和错误提示。"
      }
    ),
    page(
      "auth-customer-surface",
      "auth",
      "客户专属登录门禁",
      "/customer-workspace/shipments",
      ["PUBLIC", "CUSTOMER"],
      "frontend/src/modules/customer-space/CustomerSurfaceHost.vue",
      { kind: "state", steps: "无客户会话时显示客户专属登录；有会话时显示绑定票单，不会绕过鉴权。" }
    ),
    page(
      "auth-admin",
      "auth",
      "管理后台权限门禁",
      "/admin/overview",
      ["ADMIN"],
      "frontend/src/features/admin/AdminLoginPage.vue",
      {
        kind: "state",
        steps:
          "先经过Operations员工登录；检查管理员可进入、其他员工按权限返回。独立AdminLoginPage仅在后台主机无管理员会话状态下显示。"
      }
    ),
    page("workbenches", "workspace", "工作台入口", "/workbenches", staff, hostSources.workspace, {
      steps: "按当前员工角色显示可用工具；代理按原有入口规则进入其业务范围。"
    }),
    ...[
      ["home", "/home", "装箱工作台首页"],
      ["config", "/planner/config", "装箱配置与货物"],
      ["cargos", "/planner/cargos", "货物管理"],
      ["results", "/planner/results", "计算方案与3D结果"],
      ["containers", "/containers", "箱型资料"],
      ["algorithm", "/algorithm", "算法说明"]
    ].map(([id, path, name]) =>
      page("planner-" + id, "planner", name, path, staff, hostSources.planner, {
        prerequisite:
          id === "results"
            ? "有效货物、箱型及实际计算结果；无结果时检查真实空态。"
            : "有效员工会话。"
      })
    ),
    ...[
      ["/planner", "/planner/config"],
      ["/operations", "/workbenches"],
      ["/excel", "/planner/cargos"],
      ["/smart-import", "/planner/cargos"]
    ].map(([path, destination]) =>
      page(
        "alias-" + path.slice(1),
        "compatibility",
        path + " 兼容跳转",
        path,
        staff,
        "frontend/src/modules/routes.js",
        {
          kind: "compatibility",
          steps: "验证原有入口跳至 " + destination + "，不应新增另一套页面。"
        }
      )
    ),
    ...[
      ["overview", "历史票单总览", ["PUBLIC", ...staff, "CUSTOMER"]],
      ["shipments", "兼容代理客户票单工作区", ["CUSTOMER_AGENT"]],
      ["tracking", "单票运输查询", ["PUBLIC", ...staff, "CUSTOMER"]],
      ["profile", "客户个人资料", ["CUSTOMER"]]
    ].map(([id, name, roleList]) =>
      page(
        "tracking-" + id,
        "tracking",
        name,
        "/tracking/#" + id,
        roleList,
        "tracking-service/public/index.html",
        {
          steps:
            id === "shipments"
              ? "仅CUSTOMER会话且partyRole=OVERSEA_AGENT可用；内部OVERSEA_AGENT员工并非此身份，不能据其登录断言该页可用。"
              : "检查该hash视图的真实角色/数据范围；不适用的视图由现有页面正常回退。",
          prerequisite:
            id === "profile"
              ? "真实客户会话。"
              : id === "shipments"
                ? "CUSTOMER_AGENT_A：CUSTOMER会话 + partyRole=OVERSEA_AGENT + 已授权票单。"
                : "查询或列表有记录时再查看详情。"
        }
      )
    ),
    page(
      "tracking-detail",
      "tracking",
      "真实单票查询结果",
      "/tracking/#overview",
      ["PUBLIC", ...staff, "CUSTOMER"],
      "tracking-service/public/app.js",
      {
        kind: "detail",
        prerequisite:
          "SHIPMENT_A：当前账号历史列表中可见、有快照的真实票单；优先从历史打开，避免为截图发起外部重查。",
        steps:
          "从历史/代理客户列表点击真实票单打开快照，检查指标、航线节点、运输分段、箱明细、引用信息和原始响应。代理客户必须沿列表进入，不能粘贴#tracking绕过详情门控。"
      }
    )
  ];
  for (const module of configuredPlatformModules) {
    if (module.enabled === false) continue;
    const surface = module.surface || "business";
    const group = surface === "business" ? "business" : surface;
    const prefix = { business: "/customers", admin: "/admin", customer: "/customer-workspace" }[
      surface
    ];
    for (const entry of module.pages) {
      const record =
        entry.selection === "customerId"
          ? "customer"
          : entry.selection === "shipmentId"
            ? "shipment"
            : null;
      const adminPage = rawAdminPages.find((candidate) => "admin-" + candidate.key === module.id);
      const source =
        moduleSources[module.id] ||
        (adminPage
          ? "frontend/src/features/admin/" +
            platformModuleCatalog.views[entry.view].toString().match(/Admin[^"']+\.vue/)?.[0]
          : "frontend/src/modules/examples/customer-summary/pages/CustomerSummaryExamplePage.vue");
      const path = [prefix, module.mount, entry.path].filter(Boolean).join("/");
      items.push(
        page(
          entry.name,
          group,
          (adminPage?.label || businessNames[module.id] || module.id) + (record ? " · 详情" : ""),
          path,
          module.roles,
          source,
          {
            kind: record ? "detail" : "page",
            record,
            moduleId: module.id,
            routeName: entry.name,
            listPath: [prefix, module.mount].join("/"),
            ...(module.id === "shipments" && !record
              ? {
                  steps:
                    "票单列表核对主业务号、承运人、客户、真实状态、最近追踪与分页；每行展开查看完整绑定用户/备注/类型，查看和编辑直接进入，更多菜单含原更新/删除。检查两行选择、取消选择及批量操作；键盘/手机保留表内横滚，操作会按原业务规则执行。"
                }
              : {}),
            prerequisite: record
              ? "使用当前账号有权限查看的真实" +
                (record === "customer" ? "客户" : "票单") +
                "记录。"
              : module.id === "update-schedule-preview"
                ? "此页明确为设计预览，不表示后台调度已运行。"
                : "按注册角色与真实数据范围访问。"
          }
        )
      );
    }
  }
  items.push(...manualChecks);
  for (const module of configuredPlatformModules.filter(
    (entry) =>
      entry.enabled !== false &&
      (entry.surface || "business") === "business" &&
      !["overview", "customers", "shipments"].includes(entry.id)
  )) {
    items.push(
      page(
        "legacy-query-" + module.id,
        "compatibility",
        "旧 query · " + (businessNames[module.id] || module.id),
        "/customers?section=" + module.id,
        module.roles,
        "frontend/src/features/navigation/businessNavigation.js",
        {
          kind: "compatibility",
          steps: "验证当前已启用模块的旧section链接仍按真实角色选择对应页面。"
        }
      )
    );
  }
  const matrix = await applyReviewMatrix(items);
  return {
    generatedAt: new Date().toISOString(),
    roles,
    matrix,
    items,
    disabledModules: configuredPlatformModules
      .filter((module) => module.enabled === false)
      .map((module) => ({ id: module.id, reason: "当前注册已禁用，不提供伪造可用入口。" })),
    groups: {
      public: "公开网站",
      auth: "登录与权限",
      workspace: "通用工作台",
      business: "业务工作台",
      admin: "管理后台",
      customer: "客户空间",
      planner: "装箱规划",
      tracking: "运输追踪",
      compatibility: "兼容与旧链接"
    }
  };
}

export async function scanModalSources() {
  const result = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith(".vue")) {
        const source = await readFile(path, "utf8");
        const count = [...source.matchAll(/<el-dialog\b|role="dialog"|<el-drawer\b/g)].length;
        if (count) result.push({ source: relative(root, path).replaceAll("\\", "/"), count });
      }
    }
  }
  await walk(resolve(root, "frontend/src"));
  return result;
}
