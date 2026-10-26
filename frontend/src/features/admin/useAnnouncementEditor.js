// @ts-check
import { onScopeDispose, ref } from "vue";
/** @param {import("../../types/adminWorkflows").AnnouncementEditorPorts} ports */
export function useAnnouncementEditor({ workflow, presentation, copy, getDocument, prompt }) {
  const {
    announcementForm,
    announcementImageDragging,
    announcementImageInsertMode,
    announcementDialogError,
    uploadAnnouncementImageFile,
    canEdit: announcementCanEdit
  } = workflow;
  const {
    renderAnnouncementMarkdown,
    safeAnnouncementUrl,
    announcementPortableUrl,
    escapeAnnouncementHtml,
    announcementEditorToMarkdown
  } = presentation;
  const announcementCopy = {
    get value() {
      return copy();
    }
  };
  /** @type {import("vue").Ref<HTMLInputElement | null>} */
  const announcementImageInputRef = ref(null);
  /** @type {import("vue").Ref<HTMLElement | null>} */
  const announcementEditorRef = ref(null);
  /** @type {Range | null} */
  let announcementEditorRange = null;
  function clearEditor() {
    announcementEditorRange = null;
    if (announcementEditorRef.value) announcementEditorRef.value.innerHTML = "";
  }
  onScopeDispose(() => {
    announcementEditorRange = null;
  });
  /** @param {"cover" | "body"} mode */
  function chooseAnnouncementImage(mode = "cover") {
    if (!announcementCanEdit.value) return;
    announcementImageInsertMode.value = mode;
    announcementImageInputRef.value?.click();
  }

  /** @param {DragEvent} event */
  function handleAnnouncementImageDragLeave(event) {
    const container = /** @type {HTMLElement | null} */ (event.currentTarget);
    const related = /** @type {Node | null} */ (event.relatedTarget);
    if (related && container?.contains(related)) return;
    announcementImageDragging.value = false;
  }

  /** @param {DragEvent} event */
  function handleAnnouncementCoverDrop(event) {
    announcementImageDragging.value = false;
    if (!announcementCanEdit.value) return;
    const file = announcementImageFileFrom(event?.dataTransfer?.files);
    if (!file) return;
    void uploadAnnouncementImageFile(file, { insertIntoEditor: false });
  }

  /** @param {Event} event */
  async function handleAnnouncementImageUpload(event) {
    const input = /** @type {HTMLInputElement | null} */ (event.target);
    const file = announcementImageFileFrom(input?.files);
    if (!file) {
      if (input) input.value = "";
      return;
    }
    await uploadAnnouncementImageFile(file, {
      insertIntoEditor: announcementImageInsertMode.value === "body"
    });
    if (input) input.value = "";
  }

  /** @param {FileList | File[] | null | undefined} files */
  function announcementImageFileFrom(files) {
    return Array.from(files || []).find(
      (file) =>
        /^image\/(?:jpeg|png|gif)$/i.test(file?.type || "") ||
        /\.(?:jpe?g|png|gif)$/i.test(file?.name || "")
    );
  }

  function syncAnnouncementEditorFromMarkdown() {
    const editor = announcementEditorRef.value;
    if (!editor) return;
    editor.innerHTML = renderAnnouncementMarkdown(announcementForm.contentMarkdown);
    announcementEditorRange = null;
  }

  function syncAnnouncementMarkdownFromEditor() {
    if (!announcementCanEdit.value) return;
    const editor = announcementEditorRef.value;
    if (!editor) return;
    announcementForm.contentMarkdown = announcementEditorToMarkdown(editor);
    rememberAnnouncementEditorSelection();
  }

  function rememberAnnouncementEditorSelection() {
    const editor = announcementEditorRef.value;
    const selection = getDocument().getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const node =
      range.commonAncestorContainer.nodeType === 3
        ? range.commonAncestorContainer.parentNode
        : range.commonAncestorContainer;
    if (node === editor || editor.contains(node)) {
      announcementEditorRange = range.cloneRange();
    }
  }

  function restoreAnnouncementEditorSelection() {
    const editor = announcementEditorRef.value;
    if (!editor) return false;
    editor.focus();
    const selection = getDocument().getSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    if (announcementEditorRange) {
      try {
        selection.addRange(announcementEditorRange);
        return true;
      } catch {
        announcementEditorRange = null;
      }
    }
    const range = getDocument().createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.addRange(range);
    announcementEditorRange = range.cloneRange();
    return true;
  }

  /** @param {string} command */
  function applyAnnouncementFormat(command, value = "") {
    if (!announcementCanEdit.value) return;
    if (!restoreAnnouncementEditorSelection()) return;
    getDocument().execCommand(command, false, value);
    syncAnnouncementMarkdownFromEditor();
  }

  /** @param {string} value */
  function insertAnnouncementEditorText(value) {
    if (!announcementCanEdit.value) return;
    if (!restoreAnnouncementEditorSelection()) return;
    getDocument().execCommand("insertText", false, String(value || ""));
    syncAnnouncementMarkdownFromEditor();
  }

  /** @param {string} html */
  function insertAnnouncementEditorHtml(html) {
    if (!announcementCanEdit.value) return;
    if (!restoreAnnouncementEditorSelection()) return;
    getDocument().execCommand("insertHTML", false, html);
    syncAnnouncementMarkdownFromEditor();
  }

  function insertAnnouncementLink() {
    if (!announcementCanEdit.value) return;
    rememberAnnouncementEditorSelection();
    const entered = prompt(announcementCopy.value.linkPrompt, "https://");
    if (!entered) return;
    const url = safeAnnouncementUrl(entered);
    if (!url) {
      announcementDialogError.value = announcementCopy.value.invalidLink;
      return;
    }
    announcementDialogError.value = "";
    if (!restoreAnnouncementEditorSelection()) return;
    const selection = getDocument().getSelection();
    if (selection && !selection.isCollapsed) {
      getDocument().execCommand("createLink", false, url);
    } else {
      insertAnnouncementEditorHtml(
        `<a href="${escapeAnnouncementHtml(url)}">${escapeAnnouncementHtml(url)}</a>`
      );
      return;
    }
    syncAnnouncementMarkdownFromEditor();
  }

  function insertAnnouncementImageIntoEditor(source = "", altText = "") {
    if (!announcementCanEdit.value) return;
    const rawSource = String(source || announcementForm.imageUrl || "").trim();
    const url = safeAnnouncementUrl(rawSource);
    if (!url) {
      chooseAnnouncementImage("body");
      return;
    }
    announcementDialogError.value = "";
    const alt = String(
      altText || announcementForm.illustrationRef || announcementForm.title || "illustration"
    )
      .replaceAll("[", "")
      .replaceAll("]", "");
    const storedSource = announcementPortableUrl(rawSource, url);
    insertAnnouncementEditorHtml(
      `<img src="${escapeAnnouncementHtml(storedSource)}" alt="${escapeAnnouncementHtml(alt)}">`
    );
  }

  /** @param {ClipboardEvent} event */
  function handleAnnouncementEditorPaste(event) {
    if (!announcementCanEdit.value) return;
    event.preventDefault();
    rememberAnnouncementEditorSelection();
    const text = event.clipboardData?.getData("text/plain") || "";
    insertAnnouncementEditorText(text);
  }

  /** @param {DragEvent} event */
  function handleAnnouncementEditorDrop(event) {
    if (!announcementCanEdit.value) return;
    const file = announcementImageFileFrom(event?.dataTransfer?.files);
    if (!file) return;
    event.preventDefault();
    const range = announcementDropRange(event);
    if (range) announcementEditorRange = range;
    void uploadAnnouncementImageFile(file, { insertIntoEditor: true });
  }

  /** @param {DragEvent} event */
  function announcementDropRange(event) {
    const editor = announcementEditorRef.value;
    if (!editor) return null;
    const doc =
      /** @type {Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }} */ (
        getDocument()
      );
    let range = doc.caretRangeFromPoint?.(event.clientX, event.clientY) || null;
    if (!range && getDocument().caretPositionFromPoint) {
      const position = getDocument().caretPositionFromPoint(event.clientX, event.clientY);
      if (position) {
        range = getDocument().createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
      }
    }
    if (!range) return null;
    const node =
      range.commonAncestorContainer.nodeType === 3
        ? range.commonAncestorContainer.parentNode
        : range.commonAncestorContainer;
    return node === editor || editor.contains(node) ? range.cloneRange() : null;
  }

  return {
    announcementImageInputRef,
    announcementEditorRef,
    clearEditor,
    syncAnnouncementEditorFromMarkdown,
    syncAnnouncementMarkdownFromEditor,
    rememberAnnouncementEditorSelection,
    applyAnnouncementFormat,
    insertAnnouncementEditorText,
    insertAnnouncementLink,
    insertAnnouncementImageIntoEditor,
    handleAnnouncementEditorPaste,
    handleAnnouncementEditorDrop,
    chooseAnnouncementImage,
    handleAnnouncementImageDragLeave,
    handleAnnouncementCoverDrop,
    handleAnnouncementImageUpload
  };
}
