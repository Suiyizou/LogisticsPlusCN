<template>
  <Transition name="system-wait">
    <div
      v-if="visible"
      class="system-wait-overlay"
      :class="{ 'is-contained': contained }"
      role="status"
      aria-live="polite"
      :aria-label="message"
    >
      <div class="system-wait-card">
        <div class="system-wait-mark" aria-hidden="true">
          <i></i><i></i><i></i>
        </div>
        <strong>DrewesLogistics</strong>
        <span>{{ message }}</span>
        <b aria-hidden="true"><i></i></b>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  visible: boolean;
  message: string;
  contained?: boolean;
}>(), {
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
  color: #fff;
  background:
    radial-gradient(circle at 50% 44%, rgba(38, 146, 236, 0.22), transparent 24%),
    #061725;
}

.system-wait-overlay.is-contained {
  position: absolute;
  z-index: 20;
  color: #10283e;
  background:
    radial-gradient(circle at 50% 43%, rgba(38, 146, 236, 0.16), transparent 28%),
    rgba(245, 250, 254, 0.94);
  backdrop-filter: blur(5px);
}

.system-wait-card {
  display: grid;
  place-items: center;
  text-align: center;
}

.system-wait-mark {
  position: relative;
  width: 68px;
  height: 68px;
  margin-bottom: 22px;
  border: 1px solid rgba(85, 186, 255, 0.28);
  border-radius: 16px;
  background: rgba(8, 35, 55, 0.62);
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.22),
    inset 0 0 26px rgba(54, 160, 239, 0.08);
  perspective: 180px;
}

.system-wait-mark i {
  position: absolute;
  top: 19px;
  width: 10px;
  height: 30px;
  border: 2px solid #55baff;
  border-radius: 2px;
  transform: skewY(-20deg);
  transform-origin: left center;
  animation: system-wait-panel 1.35s cubic-bezier(0.45, 0, 0.2, 1) infinite;
}

.system-wait-mark i:nth-child(1) { left: 17px; }
.system-wait-mark i:nth-child(2) { left: 29px; animation-delay: 0.12s; }
.system-wait-mark i:nth-child(3) { left: 41px; animation-delay: 0.24s; }

.is-contained .system-wait-mark {
  background: rgba(255, 255, 255, 0.8);
  box-shadow:
    0 18px 46px rgba(28, 77, 112, 0.14),
    inset 0 0 24px rgba(54, 160, 239, 0.06);
}

.system-wait-card strong {
  max-width: min(82vw, 520px);
  font-size: clamp(20px, 2.4vw, 29px);
  letter-spacing: 0.035em;
  line-height: 1.1;
}

.system-wait-card > span {
  margin-top: 10px;
  color: rgba(221, 239, 252, 0.67);
  font-size: 11px;
}

.is-contained .system-wait-card > span {
  color: #668096;
}

.system-wait-card > b {
  width: 180px;
  height: 2px;
  margin-top: 22px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.12);
}

.is-contained .system-wait-card > b {
  background: rgba(11, 104, 210, 0.12);
}

.system-wait-card > b i {
  display: block;
  width: 48%;
  height: 100%;
  background: #46baff;
  animation: system-wait-progress 1.15s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.system-wait-enter-active,
.system-wait-leave-active {
  transition: opacity 0.18s ease;
}

.system-wait-enter-from,
.system-wait-leave-to {
  opacity: 0;
}

@keyframes system-wait-panel {
  0%, 18% {
    opacity: 0.42;
    transform: skewY(-20deg) rotateY(0);
  }
  48% {
    opacity: 1;
    transform: skewY(-20deg) rotateY(-54deg);
  }
  82%, 100% {
    opacity: 0.42;
    transform: skewY(-20deg) rotateY(0);
  }
}

@keyframes system-wait-progress {
  from { transform: translateX(-110%); }
  to { transform: translateX(320%); }
}

@media (prefers-reduced-motion: reduce) {
  .system-wait-mark i,
  .system-wait-card > b i {
    animation: none;
  }
}
</style>
