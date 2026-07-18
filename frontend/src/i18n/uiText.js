const uiText = {
  "common.cargo": { zh: "货物", en: "Cargo" },
  "common.model": { zh: "型号", en: "Model" },
  "common.dimensionsCm": { zh: "尺寸 cm", en: "Dimensions cm" },
  "common.quantity": { zh: "数量", en: "Quantity" },
  "common.unitWeight": { zh: "单重", en: "Unit Weight" },
  "common.unitWeightKg": { zh: "单重 kg", en: "Unit Weight kg" },
  "common.subtotalVolume": { zh: "小计体积", en: "Subtotal Volume" },
  "common.type": { zh: "类型", en: "Type" },
  "common.actions": { zh: "操作", en: "Actions" },
  "common.edit": { zh: "编辑", en: "Edit" },
  "common.delete": { zh: "删除", en: "Delete" },
  "common.remark": { zh: "备注", en: "Remark" },
  "common.issue": { zh: "问题", en: "Issue" },
  "common.suggestion": { zh: "建议", en: "Suggestion" },
  "common.suggestedName": { zh: "建议名称", en: "Suggested Name" },
  "common.originalName": { zh: "原始名称", en: "Original Name" },
  "common.sourceLine": { zh: "原文行", en: "Source Line" },
  "common.rowNumber": { zh: "行号", en: "Row No." },
  "common.cancel": { zh: "取消", en: "Cancel" },
  "common.close": { zh: "关闭", en: "Close" },
  "common.applyToImportPreview": { zh: "应用到导入预览", en: "Apply to Import Preview" },
  "common.saveToRecognitionResult": { zh: "保存到识别结果", en: "Save to Recognition Result" },
  "common.chooseFile": { zh: "选择文件", en: "Choose File" },
  "common.downloadTemplate": { zh: "下载样板", en: "Download Template" },
  "common.import": { zh: "导入", en: "Import" },
  "common.downloadRecognitionExcel": { zh: "下载识别结果 Excel", en: "Download Recognition Excel" },
  "common.useSample": { zh: "套用示例", en: "Use Sample" },
  "common.clear": { zh: "清空", en: "Clear" },
  "common.acknowledged": { zh: "已知晓", en: "Got It" },
  "common.more": { zh: "还有", en: "More" },
  "common.has": { zh: "有", en: "Has" },
  "common.notSelected": { zh: "尚未选择", en: "Not Selected" },
  "common.fieldName": { zh: "字段名", en: "Field Name" },
  "common.meaning": { zh: "含义", en: "Meaning" },
  "common.example": { zh: "示例", en: "Example" },
  "common.validationRule": { zh: "校验规则", en: "Validation Rule" },
  "unit.piece": { zh: "件", en: "pcs" },
  "unit.cargoPieces": { zh: "件货物", en: "pcs cargo" },
  "unit.classes": { zh: "类", en: "types" },
  "unit.row": { zh: "行", en: "row" },
  "unit.rows": { zh: "行", en: "rows" },
  "unit.item": { zh: "条", en: "item" },
  "unit.seconds": { zh: "秒", en: "sec" },
  "cargo.normal": { zh: "普通货物", en: "General Cargo" },
  "cargo.upright": { zh: "保持朝上", en: "Keep Upright" },
  "cargo.nonstack": { zh: "不可重压", en: "Non-stackable" },
  "cargo.pallet": { zh: "托盘/木箱", en: "Pallet/Wooden Crate" },
  "cargo.packageType": { zh: "包装类型", en: "Package Type" },
  "cargo.constraints": { zh: "装箱条件（可同时选择）", en: "Packing Constraints (select both if needed)" },
  "cargo.constraintsHelp": { zh: "两个条件彼此独立；例如精密设备可以同时要求“不可重压”和“保持朝上”。", en: "The constraints are independent; precision equipment may require both non-stackable and keep-upright handling." },

  "app.currentCargoList": { zh: "当前货物列表", en: "Current Cargo List" },
  "app.manualEntry": { zh: "手动录入", en: "Manual Entry" },
  "app.hideSmartImport": { zh: "收起导入货物", en: "Hide Import Cargo" },
  "app.importCsv": { zh: "导入 CSV", en: "Import CSV" },
  "app.importActionAppend": { zh: "已追加", en: "Appended" },
  "app.importActionReplace": { zh: "已导入", en: "Imported" },
  "app.importCargoSuccess": { zh: "{action} {count} 类货物{skipped}", en: "{action} {count} cargo types{skipped}" },
  "app.importSkippedRows": { zh: "，跳过 {count} 行异常数据", en: ", skipped {count} issue rows" },
  "result.bestFreight": { zh: "当前搜索最低综合参考运价", en: "Lowest Composite Reference Freight Found" },
  "result.referenceFreight": { zh: "综合参考运价", en: "Composite Reference Freight" },
  "result.priceMissing": { zh: "未设置价格，仅参与可装性计算", en: "Price not set; fit calculation only" },
  "result.estimatedFreight": { zh: "综合参考运价估算（未完成全部逐箱验证）", en: "Composite reference freight estimate (not fully verified per container)" },
  "result.estimatedCandidate": { zh: "估算候选 · 未完成全部逐箱验证", en: "Estimated candidate · not fully verified per container" },
  "result.estimatedCandidates": { zh: "估算候选", en: "Estimated Candidates" },
  "result.verificationIncomplete": { zh: "未完成全部逐箱验证", en: "Not fully verified per container" },
  "result.mixedCurrencyPrice": { zh: "币种不一致，未进行运价比较", en: "Currencies differ; freight was not compared" },
  "result.currencySetMismatch": { zh: "参与方案币种不一致，未形成最低运价结论", en: "Plan currencies differ; no lowest-freight conclusion was produced" },
  "result.currentPlanBoxes": { zh: "当前方案箱数", en: "Current Plan Containers" },
  "result.calculatedPlanComparison": { zh: "参与计算箱型与方案对比", en: "Calculated Containers and Plan Comparison" },
  "result.currentBestMark": { zh: "综合方案优选", en: "Best Overall Plan" },
  "result.noFeasiblePlan": { zh: "暂无可行方案", en: "No Feasible Plan" },
  "result.cacheHit": { zh: "已复用上次计算", en: "Reused Last Result" },
  "result.optimizationEyebrow": { zh: "搜索依据", en: "Search Basis" },
  "result.optimizationTitle": { zh: "合规后按综合参考运价搜索", en: "Search by Composite Reference Freight After Compliance" },
  "result.optimizationBasis": { zh: "最终候选同时通过尺寸、支撑、载重和偏载门槛后比较综合参考运价；箱数和利用率仅用于后续排序。本结论只覆盖本次有界搜索，不表示已证明全局最优。", en: "Final candidates must jointly pass dimensions, support, payload, and balance gates before composite reference freight is compared; container count and utilization are later tie-breakers. This conclusion covers only the bounded search and is not a proof of global optimality." },
  "result.optimizationBest": { zh: "当前搜索最优方案", en: "Best Plan Found" },
  "result.optimizationCompare": { zh: "对比方案", en: "Compared Plan" },
  "result.optimizationSaving": { zh: "按当前综合参考运价较该方案低 {amount}", en: "Current composite reference freight is {amount} lower than this plan" },
  "result.optimizationNoSaving": { zh: "综合参考运价相近，按箱数和利用率继续排序", en: "Composite reference freight is similar; container count and utilization decide the order" },
  "result.optimizationMixed": { zh: "箱型组合", en: "Container Combination" },
  "result.optimizationMixedDetail": { zh: "系统在有界搜索范围内比较多箱型组合；单一箱型是组合搜索中的一种特殊结果。", en: "The bounded search compares multi-container combinations; a single container type is a special case of the same search." },
  "result.mixedPlan": { zh: "多箱型组合", en: "Mixed Container Plan" },
  "result.holdLabel": { zh: "第 {index} 货舱", en: "Hold {index}" },
  "result.holdDetail": { zh: "装入 {pieces} 件，箱型参考价 {freight}", en: "{pieces} pcs loaded, container reference price {freight}" },
  "result.recalculate": { zh: "重新计算", en: "Recalculate" },
  "result.freightFormula": { zh: "仅汇总已设置且币种一致的箱型参考价，不等同实际订舱价", en: "Only configured, same-currency reference prices are summed; this is not a live booking price" },
  "result.priceFirstBasis": { zh: "全部约束合规后按综合参考运价排序", en: "Ranked by composite reference freight after all constraints pass" },
  "result.planFallback": { zh: "方案", en: "Plan" },
  "app.batchDelete": { zh: "批量删除", en: "Batch Delete" },
  "app.clearAll": { zh: "清空全部", en: "Clear All" },
  "app.emptyCargoList": { zh: "还没有录入货物，可以先手动新增，或使用上方智能导入/CSV 导入表格。", en: "No cargo has been entered yet. Add cargo manually, or use Smart Import/CSV import above." },
  "template.deleteConfirm": { zh: "确认删除模板「{name}」吗？", en: "Delete template \"{name}\"?" },
  "template.deleted": { zh: "已删除模板。", en: "Template deleted." },
  "template.cargoTemplates": { zh: "货物模板", en: "Cargo Templates" },
  "template.save": { zh: "保存模板", en: "Save Template" },
  "template.name": { zh: "模板名称", en: "Template Name" },
  "template.scale": { zh: "规模", en: "Scale" },
  "template.unnamed": { zh: "未命名模板", en: "Unnamed Template" },
  "template.generatedName": { zh: "货物清单 {types}类/{pieces}件", en: "Cargo List {types} types / {pieces} pcs" },
  "template.saved": { zh: "已保存模板「{name}」。", en: "Saved template \"{name}\"." },

  "profile.personalCenter": { zh: "个人中心", en: "Personal Center" },
  "profile.role.admin": { zh: "管理员", en: "Admin" },
  "profile.role.employee": { zh: "员工", en: "Employee" },
  "profile.role.business": { zh: "业务员", en: "Business Operator" },
  "profile.welcomeUser": { zh: "欢迎回来，{name}", en: "Welcome Back, {name}" },
  "profile.description": {
    zh: "这里汇总当前工作区、登录会话和常用入口，后续个人偏好会同步到员工自己的工作区。",
    en: "This panel summarizes the current workspace, login session, and common entry points. Personal preferences can later sync to each employee workspace."
  },
  "profile.tokenValidUntil": { zh: "令牌有效期", en: "Token Valid Until" },
  "profile.autoLogout": { zh: "6 小时自动下线", en: "Auto logout after 6 hours" },
  "profile.cargoTypes": { zh: "货物种类", en: "Cargo Types" },
  "profile.currentPlan": { zh: "当前计划", en: "Current Plan" },
  "profile.totalCargoPieces": { zh: "货物总件数", en: "Total Cargo Pieces" },
  "profile.containerTypes": { zh: "箱型数量", en: "Container Types" },
  "profile.availableForCalculation": { zh: "可参与计算", en: "Available for Calculation" },
  "profile.planParameters": { zh: "计划参数", en: "Plan Parameters" },
  "profile.utilizationGap": { zh: "可用率 / 间隙", en: "Utilization / Gap" },
  "profile.packingCalculation": { zh: "装箱计算", en: "Packing Calculation" },
  "profile.configParametersContainers": { zh: "配置参数和箱型", en: "Configure parameters and containers" },
  "profile.smartImport": { zh: "智能导入", en: "Smart Import" },
  "profile.excelTextRecognition": { zh: "Excel 与文本识别", en: "Excel and text recognition" },
  "profile.algorithmNotes": { zh: "算法说明", en: "Algorithm Notes" },
  "profile.viewRulesStrategies": { zh: "查看规则与策略", en: "View rules and strategies" },
  "profile.adminConsole": { zh: "管理后台", en: "Admin Console" },
  "profile.employeesDevicesSystem": { zh: "员工、设备和系统", en: "Employees, devices, and system" },
  "profile.logout": { zh: "退出登录", en: "Log Out" },

  "admin.runtimeHasFailedRequests": { zh: "有失败请求", en: "Failed Requests" },
  "admin.runtimeRunningNormally": { zh: "运行正常", en: "Running Normally" },
  "admin.files.navLabel": { zh: "文件管理", en: "File Management" },
  "admin.files.navDescription": { zh: "工作区与货运文件", en: "Workspace and shipment files" },
  "admin.files.title": { zh: "文件中心", en: "File Center" },
  "admin.files.subtitle": { zh: "分别管理短期工作区文件与长期关联到货物的业务文件。", en: "Manage temporary workspace files and long-lived documents attached to shipments." },
  "admin.files.scopeAria": { zh: "文件分类", en: "File categories" },
  "admin.files.workspaceTab": { zh: "工作区临时文件", en: "Temporary Workspace Files" },
  "admin.files.workspaceTabDescription": { zh: "导入与识别任务产生的短期文件", en: "Short-lived files used by import and recognition tasks" },
  "admin.files.shipmentTab": { zh: "货运相关文件", en: "Shipment Documents" },
  "admin.files.shipmentTabDescription": { zh: "关联订舱、提单与货物记录的业务文件", en: "Business documents linked to bookings, bills of lading, and shipments" },
  "admin.files.workspaceTitle": { zh: "工作区临时文件", en: "Temporary Workspace Files" },
  "admin.files.shipmentTitle": { zh: "货运相关文件", en: "Shipment Documents" },
  "admin.files.includeExpired": { zh: "\u5305\u542b\u5df2\u8fc7\u671f", en: "Include expired" },
  "admin.files.total": { zh: "{count} \u4e2a\u6587\u4ef6", en: "{count} file(s)" },
  "admin.files.refresh": { zh: "\u5237\u65b0", en: "Refresh" },
  "admin.files.user": { zh: "\u7528\u6237", en: "User" },
  "admin.files.uploader": { zh: "上传人", en: "Uploader" },
  "admin.files.shipmentReference": { zh: "货运编号", en: "Shipment Reference" },
  "admin.files.publicId": { zh: "记录 ID", en: "Record ID" },
  "admin.files.fileName": { zh: "\u6587\u4ef6\u540d", en: "File Name" },
  "admin.files.visibility": { zh: "可见范围", en: "Visibility" },
  "admin.files.size": { zh: "\u5927\u5c0f", en: "Size" },
  "admin.files.uploadedAt": { zh: "\u4e0a\u4f20\u65f6\u95f4", en: "Uploaded" },
  "admin.files.expiresAt": { zh: "\u8fc7\u671f\u65f6\u95f4", en: "Expires" },
  "admin.files.status": { zh: "\u72b6\u6001", en: "Status" },
  "admin.files.action": { zh: "\u64cd\u4f5c", en: "Action" },
  "admin.files.active": { zh: "\u6709\u6548", en: "Active" },
  "admin.files.expired": { zh: "\u5df2\u8fc7\u671f", en: "Expired" },
  "admin.files.download": { zh: "\u4e0b\u8f7d", en: "Download" },
  "admin.files.delete": { zh: "删除", en: "Delete" },
  "admin.files.deleteConfirm": { zh: "确认删除文件“{name}”吗？文件将进入软删除状态并保留审计记录。", en: "Delete \"{name}\"? The file will be soft-deleted and retained in the audit trail." },
  "admin.files.deleteSuccess": { zh: "货运文件已删除。", en: "Shipment file deleted." },
  "admin.files.workspaceEmpty": { zh: "暂无工作区临时文件", en: "No temporary workspace files" },
  "admin.files.shipmentEmpty": { zh: "暂无货运相关文件", en: "No shipment documents" },
  "admin.files.visibilityInternal": { zh: "仅内部", en: "Internal Only" },
  "admin.files.visibilityParties": { zh: "双方可见", en: "Visible to Parties" },
  "admin.files.visibilityPublic": { zh: "公开", en: "Public" },
  "admin.files.statusReady": { zh: "可用", en: "Ready" },
  "admin.files.statusQuarantined": { zh: "安全检查中", en: "Quarantined" },
  "admin.files.statusPending": { zh: "处理中", en: "Pending" },
  "admin.files.statusDeleted": { zh: "已删除", en: "Deleted" },

  "report.title": { zh: "装箱分层剖析报告", en: "Layered Packing Analysis Report" },
  "report.subtitle": {
    zh: "按高度剖开货舱：每层提供俯视定位、斜侧立体剖析与色块堆放方式说明",
    en: "Cargo hold sliced by height: each layer includes top positioning, oblique 3D analysis, and color-coded stacking notes"
  },
  "report.holdNo": { zh: "第 {index} 货舱", en: "Hold {index}" },
  "report.generatedAt": { zh: "生成时间：{value}", en: "Generated At: {value}" },
  "report.cargoLayerCounts": { zh: "货物类别：{cargoTypes} 类 · 分层数量：{layers} 层", en: "Cargo Types: {cargoTypes} · Layer Count: {layers}" },
  "report.massBalanceTitle": { zh: "质量重心与偏载", en: "Center of Mass and Load Balance" },
  "report.massBalanceText": {
    zh: "按每件货物重量和货物中心计算整舱重心；红点为重心，十字为箱体几何中心，四区显示质量占比。",
    en: "Center of mass is calculated from each cargo weight and center; the red dot is cargo mass center, the cross is container geometric center, and quadrants show weight share."
  },
  "report.massTopTitle": { zh: "货舱俯视质量图", en: "Top-view Mass Map" },
  "report.massTopText": {
    zh: "货物按实际俯视位置铺放，四区按箱体中心线划分。",
    en: "Cargo is plotted by actual top-view position; quadrants are divided by the container center lines."
  },
  "report.legendTitle": { zh: "货物编号与颜色图例", en: "Cargo Number and Color Legend" },
  "report.legendText": {
    zh: "图中 #编号 对应录入货物顺序；A=长×宽、B=宽×高、C=长×高，不同底面会拆成 #2A/#2B。",
    en: "The # number follows cargo entry order; A=L x W, B=W x H, C=L x H. Different base faces split into #2A/#2B."
  },
  "report.dimensionsQuantity": { zh: "{dimensions} cm / {quantity} 件", en: "{dimensions} cm / {quantity} pcs" },
  "report.itemCount": { zh: "{count} 件", en: "{count} pcs" },
  "report.faceStatsTitle": { zh: "A/B/C 面与摆放方向", en: "A/B/C Faces and Orientation" },
  "report.faceStatsNote": {
    zh: "第 {index} 层：说明当前底面、X/Y/Z 方向与长宽高对应关系",
    en: "Layer {index}: base face plus X/Y/Z mapping to length, width, and height"
  },
  "report.faceNameA": { zh: "长×宽", en: "L × W" },
  "report.faceNameB": { zh: "宽×高", en: "W × H" },
  "report.faceNameC": { zh: "长×高", en: "L × H" },
  "report.faceBottomLine": { zh: "{face}面 = {name}", en: "Face {face} = {name}" },
  "report.faceSizeLine": { zh: "{a}={aValue}cm / {b}={bValue}cm", en: "{a}={aValue}cm / {b}={bValue}cm" },
  "report.faceAxisLine": { zh: "当前 X={xAxis}{xValue}cm / Y={yAxis}{yValue}cm / Z={zAxis}{zValue}cm", en: "Current X={xAxis}{xValue}cm / Y={yAxis}{yValue}cm / Z={zAxis}{zValue}cm" },
  "report.footerNote": {
    zh: "说明：分层按货物底面 z 坐标分组；A=长×宽底、B=宽×高底、C=长×高底；大批量同规格货物可能以组合块显示，件数按真实数量统计。",
    en: "Note: Layers are grouped by cargo base z-coordinate; A=L x W base, B=W x H base, C=L x H base. Bulk same-size cargo may be shown as grouped blocks while counts remain true quantities."
  },

  "algorithm.eyebrow": { zh: "计算说明", en: "Calculation Notes" },
  "algorithm.title": { zh: "当前装箱算法与计算留痕", en: "Current Packing Algorithm and Calculation Trace" },
  "algorithm.whereRuns": { zh: "计算过程在哪执行", en: "Where the Calculation Runs" },
  "algorithm.whereRunsText": {
    zh: "主页面只负责收集货物和箱型参数，点击计算或修改数量后，浏览器主线程通过 packingClient.js 创建 Web Worker，把数据复制给 packingWorker.js。真正的装箱、旋转、支撑判断、箱型对比都在 Worker 里完成，所以 3D 视图和表单不会被计算过程长时间阻塞。",
    en: "The main page only collects cargo and container parameters. After recalculation or quantity changes, the browser main thread creates a Web Worker through packingClient.js and passes the data to packingWorker.js. Packing, rotation, support checks, and container comparison all run inside the Worker, so the 3D view and forms stay responsive during calculation."
  },
  "algorithm.step.expand": { zh: "1. 货物展开", en: "1. Cargo Expansion" },
  "algorithm.step.expandText": {
    zh: "系统先把每一类货物按数量展开为单件货物。先确定货物朝向，再把全局货物间隙加到最终 X/Y 水平方向；Z 使用实际外廓高度，不用间隙虚增承重面。",
    en: "The system first expands each cargo type by quantity into single pieces. It chooses the orientation first, then applies the global cargo gap to the final horizontal X/Y axes. Z keeps the physical outer height so clearance never becomes a false support surface."
  },
  "algorithm.step.sort": { zh: "2. 多策略排序", en: "2. Multi-strategy Ordering" },
  "algorithm.step.sortText": {
    zh: "同一箱型会尝试多种顺序：承重优先、体积优先、底面积优先、高度优先。当前重点优化为可堆放货物先形成支撑层，不可重压货物尽量后放到上层。",
    en: "Each container tries several orders: support first, volume first, footprint first, and height first. The current focus is to build support layers with stackable cargo first, while non-stackable cargo is placed later and higher where possible."
  },
  "algorithm.step.rotation": { zh: "3. 旋转枚举", en: "3. Rotation Enumeration" },
  "algorithm.step.rotationText": {
    zh: "普通货物和托盘/木箱会枚举最多 6 种长宽高方向；需要固定朝向时请使用保持朝上或不可重压类型。每个结果都会记录 X/Y/Z 分别对应货物原始哪条边。",
    en: "General cargo and pallet/wooden-crate units enumerate up to 6 length/width/height orientations; use keep-upright or non-stackable types when orientation must be constrained. Each result records which original edge maps to X/Y/Z."
  },
  "algorithm.step.points": { zh: "4. 候选坐标", en: "4. Candidate Points" },
  "algorithm.step.pointsText": {
    zh: "候选点来自箱底、已摆货物右侧、前侧、上方以及边界组合点。快速方案选出后，会对剩余货物做一次深度回填，避免明明有顶面空间却开第二箱。",
    en: "Candidate points come from the floor, the right/front/top sides of placed cargo, and boundary combinations. After a fast solution is selected, remaining cargo gets a deeper backfill pass so usable top space is not missed."
  },
  "algorithm.step.support": { zh: "5. 支撑约束", en: "5. Support Constraints" },
  "algorithm.step.recommend": { zh: "6. 组合方案搜索", en: "6. Combination Search" },
  "algorithm.step.recommendText": {
    zh: "参与计算箱型先生成可装候选，再在受控规模内搜索单一或混合箱型组合。最终候选必须同时通过尺寸、支撑、载重和偏载门槛；只有已设置价格的方案才参与综合参考运价比较，箱数和利用率仅作后续排序。",
    en: "Selected container types first produce feasible packing candidates, then a bounded search compares single- and mixed-container combinations. Final candidates must jointly pass dimensions, support, payload, and balance gates; only priced plans enter composite reference freight comparison, with container count and utilization used later."
  },
  "algorithm.coreFormulas": { zh: "核心计算公式", en: "Core Formulas" },
  "algorithm.currentTrace": { zh: "当前计算留痕", en: "Current Calculation Trace" },
  "algorithm.selectedContainer": { zh: "选中箱型", en: "Selected Container" },
  "algorithm.calculationMode": { zh: "计算模式", en: "Calculation Mode" },
  "algorithm.cargoExpansion": { zh: "货物展开", en: "Cargo Expansion" },
  "algorithm.plannedUtilization": { zh: "计划可用率", en: "Planned Utilization" },
  "algorithm.horizontalGap": { zh: "水平间隙", en: "Horizontal Gap" },
  "algorithm.firstBoxStrategy": { zh: "首箱策略", en: "First-hold Strategy" },
  "algorithm.firstBoxLoaded": { zh: "首箱已摆", en: "First-hold Loaded" },
  "algorithm.containerVolume": { zh: "箱体体积", en: "Container Volume" },
  "algorithm.usableVolume": { zh: "可用体积", en: "Usable Volume" },
  "algorithm.firstBoxOccupiedVolume": { zh: "首箱占用体积", en: "First-hold Occupied Volume" },
  "algorithm.firstBoxSpaceUsed": { zh: "首箱空间占用", en: "First-hold Space Used" },
  "algorithm.geometryBoxes": { zh: "几何箱数", en: "Geometry Boxes" },
  "algorithm.weightBoxes": { zh: "重量箱数", en: "Weight Boxes" },
  "algorithm.finalBoxes": { zh: "当前方案箱数", en: "Current Plan Containers" },
  "algorithm.noTrace": {
    zh: "当前还没有计算结果，返回装箱计算页录入货物后会在这里显示实际计算留痕。",
    en: "No calculation result yet. Return to Packing Calculation and enter cargo to show the actual calculation trace here."
  },
  "algorithm.workerFlow": { zh: "Worker 工作流程", en: "Worker Workflow" },

  "container.referenceTitle": { zh: "箱型尺寸资料库", en: "Container Size Reference" },
  "container.backToConfig": { zh: "返回配置页", en: "Back to Setup" },
  "container.sourceAlert": {
    zh: "尺寸资料来自公开船司/箱东页面；静态参考价格来自公开运价指数并按箱型估算，未绑定实际起运港、目的港、船期、有效期、设备可用性，也未完整包含 OOG、冷藏、绑扎、吊装和码头等附加费，因此只作为方案比较基准，不等于实际订舱报价。",
    en: "Dimensions come from public carrier/container-owner references. Static reference prices come from public freight indexes and equipment estimates; they are not bound to actual ports, sailing dates, validity, or equipment availability and do not fully include OOG, reefer, lashing, lifting, and terminal charges. They are comparison inputs, not live booking quotes."
  },
  "container.flatRackHeightIgnored": { zh: "平板不计高度", en: "Flat rack height ignored" },
  "container.flatRackHeightLimitTag": { zh: "装载高限 {value} cm", en: "Load height limit {value} cm" },
  "container.heightLimitCm": { zh: "装载高度上限 cm", en: "Load Height Limit cm" },
  "container.heightCm": { zh: "高 cm", en: "Height cm" },
  "container.heightLimitShort": { zh: "高限", en: "Height Limit" },
  "container.frameHeightShort": { zh: "设备高", en: "Frame Height" },
  "container.useCustomHeightLimit": { zh: "平板/超限设备使用自定义装载高度上限", en: "Use custom load height limit for flat-rack/OOG equipment" },
  "container.heightLimitHelp": {
    zh: "平板柜不再无限制堆高；计算会以这里的高度作为最高装载边界。",
    en: "Flat racks are no longer treated as unlimited height; packing uses this value as the maximum load height."
  },
  "container.calcSize": { zh: "计算尺寸", en: "Calculation Size" },
  "container.maxPayload": { zh: "最大载重", en: "Max Payload" },
  "container.referencePrice": { zh: "箱型静态参考价", en: "Static Container Reference Price" },
  "container.priceMissing": { zh: "未设置；不参与最低运价比较", en: "Not set; excluded from lowest-freight comparison" },
  "container.priceOptionalHint": { zh: "可留空；箱型仍参与可装性计算，但不会参与最低运价比较。", en: "Optional. The container remains in fit calculations but is excluded from lowest-freight comparison." },
  "container.referencePriceSourceFallback": { zh: "参考运价来源", en: "Reference Freight Source" },
  "container.restoreDefaultPrice": { zh: "恢复默认价格", en: "Restore Default Price" },
  "container.restorePriceShort": { zh: "恢复价格", en: "Restore Price" },
  "container.defaultPriceHint": { zh: "默认参考价：USD {value}", en: "Default reference price: USD {value}" },
  "container.userEditedPrice": { zh: "用户编辑参考价", en: "User-edited reference price" },
  "container.userEditedPriceBasis": {
    zh: "用户自定义参考价；实际订舱前请按实时询价复核。",
    en: "User-defined reference price; verify against live quotations before booking."
  },
  "container.parametersUpdated": { zh: "箱型参数已更新。", en: "Container parameters updated." },
  "container.customAdded": { zh: "已加入自定义箱型。", en: "Custom container added." },
  "container.restoredDefaults": { zh: "{name} 已恢复默认尺寸和价格。", en: "{name} restored to default dimensions and price." },
  "container.restoredDefaultPrice": { zh: "{name} 已恢复默认参考价格。", en: "{name} restored to the default reference price." },
  "container.dimensionBasis": { zh: "尺寸依据", en: "Dimension Basis" },
  "container.manualDimensions": { zh: "手动录入尺寸", en: "Manual Dimensions" },
  "container.customNote": { zh: "自定义箱型，请按实际设备复核。", en: "Custom container; verify against actual equipment." },
  "container.userDefinedDimensions": { zh: "用户自定义尺寸", en: "User-defined Dimensions" },
  "container.priority.common": { zh: "常用", en: "Common" },
  "container.priority.limited": { zh: "少量使用", en: "Limited Use" },
  "container.priority.special": { zh: "特殊设备", en: "Special Equipment" },
  "container.priority.custom": { zh: "自定义", en: "Custom" },

  "excel.title": { zh: "导入货物", en: "Import Cargo" },
  "excel.importCargoEyebrow": { zh: "导入货物", en: "IMPORT CARGO" },
  "excel.importCargoTitle": { zh: "选择导入方式", en: "Choose an import method" },
  "excel.importModeChoice": { zh: "货物导入方式", en: "Cargo import method" },
  "excel.manualImport": { zh: "快速导入", en: "Quick Import" },
  "excel.manualSubtitle": { zh: "适合字段清晰、格式规范的表格", en: "For clean tables with clearly labeled fields" },
  "excel.smartRecognition": { zh: "智能导入", en: "Smart Import" },
  "excel.recognitionSubtitle": { zh: "适合不规整、杂糅或拼盘表格", en: "For irregular, mixed, or consolidated sheets" },
  "excel.fieldTemplate": { zh: "字段样板", en: "Field Template" },
  "excel.fieldSubtitle": { zh: "标准字段、规则和示例", en: "Standard fields, rules, and examples" },
  "excel.manualPath": { zh: "快速导入", en: "Quick Import" },
  "excel.manualPathText": {
    zh: "在浏览器后台线程中按标准字段映射、校验并直接生成装箱货物，通常几秒内完成。",
    en: "Map and validate standard fields in a browser worker, then create packing cargo directly—usually within seconds."
  },
  "excel.quickImportCheckTitle": { zh: "快速导入需要人工复核", en: "Quick import requires a manual check" },
  "excel.quickImportCheckDescription": { zh: "适合表头和条目清晰的表格；复杂包装关系、拼盘信息或特殊约束可能识别不完整，请在导入前后核对名称、尺寸、数量、单重和装箱条件。", en: "Best for clean headers and rows. Complex packaging, consolidated loads, or special constraints may be incomplete; verify names, dimensions, quantities, unit weights, and handling constraints before and after import." },
  "excel.quickImportParsing": { zh: "正在按字段映射快速解析文件。", en: "Parsing the file with field mapping." },
  "excel.quickImportFailed": { zh: "快速导入解析失败，请检查文件格式和字段。", en: "Quick import parsing failed. Check the file format and fields." },
  "excel.localParseFallback": { zh: "后端解析不可用，已切换浏览器本地解析：{message}", en: "Backend parsing is unavailable. Switched to local browser parsing: {message}" },
  "excel.localParsing": { zh: "正在解析文件，请稍候。大文件会在后台线程处理，页面不会被阻塞。", en: "Parsing the file. Large files are processed in a background worker so the page remains responsive." },
  "excel.workbookRead": { zh: "已读取 {count} 个工作表，正在生成预览。", en: "Read {count} worksheet(s). Generating the preview." },
  "excel.fileParseFailed": { zh: "文件解析失败，请检查 Excel/CSV 格式。", en: "Could not parse the file. Check the Excel/CSV format." },
  "excel.validatingRows": { zh: "正在校验行数据与字段映射...", en: "Validating rows and field mappings..." },
  "excel.previewValidationFailed": { zh: "预览校验失败，请检查字段映射。", en: "Preview validation failed. Check the field mappings." },
  "excel.previewCompleteWithIssues": { zh: "已完成预览：{valid} 行有效，{invalid} 行需要确认。", en: "Preview complete: {valid} valid row(s), {invalid} row(s) need review." },
  "excel.previewCompleteAllValid": { zh: "已完成预览：{count} 行全部通过校验。", en: "Preview complete: all {count} row(s) passed validation." },
  "excel.quickImportPostCheck": { zh: "已快速导入 {count} 类货物。识别结果可能存在偏差，请检查名称、尺寸、数量、单重、不可重压和保持朝上条件，确认后再进入计算。", en: "Quick-imported {count} cargo types. Results may contain mapping errors; verify names, dimensions, quantities, unit weights, non-stackable, and keep-upright constraints before calculating." },
  "excel.choosePreciseFile": { zh: "选择 Excel 精确识别", en: "Choose Excel for Precise Import" },
  "excel.dropToRecognize": { zh: "拖拽文件到此快速导入", en: "Drop a file here for quick import" },
  "excel.dropRelease": { zh: "松开文件，立即快速解析", en: "Release to parse immediately" },
  "excel.dropBusy": { zh: "正在读取并快速解析文件", en: "Reading and parsing the file" },
  "excel.dropSupportText": {
    zh: "也可以点击此区域选择文件；快速导入不会调用 Agent。",
    en: "You can also click this area to choose a file. Quick import does not call the Agent."
  },
  "excel.smartDropToRecognize": { zh: "拖拽文件到此进行智能导入", en: "Drop a file here for smart import" },
  "excel.smartDropRelease": { zh: "松开文件，立即开始智能识别", en: "Release to start smart recognition" },
  "excel.smartDropBusy": { zh: "正在读取并智能识别文件", en: "Reading and recognizing the file" },
  "excel.smartDropSupportText": {
    zh: "也可以点击此区域选择文件；系统会交给 Agent 标准化并审查结果。",
    en: "You can also click this area to choose a file. The Agent will standardize and review the result."
  },
  "excel.dropSingleFileOnly": {
    zh: "每次只能识别一个文件，请重新拖入单个 Excel 或 CSV 文件。",
    en: "Only one file can be recognized at a time. Drop a single Excel or CSV file."
  },
  "excel.dropUnsupportedFile": {
    zh: "不支持文件“{name}”，请选择 XLSX、XLS、CSV 或 TSV 文件。",
    en: "The file “{name}” is not supported. Choose an XLSX, XLS, CSV, or TSV file."
  },
  "excel.agentPreparingFromExcel": {
    zh: "正在读取 Excel，并转换为带单元格坐标的格式化文本。",
    en: "Reading the workbook and converting it into coordinate-preserving text."
  },
  "excel.agentSubmittedFromExcel": {
    zh: "已读取 {count} 个工作表，正在交给智能识别 agent。",
    en: "Read {count} sheet(s); sending the formatted text to the recognition agent."
  },
  "excel.excelAgentFailed": {
    zh: "Excel 转智能识别失败，请检查文件格式或后端 agent 配置。",
    en: "Excel-to-agent recognition failed. Check the file format or backend agent configuration."
  },
  "excel.excelFormattedSource": { zh: "Excel 格式化文本", en: "Formatted Excel text" },
  "excel.pastedTextSource": { zh: "智能识别粘贴文本", en: "Pasted smart-recognition text" },
  "excel.currentFile": { zh: "当前文件", en: "Current File" },
  "excel.validRows": { zh: "有效行", en: "Valid Rows" },
  "excel.issueRows": { zh: "异常行", en: "Issue Rows" },
  "excel.aggregatedCargo": { zh: "聚合后货物", en: "Aggregated Cargo" },
  "excel.importPieces": { zh: "导入件数", en: "Import Pieces" },
  "excel.recognitionPath": { zh: "智能导入", en: "Smart Import" },
  "excel.recognitionPathText": {
    zh: "上传不规整、信息杂糅或包含拼盘关系的 Excel，或粘贴聊天/报价文本；系统解析文件后交给 Agent 输出标准清单和逐项审查结果。",
    en: "Upload an irregular, mixed, or consolidated Excel file—or paste chat/quote text. The workbook is parsed, then the Agent returns a standardized list and itemized review."
  },
  "excel.fileQueue": { zh: "\u6587\u4ef6\u961f\u5217", en: "File Queue" },
  "excel.fileQueueCount": { zh: "{count} \u4e2a\u6587\u4ef6", en: "{count} file(s)" },
  "excel.smartQueueHint": { zh: "\u4e00\u6b21\u8bc6\u522b\u4e00\u4efd\uff1b\u9996\u4efd\u81ea\u52a8\u5f00\u59cb\uff0c\u5176\u4f59\u53ef\u5728\u961f\u5217\u4e2d\u9010\u4efd\u542f\u52a8", en: "One file at a time; the first starts automatically, then start each remaining queued file" },
  "excel.queueQueued": { zh: "\u7b49\u5f85\u5904\u7406", en: "Queued" },
  "excel.queueProcessing": { zh: "\u5904\u7406\u4e2d", en: "Processing" },
  "excel.queueReady": { zh: "\u5df2\u5b8c\u6210", en: "Ready" },
  "excel.queueFailed": { zh: "\u5904\u7406\u5931\u8d25", en: "Failed" },
  "excel.recognizeThisFile": { zh: "\u8bc6\u522b\u6b64\u6587\u4ef6", en: "Recognize This File" },
  "excel.workspaceFiles": { zh: "\u5de5\u4f5c\u533a\u6587\u4ef6", en: "Workspace Files" },
  "excel.workspaceFilesEyebrow": { zh: "\u6211\u7684\u4e0a\u4f20\u6587\u4ef6", en: "MY UPLOADED FILES" },
  "excel.workspaceFilesRetention": { zh: "\u6587\u4ef6\u4fdd\u7559 14 \u5929\uff0c\u91cd\u65b0\u4f7f\u7528\u540e\u81ea\u52a8\u5ef6\u957f\u6709\u6548\u671f\u3002", en: "Files are retained for 14 days; reusing one renews its retention period." },
  "excel.workspaceFilesEmpty": { zh: "\u6682\u65e0\u5df2\u4e0a\u4f20\u6587\u4ef6\u3002", en: "No uploaded files yet." },
  "excel.workspaceFilesLoadFailed": { zh: "\u65e0\u6cd5\u8bfb\u53d6\u5de5\u4f5c\u533a\u6587\u4ef6\uff1a{message}", en: "Could not load workspace files: {message}" },
  "excel.workspaceFileReuseFailed": { zh: "\u65e0\u6cd5\u590d\u7528\u8be5\u6587\u4ef6\uff1a{message}", en: "Could not reuse this file: {message}" },
  "excel.workspaceFilePreviewFailed": { zh: "\u65e0\u6cd5\u9884\u89c8\u8be5\u6587\u4ef6\uff1a{message}", en: "Could not preview this file: {message}" },
  "excel.workspaceFileDeleteFailed": { zh: "\u65e0\u6cd5\u5220\u9664\u8be5\u6587\u4ef6\uff1a{message}", en: "Could not delete this file: {message}" },
  "excel.workspaceFileDaysRemaining": { zh: "\u5269\u4f59 {count} \u5929", en: "{count} day(s) remaining" },
  "excel.useForQuickImport": { zh: "\u5feb\u901f\u5bfc\u5165", en: "Use for Quick Import" },
  "excel.useForSmartImport": { zh: "\u667a\u80fd\u5bfc\u5165", en: "Use for Smart Import" },
  "excel.refreshFiles": { zh: "\u5237\u65b0", en: "Refresh" },
  "excel.unknownDate": { zh: "\u672a\u77e5\u65e5\u671f", en: "Unknown Date" },
  "excel.orPasteText": { zh: "或粘贴货物文本", en: "OR PASTE CARGO TEXT" },
  "excel.startSmartRecognition": { zh: "开始智能识别", en: "Start Smart Recognition" },
  "excel.recognizing": { zh: "智能识别中...", en: "Recognizing..." },
  "excel.elapsedTime": { zh: "已识别 {time}", en: "Elapsed {time}" },
  "excel.completedIn": { zh: "本次识别耗时 {time}", en: "Completed in {time}" },
  "excel.recognizingCargo": { zh: "正在智能识别货物信息", en: "Recognizing cargo information" },
  "excel.recognizingCargoText": {
    zh: "后端会提取货物名称、型号、尺寸、数量、重量和备注，完成后自动生成可导入清单。",
    en: "The backend extracts cargo name, model, dimensions, quantity, weight, and notes, then generates an importable list."
  },
  "excel.sourceWorkbook": { zh: "原始工作簿", en: "Source Workbook" },
  "excel.previewWorkbook": { zh: "在线预览", en: "Preview Online" },
  "excel.downloadOriginalWorkbook": { zh: "下载原文件", en: "Download Original" },
  "excel.onlinePreview": { zh: "浏览器内预览", en: "Browser Preview" },
  "excel.previewLimit": { zh: "为保证页面流畅，最多展示前 {count} 行；下载文件不受影响。", en: "Up to {count} rows are shown for performance. Downloads are unaffected." },
  "excel.emptyWorksheet": { zh: "该工作表没有可预览的数据。", en: "This worksheet has no previewable data." },
  "excel.needsAction": { zh: "需要处理", en: "Needs Action" },
  "excel.recognitionTip": { zh: "识别提示", en: "Recognition Tip" },
  "excel.recognitionCompleteMessage": {
    zh: "智能识别完成：{types} 类货物，{pieces} 件；{review} 条硬性问题需确认。低风险提示已自动放行，导入后请检查当前货物清单。",
    en: "Smart recognition complete: {types} cargo types, {pieces} pcs; {review} hard issues need confirmation. Low-risk hints were auto-approved; review the current cargo list after importing."
  },
  "excel.downloadFailed": { zh: "下载失败：{message}", en: "Download failed: {message}" },
  "excel.recognitionTimeout": {
    zh: "智能识别仍在后台处理中，请稍后重新进入当前任务查看结果。",
    en: "Recognition is still running in the background. Reopen the current task later to view the result."
  },
  "excel.recognitionUnavailable": {
    zh: "智能识别接口不可用：{message}",
    en: "Smart recognition API unavailable: {message}"
  },
  "excel.recognitionBackendOutdated": {
    zh: "智能识别后端仍在运行旧版本，尚未启用 v4 自动拆批与包装层级校验。请在服务器重新构建并重启 backend 容器，同时确认前端连接的是新 API 地址后再试。",
    en: "The recognition backend is still running an old build without the v4 adaptive batching and packaging-hierarchy checks. Rebuild and restart the backend container, and verify that the frontend points to the new API endpoint before retrying."
  },
  "excel.recognitionFailed": {
    zh: "智能识别失败：{message}",
    en: "Smart recognition failed: {message}"
  },
  "excel.recognitionFailedFallback": {
    zh: "请检查后端任务日志",
    en: "Check the backend task logs"
  },
  "excel.recognitionPartial": {
    zh: "识别仅得到部分结果：仍有 {count} 项因输出超限、行覆盖缺失、请求/时间上限或输入截断而未完成。请逐项复核补录；若提示输入截断，请精简工作表后重新识别。未处理前禁止直接导入。",
    en: "Recognition produced only a partial result: {count} item(s) remain unresolved because of an output limit, missing row coverage, request/time budget, or truncated input. Review and complete each item; if the input was truncated, reduce the workbook and run recognition again. Direct import is blocked until resolved."
  },
  "excel.recognitionIssueOutputLimit": {
    zh: "该源行在单行紧凑重试后仍返回截断或无效 JSON，请按原文人工补录。",
    en: "This source row still returned truncated or invalid JSON after a compact single-row retry. Complete it manually from the source."
  },
  "excel.recognitionIssueRowCoverage": {
    zh: "Agent 未明确返回该源行的货物、异常或跳过状态，请按原文人工确认。",
    en: "The agent did not explicitly classify this source row as cargo, an issue, or skipped. Review it manually."
  },
  "excel.recognitionIssueRequestBudget": {
    zh: "任务已达到请求次数或处理时间上限，该源行未继续请求，请人工补录或精简文件后重试。",
    en: "The task reached its request or time budget before this source row could be processed. Complete it manually or retry with a smaller workbook."
  },
  "excel.recognitionIssueInputTruncated": {
    zh: "工作簿的行、列、合并区域或单元格内容已被截断，当前结果不是完整清单。请精简工作表并重新识别。",
    en: "Workbook rows, columns, merged ranges, or cell content were truncated, so this is not a complete list. Reduce the workbook and run recognition again."
  },
  "excel.recognitionIssuePalletDimensionsMissing": {
    zh: "原文件没有提供装货完成后的最终托盘外廓长、宽、高。系统不会用单箱尺寸、总体积或层数代替托盘尺寸；请决定是否逐条手工补录，未补全前禁止导入。",
    en: "The source does not provide the final outer length, width, and height of the loaded pallet. Carton dimensions, total volume, and layer counts will not be substituted. Decide whether to enter the dimensions manually for this item; import remains blocked until completed."
  },
  "excel.recognitionPalletDimensionsBlocking": {
    zh: "有 {count} 项缺少最终托盘外廓尺寸。请打开“查看审查结果”，逐条输入托盘长、宽、高；未补全前不能导入。",
    en: "{count} item(s) are missing final pallet outer dimensions. Open Review Results and enter the pallet length, width, and height for each item; import is blocked until they are complete."
  },
  "excel.recognitionEditSaved": {
    zh: "已修改第 {index} 条识别结果，可继续编辑或直接导入。",
    en: "Recognition result {index} was updated. You can continue editing or import it now."
  },
  "excel.textItems": { zh: "文本条目", en: "Text Items" },
  "excel.validItems": { zh: "有效条目", en: "Valid Items" },
  "excel.issueItems": { zh: "异常条目", en: "Issue Items" },
  "excel.importMode": { zh: "写入方式", en: "Write Mode" },
  "excel.replaceCargo": { zh: "替换当前货物", en: "Replace Current Cargo" },
  "excel.appendCargo": { zh: "追加到当前货物", en: "Append to Current Cargo" },
  "excel.workbookAndUnits": { zh: "工作表与单位", en: "Worksheet and Units" },
  "excel.worksheet": { zh: "工作表", en: "Worksheet" },
  "excel.dimensionUnit": { zh: "尺寸单位", en: "Dimension Unit" },
  "excel.weightUnit": { zh: "重量单位", en: "Weight Unit" },
  "excel.autoDetect": { zh: "自动识别", en: "Auto Detect" },
  "excel.fieldMapping": { zh: "字段自动映射", en: "Automatic Field Mapping" },
  "excel.unmapped": { zh: "未映射", en: "Unmapped" },
  "excel.rowsFailedValidation": { zh: "行未通过校验，导入时会跳过这些行。", en: "rows failed validation and will be skipped during import." },
  "excel.allRowsValid": { zh: "全部行已通过校验。", en: "All rows passed validation." },
  "excel.validPreview": { zh: "有效数据预览", en: "Valid Data Preview" },
  "excel.moreCargoHidden": { zh: "类货物未显示", en: "more cargo types hidden" },
  "excel.suggestEdit": { zh: "建议修改", en: "Suggest Edit" },
  "excel.noIssueRows": { zh: "暂无异常行", en: "No issue rows" },
  "excel.moreIssueRowsHidden": { zh: "行异常未显示", en: "more issue rows hidden" },
  "excel.requiredFields": { zh: "必填字段", en: "Required Fields" },
  "excel.optionalRules": { zh: "可选字段与规则", en: "Optional Fields and Rules" },
  "excel.rule.type": {
    zh: "type 用于包装类型；nonStack 和 keepUpright 是两个独立条件，可以同时为 true。备注里的“不可重压/易碎”和“保持朝上/不可倒置”也会分别识别。",
    en: "type describes the package. nonStack and keepUpright are independent and may both be true. Notes containing non-stackable/fragile and keep-upright/this-side-up are detected separately."
  },
  "excel.rule.dimensionText": {
    zh: "dimensionText：允许把尺寸写成 60*40*35、60×40×35 cm 或“长宽高”。",
    en: "dimensionText: dimensions may be written as 60*40*35, 60 x 40 x 35 cm, or length/width/height text."
  },
  "excel.rule.model": {
    zh: "model：可填写型号/规格；如果同名货物出现多种尺寸但没有型号，系统会自动补为“型号 A/B/C”。",
    en: "model: optional model/specification. If one cargo name has multiple sizes without models, the system auto-fills Model A/B/C."
  },
  "excel.rule.totalWeight": {
    zh: "totalWeightKg：如果没有单件重量，可以用总重量除以数量自动换算。",
    en: "totalWeightKg: if unit weight is unavailable, total weight can be divided by quantity automatically."
  },
  "excel.rule.duplicateSku": {
    zh: "重复 SKU 或同规格同名称货物会先聚合数量，再写入当前货物列表。",
    en: "Duplicate SKUs or same-name same-size cargo are aggregated before writing to the current cargo list."
  },
  "excel.standardExample": { zh: "标准 Excel 示例", en: "Standard Excel Example" },
  "excel.recognitionPosition": { zh: "智能识别的位置", en: "Where Smart Recognition Fits" },
  "excel.recognitionPositionText": {
    zh: "快速导入走本地确定性规则，适合标准表格；精确导入接受 Excel 或文本并走后端 Agent，适合复杂包装和拼盘关系。两条路径都由用户确认后才写入当前货物。",
    en: "Quick import uses deterministic local rules for standard sheets. Precise import accepts Excel or text and uses the backend Agent for complex packaging and consolidated loads. Both paths require user confirmation before writing cargo."
  },
  "excel.suggestStandardCargo": { zh: "建议修改为标准货物", en: "Suggest Standard Cargo" },
  "excel.preserveFields": { zh: "系统已尽量保留原始行中的可识别字段。", en: "The system kept identifiable fields from the original row where possible." },
  "excel.cargoName": { zh: "货物名称", en: "Cargo Name" },
  "excel.modelSpec": { zh: "型号/规格", en: "Model / Spec" },
  "excel.lengthCm": { zh: "长度 cm", en: "Length cm" },
  "excel.widthCm": { zh: "宽度 cm", en: "Width cm" },
  "excel.heightCm": { zh: "高度 cm", en: "Height cm" },
  "excel.singleWeightKg": { zh: "单件重量 kg", en: "Unit Weight kg" },
  "excel.handlingConstraints": { zh: "装箱条件（可同时选择）", en: "Packing Constraints (select both if needed)" },
  "excel.needsChanges": { zh: "还需要修改", en: "Still needs changes" },
  "excel.recognitionResultNo": { zh: "识别结果第", en: "Recognition Result" },
  "excel.editRecognitionCargo": { zh: "编辑识别货物", en: "Edit Recognized Cargo" },
  "excel.editNoAgent": {
    zh: "这里修改的是导入前的识别结果，不会重新调用 Agent。",
    en: "These edits apply to the pre-import recognition result and do not call the Agent again."
  },
  "excel.editUseCase": { zh: "适合修正重量千分位、型号、尺寸或货物类型。", en: "Useful for fixing weight separators, models, dimensions, or cargo types." },
  "excel.unnamedCargo": { zh: "未命名货物", en: "Unnamed Cargo" },
  "excel.cargoEditSummary": {
    zh: "{label}，{length} × {width} × {height} cm，{quantity} 件，{weight} kg/件",
    en: "{label}, {length} × {width} × {height} cm, {quantity} pcs, {weight} kg/pc"
  },
  "excel.recognitionReviewEyebrow": { zh: "识别复核", en: "Recognition Review" },
  "excel.recognitionReviewTitle": { zh: "请确认智能识别结果", en: "Review Smart Recognition Results" },
  "excel.recognitionReviewNotice": {
    zh: "每条待确认信息按“原文 → Agent 识别 → 最终导入格式”展示。请重点检查第三行；如尺寸、数量、重量或类型不正确，点击“编辑导入格式”后再导入。",
    en: "Each item is shown as Source → Agent Recognition → Final Import Format. Check the third line carefully; if dimensions, quantity, weight, or type are incorrect, select Edit Import Format before importing."
  },
  "excel.reviewPalletDimensionsMissingTitle": {
    zh: "缺少最终托盘外廓尺寸（{count} 项）",
    en: "Final pallet outer dimensions missing ({count})"
  },
  "excel.reviewPalletDimensionsMissingDescription": {
    zh: "系统只能确认这些货物以托盘为最终搬运单元，但原文件没有给出装货完成后的托盘长、宽、高。若要导入，请点击对应条目的“输入托盘尺寸”逐条补全；暂不输入可关闭复核窗口，当前结果不会被导入。",
    en: "These items were identified as palletized handling units, but the source does not provide the loaded pallet's final length, width, and height. To import them, select Enter Pallet Dimensions on each item and complete the fields. You may close the review without entering them; the current result will not be imported."
  },
  "excel.reviewNormalItems": { zh: "正常识别项", en: "Normal Items" },
  "excel.reviewNeedsConfirmItems": { zh: "需确认项", en: "Items to Confirm" },
  "excel.reviewNeedsConfirm": { zh: "需人工确认", en: "Needs Manual Confirmation" },
  "excel.reviewNormal": { zh: "正常识别结果", en: "Normal Recognition Results" },
  "excel.reviewOriginalData": { zh: "原文", en: "Source" },
  "excel.reviewAgentSuggestion": { zh: "Agent 识别", en: "Agent Recognition" },
  "excel.reviewSystemJudgement": { zh: "需确认原因", en: "Reason to Confirm" },
  "excel.reviewImportedCandidate": { zh: "将以以下格式导入", en: "Will Be Imported As" },
  "excel.reviewEditImport": { zh: "编辑导入格式", en: "Edit Import Format" },
  "excel.reviewEnterPalletDimensions": { zh: "输入托盘尺寸", en: "Enter Pallet Dimensions" },
  "excel.reviewFinalPalletOuterDimensions": { zh: "最终托盘外廓尺寸", en: "Final Loaded Pallet Dimensions" },
  "excel.reviewOriginalCartonDimensions": { zh: "源文件单箱/内装尺寸", en: "Source Carton / Inner-package Dimensions" },
  "excel.reviewDimensionsNotProvided": { zh: "未提供，需用户补录", en: "Not provided; user input required" },
  "excel.reviewNotImportedYet": { zh: "当前没有可导入数据，请点击右侧按钮补全。", en: "No importable data yet. Use the button on the right to complete it." },
  "excel.reviewNoSuggestion": { zh: "Agent 没有生成完整字段，请结合原文检查最终导入格式。", en: "The Agent did not produce complete fields. Compare the source with the final import format." },
  "excel.reviewSourceText": { zh: "来源原文", en: "Source Text" },
  "excel.reviewRowNumber": { zh: "来源行号", en: "Source Row" },
  "excel.reviewPackageInfo": { zh: "包装信息", en: "Package Info" },
  "excel.reviewCargoUnitInfo": { zh: "\u8d27\u7269\u5355\u7bb1\u4fe1\u606f", en: "Cargo / Carton Information" },
  "excel.reviewPalletInfo": { zh: "\u6258\u76d8\u4fe1\u606f", en: "Pallet Information" },
  "excel.reviewNotesInfo": { zh: "\u5907\u6ce8\u4fe1\u606f", en: "Notes" },
  "excel.reviewPiecesPerPallet": { zh: "\u4e00\u6258\u88c5\u8f7d", en: "Loaded per Pallet" },
  "excel.reviewPiecesCount": { zh: "{count} \u4ef6", en: "{count} pcs" },
  "excel.reviewPalletCount": { zh: "\u6258\u76d8\u6570\u91cf", en: "Pallet Quantity" },
  "excel.reviewAgentNotes": { zh: "Agent 备注", en: "Agent Notes" },
  "excel.reviewValidation": { zh: "校验结果", en: "Validation" },
  "excel.reviewNoIssues": { zh: "暂无需确认项，可继续检查正常识别结果后导入。", en: "No items need confirmation; review the normal results before importing." },
  "excel.reviewAllNeedConfirm": { zh: "本次识别结果均需要人工确认。", en: "All recognized items need manual confirmation." },
  "excel.reviewUnknownItem": { zh: "未命名识别项", en: "Unnamed Recognized Item" },
  "excel.reviewUnknownReason": { zh: "系统未能给出明确原因，请对照原文复核后再导入。", en: "No clear reason was provided; compare with the source text before importing." },
  "excel.reviewReasonEmptyPallet": {
    zh: "疑似空托盘/单独托盘：请确认它是否真的要作为独立装柜货物；如果只是托盘皮重说明，应改进备注或删除该项。",
    en: "Possible empty or standalone pallet: confirm whether it should be imported as its own handled unit; if it only describes tare weight, move it to notes or remove it."
  },
  "excel.reviewReasonMixedPallet": {
    zh: "疑似拼装/混装托盘：请确认尺寸是最终托盘尺寸，单重已包含托盘/木架和托盘内货物总重。",
    en: "Possible mixed/combined pallet: confirm dimensions are the final pallet size and unit weight includes pallet/crate tare plus contained cargo weight."
  },
  "excel.reviewReasonUncertain": {
    zh: "识别内容带有可能、不确定、重复或人工确认信号，请重点核对原文和导入字段。",
    en: "The recognition contains possible, uncertain, duplicate, or manual-review signals; verify the source text and imported fields."
  },
  "excel.reviewReasonStandalonePallet": {
    zh: "疑似单独托盘：请确认它不是用于承托其他货物的空托盘，也不是重复计算的托盘行。",
    en: "Possible standalone pallet: confirm it is not an empty support pallet for other cargo and not a duplicated pallet row."
  },
  "excel.reviewReasonPalletWeight": {
    zh: "托盘/木箱单重为空或为 0，装箱计算会低估重量，请补全单重。",
    en: "Pallet/crate unit weight is empty or zero; packing will underestimate weight, so fill in the unit weight."
  },
  "excel.openRecognitionReview": { zh: "查看审查结果", en: "View Review Results" },

  "scene.lengthCm": { zh: "长 {value} cm", en: "Length {value} cm" },
  "scene.widthCm": { zh: "宽 {value} cm", en: "Width {value} cm" },
  "scene.heightCm": { zh: "高 {value} cm", en: "Height {value} cm" },
  "scene.corner": { zh: "角 {value}", en: "Corner {value}" },
  "scene.origin": { zh: "原点 O", en: "Origin O" },
  "scene.axisX": { zh: "X 箱长", en: "X Length" },
  "scene.axisY": { zh: "Y 箱宽", en: "Y Width" },
  "scene.axisZ": { zh: "Z 高度", en: "Z Height" }
};

function interpolate(text, params = {}) {
  return String(text).replace(/\{(\w+)\}/g, (_, key) => params[key] ?? "");
}

export function translateUiText(key, locale = "zh-CN", params = {}) {
  const entry = uiText[key];
  if (!entry) return key;
  const text = locale === "en-US" ? entry.en : entry.zh;
  return interpolate(text || entry.zh || key, params);
}

export { uiText };
