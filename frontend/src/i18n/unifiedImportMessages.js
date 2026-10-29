const zh = {
  title: "智能导入",
  description:
    "统一上传 Excel 或完整清晰的装箱单截图，系统按文件类型识别。所有结果均须对照来源审阅后导入。",
  choose: "选择 Excel / 图片",
  support: "XLSX / XLS / CSV / TSV · PNG / JPEG（图片 ≤5 MB）",
  invalid: "请选择支持的 Excel 文件或不超过 5 MB 的 PNG/JPEG 图片。",
  selected: "当前来源",
  auxiliary: "附加原表截图交叉核对",
  auxiliaryHint:
    "Excel 的单位、合并行或包装归属不确定时，可附加同一完整表格的截图。两路必须逐件匹配；截图不能解除原 Excel 的阻断。多张工作表请提供涵盖全部包装的清晰截图，匹配不全将阻断。",
  chooseAuxiliary: "选择核对截图",
  removeAuxiliary: "移除核对截图",
  noVisual: "尚未进行截图交叉核对。Excel 当前仅有工作簿证据审阅；没有视觉验证结论。",
  pending: "等待两路识别完成，当前不能导入。",
  matched: "两路候选字段一致",
  matchedHint: "一致仅说明两路识别结果相符，不证明模型准确；仍须人工对照原文件。",
  blocked: "两路结果有差异，导入已阻断",
  confirm:
    "我已对照原 Excel 和截图，核实逐件包号、源行、厘米尺寸、包装数、单包装公斤毛重及原单合计。",
  sourceTotals: "两路原单合计各自保留，缺失仍为未知，不使用明细计算合计补齐。",
  workbook: "Excel",
  image: "截图",
  field: "字段（cm / kg）",
  identity: "包装 / 源行",
  issue: "核对结果",
  none: "—",
  textNotice: "也可展开下方文本输入；切换来源后需重新核对。",
  codes: {
    pending: "识别未完成或不可用",
    workbookBlocked: "Excel 原始核对仍被阻断",
    imageBlocked: "截图不完整、缺字段或原单核对未通过",
    identityUncertain:
      "无法唯一对应一件物理包装；包装组须在原表明确每件对应关系后重新识别，禁止按顺序猜配",
    unmatched: "仅一路存在此包装",
    missingField: "必要字段缺失或无效",
    fieldConflict: "两路字段不一致",
    sourceTotalConflict: "两路独立原单合计不一致",
    noRows: "缺少可核对的包装明细"
  },
  fields: {
    lengthCm: "长 cm",
    widthCm: "宽 cm",
    heightCm: "高 cm",
    quantity: "包装数",
    weightKg: "单包装毛重 kg",
    name: "货物名称",
    model: "型号",
    type: "包装类型",
    nonStack: "不可重压",
    keepUpright: "保持朝上",
    sourceSheet: "来源工作表",
    sourceRows: "来源行",
    marks: "唛头",
    packageCount: "原单包装合计",
    innerQuantity: "原单内件合计",
    grossWeightKg: "原单毛重 kg",
    declaredVolumeM3: "原单体积 m³",
    workbook: "Excel 身份",
    image: "截图身份"
  }
};
const en = {
  title: "Smart import",
  description:
    "Upload an Excel file or a complete, readable packing-list image. The file type selects the recognition workflow. Review every result against its source before import.",
  choose: "Choose Excel / image",
  support: "XLSX / XLS / CSV / TSV · PNG / JPEG (images ≤5 MB)",
  invalid: "Choose a supported workbook or a PNG/JPEG no larger than 5 MB.",
  selected: "Current source",
  auxiliary: "Cross-check with an original table image",
  auxiliaryHint:
    "When units, merged rows or package grouping are uncertain, attach a complete image of the same table. Both proposals must match package by package; an image cannot override an Excel source block. Include all packages across sheets; incomplete matching blocks import.",
  chooseAuxiliary: "Choose cross-check image",
  removeAuxiliary: "Remove cross-check image",
  noVisual:
    "No image cross-check has run. Excel currently has workbook evidence review only; there is no visual validation result.",
  pending: "Waiting for both recognition results. Import is blocked.",
  matched: "Both proposals agree",
  matchedHint:
    "Agreement only compares the two recognition proposals; it does not prove model accuracy. Human source review is still required.",
  blocked: "Evidence differs; import is blocked",
  confirm:
    "I checked both sources: individual package IDs, source rows, centimetre dimensions, package counts, gross kg per package and independent source totals.",
  sourceTotals:
    "Each source retains its independent printed totals. Missing totals remain unknown; calculated row sums never fill them in.",
  workbook: "Excel",
  image: "Image",
  field: "Field (cm / kg)",
  identity: "Package / source rows",
  issue: "Cross-check result",
  none: "—",
  textNotice: "You can also expand text input below. Changing sources requires a fresh review.",
  codes: {
    pending: "Recognition pending or unavailable",
    workbookBlocked: "Excel source review is blocked",
    imageBlocked: "Image is incomplete, has missing fields or fails source checks",
    identityUncertain:
      "Cannot uniquely match a physical package. Make individual package identities explicit in the source and recognize it again; row order is not evidence",
    unmatched: "Package appears in only one source",
    missingField: "Required field is missing or invalid",
    fieldConflict: "Fields disagree",
    sourceTotalConflict: "Independent source totals disagree",
    noRows: "No comparable package rows"
  },
  fields: {
    lengthCm: "Length cm",
    widthCm: "Width cm",
    heightCm: "Height cm",
    quantity: "Packages",
    weightKg: "Gross kg/package",
    name: "Cargo name",
    model: "Model",
    type: "Package type",
    nonStack: "No stacking",
    keepUpright: "Keep upright",
    sourceSheet: "Source sheet",
    sourceRows: "Source rows",
    marks: "Marks",
    packageCount: "Printed package total",
    innerQuantity: "Printed inner quantity",
    grossWeightKg: "Printed gross kg",
    declaredVolumeM3: "Printed volume m³",
    workbook: "Excel identity",
    image: "Image identity"
  }
};
export const unifiedImportMessages = { "zh-CN": zh, "en-US": en };
