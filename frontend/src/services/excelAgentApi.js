import { fetchWithApiFallback, requestJson } from "./apiClient";

const configuredBase = import.meta.env.VITE_API_BASE_URL;

export async function createExcelCleaningTask(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("mode", "agent");
  return request("/excel-cleaning/tasks", {
    method: "POST",
    body: formData
  });
}

export async function parseCargoImportFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  return request("/cargo-imports/preview", {
    method: "POST",
    body: formData
  });
}

export function fetchExcelCleaningTasks() {
  return request("/excel-cleaning/tasks");
}

export function fetchExcelCleaningTask(id) {
  return request(`/excel-cleaning/tasks/${id}`);
}

export async function downloadCleanedExcel(id, fileName = "cleaned-cargos.xlsx") {
  const response = await fetchWithApiFallback(`/excel-cleaning/tasks/${id}/cleaned-excel`, {}, configuredBase);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function createTextRecognitionTask(text, options = {}) {
  return request("/text-recognition/tasks", {
    method: "POST",
    body: {
      text,
      sourceName: options.sourceName || "pasted-text",
      mode: options.mode || "agent",
      languageHint: options.languageHint || "auto"
    }
  });
}

export function fetchTextRecognitionCapabilities() {
  return request("/text-recognition/capabilities");
}

export function fetchTextRecognitionTasks() {
  return request("/text-recognition/tasks");
}

export function fetchTextRecognitionTask(id) {
  return request(`/text-recognition/tasks/${id}`);
}

export async function waitForTextRecognitionTask(id, options = {}) {
  const requestedIntervalMs = Number(options.intervalMs);
  const initialIntervalMs = Math.max(800, Number.isFinite(requestedIntervalMs) ? requestedIntervalMs : 1000);
  const requestedMaxIntervalMs = Number(options.maxIntervalMs);
  const maxIntervalMs = Math.max(
    initialIntervalMs,
    Number.isFinite(requestedMaxIntervalMs) ? requestedMaxIntervalMs : 2500
  );
  const timeoutMs = Math.max(30000, Number(options.timeoutMs || 10 * 60 * 1000));
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const task = await fetchTextRecognitionTask(id);
    if (["SUCCEEDED", "FAILED"].includes(task?.status)) return task;
    const elapsedMs = Date.now() - startedAt;
    const intervalMs = elapsedMs < 15000
      ? initialIntervalMs
      : elapsedMs < 60000
        ? Math.min(maxIntervalMs, Math.max(initialIntervalMs, 1500))
        : maxIntervalMs;
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
  const error = new Error("TEXT_RECOGNITION_TIMEOUT");
  error.code = "TEXT_RECOGNITION_TIMEOUT";
  throw error;
}

export async function downloadTextRecognitionExcel(id, fileName = "text-recognition-cargos.xlsx") {
  const response = await fetchWithApiFallback(`/text-recognition/tasks/${id}/cleaned-excel`, {}, configuredBase);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function request(path, options = {}) {
  const headers = options.body instanceof FormData ? {} : { "Content-Type": "application/json" };
  return requestJson(path, {
    method: options.method || "GET",
    headers,
    body: options.body
  }, configuredBase);
}
