import { fetchWithApiFallback, requestJson } from "./apiClient";

const configuredBase = import.meta.env.VITE_API_BASE_URL;

export function uploadWorkspaceFiles(files, source = "cargo-import") {
  const formData = new FormData();
  for (const file of Array.from(files || [])) {
    formData.append("files", file);
  }
  if (source) formData.append("source", source);
  return requestJson("/workspace-files", {
    method: "POST",
    headers: {},
    body: formData
  }, configuredBase);
}

export function fetchWorkspaceFiles(options = {}) {
  const params = new URLSearchParams();
  if (options.date) params.set("date", options.date);
  params.set("page", String(Math.max(0, Number(options.page || 0))));
  params.set("size", String(Math.max(1, Number(options.size || 100))));
  return requestJson(`/workspace-files?${params.toString()}`, {}, configuredBase);
}

export function reuseWorkspaceFile(id) {
  return requestJson(`/workspace-files/${encodeURIComponent(id)}/reuse`, {
    method: "POST"
  }, configuredBase);
}

export function deleteWorkspaceFile(id) {
  return requestJson(`/workspace-files/${encodeURIComponent(id)}`, {
    method: "DELETE"
  }, configuredBase);
}

export async function fetchWorkspaceFileBlob(id, disposition = "download") {
  const action = disposition === "preview" ? "preview" : "download";
  const response = await fetchWithApiFallback(
    `/workspace-files/${encodeURIComponent(id)}/${action}`,
    {},
    configuredBase
  );
  return response.blob();
}
