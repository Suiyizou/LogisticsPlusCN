<template>
  <Transition name="system-wait">
    <div
      v-if="visible"
      class="system-wait-overlay"
      :class="{ 'is-contained': contained }"
      role="status"
      aria-live="polite"
      :aria-label="message"
      :aria-busy="visible"
    >
      <section class="system-wait-card">
        <BrandLockup />
        <span class="system-wait-spinner" aria-hidden="true"></span>
        <h2>{{ message }}</h2>
        <p>{{ t("maritime.waitingHint") }}</p>
      </section>
    </div>
  </Transition>
</template>
<script setup lang="ts">
import BrandLockup from "./brand/BrandLockup.vue";
import { t } from "../i18n";
withDefaults(defineProps<{ visible: boolean; message: string; contained?: boolean }>(), {
  contained: false
});
</script>
<style scoped>
.system-wait-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 24px;
  color: var(--color-foreground);
  background: var(--color-background);
}
.system-wait-overlay.is-contained {
  position: absolute;
  z-index: 20;
  background: rgb(242 245 246 / 97%);
}
.system-wait-card {
  width: min(520px, 100%);
  padding: 42px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-card);
  background: white;
}
.system-wait-spinner {
  width: 30px;
  height: 30px;
  margin: 38px 0 24px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: wait-spin 0.9s linear infinite;
}
.system-wait-card h2 {
  margin: 0;
  font-size: 23px;
  font-weight: 600;
  line-height: 1.4;
}
.system-wait-card p {
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-muted);
  margin: 12px 0 0;
}
.system-wait-enter-active,
.system-wait-leave-active {
  transition: opacity 180ms ease;
}
.system-wait-enter-from,
.system-wait-leave-to {
  opacity: 0;
}
@keyframes wait-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 600px) {
  .system-wait-card {
    padding: 32px 22px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .system-wait-spinner {
    animation: none;
    border-right-color: var(--color-accent);
  }
  .system-wait-enter-active,
  .system-wait-leave-active {
    transition: none;
  }
}
</style>
