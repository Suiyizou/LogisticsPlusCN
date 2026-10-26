// @ts-check
import { reactive, ref } from "vue";
import { useAdminSessionGuard, adminErrorText } from "./useAdminSessionGuard.js";
import {
  adminFilePreviewKind,
  adminShipmentFileDeleted,
  adminShipmentFileId
} from "./adminFileRules.js";

export const ADMIN_TEXT_PREVIEW_LIMIT = 1024 * 1024;
/** @param {import("../../types/adminFiles").AdminFilePreviewPorts} ports */
export function useAdminFilePreview({
  currentUser,
  fetchBlob,
  createObjectUrl,
  revokeObjectUrl,
  t,
  handled
}) {
  /** @type {import("../../types/adminFiles").AdminFilePreviewState} */
  const empty = { open: false, kind: "", name: "", url: "", text: "", message: "", isError: false };
  const filePreviewDialog = reactive({ ...empty });
  const reading = ref(false);
  let version = 0;
  /** @type {string | number | null} */
  let selectedId = null;
  const session = useAdminSessionGuard({ currentUser, invalidate: closeFilePreviewDialog });
  function closeFilePreviewDialog() {
    version++;
    if (filePreviewDialog.url) revokeObjectUrl(filePreviewDialog.url);
    Object.assign(filePreviewDialog, empty);
    reading.value = false;
    selectedId = null;
  }
  /** @param {string | number} id */
  function closeDeletedFile(id) {
    if (selectedId !== null && String(id) === String(selectedId)) closeFilePreviewDialog();
  }
  /** @param {import("../../types/adminFiles").AdminShipmentFile} file */
  async function handlePreviewShipmentFile(file) {
    const context = session.capture(),
      id = adminShipmentFileId(file);
    if (context === null || id === "" || adminShipmentFileDeleted(file)) return false;
    const name = file.originalFileName || file.fileName || "";
    closeFilePreviewDialog();
    const request = version;
    selectedId = id;
    reading.value = true;
    Object.assign(filePreviewDialog, {
      open: true,
      name,
      message: t("admin.files.previewLoading")
    });
    const current = () => session.current(context) && request === version && filePreviewDialog.open;
    try {
      const blob = await fetchBlob(id);
      if (!current()) return false;
      const kind = adminFilePreviewKind(name, blob.type);
      if (kind === "pdf" || kind === "image") {
        filePreviewDialog.url = createObjectUrl(blob);
        filePreviewDialog.kind = kind;
        filePreviewDialog.message = t("admin.files.previewDownloadTip");
      } else if (kind === "text") {
        const text = await blob.slice(0, ADMIN_TEXT_PREVIEW_LIMIT).text();
        if (!current()) return false;
        filePreviewDialog.text = text;
        filePreviewDialog.kind = "text";
        filePreviewDialog.message = t(
          blob.size > ADMIN_TEXT_PREVIEW_LIMIT
            ? "adminWorkflow.textPreviewTruncated"
            : "admin.files.previewTextFallback",
          { name }
        );
      } else {
        filePreviewDialog.kind = "fallback";
        filePreviewDialog.text = t("admin.files.previewNotSupported");
        filePreviewDialog.message = t("admin.files.previewDownloadTip");
      }
      return true;
    } catch (error) {
      handled(error);
      if (!current()) return false;
      Object.assign(filePreviewDialog, {
        kind: "fallback",
        text: t("admin.files.previewNotSupported"),
        isError: true,
        message: t("admin.files.previewFailed", { message: adminErrorText(error, "error") })
      });
      return false;
    } finally {
      if (current()) reading.value = false;
    }
  }
  return {
    filePreviewDialog,
    reading,
    handlePreviewShipmentFile,
    closeFilePreviewDialog,
    closeDeletedFile
  };
}
