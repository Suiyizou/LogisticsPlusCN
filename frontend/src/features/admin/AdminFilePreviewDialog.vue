<script setup lang="ts">
import WorkspaceDialogTransition from "../../components/workspace/WorkspaceDialogTransition.vue";
import { ref } from "vue";
import { useDialogFocus } from "../../composables/useDialogFocus.js";
import type { AdminFilePreview, AdminFilePreviewPorts } from "../../types/adminFiles";
const props = defineProps<{ workflow: AdminFilePreview; t: AdminFilePreviewPorts["t"] }>();
const { filePreviewDialog, closeFilePreviewDialog } = props.workflow;
const dialogElement = ref<HTMLElement | null>(null);
const { onDialogKeydown } = useDialogFocus({
  dialogElement,
  isOpen: () => filePreviewDialog.open,
  isBusy: () => false,
  close: closeFilePreviewDialog
});
</script>
<template>
  <WorkspaceDialogTransition
    ><div v-if="filePreviewDialog.open" class="modal-backdrop">
      <div
        class="modal file-preview-modal workspace-modal--form"
        ref="dialogElement"
        role="dialog"
        aria-modal="true"
        :aria-label="filePreviewDialog.name || t('admin.files.previewTitle')"
        tabindex="-1"
        @keydown="onDialogKeydown"
        @click.stop
      >
        <header>
          <div>
            <p>{{ t("admin.files.previewTitle") }}</p>
            <h2>{{ filePreviewDialog.name || t("admin.files.previewTitle") }}</h2>
          </div>
          <button type="button" :aria-label="t('common.cancel')" @click="closeFilePreviewDialog">
            ×
          </button>
        </header>
        <div class="file-preview-content-wrapper">
          <p
            v-if="filePreviewDialog.message"
            class="file-preview-message"
            :class="{ error: filePreviewDialog.isError }"
          >
            {{ filePreviewDialog.message }}
          </p>
          <div class="file-preview-render">
            <iframe
              v-if="filePreviewDialog.kind === 'pdf' && filePreviewDialog.url"
              :src="filePreviewDialog.url"
              :title="filePreviewDialog.name || t('admin.files.previewTitle')"
            ></iframe>
            <img
              v-else-if="filePreviewDialog.kind === 'image' && filePreviewDialog.url"
              :src="filePreviewDialog.url"
              :alt="filePreviewDialog.name || t('admin.files.previewTitle')"
            />
            <textarea
              v-else-if="filePreviewDialog.kind === 'text'"
              class="file-preview-textarea"
              readonly
              :aria-label="filePreviewDialog.name || t('admin.files.previewTitle')"
              :value="filePreviewDialog.text"
            ></textarea>
            <p v-else-if="filePreviewDialog.kind === 'fallback'" class="file-preview-fallback">
              {{ filePreviewDialog.text || t("admin.files.previewNotSupported") }}
            </p>
            <p v-else class="file-preview-fallback">{{ t("admin.files.previewLoading") }}</p>
          </div>
        </div>
        <div class="modal-actions">
          <button class="primary" type="button" @click="closeFilePreviewDialog">
            {{ t("common.cancel") }}
          </button>
        </div>
      </div>
    </div></WorkspaceDialogTransition
  >
</template>
<style scoped>
.file-preview-modal {
  overflow: auto;
}
</style>

<style scoped src="../../components/workspace/workspaceDialogStyles.css"></style>
