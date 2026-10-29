const zh = {
  textEditor: {
    label: "货物明细",
    hint: "请保留独立包装编号、尺寸单位、包装数和单包装毛重，便于逐项核对。"
  },
  eyebrow: "SMART IMPORT",
  reviewBadge: "逐项审阅后导入",
  stepsLabel: "导入步骤",
  reviewStep: "核对识别结果",
  importStep: "确认加入货物",
  browse: "浏览文件",
  changeSource: "更换文件",
  replaceSource: "点击或拖入文件以更换，已有识别结果将重新核对。",
  optional: "按需展开",
  excelGuidance:
    "请保留原表标题、尺寸单位和合计行。上传后可预览原工作簿，逐项核实包装与重量，再确认导入。",
  modes: {
    excel: {
      title: "Excel 智能导入",
      description: "从原始装箱单开始，识别包装明细，核对尺寸、数量与毛重。",
      choose: "选择装箱单，或将文件拖到这里",
      support: "支持 XLSX / XLS / CSV / TSV · 保留原始表格与单位",
      sourceStep: "上传原始表格"
    },
    image: {
      title: "图片智能导入",
      description: "上传清晰完整的装箱单图片，对照原图审阅识别结果。",
      choose: "选择装箱单图片，或将图片拖到这里",
      support: "支持 PNG / JPEG · 单张不超过 5 MB",
      sourceStep: "上传完整图片"
    },
    text: {
      title: "文本智能导入",
      description: "粘贴货物明细，保留尺寸单位与包装信息，识别后逐项核对。",
      sourceStep: "粘贴货物文本"
    }
  },
  title: "智能导入",
  description:
    "统一上传 Excel 或完整清晰的装箱单截图，系统按文件类型识别。所有结果均须对照来源审阅后导入。",
  choose: "选择 Excel / 图片",
  support: "XLSX / XLS / CSV / TSV · PNG / JPEG（图片 ≤5 MB）",
  invalid: "请选择支持的 Excel 文件或不超过 5 MB 的 PNG/JPEG 图片。",
  selected: "当前来源",
  auxiliary: "附加原表截图核对",
  auxiliaryHint:
    "如需核对单位、合并行或包装归属，可附上同一装箱单的完整截图。Excel 与图片中的包装必须逐件对应；任何一方有差异或缺失都不能导入。多张工作表需涵盖全部包装。",
  chooseAuxiliary: "选择核对截图",
  removeAuxiliary: "移除核对截图",
  noVisual: "未附截图时，仅核对原工作簿；上传截图后才会增加原图比对。",
  pending: "等待两路识别完成，当前不能导入。",
  matched: "Excel 与图片字段一致",
  matchedHint: "识别结果一致仍须人工核实。请对照原文件检查每件包装，确认尺寸、数量和毛重。",
  blocked: "Excel 与图片尚未核对通过，暂不能导入",
  confirm:
    "我已对照原 Excel 和截图，核实逐件包号、源行、厘米尺寸、包装数、单包装公斤毛重及原单合计。",
  sourceTotals: "Excel 和原图的合计分别保留；原单没有注明的合计将显示为未知，不以计算值代替。",
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
  textEditor: {
    label: "Cargo details",
    hint: "Keep package IDs, dimension units, package counts and gross weight per package in the original text."
  },
  eyebrow: "SMART IMPORT",
  reviewBadge: "Review before import",
  stepsLabel: "Import steps",
  reviewStep: "Review recognized details",
  importStep: "Confirm cargo import",
  browse: "Browse files",
  changeSource: "Change file",
  replaceSource: "Click or drop a replacement. A new source requires a fresh review.",
  optional: "Optional",
  excelGuidance:
    "Keep original headers, units and totals. Preview the source workbook and verify packages and gross weights before importing.",
  modes: {
    excel: {
      title: "Excel smart import",
      description:
        "Start with the original packing list. Recognize package details and verify dimensions, counts and gross weights.",
      choose: "Choose a packing list or drop it here",
      support: "XLSX / XLS / CSV / TSV · Keep original tables and units",
      sourceStep: "Upload original workbook"
    },
    image: {
      title: "Image smart import",
      description:
        "Upload a complete, readable packing-list image and review every recognized value against it.",
      choose: "Choose a packing-list image or drop it here",
      support: "PNG / JPEG · Up to 5 MB per image",
      sourceStep: "Upload complete image"
    },
    text: {
      title: "Text smart import",
      description:
        "Paste cargo details with their units and packaging information, then review the recognized results.",
      sourceStep: "Paste cargo details"
    }
  },
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
