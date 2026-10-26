// @ts-check
import { computed, nextTick, reactive, ref } from "vue";
import { adminErrorText, useAdminSessionGuard } from "./useAdminSessionGuard.js";

/** @param {import("../../types/adminWorkflows").AdminAnnouncementPorts} ports */
export function useAdminAnnouncements({
  currentUser,
  isHostBusy,
  services,
  feedback,
  t,
  translate,
  copy,
  today,
  safeUrl,
  confirmDelete,
  editor
}) {
  /** @type {import("vue").Ref<import("../../types/adminWorkflows").AdminAnnouncement[]>} */
  const announcements = ref([]);
  const announcementTotal = ref(0),
    announcementPage = ref(1),
    announcementPageSize = ref(20);
  const announcementsLoaded = ref(false),
    announcementDialogOpen = ref(false);
  /** @type {import("vue").Ref<string | number>} */
  const editingAnnouncementId = ref("");
  const announcementDialogError = ref(""),
    announcementImageUploading = ref(false);
  const announcementUploadedPath = ref(""),
    pending = ref(false),
    reading = ref(0);
  /** @type {import("vue").Ref<"cover" | "body">} */
  const announcementImageInsertMode = ref("cover");
  const announcementImageDragging = ref(false);
  /** @type {import("vue").Ref<import("../../types/adminWorkflows").AdminAnnouncement | null>} */
  const announcementPreviewRecord = ref(null);
  const emptyForm = () => ({
    title: "",
    contentMarkdown: "",
    imageUrl: "",
    illustrationRef: "",
    audience: "ALL",
    displayDate: today()
  });
  const announcementForm = reactive(emptyForm());
  const busy = computed(
    () => pending.value || reading.value > 0 || announcementImageUploading.value
  );
  let readVersion = 0,
    draftVersion = 0;
  const session = useAdminSessionGuard({ currentUser, invalidate });
  const canEdit = computed(
    () => session.authorized() && announcementDialogOpen.value && !pending.value && !isHostBusy()
  );
  function clearDraft() {
    draftVersion++;
    announcementDialogOpen.value = false;
    editingAnnouncementId.value = "";
    announcementDialogError.value = "";
    announcementUploadedPath.value = "";
    announcementImageUploading.value = false;
    announcementImageInsertMode.value = "cover";
    announcementImageDragging.value = false;
    Object.assign(announcementForm, emptyForm());
    editor.cleared();
  }
  function invalidate() {
    readVersion++;
    pending.value = false;
    reading.value = 0;
    announcements.value = [];
    announcementTotal.value = 0;
    announcementPage.value = 1;
    announcementPageSize.value = 20;
    announcementsLoaded.value = false;
    announcementPreviewRecord.value = null;
    clearDraft();
  }
  /** Raw loader also serves dashboard initialization; host busy is checked at user entry points.
   * @param {boolean} [afterWrite] */
  async function readPage(afterWrite = false) {
    const context = session.capture();
    if (context === null || (pending.value && !afterWrite)) return false;
    const version = ++readVersion,
      page = announcementPage.value,
      size = announcementPageSize.value;
    reading.value++;
    const current = () =>
      session.current(context) &&
      version === readVersion &&
      page === announcementPage.value &&
      size === announcementPageSize.value;
    try {
      let data = await services.fetchAnnouncements({ page: page - 1, size });
      if (!current()) return false;
      const total = Number.isFinite(data.total)
        ? Math.max(0, Math.floor(data.total ?? 0))
        : (data.items?.length ?? 0);
      const lastPage = Math.max(1, Math.ceil(total / size));
      if (page > lastPage) {
        data = await services.fetchAnnouncements({ page: lastPage - 1, size });
        if (!current()) return false;
        announcementPage.value = lastPage;
      }
      announcements.value = Array.isArray(data.items) ? data.items : [];
      announcementTotal.value = Number.isFinite(data.total)
        ? Math.max(0, Math.floor(data.total ?? 0))
        : announcements.value.length;
      announcementsLoaded.value = true;
      return true;
    } catch (error) {
      feedback.handled(error);
      if (current()) throw error;
      return false;
    } finally {
      if (session.current(context)) reading.value--;
    }
  }
  /** @param {number} [page] @param {number} [size] */
  async function loadAnnouncementPage(
    page = announcementPage.value,
    size = announcementPageSize.value
  ) {
    const context = session.capture();
    if (
      context === null ||
      pending.value ||
      isHostBusy() ||
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(size) ||
      size < 1
    )
      return false;
    announcementPage.value = page;
    announcementPageSize.value = size;
    try {
      return await readPage();
    } catch (error) {
      if (session.current(context))
        await feedback.error(translate(adminErrorText(error, t("admin.employee.errorFallback"))));
      return false;
    }
  }
  /** @param {import("../../types/adminWorkflows").AdminAnnouncement | null} [record] */
  function openAnnouncementEditor(record = null) {
    if (!session.authorized() || busy.value || isHostBusy()) return false;
    clearDraft();
    editingAnnouncementId.value = record?.id ?? "";
    Object.assign(announcementForm, {
      ...emptyForm(),
      title: record?.title || "",
      contentMarkdown: record?.contentMarkdown || "",
      imageUrl: record?.imageUrl || "",
      illustrationRef: record?.illustrationRef || "",
      audience: String(record?.audience || record?.visibility || "ALL").toUpperCase(),
      displayDate: record?.displayDate || today()
    });
    announcementUploadedPath.value = announcementForm.imageUrl.startsWith(
      "/api/public/announcement-images/"
    )
      ? announcementForm.imageUrl.replace("/api/public/", "")
      : "";
    announcementDialogOpen.value = true;
    const context = session.capture(),
      draft = draftVersion;
    void nextTick(() => {
      if (session.current(context) && draft === draftVersion && announcementDialogOpen.value)
        editor.opened();
    });
    return true;
  }
  function closeAnnouncementEditor() {
    if (pending.value) return false;
    clearDraft();
    return true;
  }
  /** @param {import("../../types/adminWorkflows").AdminAnnouncement} record */
  function openAnnouncementPreview(record) {
    if (session.authorized()) announcementPreviewRecord.value = { ...record };
  }
  function closeAnnouncementPreview() {
    announcementPreviewRecord.value = null;
  }
  /** @param {File} file @param {{ insertIntoEditor?: boolean }} [options] */
  async function uploadAnnouncementImageFile(file, { insertIntoEditor = false } = {}) {
    if (!canEdit.value || announcementImageUploading.value || !file) return false;
    const context = session.capture(),
      draft = draftVersion,
      initialUrl = announcementForm.imageUrl;
    const current = () =>
      session.current(context) && draft === draftVersion && announcementDialogOpen.value;
    announcementDialogError.value = "";
    announcementImageUploading.value = true;
    try {
      const uploaded = await services.uploadImage(file);
      if (!current()) return false;
      const url = String(uploaded?.url || "");
      if (!safeUrl(url)) throw Error(copy().uploadFailed);
      // A manually edited cover URL takes precedence over a late upload response.
      if (!insertIntoEditor && announcementForm.imageUrl !== initialUrl) return false;
      if (!insertIntoEditor) announcementForm.imageUrl = url;
      announcementUploadedPath.value = String(uploaded?.storagePath || "");
      const alt = String(uploaded?.originalName || file.name || "");
      if (!announcementForm.illustrationRef.trim()) announcementForm.illustrationRef = alt;
      if (insertIntoEditor) editor.insertImage(url, alt);
      feedback.success(copy().uploadSuccess);
      return true;
    } catch (error) {
      feedback.handled(error);
      if (current())
        announcementDialogError.value = translate(adminErrorText(error, copy().uploadFailed));
      return false;
    } finally {
      if (current()) {
        announcementImageUploading.value = false;
        announcementImageInsertMode.value = "cover";
      }
    }
  }
  /** @param {"save" | "publish" | "disable" | "delete"} action @param {import("../../types/adminWorkflows").AdminAnnouncement | null} [record] */
  async function mutate(action, record = null) {
    const context = session.capture();
    if (
      context === null ||
      busy.value ||
      isHostBusy() ||
      (action !== "save" && announcementDialogOpen.value)
    )
      return false;
    if (action === "save") {
      if (!announcementDialogOpen.value) return false;
      announcementDialogError.value = "";
      if (
        !announcementForm.title.trim() ||
        !announcementForm.contentMarkdown.trim() ||
        !announcementForm.displayDate
      ) {
        announcementDialogError.value = copy().required;
        return false;
      }
      if (announcementForm.imageUrl.trim() && !safeUrl(announcementForm.imageUrl)) {
        announcementDialogError.value = copy().invalidImage;
        return false;
      }
    } else if (!record || record.id == null) return false;
    const target = record ? Object.freeze({ ...record }) : null;
    const id = editingAnnouncementId.value,
      wasEditing = id !== "";
    const payload = Object.freeze({
      ...announcementForm,
      title: announcementForm.title.trim(),
      contentMarkdown: announcementForm.contentMarkdown.trim(),
      imageUrl: announcementForm.imageUrl.trim() || null,
      illustrationRef: announcementForm.illustrationRef.trim() || null
    });
    pending.value = true;
    try {
      if (action === "delete" && target && !(await confirmDelete(target))) return false;
      if (!session.current(context) || isHostBusy()) return false;
      feedback.clear();
      if (action === "save") {
        const saved = wasEditing
          ? await services.updateAnnouncement(id, payload)
          : await services.createAnnouncement(payload);
        if (!session.current(context)) return false;
        if (wasEditing)
          announcements.value = announcements.value.map((row) =>
            String(row.id) === String(id) ? saved : row
          );
        else {
          if (announcementPage.value === 1)
            announcements.value = [saved, ...announcements.value].slice(
              0,
              announcementPageSize.value
            );
          announcementTotal.value++;
        }
        clearDraft();
      } else if (target) {
        if (action === "delete") await services.deleteAnnouncement(target.id);
        else if (action === "publish") await services.publishAnnouncement(target.id);
        else await services.disableAnnouncement(target.id);
        if (!session.current(context)) return false;
        if (action === "delete") {
          announcements.value = announcements.value.filter(
            (row) => String(row.id) !== String(target.id)
          );
          announcementTotal.value = Math.max(0, announcementTotal.value - 1);
          if (String(announcementPreviewRecord.value?.id) === String(target.id))
            announcementPreviewRecord.value = null;
        } else {
          const status = action === "publish" ? "PUBLISHED" : "DISABLED";
          announcements.value = announcements.value.map((row) =>
            String(row.id) === String(target.id) ? { ...row, status } : row
          );
          if (
            String(announcementPreviewRecord.value?.id) === String(target.id) &&
            announcementPreviewRecord.value
          )
            announcementPreviewRecord.value = { ...announcementPreviewRecord.value, status };
        }
      }
      try {
        await readPage(true);
      } catch {
        if (session.current(context)) await feedback.error(t("adminWorkflow.savedRefreshFailed"));
        return session.current(context);
      }
      if (session.current(context))
        feedback.success(
          copy()[
            action === "save"
              ? wasEditing
                ? "updated"
                : "created"
              : action === "publish"
                ? "publishedSuccess"
                : action === "disable"
                  ? "disabledSuccess"
                  : "deletedSuccess"
          ]
        );
      return session.current(context);
    } catch (error) {
      feedback.handled(error);
      if (session.current(context)) {
        const text = translate(adminErrorText(error, t("admin.employee.errorFallback")));
        if (action === "save") announcementDialogError.value = text;
        else await feedback.error(text, { popup: true });
      }
      return false;
    } finally {
      if (session.current(context)) pending.value = false;
    }
  }
  return {
    announcements,
    announcementTotal,
    announcementPage,
    announcementPageSize,
    announcementsLoaded,
    announcementDialogOpen,
    editingAnnouncementId,
    announcementDialogError,
    announcementForm,
    announcementImageUploading,
    announcementImageInsertMode,
    announcementImageDragging,
    announcementUploadedPath,
    announcementPreviewRecord,
    busy,
    pending,
    canEdit,
    loadAnnouncementPageWithoutLoading: () => readPage(),
    loadAnnouncementPage: () => loadAnnouncementPage(),
    /** @param {number} page */
    changeAnnouncementPage: (page) => loadAnnouncementPage(page),
    /** @param {number} size */
    changeAnnouncementPageSize: (size) => loadAnnouncementPage(1, size),
    openAnnouncementEditor,
    closeAnnouncementEditor,
    openAnnouncementPreview,
    closeAnnouncementPreview,
    uploadAnnouncementImageFile,
    handleSaveAnnouncement: () => mutate("save"),
    /** @param {import("../../types/adminWorkflows").AdminAnnouncement} record */
    handlePublishAnnouncement: (record) => mutate("publish", record),
    /** @param {import("../../types/adminWorkflows").AdminAnnouncement} record */
    handleDeactivateAnnouncement: (record) => mutate("disable", record),
    /** @param {import("../../types/adminWorkflows").AdminAnnouncement} record */
    handleDeleteAnnouncement: (record) => mutate("delete", record)
  };
}
