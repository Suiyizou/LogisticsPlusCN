export const shipmentBatchMessages = {
  "zh-CN": {
    trackImportSummary:
      "可提交 {ready} 条；问题 {blocked} 项；跳过 {skipped} 行；重复 {duplicates} 条",
    trackImportBlocked: "请修正原文件中的问题后重新上传，当前不会创建导入任务。",
    trackImportRow: "原表第 {row} 行",
    trackFieldMapping: "识别字段映射",
    trackSourceRow: "原行号",
    trackOriginalReference: "原始单号",
    trackQueryReference: "提交查询号",
    trackCarrierEvidence: "船司依据",
    trackValidation: "校验结果",
    batchTrackProgress:
      "\u4efb\u52a1 {status}\uff1a{done}/{total}\uff08\u5df2\u8ffd\u8e2a {succeeded}\uff0c\u5f85\u4eba\u5de5 {manual}\uff0c\u5931\u8d25 {failed}\uff09",
    trackSheet: "\u5de5\u4f5c\u8868",
    trackColumn: "\u8ffd\u8e2a\u5355\u53f7\u5217",
    trackColumnDecision:
      "所选列作为唯一查询号来源：{trackable} 条通过当前船司能力校验，{manual} 条需人工处理。有阻断问题时不会提交整批。",
    trackSucceeded: "\u8ffd\u8e2a\u5b8c\u6210",
    trackManualPlaceholder: "\u5df2\u5efa\u6863\uff0c\u7b49\u5f85\u4eba\u5de5\u8865\u5f55",
    trackFailed: "\u5904\u7406\u5931\u8d25",
    trackStopped: "\u4efb\u52a1\u5df2\u7ec8\u6b62\uff0c\u672a\u5904\u7406",
    batchTrackStartFailed: "\u540e\u53f0\u6279\u91cf\u4efb\u52a1\u521b\u5efa\u5931\u8d25",
    batchTrackCancelFailed: "\u7ec8\u6b62\u4efb\u52a1\u5931\u8d25",
    trackExcelColumnsHint:
      "\u652f\u6301 .xlsx/.xls/.csv\uff1b\u4e0a\u4f20\u540e\u5148\u9884\u89c8\u5e76\u7531\u4f60\u9009\u62e9\u8ffd\u8e2a\u5217",
    trackExcelRule:
      "\u7cfb\u7edf\u53ea\u63d0\u4f9b\u5efa\u8bae\u5217\uff1b\u63d0\u4ea4\u65f6\u4ec5\u4f7f\u7528\u4f60\u660e\u786e\u9009\u62e9\u7684\u5217\uff0c\u4e0d\u4f1a\u626b\u63cf\u5176\u4ed6\u5217\u8865\u731c\u5355\u53f7\u3002"
  },
  "en-US": {
    trackImportSummary:
      "{ready} ready; {blocked} issues; {skipped} skipped rows; {duplicates} duplicates",
    trackImportBlocked:
      "Correct the source workbook and upload again before creating an import task.",
    trackImportRow: "Source row {row}",
    trackFieldMapping: "Detected field mapping",
    trackSourceRow: "Row",
    trackOriginalReference: "Original reference",
    trackQueryReference: "Query reference",
    trackCarrierEvidence: "Carrier evidence",
    trackValidation: "Validation",
    batchTrackProgress:
      "Task {status}: {done}/{total} ({succeeded} tracked, {manual} manual, {failed} failed)",
    trackSheet: "Worksheet",
    trackColumn: "Tracking column",
    trackColumnDecision:
      "Only the selected column supplies references: {trackable} pass the configured carrier checks; {manual} need manual attention. Blocking issues prevent the entire submission.",
    trackSucceeded: "Tracking completed",
    trackManualPlaceholder: "Saved for manual entry",
    trackFailed: "Processing failed",
    trackStopped: "Task stopped before processing",
    batchTrackStartFailed: "Could not create the background batch task",
    batchTrackCancelFailed: "Could not stop the batch task",
    trackExcelColumnsHint:
      "Supports .xlsx/.xls/.csv; preview the workbook and choose the tracking column before submitting.",
    trackExcelRule:
      "The system only suggests a column. Submission uses only the column you explicitly select and never guesses from other columns."
  }
};
