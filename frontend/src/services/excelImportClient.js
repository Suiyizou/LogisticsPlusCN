let currentJobId = 0;

export function readWorkbookInWorker(file) {
  return runExcelImportWorker("readWorkbook", { file }, workbookTimeoutMs(file));
}

export function buildPreviewInWorker(sheet, mapping, options) {
  const rowCount = Array.isArray(sheet?.rows) ? sheet.rows.length : 0;
  return runExcelImportWorker("buildPreview", { sheet, mapping, options }, Math.min(180000, Math.max(30000, rowCount * 8 + 30000)));
}

function runExcelImportWorker(action, payload, timeoutMs) {
  const id = ++currentJobId;
  const worker = new Worker(new URL("../workers/excelImportWorker.js", import.meta.url), { type: "module" });

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      settle(reject, new Error("文件解析时间过长，请确认文件行数，或拆分为较小批次后再导入。"));
    }, timeoutMs);

    function cleanup() {
      window.clearTimeout(timer);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }

    function settle(callback, value) {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    }

    worker.onmessage = (event) => {
      const { id: messageId, type, result, message } = event.data || {};
      if (messageId !== id) return;
      if (type === "result") settle(resolve, result);
      else settle(reject, new Error(message || "文件解析失败，请检查 Excel/CSV 格式。"));
    };

    worker.onerror = (error) => {
      settle(reject, new Error(error?.message || "文件解析失败，请检查 Excel/CSV 格式。"));
    };

    worker.onmessageerror = () => {
      settle(reject, new Error("文件解析结果无法传回页面，请检查 Excel/CSV 格式。"));
    };

    try {
      worker.postMessage({ id, action, payload });
    } catch (error) {
      settle(reject, new Error(error?.message || "文件解析任务启动失败。"));
    }
  });
}

function workbookTimeoutMs(file) {
  const sizeMb = Number(file?.size || 0) / 1024 / 1024;
  return Math.min(240000, Math.max(45000, sizeMb * 12000 + 45000));
}
