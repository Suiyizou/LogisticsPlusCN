export const shipmentBatchMessages = {
  "zh-CN": {
    batchTrackProgress: "\u4efb\u52a1 {status}\uff1a{done}/{total}\uff08\u5df2\u8ffd\u8e2a {succeeded}\uff0c\u5f85\u4eba\u5de5 {manual}\uff0c\u5931\u8d25 {failed}\uff09",
    trackSheet: "\u5de5\u4f5c\u8868",
    trackColumn: "\u8ffd\u8e2a\u5355\u53f7\u5217",
    trackColumnDecision: "\u6240\u9009\u5217\u5c06\u4f5c\u4e3a\u552f\u4e00\u5355\u53f7\u6765\u6e90\uff1a{trackable} \u6761 COSU \u540e\u53f0\u8ffd\u8e2a\uff0c{manual} \u6761\u4ec5\u5efa\u6863\u5f85\u4eba\u5de5\u8865\u5f55\u3002",
    trackSucceeded: "\u8ffd\u8e2a\u5b8c\u6210",
    trackManualPlaceholder: "\u5df2\u5efa\u6863\uff0c\u7b49\u5f85\u4eba\u5de5\u8865\u5f55",
    trackFailed: "\u5904\u7406\u5931\u8d25",
    trackStopped: "\u4efb\u52a1\u5df2\u7ec8\u6b62\uff0c\u672a\u5904\u7406",
    batchTrackStartFailed: "\u540e\u53f0\u6279\u91cf\u4efb\u52a1\u521b\u5efa\u5931\u8d25",
    batchTrackCancelFailed: "\u7ec8\u6b62\u4efb\u52a1\u5931\u8d25",
    trackExcelColumnsHint: "\u652f\u6301 .xlsx/.xls/.csv\uff1b\u4e0a\u4f20\u540e\u5148\u9884\u89c8\u5e76\u7531\u4f60\u9009\u62e9\u8ffd\u8e2a\u5217",
    trackExcelRule: "\u7cfb\u7edf\u53ea\u63d0\u4f9b\u5efa\u8bae\u5217\uff1b\u63d0\u4ea4\u65f6\u4ec5\u4f7f\u7528\u4f60\u660e\u786e\u9009\u62e9\u7684\u5217\uff0c\u4e0d\u4f1a\u626b\u63cf\u5176\u4ed6\u5217\u8865\u731c\u5355\u53f7\u3002"
  },
  "en-US": {
    batchTrackProgress: "Task {status}: {done}/{total} ({succeeded} tracked, {manual} manual, {failed} failed)",
    trackSheet: "Worksheet",
    trackColumn: "Tracking column",
    trackColumnDecision: "Only the selected column supplies references: {trackable} COSU rows will be tracked and {manual} rows will be saved for manual entry.",
    trackSucceeded: "Tracking completed",
    trackManualPlaceholder: "Saved for manual entry",
    trackFailed: "Processing failed",
    trackStopped: "Task stopped before processing",
    batchTrackStartFailed: "Could not create the background batch task",
    batchTrackCancelFailed: "Could not stop the batch task",
    trackExcelColumnsHint: "Supports .xlsx/.xls/.csv; preview the workbook and choose the tracking column before submitting.",
    trackExcelRule: "The system only suggests a column. Submission uses only the column you explicitly select and never guesses from other columns."
  }
};
