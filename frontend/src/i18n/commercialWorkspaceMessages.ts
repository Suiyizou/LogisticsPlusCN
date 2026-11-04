import { i18n, t } from "./index";

const entries = {
  overviewTrendEmpty: [
    "近七天暂无票单新增或更新可供绘图。",
    "No new or updated shipments to chart for the past seven days."
  ],
  overviewTodayEmpty: ["今日暂无业务活动可供绘图。", "No business activity to chart today."],
  overviewResourcesEmpty: [
    "当前范围暂无业务资源可供绘图。",
    "No business resources to chart in your current scope."
  ],
  overviewStatusEmpty: [
    "当前范围暂无票单状态可供绘图。",
    "No shipment statuses to chart in your current scope."
  ],
  workflowTitle: ["常用操作", "Common workflows"],
  workflowShipments: [
    "核对票单、更新货踪并处理发布。",
    "Review shipments, refresh tracking and manage publication."
  ],
  workflowCustomers: [
    "管理客户账号、代理分配和票单授权。",
    "Manage customer accounts, agent assignments and shipment access."
  ],
  workflowAgents: [
    "管理海外代理账号和关联客户。",
    "Manage overseas agent accounts and linked customers."
  ],
  customerAccounts: ["可见客户", "Visible customers"],
  activeAccounts: ["启用账号", "Active accounts"],
  awaitingAgent: ["待分配代理", "Awaiting agent"],
  awaitingAgentHint: [
    "尚未分配海外代理的启用发货人和收货人",
    "Active shippers and consignees without an overseas agent"
  ],
  directorySearchEmpty: ["未找到匹配的账号", "No matching accounts"],
  directorySearchEmptyHint: ["调整搜索条件后重试。", "Change the search criteria and try again."],
  customerEmpty: ["当前范围暂无客户", "No customers in this scope"],
  customerEmptyHint: [
    "添加单个客户或从模板批量导入。",
    "Add a customer or import accounts using the template."
  ],
  agentAccounts: ["可见海外代理", "Visible overseas agents"],
  agentWithoutCustomers: ["待关联客户", "Awaiting customer links"],
  agentWithoutCustomersHint: [
    "尚未关联客户的启用海外代理",
    "Active overseas agents with no linked customers"
  ],
  agentSearch: ["按姓名或账号搜索", "Search by name or username"],
  anyStatus: ["全部状态", "All statuses"],
  agentEmpty: ["暂无海外代理", "No overseas agents yet"],
  agentEmptyHint: [
    "创建代理账号后，可在客户目录中分配代理。",
    "Create an agent account, then assign customers from the directory."
  ],
  catalogMatches: ["匹配的服务", "Matching services"],
  catalogEnabled: ["本页启用", "Enabled on this page"],
  catalogDisabled: ["本页停用", "Disabled on this page"],
  catalogEmpty: ["暂无服务项目", "No services yet"],
  catalogEmptyHint: [
    "创建服务后，可维护其代码、说明和启用状态。",
    "Create a service to manage its code, description and availability."
  ],
  catalogSearchEmpty: ["未找到匹配的服务", "No matching services"],
  catalogSearchHint: ["按服务代码或名称搜索。", "Search by service code or name."],
  clearSearch: ["清除搜索", "Clear search"],
  customerShipmentsKicker: ["已发布票单", "Published shipments"],
  shipmentTotal: ["全部已发布", "Published shipments"],
  unfinishedTotal: ["运输未完成", "Unfinished shipments"],
  shipmentResults: [
    "显示第 {first}–{last} 票，共 {total} 票",
    "Showing {first}–{last} of {total} shipments"
  ],
  shipmentAll: ["全部票单", "All shipments"],
  shipmentUnfinished: ["未完成", "Unfinished"],
  shipmentSort: ["排序", "Sort order"],
  shipmentAssignedAt: ["分配于", "Assigned"],
  shipmentSortAssigned: ["最近分配", "Recently assigned"],
  shipmentSortEtaAsc: ["到达时间从早到晚", "Earliest arrival first"],
  shipmentSortEtaDesc: ["到达时间从晚到早", "Latest arrival first"],
  shipmentNoStatus: ["暂无运输状态", "Tracking status unavailable"],
  shipmentEmptyHint: [
    "票单发布给本企业后会显示在这里。",
    "Shipments appear here once they are published to your company."
  ],
  shipmentEmptyFilter: ["当前筛选范围内暂无票单", "No shipments match this filter"],
  shipmentEmptyFilterHint: [
    "切换到全部票单可查看已发布的记录。",
    "Switch to all shipments to see the published records."
  ],
  shipmentLoadError: ["无法加载票单", "Shipments could not be loaded"],
  retry: ["重试", "Retry"],
  jobNumber: ["货代单号", "Forwarder job number"],
  poNumber: ["客户采购单号", "Customer purchase order"]
};
for (const [index, locale] of (["zh-CN", "en-US"] as const).entries()) {
  const messages = Object.fromEntries(
    Object.entries(entries).map(([key, labels]) => [key, labels[index]])
  );
  i18n.global.mergeLocaleMessage(locale, { commercialWorkspace: messages });
}
export function commercialText(key: keyof typeof entries, values?: Record<string, number>) {
  return t("commercialWorkspace." + key, values);
}
