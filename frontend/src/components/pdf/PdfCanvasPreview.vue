<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import {
  createPdfCanvasController,
  createPdfResizeScheduler,
  type PdfCanvasState
} from "./pdfCanvasController";
import { wt } from "../workspace/workspaceCopy";
const props = defineProps<{ blob: Blob; isOpen: () => boolean; name: string }>();
const emit = defineEmits<{ download: [] }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const viewport = ref<HTMLElement | null>(null);
const state = reactive<PdfCanvasState>({ phase: "idle", page: 0, pages: 0 });
const controller = createPdfCanvasController({
  loadRuntime: () => import("./pdfjsRuntime"),
  canvas: () => canvas.value,
  width: () => Math.max(1, (viewport.value?.clientWidth || 320) - 32),
  pixelRatio: () => window.devicePixelRatio || 1,
  update: (value) => Object.assign(state, value)
});
let version = 0;
let observer: ResizeObserver | null = null;
// Read the reactive owner even while the dialog's leave transition retains old VNodes.
watch(
  () => [props.isOpen(), props.blob] as const,
  async ([open, blob]) => {
    const request = ++version;
    controller.close();
    if (!open) return;
    await nextTick();
    if (request === version && props.isOpen() && props.blob === blob) void controller.open(blob);
  },
  { immediate: true, flush: "sync" }
);
const resizeScheduler = createPdfResizeScheduler({
  width: () => viewport.value?.clientWidth || 0,
  schedule: (callback) => requestAnimationFrame(callback),
  cancel: (frame) => cancelAnimationFrame(frame),
  render: () => {
    if (props.isOpen() && state.pages && state.phase !== "error") void controller.render();
  }
});
onMounted(() => {
  observer = new ResizeObserver(() => resizeScheduler.resize());
  if (viewport.value) observer.observe(viewport.value);
});
onBeforeUnmount(() => {
  version++;
  resizeScheduler.dispose();
  observer?.disconnect();
  controller.close();
});
</script>
<template>
  <section
    class="pdf-preview"
    :aria-label="name"
    :aria-busy="state.phase === 'loading' || state.phase === 'rendering'"
  >
    <nav class="pdf-preview__toolbar" :aria-label="wt('pdfNavigation')">
      <button
        type="button"
        :disabled="state.phase !== 'ready' || state.page <= 1"
        @click="controller.render(state.page - 1)"
      >
        {{ wt("pdfPrevious") }}
      </button>
      <span aria-live="polite">{{
        wt("pdfPage", { page: state.page || "—", pages: state.pages || "—" })
      }}</span>
      <button
        type="button"
        :disabled="state.phase !== 'ready' || state.page >= state.pages"
        @click="controller.render(state.page + 1)"
      >
        {{ wt("pdfNext") }}
      </button>
      <button type="button" :disabled="state.phase !== 'ready'" @click="controller.render()">
        {{ wt("pdfFit") }}
      </button>
      <button type="button" @click="emit('download')">{{ wt("pdfDownload") }}</button>
    </nav>
    <div ref="viewport" class="pdf-preview__viewport">
      <p v-if="state.phase === 'error'" class="pdf-preview__status error" role="alert">
        {{ wt("pdfError") }}
      </p>
      <p v-else-if="state.phase !== 'ready'" class="pdf-preview__status" role="status">
        {{ wt("pdfLoading") }}
      </p>
      <canvas
        v-show="state.phase !== 'error' && state.page > 0"
        ref="canvas"
        :aria-label="wt('pdfCanvas', { page: state.page || 1 })"
        role="img"
      ></canvas>
    </div>
  </section>
</template>
<style scoped>
.pdf-preview {
  min-width: 0;
  width: 100%;
}
.pdf-preview__toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}
.pdf-preview__toolbar button {
  min-height: 36px;
  padding: 6px 10px;
  color: var(--color-primary);
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-control);
}
.pdf-preview__toolbar button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.pdf-preview__toolbar span {
  font-variant-numeric: tabular-nums;
  font-size: 12px;
}
.pdf-preview__viewport {
  position: relative;
  min-width: 0;
  min-height: 280px;
  max-height: 62vh;
  overflow: auto;
  scrollbar-gutter: stable;
  padding: 16px;
  background: var(--color-background);
}
.pdf-preview__viewport canvas {
  display: block;
  margin: 0 auto;
  background: white;
}
.pdf-preview__status {
  margin: 0;
  padding: 28px 12px;
  color: var(--color-muted);
  line-height: 1.7;
}
.pdf-preview__status.error {
  color: var(--color-destructive);
}
@media (max-width: 600px) {
  .pdf-preview__toolbar {
    gap: 6px;
    padding: 8px;
  }
  .pdf-preview__toolbar button {
    padding: 6px 8px;
    font-size: 12px;
  }
}
</style>
