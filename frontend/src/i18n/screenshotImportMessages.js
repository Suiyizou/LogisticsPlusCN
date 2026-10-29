export const screenshotImportMessages = {
  "zh-CN": {
    sourceReview: "来源中的单位、表格区间或体积需要复核。请对照原文件更正或确认候选值。",
    totalsUnknown:
      "未提供可独立核对的原单合计；当前数字仅为识别明细的计算合计，不代表与原单核对一致。请逐项对照原图确认。",
    rowTotals: "当前明细计算合计",
    printedTotals: "原图明确印出的合计（缺失为 —）",
    sourceBlocked:
      "原始来源仍有阻断问题，或原单包装/重量合计与当前明细不一致；确认不能解除，请核实完整原图后重新识别。",
    packageNo: "独立包装编号",
    marks: "唛头",
    identityReview:
      "独立包装编号/唛头对应一件实物包装，不可重复、使用区间或搭配多件数量。请对照原图修正；成组包装信息可保留在来源依据中。",
    sourceConfirm: "我已核实来源单位、包装尺寸、数量、重量及表格区间，并确认以上结果。",
    unitUnproven: "原文件未明确证明候选单位，必须核实单位并更正或确认。",
    unitConflict: "候选单位与原文件明确单位冲突，请更正映射或分开导入不同单位的表格区间。",
    controlExcluded: "已从货物中排除重复标题或合计行，请确认表格区间。",
    title: "截图识别",
    description: "上传完整清晰的 PNG/JPEG（≤5 MB）。截图通过视觉模型识别；Excel 请使用工作簿解析。",
    caution:
      "当前配置的模型需支持图片输入，视觉能力尚未在线验证。识别结果可能有误，导入前请逐项对照原图核实。",
    choose: "选择截图",
    start: "开始识别",
    cancel: "停止等待",
    running: "正在识别截图…",
    failed: "截图识别失败，请确认后台模型支持图片输入后重试。",
    unsupported: "当前后端未提供独立截图识别能力。",
    timeout: "等待已结束，请稍后重新识别。",
    invalidFile: "请选择不超过 5 MB 的 PNG 或 JPEG 文件。",
    name: "货物名称",
    model: "型号",
    lengthCm: "长 cm",
    widthCm: "宽 cm",
    heightCm: "高 cm",
    quantity: "包装数",
    weightKg: "单包装毛重 kg",
    type: "包装类型",
    normal: "普通包装",
    pallet: "托盘/木箱",
    nonStack: "不可重压",
    keepUpright: "保持朝上",
    sourceText: "原图字段与单位依据",
    confirm:
      "我已逐项对照完整原图，确认外包装尺寸、单位、包装数量、单包装毛重和约束；已更正缺失或模糊字段。",
    incomplete: "原图内容不完整或无法完整识别，请重新上传完整清晰的截图。",
    invalidRows: "标记的行仍有缺失或无效字段，请更正后确认。",
    import: "确认导入货物",
    issues: "识别待复核项",
    preview: "来源截图",
    row: "行",
    noRows: "尚无识别结果。",
    canceled: "已停止等待，后台任务可能继续；当前结果不会导入。"
  },
  "en-US": {
    sourceReview:
      "Source units, table boundaries or volume require review. Correct or confirm the proposed values against the original file.",
    totalsUnknown:
      "Independent source totals are unavailable. Displayed sums are calculated from proposed rows and do not prove agreement with the original. Verify every value against the image.",
    rowTotals: "Calculated row totals",
    printedTotals: "Explicit printed source totals (— means unavailable)",
    sourceBlocked:
      "The source retains blocking issues, or package/weight totals disagree with current details. Confirmation cannot override this; verify the complete image and recognize it again.",
    packageNo: "Individual package ID",
    marks: "Marks",
    identityReview:
      "An individual package ID/mark must identify one physical package, without duplicates or ranges. Correct it against the source; group labels may be retained in the visible source evidence.",
    sourceConfirm:
      "I verified source units, outer dimensions, package counts, gross weights and table boundaries, and confirm these values.",
    unitUnproven:
      "The original source does not prove the proposed unit. Verify and correct or confirm it.",
    unitConflict:
      "The proposed unit conflicts with the original source. Correct the mapping or split regions with different units.",
    controlExcluded:
      "A repeated heading or total was excluded from cargo. Verify the table boundaries.",
    title: "Screenshot recognition",
    description:
      "Upload a complete, readable PNG/JPEG (≤5 MB). Images use vision recognition; use workbook parsing for Excel.",
    caution:
      "The configured model must support image input. Vision support has not been verified online. Review every proposed value against the source before importing.",
    choose: "Choose screenshot",
    start: "Recognize image",
    cancel: "Stop waiting",
    running: "Recognizing screenshot…",
    failed:
      "Screenshot recognition failed. Check that the configured model supports images and retry.",
    unsupported: "This backend does not provide the separate screenshot contract.",
    timeout: "Recognition wait expired. Please retry later.",
    invalidFile: "Choose a PNG or JPEG no larger than 5 MB.",
    name: "Cargo name",
    model: "Model",
    lengthCm: "Length cm",
    widthCm: "Width cm",
    heightCm: "Height cm",
    quantity: "Packages",
    weightKg: "Gross kg/package",
    type: "Package type",
    normal: "Ordinary package",
    pallet: "Pallet/wooden case",
    nonStack: "No stacking",
    keepUpright: "Keep upright",
    sourceText: "Visible source values and units",
    confirm:
      "I reviewed every value against the complete source image, including outer dimensions, units, package count, gross weight per package and handling constraints, and corrected missing or ambiguous fields.",
    incomplete: "The image could not be read completely. Upload a complete readable screenshot.",
    invalidRows:
      "Highlighted rows contain missing or invalid fields. Correct them before confirming.",
    import: "Confirm cargo import",
    issues: "Recognition review items",
    preview: "Source screenshot",
    row: "Row",
    noRows: "No recognition result yet.",
    canceled:
      "Stopped waiting. The backend task may continue; results from this request will not be imported."
  }
};
