import { readFile } from "node:fs/promises";

const bindings = {
  P01: ["public-home", "public-mega"],
  P02: ["public-services"],
  P03: ["service-transport"],
  P04: ["service-planning"],
  P05: ["service-containers"],
  P06: ["service-booking"],
  P07: ["service-operations"],
  P08: ["service-shipments"],
  P09: ["service-customers"],
  P10: ["service-agents"],
  P11: ["service-handover"],
  P12: ["service-files"],
  P13: ["service-customerportal"],
  P14: ["service-administration"],
  W01: ["workbenches"],
  L01: ["planner-home"],
  L02: ["planner-config"],
  L03: ["planner-cargos"],
  L04: ["planner-results"],
  L05: ["planner-containers"],
  L06: ["planner-algorithm"],
  AU01: ["auth-employee"],
  AU02: ["auth-customer"],
  AU03: ["auth-customer-surface"],
  AU04: ["auth-admin"],
  B01: ["business-overview"],
  B02: ["business-customers"],
  B03: ["business-customers-detail"],
  B04: ["business-shipments"],
  B05: ["business-shipments-detail"],
  B06: ["business-agents"],
  B07: ["business-handover"],
  B08: ["business-service-catalog"],
  B09: ["business-update-schedule-preview"],
  C01: ["customer-assigned-shipments"],
  A01: ["admin-overview"],
  A02: ["admin-audit"],
  A03: ["admin-employees"],
  A04: ["admin-platform"],
  A05: ["admin-handovers"],
  A06: ["admin-tickets"],
  A07: ["admin-devices"],
  A08: ["admin-files"],
  A09: ["admin-announcements"],
  A10: ["admin-system"],
  T01: ["tracking-overview"],
  T02: ["tracking-shipments"],
  T03: ["tracking-tracking"],
  T04: ["tracking-profile"],
  T05: ["tracking-detail"],
  T06: ["tracking-embedded"],
  T07: ["tracking-cma-settings"],
  D01: ["portal-profile", "portal-password"],
  D02: ["business-profile"],
  D03: ["planner-personal", "planner-timeout"],
  D04: ["planner-container-modal"],
  D05: ["planner-cargo-modal"],
  D06: ["planner-import-manual", "planner-import-smart"],
  D07: ["planner-source-preview"],
  D08: ["planner-workspace-files"],
  D09: ["planner-recognition-review"],
  D10: ["planner-suggestion", "planner-recognition-edit"],
  D11: ["planner-result-switches", "planner-visual-options", "planner-3d-2d", "planner-report"],
  D12: ["customer-create"],
  D13: ["customer-import", "customer-credential"],
  D14: ["customer-code", "customer-reset", "customer-password-result"],
  D15: ["customer-transfer"],
  D16: ["agent-create", "agent-import"],
  D17: ["handover-dialog"],
  D18: ["shipment-create"],
  D19: ["shipment-import"],
  D20: ["shipment-batch-track", "tracking-workbench-batch-link"],
  D21: ["shipment-batch-fields"],
  D22: ["service-catalog-editor"],
  D23: ["admin-employee-edit", "admin-employee-reset", "admin-password-result"],
  D24: ["admin-announcement-editor", "admin-announcement-preview"],
  D25: ["system-announcements"],
  D26: ["admin-files-workspace", "admin-files-shipment"],
  D27: ["admin-file-preview"],
  D28: ["tracking-batch"],
  D29: ["tracking-related-files", "tracking-file-comments"],
  D30: ["tracking-file-preview"],
  D31: ["tracking-business-reference"],
  D32: ["tracking-agent-update"],
  D33: ["tracking-account-menu", "tracking-announcement"],
  D34: ["tracking-confirmations"],
  D35: ["global-wait-error"]
};

export async function applyReviewMatrix(items) {
  const source = await readFile(
    new URL("../../docs/UI_FULL_PAGE_REVIEW_PLAN.md", import.meta.url),
    "utf8"
  );
  const matrix = [];
  for (const line of source.split(/\r?\n/)) {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (!/^(?:P|W|L|AU|B|C|A|T|D)\d{2}$/.test(cells[0])) continue;
    matrix.push({
      id: cells[0],
      requirement:
        cells[0] === "D28"
          ? "根任务最终决策：旧tracking批量dialog休眠；现行批量追踪位于Vue票单工作台，由D20检查。源码存在不作为用户可达证据。"
          : cells.slice(1).join(" · "),
      itemIds: bindings[cells[0]] || []
    });
  }
  for (const item of items) {
    item.availability ||= "standard";
    item.matrix = matrix.filter((row) => row.itemIds.includes(item.id));
    item.evidenceDimensions = [
      "可达",
      "非空正常态",
      "子视图",
      "详情/弹窗",
      "角色",
      "桌面",
      "窄屏",
      "证据"
    ];
  }
  const dormant = {
    "tracking-batch":
      "旧追踪端批量dialog已休眠。正式批量能力转至Vue票单工作台；追踪标题右侧链接只负责导航，不开启旧弹窗。",
    "tracking-document-drawer":
      "旧document-drawer无标准打开调用链，休眠。现行文件入口是查询结果“票单文件”打开RelatedFilesDrawer。",
    "tracking-document-editor":
      "旧document-editor随旧文档drawer休眠，没有当前用户标准触发入口。现行上传在RelatedFilesDrawer中按权限操作。"
  };
  for (const item of items) {
    if (dormant[item.id]) {
      item.availability = "dormant";
      item.steps = dormant[item.id];
      item.prerequisite = "没有标准可达入口；不能强制DOM显示后记为验收通过。";
    }
    if (item.id === "business-update-schedule-preview") item.availability = "preview";
    if (item.id === "auth-admin") {
      item.availability = "host-state";
      item.steps =
        "先经过真实统一登录/外层权限守卫。AdminDashboard内部认证分支若被外层拦截，只记录宿主内部状态，不另造独立管理登录路由。";
    }
  }
  return {
    plan: "docs/UI_FULL_PAGE_REVIEW_PLAN.md",
    mainViews: 45,
    modalGroups: 35,
    note: "45个主视图、D01–D35条件组和检查卡片不是同一计数；源码声明、现行入口与人工验收分别记录。D28以根任务最终决策为准，旧批量dialog休眠，实际能力由D20承接。",
    rows: matrix
  };
}
