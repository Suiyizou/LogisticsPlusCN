<script setup lang="ts">
import WorkspaceDialogTransition from "../../components/workspace/WorkspaceDialogTransition.vue";
import { computed, ref } from "vue";
import { useDialogFocus } from "../../composables/useDialogFocus.js";
import { createAnnouncementLabels } from "./announcementLabels.js";
import { useAnnouncementEditor } from "./useAnnouncementEditor.js";
import { ANNOUNCEMENT_EMOJIS, ANNOUNCEMENT_SYMBOLS } from "./announcementCopy.js";
import type {
  AdminAnnouncementWorkflow,
  AnnouncementPresentation,
  AnnouncementCopy
} from "../../types/adminWorkflows";
const props = defineProps<{
  workflow: AdminAnnouncementWorkflow;
  presentation: AnnouncementPresentation;
  copy: AnnouncementCopy;
  busy: boolean;
  today: () => string;
}>();
const {
  announcementDialogOpen,
  editingAnnouncementId,
  announcementDialogError,
  announcementForm,
  announcementImageUploading,
  announcementImageDragging,
  announcementUploadedPath,
  announcementPreviewRecord,
  closeAnnouncementEditor,
  closeAnnouncementPreview,
  handleSaveAnnouncement,
  pending: announcementSaving,
  canEdit: announcementCanEdit
} = props.workflow;
const announcementCopy = computed(() => props.copy);
const loading = computed(() => props.busy);
const editorDialogElement = ref<HTMLElement | null>(null);
const previewDialogElement = ref<HTMLElement | null>(null);
const editorDialogFocus = useDialogFocus({
  dialogElement: editorDialogElement,
  isOpen: () => announcementDialogOpen.value,
  isBusy: () => announcementSaving.value || announcementImageUploading.value,
  close: closeAnnouncementEditor
});
const previewDialogFocus = useDialogFocus({
  dialogElement: previewDialogElement,
  isOpen: () => Boolean(announcementPreviewRecord.value),
  isBusy: () => false,
  close: closeAnnouncementPreview
});

const todayDateString = () => props.today();
const announcementQuickTags = computed(() => props.copy.quickTags);
const announcementEditorPreviewHtml = computed(() =>
  props.presentation.renderAnnouncementMarkdown(announcementForm.contentMarkdown)
);
const { announcementImageUrl, renderAnnouncementMarkdown } = props.presentation;
const { announcementAudience, announcementStatusLabel, announcementVisibilityLabel } =
  createAnnouncementLabels(() => props.copy);
const editor = useAnnouncementEditor({
  workflow: props.workflow,
  presentation: props.presentation,
  copy: () => props.copy,
  getDocument: () => document,
  prompt: (message, value) => window.prompt(message, value)
});
const {
  announcementImageInputRef,
  announcementEditorRef,
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
} = editor;
defineExpose({
  opened: editor.syncAnnouncementEditorFromMarkdown,
  cleared: editor.clearEditor,
  insertImage: editor.insertAnnouncementImageIntoEditor
});
</script>
<template>
  <WorkspaceDialogTransition
    ><div v-if="announcementDialogOpen" class="modal-backdrop">
      <div
        class="modal announcement-editor-modal workspace-modal--wide"
        ref="editorDialogElement"
        tabindex="-1"
        @keydown="editorDialogFocus.onDialogKeydown"
        role="dialog"
        aria-modal="true"
      >
        <header>
          <div>
            <p>Announcement Editor</p>
            <h2>
              {{
                editingAnnouncementId !== ""
                  ? announcementCopy.editTitle
                  : announcementCopy.createTitle
              }}
            </h2>
          </div>
          <button
            type="button"
            :disabled="announcementSaving"
            :aria-label="announcementCopy.close"
            @click="closeAnnouncementEditor"
          >
            ×
          </button>
        </header>
        <form class="announcement-editor-form" @submit.prevent="handleSaveAnnouncement">
          <div class="announcement-editor-grid">
            <div class="announcement-fields">
              <label>
                <span>{{ announcementCopy.title }}</span>
                <input
                  :disabled="!announcementCanEdit"
                  v-model.trim="announcementForm.title"
                  maxlength="160"
                  :placeholder="announcementCopy.titlePlaceholder"
                />
              </label>
              <div class="announcement-field-row">
                <label>
                  <span>{{ announcementCopy.displayDate }}</span>
                  <input
                    :disabled="!announcementCanEdit"
                    v-model="announcementForm.displayDate"
                    type="date"
                  />
                </label>
                <label>
                  <span>{{ announcementCopy.visibility }}</span>
                  <el-select
                    popper-class="business-select-popper workspace-select-popper"
                    :disabled="!announcementCanEdit"
                    v-model="announcementForm.audience"
                    class="business-select"
                  >
                    <el-option value="CUSTOMER" :label="announcementVisibilityLabel('CUSTOMER')" />
                    <el-option value="EMPLOYEE" :label="announcementVisibilityLabel('EMPLOYEE')" />
                    <el-option value="ALL" :label="announcementVisibilityLabel('ALL')" />
                  </el-select>
                </label>
              </div>
              <div
                class="announcement-image-field"
                :class="{ 'is-dragging': announcementImageDragging }"
                @dragenter.prevent="announcementImageDragging = true"
                @dragover.prevent="announcementImageDragging = true"
                @dragleave="handleAnnouncementImageDragLeave"
                @drop.prevent="handleAnnouncementCoverDrop"
              >
                <span class="announcement-field-label">{{ announcementCopy.coverImage }}</span>
                <button
                  class="announcement-image-dropzone"
                  type="button"
                  :disabled="announcementImageUploading || !announcementCanEdit"
                  @click="chooseAnnouncementImage('cover')"
                >
                  <img
                    v-if="announcementImageUrl(announcementForm)"
                    :src="announcementImageUrl(announcementForm)"
                    :alt="announcementForm.title || announcementCopy.coverImage"
                  />
                  <span v-else class="announcement-image-drop-icon" aria-hidden="true">+</span>
                  <span>
                    <b>{{
                      announcementImageUploading
                        ? announcementCopy.uploadingImage
                        : announcementCopy.dropImage
                    }}</b>
                    <small>{{ announcementCopy.uploadHint }}</small>
                  </span>
                  <em>{{ announcementCopy.chooseImage }}</em>
                </button>
                <input
                  ref="announcementImageInputRef"
                  class="announcement-file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/gif"
                  @change="handleAnnouncementImageUpload"
                />
                <label class="announcement-image-url-field">
                  <span>{{ announcementCopy.imageUrl }}</span>
                  <input
                    :disabled="!announcementCanEdit"
                    v-model.trim="announcementForm.imageUrl"
                    type="text"
                    placeholder="https://example.com/image.jpg"
                  />
                </label>
                <small v-if="announcementUploadedPath" class="announcement-storage-path">
                  <b>{{ announcementCopy.storagePath }}</b>
                  <code>{{ announcementUploadedPath }}</code>
                </small>
              </div>
              <label>
                <span>{{ announcementCopy.illustrationRef }}</span>
                <input
                  :disabled="!announcementCanEdit"
                  v-model.trim="announcementForm.illustrationRef"
                  :placeholder="announcementCopy.illustrationPlaceholder"
                />
              </label>
              <div class="announcement-rich-field">
                <span class="announcement-field-label">{{ announcementCopy.content }}</span>
                <div class="announcement-rich-toolbar" :aria-label="announcementCopy.toolbar">
                  <button
                    type="button"
                    :title="announcementCopy.heading2"
                    :disabled="!announcementCanEdit"
                    @mousedown.prevent="applyAnnouncementFormat('formatBlock', 'h2')"
                  >
                    H2
                  </button>
                  <button
                    type="button"
                    :title="announcementCopy.heading3"
                    :disabled="!announcementCanEdit"
                    @mousedown.prevent="applyAnnouncementFormat('formatBlock', 'h3')"
                  >
                    H3
                  </button>
                  <button
                    type="button"
                    :title="announcementCopy.bold"
                    :disabled="!announcementCanEdit"
                    @mousedown.prevent="applyAnnouncementFormat('bold')"
                  >
                    <b>B</b>
                  </button>
                  <button
                    type="button"
                    :title="announcementCopy.italic"
                    :disabled="!announcementCanEdit"
                    @mousedown.prevent="applyAnnouncementFormat('italic')"
                  >
                    <i>I</i>
                  </button>
                  <button
                    type="button"
                    :title="announcementCopy.bulletList"
                    :disabled="!announcementCanEdit"
                    @mousedown.prevent="applyAnnouncementFormat('insertUnorderedList')"
                  >
                    •
                  </button>
                  <button
                    type="button"
                    :title="announcementCopy.numberedList"
                    :disabled="!announcementCanEdit"
                    @mousedown.prevent="applyAnnouncementFormat('insertOrderedList')"
                  >
                    1.
                  </button>
                  <button
                    type="button"
                    :title="announcementCopy.quote"
                    :disabled="!announcementCanEdit"
                    @mousedown.prevent="applyAnnouncementFormat('formatBlock', 'blockquote')"
                  >
                    “”
                  </button>
                  <button
                    type="button"
                    :title="announcementCopy.link"
                    :disabled="!announcementCanEdit"
                    @mousedown.prevent="insertAnnouncementLink"
                  >
                    ↗
                  </button>
                  <button
                    type="button"
                    :title="announcementCopy.insertImage"
                    :disabled="!announcementCanEdit"
                    @mousedown.prevent="insertAnnouncementImageIntoEditor()"
                  >
                    ▧
                  </button>
                  <span class="announcement-toolbar-divider" aria-hidden="true"></span>
                  <details
                    class="announcement-toolbar-palette"
                    @mousedown="rememberAnnouncementEditorSelection"
                  >
                    <summary :title="announcementCopy.emoji">☺</summary>
                    <div>
                      <button
                        v-for="item in ANNOUNCEMENT_EMOJIS"
                        :key="item"
                        type="button"
                        :disabled="!announcementCanEdit"
                        @mousedown.prevent="insertAnnouncementEditorText(item)"
                      >
                        {{ item }}
                      </button>
                    </div>
                  </details>
                  <details
                    class="announcement-toolbar-palette"
                    @mousedown="rememberAnnouncementEditorSelection"
                  >
                    <summary :title="announcementCopy.symbol">Ω</summary>
                    <div>
                      <button
                        v-for="item in ANNOUNCEMENT_SYMBOLS"
                        :key="item"
                        type="button"
                        :disabled="!announcementCanEdit"
                        @mousedown.prevent="insertAnnouncementEditorText(item)"
                      >
                        {{ item }}
                      </button>
                    </div>
                  </details>
                  <details
                    class="announcement-toolbar-palette announcement-toolbar-tags"
                    @mousedown="rememberAnnouncementEditorSelection"
                  >
                    <summary :title="announcementCopy.tag">#</summary>
                    <div>
                      <button
                        v-for="item in announcementQuickTags"
                        :key="item"
                        type="button"
                        :disabled="!announcementCanEdit"
                        @mousedown.prevent="insertAnnouncementEditorText(item)"
                      >
                        {{ item }}
                      </button>
                    </div>
                  </details>
                  <span class="announcement-toolbar-spacer"></span>
                  <button
                    type="button"
                    :title="announcementCopy.undo"
                    :disabled="!announcementCanEdit"
                    @mousedown.prevent="applyAnnouncementFormat('undo')"
                  >
                    ↶
                  </button>
                  <button
                    type="button"
                    :title="announcementCopy.redo"
                    :disabled="!announcementCanEdit"
                    @mousedown.prevent="applyAnnouncementFormat('redo')"
                  >
                    ↷
                  </button>
                  <button
                    type="button"
                    :title="announcementCopy.clearFormat"
                    :disabled="!announcementCanEdit"
                    @mousedown.prevent="applyAnnouncementFormat('removeFormat')"
                  >
                    Tx
                  </button>
                </div>
                <div
                  ref="announcementEditorRef"
                  class="announcement-rich-editor"
                  :contenteditable="announcementCanEdit"
                  role="textbox"
                  aria-multiline="true"
                  :data-placeholder="announcementCopy.contentPlaceholder"
                  @focus="rememberAnnouncementEditorSelection"
                  @input="syncAnnouncementMarkdownFromEditor"
                  @keyup="rememberAnnouncementEditorSelection"
                  @mouseup="rememberAnnouncementEditorSelection"
                  @paste="handleAnnouncementEditorPaste"
                  @dragover.prevent
                  @drop="handleAnnouncementEditorDrop"
                ></div>
                <small>{{ announcementCopy.editorHint }}</small>
              </div>
              <p v-if="announcementDialogError" class="announcement-dialog-error" role="alert">
                {{ announcementDialogError }}
              </p>
            </div>
            <aside class="announcement-live-preview">
              <div class="announcement-preview-heading">
                <span>{{ announcementCopy.livePreview }}</span>
                <small>{{ announcementForm.displayDate || todayDateString() }}</small>
              </div>
              <article class="announcement-preview-card">
                <img
                  v-if="announcementImageUrl(announcementForm)"
                  :src="announcementImageUrl(announcementForm)"
                  :alt="announcementForm.title || announcementCopy.preview"
                />
                <span class="announcement-preview-visibility">
                  {{ announcementVisibilityLabel(announcementForm.audience) }}
                </span>
                <h3>{{ announcementForm.title || announcementCopy.untitled }}</h3>
                <div
                  class="announcement-markdown-preview"
                  v-html="announcementEditorPreviewHtml"
                ></div>
              </article>
            </aside>
          </div>
          <div class="modal-actions announcement-editor-actions">
            <button type="button" :disabled="announcementSaving" @click="closeAnnouncementEditor">
              {{ announcementCopy.cancel }}
            </button>
            <button class="primary" type="submit" :disabled="loading || announcementImageUploading">
              {{ announcementCopy.saveDraft }}
            </button>
          </div>
        </form>
      </div>
    </div></WorkspaceDialogTransition
  >

  <WorkspaceDialogTransition
    ><div v-if="announcementPreviewRecord" class="modal-backdrop">
      <div
        class="modal announcement-preview-modal workspace-modal--wide"
        ref="previewDialogElement"
        tabindex="-1"
        @keydown="previewDialogFocus.onDialogKeydown"
        role="dialog"
        aria-modal="true"
      >
        <header>
          <div>
            <p>Announcement Preview</p>
            <h2>{{ announcementPreviewRecord.title || announcementCopy.untitled }}</h2>
          </div>
          <button
            type="button"
            :aria-label="announcementCopy.close"
            @click="closeAnnouncementPreview"
          >
            ×
          </button>
        </header>
        <div class="announcement-preview-dialog-body">
          <article class="announcement-preview-card is-dialog">
            <img
              v-if="announcementImageUrl(announcementPreviewRecord)"
              :src="announcementImageUrl(announcementPreviewRecord)"
              :alt="announcementPreviewRecord.title || announcementCopy.preview"
            />
            <div class="announcement-preview-meta">
              <span>{{
                announcementVisibilityLabel(announcementAudience(announcementPreviewRecord))
              }}</span>
              <span>{{ announcementPreviewRecord.displayDate || "-" }}</span>
              <span>{{ announcementStatusLabel(announcementPreviewRecord.status) }}</span>
            </div>
            <h3>{{ announcementPreviewRecord.title || announcementCopy.untitled }}</h3>
            <div
              class="announcement-markdown-preview"
              v-html="renderAnnouncementMarkdown(announcementPreviewRecord.contentMarkdown)"
            ></div>
          </article>
        </div>
        <div class="modal-actions">
          <button class="primary" type="button" @click="closeAnnouncementPreview">
            {{ announcementCopy.close }}
          </button>
        </div>
      </div>
    </div></WorkspaceDialogTransition
  >
</template>
<style scoped src="./announcementStyles.css"></style>

<style scoped src="../../components/workspace/workspaceDialogStyles.css"></style>
