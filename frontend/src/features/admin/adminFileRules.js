// @ts-check
const images = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);
const texts = new Set([
  "txt",
  "csv",
  "log",
  "json",
  "xml",
  "md",
  "markdown",
  "html",
  "htm",
  "js",
  "ts",
  "jsx",
  "tsx",
  "css",
  "scss",
  "less",
  "yml",
  "yaml",
  "ini",
  "conf",
  "properties",
  "sh",
  "bash",
  "bat",
  "ps1",
  "sql",
  "java",
  "py",
  "rb",
  "go",
  "rs",
  "c",
  "cc",
  "cpp",
  "h",
  "hpp",
  "php",
  "swift",
  "kt",
  "dart",
  "toml",
  "env",
  "gitignore"
]);
/** @param {import("../../types/adminFiles").AdminShipmentFile} file */
export function adminShipmentFileId(file) {
  return file.id ?? file.publicId ?? "";
}
/** @param {import("../../types/adminFiles").AdminShipmentFile} file */
export function adminShipmentFileDeleted(file) {
  return String(file.status || "").toUpperCase() === "DELETED" || Boolean(file.deletedAt);
}
/** @param {string} name @param {string} mime
 * @returns {import("../../types/adminFiles").AdminFilePreviewKind} */
export function adminFilePreviewKind(name, mime) {
  const extension = name.trim().toLowerCase().split(".").slice(1).pop() || "";
  if (extension === "pdf") return "pdf";
  if (images.has(extension)) return "image";
  if (texts.has(extension)) return "text";
  // Office files are compound/ZIP binary documents, not extracted text. Unknown
  // files are rendered as text only when their response explicitly declares it.
  if (/^(docx?|xlsx?|pptx?|odt|ods|odp)$/.test(extension)) return "fallback";
  return /^text\/|^application\/(json|xml)(;|$)/i.test(mime) ? "text" : "fallback";
}
