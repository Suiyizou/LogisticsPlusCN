<template>
  <div
    ref="region"
    class="maritime-navigation"
    :class="{ 'is-detail': route.path !== '/' }"
    @pointerenter="clearClose"
    @pointerleave="scheduleClose"
    @keydown.esc="escape"
    @focusout="focusLeft"
  >
    <div class="maritime-utility">
      <div class="maritime-wrap">
        <span>{{ t("maritime.company") }}</span
        ><span>{{ t("maritime.location") }}</span>
      </div>
    </div>
    <header class="maritime-header maritime-wrap">
      <PublicBrand href="/" :company="route.path !== '/'" />
      <nav class="maritime-primary-nav" :aria-label="t('publicSite.navLabel')">
        <button
          ref="trigger"
          type="button"
          class="maritime-nav-trigger"
          :class="{ 'is-open': open }"
          :aria-expanded="open"
          :aria-controls="menuId"
          @pointerenter="scheduleOpen"
          @click="toggle"
        >
          <span>{{ t("publicSite.navCapabilities") }}</span
          ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
        </button>
        <a :href="trackingPath">{{ t("publicSite.navTracking") }}</a
        ><a href="/planner/config">{{ t("publicSite.navPlanning") }}</a>
      </nav>
      <div class="maritime-header__actions">
        <LanguageSwitcher /><a
          class="maritime-button maritime-button--primary"
          href="/workbenches"
          >{{ t("publicSite.navOpen") }}</a
        ><button
          type="button"
          ref="mobileTrigger"
          class="maritime-mobile-menu"
          :aria-label="t(open ? 'publicSite.menuClose' : 'publicSite.menuMobile')"
          :aria-expanded="open"
          :aria-controls="menuId"
          @click="toggle"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path :d="open ? 'm5 5 14 14M5 19 19 5' : 'M4 6h16M4 12h16M4 18h16'" />
          </svg>
        </button>
      </div>
    </header>
    <Transition name="mega"
      ><PublicMegaMenu
        v-if="open"
        :id="menuId"
        :compact="compact"
        :signed-in="Boolean(currentUser)"
        @navigate="close(false)"
    /></Transition>
  </div>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted, ref, useId } from "vue";
import PublicBrand from "./PublicBrand.vue";
import { useRoute } from "vue-router";
import LanguageSwitcher from "../LanguageSwitcher.vue";
import PublicMegaMenu from "./PublicMegaMenu.vue";
import { t } from "../../i18n";
defineProps<{
  trackingPath: string;
  currentUser?: { role?: string } | null;
  entryLabel?: string;
}>();
const open = ref(false),
  compact = ref(false);
const route = useRoute();
const region = ref<HTMLElement | null>(null),
  trigger = ref<HTMLButtonElement | null>(null);
const mobileTrigger = ref<HTMLButtonElement | null>(null);
const menuId = useId();
let openTimer: ReturnType<typeof setTimeout> | undefined,
  closeTimer: ReturnType<typeof setTimeout> | undefined;
let query: MediaQueryList | undefined;
function clearClose() {
  clearTimeout(closeTimer);
}
function close(returnFocus = false) {
  clearTimeout(openTimer);
  clearTimeout(closeTimer);
  open.value = false;
  if (returnFocus) (compact.value ? mobileTrigger.value : trigger.value)?.focus();
}
function toggle() {
  clearTimeout(openTimer);
  clearClose();
  open.value = !open.value;
}
function scheduleOpen(event: PointerEvent) {
  if (event.pointerType === "touch" || compact.value) return;
  clearClose();
  clearTimeout(openTimer);
  openTimer = setTimeout(() => {
    open.value = true;
  }, 120);
}
function scheduleClose() {
  clearTimeout(openTimer);
  if (!compact.value) closeTimer = setTimeout(() => close(false), 140);
}
function escape() {
  if (open.value) close(true);
}
function outside(event: PointerEvent) {
  if (region.value && !region.value.contains(event.target as Node)) close(false);
}
function focusLeft(event: FocusEvent) {
  if (event.relatedTarget && !region.value?.contains(event.relatedTarget as Node)) close(false);
}
function update() {
  compact.value = Boolean(query?.matches);
}
onMounted(() => {
  query = window.matchMedia("(max-width: 1023px), (pointer: coarse)");
  update();
  query.addEventListener("change", update);
  document.addEventListener("pointerdown", outside);
});
onUnmounted(() => {
  clearTimeout(openTimer);
  clearTimeout(closeTimer);
  query?.removeEventListener("change", update);
  document.removeEventListener("pointerdown", outside);
});
</script>
