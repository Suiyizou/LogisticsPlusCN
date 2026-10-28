const managers = ["ADMIN", "BUSINESS"];
const business = [...managers, "OVERSEA_AGENT"];
const staff = [...business, "EMPLOYEE"];
const all = ["PUBLIC", ...staff, "CUSTOMER"];
function check(id, group, name, path, roles, source, steps, extra = {}) {
  return { id, group, name, path, roles, source, steps, kind: "modal", ...extra };
}
const c = "frontend/src/modules/customers/components/";
const a = "frontend/src/features/admin/";
const p = "frontend/src/components/";
const tracking = "tracking-service/public/index.html";

export const manualChecks = [
  check(
    "public-mega",
    "public",
    "服务 mega 导航",
    "/",
    ["PUBLIC"],
    p + "public/PublicMegaMenu.vue",
    "桌面导航“服务”：悬停、点击、Tab聚焦 → 三列服务与右侧联动卡；Escape返回。手机菜单展开各组再进入详情。",
    { kind: "panel" }
  ),
  check(
    "portal-profile",
    "workspace",
    "个人信息弹窗",
    "/workbenches",
    business,
    p + "WorkbenchPortal.vue",
    "右上账号下拉 → 个人信息；检查表单、取消、关闭、焦点返回。"
  ),
  check(
    "portal-password",
    "workspace",
    "修改密码弹窗",
    "/workbenches",
    business,
    p + "WorkbenchPortal.vue",
    "右上账号下拉 → 修改密码；检查规则和取消。提交会真实修改密码。"
  ),
  check(
    "system-announcements",
    "workspace",
    "系统公告弹窗",
    "/workbenches",
    business,
    p + "SystemAnnouncementDialog.vue",
    "顶部“系统消息”打开公告。无公告时检查真实空态；标记已读会真实保存。"
  ),
  check(
    "business-profile",
    "business",
    "个人资料与密码",
    "/customers/directory",
    business,
    "frontend/src/features/account/PersonalProfileDialog.vue",
    "左侧栏底部个人卡片 → 个人信息弹窗，分别检查资料和密码两个区块。"
  ),
  check(
    "customer-detail-binding",
    "business",
    "客户详情 · 票单绑定方式",
    "/customers/directory/:customerId",
    managers,
    "frontend/src/modules/customers/pages/CustomerDetailPage.vue",
    "详情下半区绑定票单：按参考号/按票单ID切换，检查船司、类型、候选、草稿/已发布、批量发布及解绑入口；发布/解绑须人工确认。",
    {
      kind: "tab",
      record: "customer",
      listPath: "/customers/directory",
      prerequisite: "真实客户记录及其可绑定/已绑定票单。"
    }
  ),
  check(
    "shipment-detail-binding",
    "business",
    "票单详情 · 客户可见范围",
    "/customers/shipments/:shipmentId",
    managers,
    "frontend/src/modules/shipments/pages/ShipmentDetailPage.vue",
    "详情业务字段下方 → 客户复选列表、批量绑定、已绑定客户及解绑确认；保存/手动快照是实际变更。",
    {
      kind: "panel",
      record: "shipment",
      listPath: "/customers/shipments",
      prerequisite: "真实可管理票单。"
    }
  ),
  check(
    "business-refresh-overlay",
    "business",
    "单票更新等待与结果反馈",
    "/customers/shipments",
    business,
    p + "BusinessCustomerPage.vue",
    "真实票单行“更多 → 更新”，或详情“从船司刷新” → 等待层、可取消、成功/失败反馈；此操作实际查询船司。",
    { prerequisite: "可更新的真实票单，不人为构造更新状态。" }
  ),
  check(
    "customer-create",
    "business",
    "创建客户",
    "/customers/directory",
    managers,
    c + "CustomerFormDialog.vue",
    "列表标题右侧“创建客户”；填写表单前检查初始样式，取消不会创建记录。"
  ),
  check(
    "customer-import",
    "business",
    "客户批量导入",
    "/customers/directory",
    managers,
    c + "CustomerImportDialog.vue",
    "列表标题右侧“批量导入” → 文件选择、字段/校验预览、结果；导入需真实文件，最终提交会写入。"
  ),
  check(
    "customer-credential",
    "business",
    "客户登录资料编辑",
    "/customers/directory",
    managers,
    c + "CustomerCredentialDialog.vue",
    "真实客户行“编辑” → 登录账号等资料；检查取消与验证。",
    { prerequisite: "真实客户记录。" }
  ),
  check(
    "customer-code",
    "business",
    "客户代码修改",
    "/customers/directory/:customerId",
    managers,
    c + "CustomerClientCodeDialog.vue",
    "客户详情 → 客户代码旁编辑按钮。",
    { record: "customer", listPath: "/customers/directory", prerequisite: "可管理的真实客户详情。" }
  ),
  check(
    "customer-reset",
    "business",
    "重置客户密码",
    "/customers/directory",
    managers,
    c + "CustomerPasswordDialog.vue",
    "真实客户行“重置密码”，或详情顶部重置按钮 → 确认弹窗。最终确认会真实变更密码。"
  ),
  check(
    "customer-password-result",
    "business",
    "客户密码结果",
    "/customers/directory",
    managers,
    c + "PasswordResultDialog.vue",
    "创建/重置真实测试客户成功后显示一次性凭据结果；仅在获准操作的测试记录上检查，不伪造结果。",
    { prerequisite: "一次实际成功的测试客户创建/密码重置操作。" }
  ),
  check(
    "customer-transfer",
    "business",
    "客户转移弹窗",
    "/customers/directory",
    managers,
    "frontend/src/modules/handover/components/CustomerTransferDialog.vue",
    "真实客户行“转移”，或勾选客户后的批量转移 → 接收人选择及范围；确认会真实转移。"
  ),
  check(
    "handover-dialog",
    "business",
    "业务交接申请弹窗",
    "/customers/handover",
    managers,
    "frontend/src/modules/handover/components/BusinessHandoverDialog.vue",
    "业务交接页可交接对象行“交接” → 接收人、客户范围及原因；代理角色看到的转移/只读范围按现有权限。"
  ),
  check(
    "agent-create",
    "business",
    "创建海外代理",
    "/customers/agents",
    managers,
    "frontend/src/modules/agents/components/AgentCreateDialog.vue",
    "页头“新增代理” → 基本资料与账号字段。"
  ),
  check(
    "agent-import",
    "business",
    "海外代理批量导入",
    "/customers/agents",
    managers,
    "frontend/src/modules/agents/components/AgentImportDialog.vue",
    "页头“批量导入” → 文件、列映射、校验、导入结果；提交会真实写入。"
  ),
  check(
    "shipment-create",
    "business",
    "手动创建票单",
    "/customers/shipments",
    managers,
    "frontend/src/features/shipments/ManualShipmentCreateDialog.vue",
    "页头“新建票单” → 业务、港口/节点、箱型、运输分段、集装箱等全部字段区块。"
  ),
  check(
    "shipment-import",
    "business",
    "票单 Excel 导入",
    "/customers/shipments",
    business,
    "frontend/src/features/shipments/ManualShipmentImportDialog.vue",
    "页头“Excel导入” → 模板下载、文件选择、预览、校验与结果下载。账号是否可写由现有流程决定。"
  ),
  check(
    "shipment-batch-fields",
    "business",
    "批量业务字段弹窗",
    "/customers/shipments",
    managers,
    "frontend/src/modules/shipments/pages/ShipmentListWorkspacePage.vue",
    "勾选真实票单 → 列表上方选择栏“批量编辑业务字段”；检查工作号、PO、客户简称列。",
    { prerequisite: "至少一条可管理的真实票单被选中。" }
  ),
  check(
    "shipment-batch-track",
    "business",
    "批量追踪与任务结果弹窗",
    "/customers/shipments",
    business,
    "frontend/src/modules/shipments/pages/ShipmentListWorkspacePage.vue",
    "页头“批量追踪” → 客户、船司、类型、单号与结果；一键更新/更新选中也产生实际任务进度，不能用假进度替代。"
  ),
  check(
    "service-catalog-editor",
    "business",
    "服务目录新增/编辑",
    "/customers/service-catalog",
    managers,
    "frontend/src/modules/service-catalog/pages/ServiceCatalogPage.vue",
    "页头新增，或已有服务行编辑 → 同一表单两种状态；提交会真实保存。"
  ),
  check(
    "admin-employee-edit",
    "admin",
    "员工新增与编辑弹窗",
    "/admin/employees",
    ["ADMIN"],
    a + "AdminEmployeeDialogs.vue",
    "页头新增员工、真实员工行编辑 → 分别检查新建/编辑两种表单。"
  ),
  check(
    "admin-employee-reset",
    "admin",
    "员工重置密码确认",
    "/admin/employees",
    ["ADMIN"],
    a + "AdminEmployeeDialogs.vue",
    "真实测试员工行“重置密码” → 确认弹窗；当前本人通常禁用。确认会真实重置。"
  ),
  check(
    "admin-password-result",
    "admin",
    "员工临时密码结果",
    "/admin/employees",
    ["ADMIN"],
    a + "AdminEmployeeDialogs.vue",
    "实际新增或重置测试员工成功后出现结果/复制凭据弹窗；不为视觉检查重置生产账号。",
    { prerequisite: "获准的一次真实测试账号变更。" }
  ),
  check(
    "admin-files-workspace",
    "admin",
    "文件 · 工作区文件标签",
    "/admin/files",
    ["ADMIN"],
    a + "AdminFilesPage.vue",
    "页头标签切换至工作区文件 → 过期筛选、文件列表、下载和分页。此标签是页内状态，没有伪造query参数。",
    { kind: "tab" }
  ),
  check(
    "admin-files-shipment",
    "admin",
    "文件 · 票单文件标签",
    "/admin/files",
    ["ADMIN"],
    a + "AdminFilesPage.vue",
    "页头标签切换至票单文件 → 预览、下载、删除状态及分页。",
    { kind: "tab" }
  ),
  check(
    "admin-file-preview",
    "admin",
    "票单文件预览弹窗",
    "/admin/files",
    ["ADMIN"],
    a + "AdminFilePreviewDialog.vue",
    "票单文件标签 → 可预览文件行“预览”；PDF检查本地canvas、页码/上一页/下一页、适宽resize、既有盖章/填写外观、加载/密码/损坏/失败与下载；仅成功绘制后标预览就绪，关闭/切文件不能被旧响应回填。其它格式沿原分支检查。",
    { prerequisite: "真实文件记录及对应访问权限。" }
  ),
  check(
    "admin-announcement-editor",
    "admin",
    "公告新增/编辑弹窗",
    "/admin/announcements",
    ["ADMIN"],
    a + "AdminAnnouncementDialogs.vue",
    "新增公告或已有公告行编辑 → 标题、日期/受众、封面、富文本工具、正文预览；发布会真实通知。"
  ),
  check(
    "admin-announcement-preview",
    "admin",
    "公告预览弹窗",
    "/admin/announcements",
    ["ADMIN"],
    a + "AdminAnnouncementDialogs.vue",
    "已有公告行“预览” → 正文、封面、可见范围及关闭。",
    { prerequisite: "已有公告记录。" }
  ),
  check(
    "admin-llm",
    "admin",
    "系统管理 · 模型配置区",
    "/admin/system",
    ["ADMIN"],
    a + "AdminLlmSettingsPanel.vue",
    "系统管理页中部模型配置：检查已保存摘要、未保存状态、密码式密钥输入。不要为视觉检查保存未知服务地址或密钥。",
    { kind: "panel" }
  ),
  check(
    "planner-import-manual",
    "planner",
    "货物导入 · 快速导入标签",
    "/planner/cargos",
    staff,
    p + "ExcelTemplatePage.vue",
    "货物管理“导入/智能导入”展开 → 快速导入标签；检查文件拖放、预览、映射、校验。",
    { kind: "tab" }
  ),
  check(
    "planner-import-smart",
    "planner",
    "货物导入 · 智能识别标签",
    "/planner/cargos",
    staff,
    p + "ExcelTemplatePage.vue",
    "展开导入区 → 智能识别标签；依赖真实识别服务与文件，失败时检查实际反馈。",
    { kind: "tab" }
  ),
  check(
    "planner-source-preview",
    "planner",
    "原始工作簿在线预览",
    "/planner/cargos",
    staff,
    p + "ExcelTemplatePage.vue",
    "导入区选择真实工作簿 → “预览工作簿”；检查工作表切换、数据表、下载原文件。",
    { prerequisite: "已选真实工作簿。" }
  ),
  check(
    "planner-workspace-files",
    "planner",
    "工作区文件弹窗",
    "/planner/cargos",
    staff,
    p + "ExcelTemplatePage.vue",
    "导入区“工作区文件” → 按日期分组、预览、用于快速/智能导入、过期信息。"
  ),
  check(
    "planner-recognition-review",
    "planner",
    "智能识别复核弹窗",
    "/planner/cargos",
    staff,
    p + "ExcelTemplatePage.vue",
    "真实智能识别完成 → 复核结果；检查问题摘要、托盘尺寸缺项、各货物复核入口。",
    { prerequisite: "真实识别结果。" }
  ),
  check(
    "planner-suggestion",
    "planner",
    "标准货物建议弹窗",
    "/planner/cargos",
    staff,
    p + "ExcelTemplatePage.vue",
    "快速导入预览有建议/无效行 → 行内“建议标准货物”；检查尺寸、数量、包装、约束字段。",
    { prerequisite: "包含建议的真实导入预览。" }
  ),
  check(
    "planner-recognition-edit",
    "planner",
    "识别货物编辑弹窗",
    "/planner/cargos",
    staff,
    p + "ExcelTemplatePage.vue",
    "识别结果/复核结果行编辑 → 修改货物草稿；应用会改变当前导入草稿。",
    { prerequisite: "真实识别货物。" }
  ),
  check(
    "planner-cargo-modal",
    "planner",
    "添加/编辑货物弹窗",
    "/planner/cargos",
    staff,
    p + "CargoModal.vue",
    "货物列表“添加货物”，或已有货物行编辑；分别检查常规与托盘字段、堆叠/朝向约束。"
  ),
  check(
    "planner-container-modal",
    "planner",
    "添加/编辑箱型弹窗",
    "/planner/config",
    staff,
    p + "ContainerModal.vue",
    "箱型区域“添加箱型”，或自定义箱型行编辑；检查尺寸、载重及开门方向。"
  ),
  check(
    "planner-result-switches",
    "planner",
    "结果 · 候选箱型与箱序号",
    "/planner/results",
    staff,
    "frontend/src/App.vue",
    "完成实际计算后，切换候选方案卡与箱序号；检查状态、利用率、重量、剩余货物及选中区分。",
    { kind: "tab", prerequisite: "真实计算结果；多个候选/多箱时检查对应切换。" }
  ),
  check(
    "planner-3d-2d",
    "planner",
    "结果 · 3D/2D与方向视图",
    "/planner/results",
    staff,
    p + "ContainerScene.vue",
    "可视化工具栏3D/2D切换、正面/侧面/顶面/等轴、复位和全屏；检查3D交互、2D投影、货物hover与图例。",
    { kind: "tab", prerequisite: "真实有放置明细的计算结果。" }
  ),
  check(
    "planner-visual-options",
    "planner",
    "结果 · 显示选项与剖切",
    "/planner/results",
    staff,
    p + "ContainerScene.vue",
    "可视化右上“显示选项”popover → 标签、剩余空间、重心、网格、外壳、透明、热力及坐标轴；剖切开关 → XYZ方向和滑杆；图例可隐藏SKU。",
    { kind: "panel", prerequisite: "真实有放置明细的计算结果。" }
  ),
  check(
    "planner-report",
    "planner",
    "结果 · 图片/PDF/报告导出",
    "/planner/results",
    staff,
    p + "ContainerScene.vue",
    "可视化底部导出图片、PDF、剩余空间报告、全部箱报告ZIP及打印；这些是实际文件输出，空结果时应正确禁用。",
    { kind: "panel", prerequisite: "满足导出要求的真实计算方案。" }
  ),
  check(
    "planner-equipment-filters",
    "planner",
    "箱型资料 · 类型筛选",
    "/containers",
    staff,
    p + "ContainerReferencePage.vue",
    "箱型资料页上方筛选按钮 → 全部/常用/其他实际分组；检查长名称、规格单位及窄屏表格。",
    { kind: "tab" }
  ),
  check(
    "planner-personal",
    "planner",
    "装箱个人中心弹层",
    "/planner/config",
    staff,
    "frontend/src/App.vue",
    "右上当前用户按钮 → 个人中心、会话资料及工具链接。"
  ),
  check(
    "planner-timeout",
    "planner",
    "装箱超时与部分结果弹窗",
    "/planner/results",
    staff,
    "frontend/src/App.vue",
    "仅在实际大任务触发超时时出现；检查部分结果、取消/继续等实际选项，不注入超时状态。",
    { prerequisite: "实际触发计算超时；常规走查可标记条件未满足。" }
  ),
  check(
    "tracking-batch",
    "tracking",
    "旧批量追踪工作区 · 休眠UI",
    "/tracking/#tracking",
    all,
    tracking,
    "旧tracking批量dialog休眠；现行批量追踪位于Vue票单工作台，不通过测试后门强制打开旧弹窗。",
    { prerequisite: "没有现行标准打开入口，不计可达。" }
  ),
  check(
    "tracking-related-files",
    "tracking",
    "票单关联文件侧栏",
    "/tracking/#tracking",
    all,
    tracking,
    "先沿真实历史/授权列表打开结果 → 结果“票单文件”按钮 → RelatedFilesDrawer；按权限查看文件/分类/角色/目标客户，文件行“更多”查看权限与删除，检查菜单键盘/Escape/外点及上传区。未登录时显示实际登录提示。不假设历史列表有“文件”行按钮。",
    { prerequisite: "真实票单记录，读写范围由服务端决定。" }
  ),
  check(
    "tracking-file-comments",
    "tracking",
    "文件评论区",
    "/tracking/#tracking",
    [...business, "CUSTOMER"],
    tracking,
    "真实结果“票单文件” → RelatedFilesDrawer → 真实文件的评论区；检查已有评论/空态与真实发送反馈。",
    { kind: "panel", prerequisite: "可访问的真实文件。" }
  ),
  check(
    "tracking-document-drawer",
    "tracking",
    "旧文档详情侧栏 · 休眠UI",
    "/tracking/#tracking",
    all,
    tracking,
    "旧document drawer没有当前标准打开链；现行结果“票单文件”打开RelatedFilesDrawer。",
    { prerequisite: "旧UI休眠，不计用户可达。" }
  ),
  check(
    "tracking-document-editor",
    "tracking",
    "旧文档编辑弹窗 · 休眠UI",
    "/tracking/#tracking",
    business,
    tracking,
    "旧document editor随旧drawer休眠；现行上传在RelatedFilesDrawer内按权限操作。",
    { prerequisite: "旧UI休眠，不计用户可达。" }
  ),
  check(
    "tracking-file-preview",
    "tracking",
    "文件预览弹窗",
    "/tracking/#tracking",
    all,
    tracking,
    "真实结果“票单文件” → RelatedFilesDrawer文件行预览 → 文件预览及下载；PDF检查本地canvas、中英文/扫描多页、页码切换、适宽resize/390px、既有盖章/填写字段外观、密码/损坏/worker失败、关闭回焦与canvas销毁；关闭/新文件/会话失效后旧响应不得回填。未成功绘制不能记为通过。其它格式沿原分支检查，不支持格式的真实降级另记。历史附件只有元数据、没有原文件时标缺文件。",
    { prerequisite: "真实可访问文件。" }
  ),
  check(
    "tracking-business-reference",
    "tracking",
    "业务参考字段编辑弹窗",
    "/tracking/#tracking",
    business,
    tracking,
    "真实结果 → 业务参考信息编辑 → 客户简称、PO、工作号；此处沿用浏览器补充记录语义，不据保存外观宣称服务器已经写入。",
    { prerequisite: "可写的真实票单查询结果。" }
  ),
  check(
    "tracking-announcement",
    "tracking",
    "追踪端系统公告弹窗",
    "/tracking/#overview",
    [...business, "CUSTOMER"],
    tracking,
    "页面顶部系统消息按钮 → 公告正文、关闭、确认已读。"
  ),
  check(
    "tracking-agent-update",
    "tracking",
    "代理批量更新任务弹窗",
    "/tracking/#shipments",
    ["CUSTOMER_AGENT"],
    tracking,
    "兼容代理客户的票单工作区勾选真实票单 → 更新确认 → 任务进度/逐项结果；不是内部OVERSEA_AGENT员工页面。",
    { prerequisite: "CUSTOMER会话且partyRole=OVERSEA_AGENT、有授权可更新票单；操作实际查询船司。" }
  ),
  check(
    "tracking-workbench-batch-link",
    "tracking",
    "员工批量追踪 · 前往Vue工作台",
    "/customers/shipments",
    managers,
    tracking,
    "tracking标题右侧“前往工作台批量追踪”链接#batch-workspace-trigger（仅内部ADMIN/BUSINESS可见）→ 同源/customers/shipments → 点击页头既有“批量追踪”。这里不打开旧tracking dialog。",
    { kind: "panel" }
  ),
  check(
    "tracking-embedded",
    "tracking",
    "真实查询 · 嵌入模式",
    "/tracking/?embed=1#tracking",
    all,
    tracking,
    "使用本地manifest的真实船司/类型/单号进行查询，检查embed壳、返回和窄屏。已授权代理客户仍应先沿其列表进入结果，不绕过详情门控。",
    {
      kind: "state",
      record: "tracking",
      prerequisite: "真实参考号及允许该查询的会话；可能触发外部船司查询，不用占位号。"
    }
  ),
  check(
    "tracking-cma-settings",
    "tracking",
    "CMA · 通道维护区域",
    "/tracking/#tracking",
    managers,
    tracking,
    "按现有维护权限打开CMA状态/设置区域，检查Cookie/UA与清理确认；普通客户和访客隐藏。密钥、Cookie不截入证据。",
    { kind: "panel", prerequisite: "具有现有维护权限的内部账号；控件不存在时如实记录。" }
  ),
  check(
    "tracking-account-menu",
    "tracking",
    "追踪账号菜单与角色入口",
    "/tracking/#overview",
    all,
    tracking,
    "实际登录后用键盘展开账号菜单、Escape关闭和焦点恢复，核对内部员工/普通客户/兼容代理客户的真实入口差异。",
    { kind: "panel" }
  ),
  check(
    "tracking-confirmations",
    "tracking",
    "追踪写入操作确认",
    "/tracking/#tracking",
    all,
    tracking,
    "在有权限的隔离样本上查看CMA清理、文件删除、队列清空等现有确认；先取消核对无写入，只有获准的样本才实际确认。休眠批量队列不可强制显示当作可达证据。",
    { kind: "state", prerequisite: "对应现行操作及真实隔离样本。" }
  ),
  check(
    "global-wait-error",
    "workspace",
    "真实等待 / API失败 / 页面重试",
    "/workbenches",
    all,
    p + "AsyncPageError.vue",
    "在真实请求/导航发生时检查SystemWaitOverlay、GlobalApiErrorNotice和AsyncPageError。资源失败重试保留完整URL并真正重载；人工受控失败证据与正常态分开，不注入假业务数据。",
    { kind: "state", prerequisite: "相应真实或受控网络/资源失败条件。" }
  ),
  check(
    "legacy-query-overview",
    "compatibility",
    "旧 query · 业务概览",
    "/customers?section=overview",
    managers,
    "frontend/src/features/navigation/businessNavigation.js",
    "验证旧section入口仍选择业务概览。",
    { kind: "compatibility" }
  ),
  check(
    "legacy-query-customers",
    "compatibility",
    "旧 query · 客户目录",
    "/customers?section=customers",
    business,
    "frontend/src/features/navigation/businessNavigation.js",
    "验证旧section入口选择客户目录。",
    { kind: "compatibility" }
  ),
  check(
    "legacy-query-shipments",
    "compatibility",
    "旧 query · 票单列表",
    "/customers?section=shipments",
    business,
    "frontend/src/features/navigation/businessNavigation.js",
    "管理后台旧票单链接仍应进入票单管理。",
    { kind: "compatibility" }
  ),
  check(
    "legacy-query-customer-detail",
    "compatibility",
    "旧 query · 客户详情",
    "/customers?section=customers&customer=:customerId&view=detail",
    business,
    "frontend/src/features/navigation/businessNavigation.js",
    "真实customer参数与显式view=detail选择详情；不带view=detail的旧链接只选择列表客户。",
    { kind: "compatibility", record: "customer", listPath: "/customers/directory" }
  ),
  check(
    "legacy-query-shipment-detail",
    "compatibility",
    "旧 query · 票单详情",
    "/customers?section=shipments&shipment=:shipmentId",
    business,
    "frontend/src/features/navigation/businessNavigation.js",
    "管理后台票单行旧query跳转应打开所选真实票单。",
    { kind: "compatibility", record: "shipment", listPath: "/customers/shipments" }
  ),
  check(
    "legacy-root-hash",
    "compatibility",
    "旧 #/ 官网入口",
    "/#/",
    ["PUBLIC"],
    "frontend/src/main.js",
    "验证规范化至官网，CSS、mega和服务详情保持完整。",
    { kind: "compatibility" }
  ),
  check(
    "legacy-admin-hash",
    "compatibility",
    "旧 #admin 管理入口",
    "/#admin",
    ["ADMIN"],
    "frontend/src/main.js",
    "验证保留管理入口认证与权限，不被公开官网捕获。",
    { kind: "compatibility" }
  )
];
