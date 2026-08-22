import { buildPreview, readWorkbook } from "../services/excelImport";

const workerScope = typeof self !== "undefined" ? self : null;

if (workerScope?.addEventListener) {
  workerScope.onmessage = async (event) => {
    const { id, action, payload } = event.data || {};
    try {
      let result = null;
      if (action === "readWorkbook") {
        result = await readWorkbook(payload.file);
      } else if (action === "buildPreview") {
        result = buildPreview(payload.sheet, payload.mapping || {}, payload.options || {});
      } else {
        throw new Error("Unsupported excel import action");
      }
      workerScope.postMessage({ id, type: "result", result });
    } catch (error) {
      workerScope.postMessage({
        id,
        type: "error",
        message: error?.message || "Excel/CSV 解析失败，请检查文件格式。"
      });
    }
  };
}
