<template>
  <Teleport to="body">
    <Transition name="global-api-notice">
      <aside v-if="notice" class="global-api-error-notice" role="alert" aria-live="assertive">
        <div class="global-api-error-icon" aria-hidden="true">!</div>
        <div class="global-api-error-content">
          <strong>{{ t("app.requestFailed") }}</strong>
          <p>{{ notice.message }}</p>
          <small v-if="notice.meta">{{ notice.meta }}</small>
        </div>
        <button type="button" :aria-label="t('app.dismissError')" @click="dismiss">×</button>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import { API_ERROR_EVENT } from "../services/apiClient";
import { t } from "../i18n";

const notice = ref(null);
let dismissTimer;
let lastSignature = "";
let lastShownAt = 0;

onMounted(() => {
  window.addEventListener(API_ERROR_EVENT, showApiError);
});

onUnmounted(() => {
  window.removeEventListener(API_ERROR_EVENT, showApiError);
  window.clearTimeout(dismissTimer);
});

function showApiError(event) {
  const error = event?.detail?.error;
  const message = String(error?.message || t("app.requestFailedHint"));
  const meta = buildMeta(error);
  const signature = `${error?.status || ""}|${error?.code || ""}|${message}`;
  const now = Date.now();
  if (signature === lastSignature && now - lastShownAt < 1500) return;

  lastSignature = signature;
  lastShownAt = now;
  notice.value = { message, meta };
  window.clearTimeout(dismissTimer);
  dismissTimer = window.setTimeout(dismiss, 8000);
}

function buildMeta(error) {
  const parts = [];
  if (error?.status) parts.push(`HTTP ${error.status}`);
  if (error?.code) parts.push(String(error.code));
  if (error?.errorId) parts.push(`${t("app.errorId")}: ${error.errorId}`);
  return parts.join(" · ");
}

function dismiss() {
  notice.value = null;
  window.clearTimeout(dismissTimer);
}
</script>

<style scoped>
.global-api-error-notice {
  position: fixed;
  top: 22px;
  right: 22px;
  z-index: 21000;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  width: min(430px, calc(100vw - 32px));
  padding: 15px 14px;
  border: 1px solid var(--color-destructive);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-overlay);
  color: var(--color-destructive);
}

.global-api-error-icon {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: var(--radius-control);
  background: var(--color-destructive);
  color: #fff;
  font-weight: 900;
}

.global-api-error-content {
  min-width: 0;
}

.global-api-error-content strong {
  display: block;
  margin-bottom: 4px;
  color: var(--color-destructive);
  font-size: 14px;
}

.global-api-error-content p {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--color-foreground);
  font-size: 13px;
  line-height: 1.5;
}

.global-api-error-content small {
  display: block;
  margin-top: 5px;
  color: var(--color-muted);
  font-size: 11px;
}

.global-api-error-notice button {
  align-self: start;
  border: 0;
  background: transparent;
  color: var(--color-destructive);
  cursor: pointer;
  font-size: 21px;
  line-height: 1;
}

.global-api-notice-enter-active,
.global-api-notice-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.global-api-notice-enter-from,
.global-api-notice-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
