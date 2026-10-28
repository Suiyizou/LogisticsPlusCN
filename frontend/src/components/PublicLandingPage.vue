<template>
  <div class="landing-page" :lang="currentLocale">
    <PublicSiteHeader :tracking-path="trackingPath" :entry-label="entryLabel" />
    <main>
      <section id="landing-top" class="maritime-hero">
        <div class="maritime-wrap">
          <span class="maritime-eyebrow">{{ t("maritime.heroEyebrow") }}</span>
          <h1>{{ t("maritime.heroTitle") }}<br />{{ t("maritime.heroTitleSecond") }}</h1>
          <p>{{ t("maritime.heroDescription") }}<br />{{ t("maritime.heroDescriptionSecond") }}</p>
          <div class="maritime-hero__actions">
            <a class="maritime-button maritime-button--primary" :href="trackingPath"
              >{{ t("maritime.trackAction") }} <span aria-hidden="true">→</span></a
            ><a class="maritime-button maritime-button--outline" href="/workbenches"
              >{{ entryLabel }} <span aria-hidden="true">↗</span></a
            >
          </div>
        </div>
        <small class="maritime-hero__caption">{{ t("maritime.imageCaption") }}</small>
      </section>
      <div class="maritime-wrap">
        <PublicTrackingDock :tracking-path="trackingPath" /><PublicToolsSection
          :tracking-path="trackingPath"
        />
      </div>
      <section class="maritime-about">
        <img src="/brand/harbor.png" :alt="t('maritime.imageAlt')" loading="lazy" />
        <div>
          <span class="maritime-eyebrow">{{ t("maritime.aboutEyebrow") }}</span>
          <h2>{{ t("maritime.aboutTitle") }}<br />{{ t("maritime.aboutTitleSecond") }}</h2>
          <p>{{ t("maritime.aboutDescription") }}</p>
          <a class="maritime-text-link" href="/workbenches"
            >{{ t("maritime.portalAction") }} <span aria-hidden="true">↗</span></a
          >
        </div>
      </section>
    </main>
    <footer class="maritime-footer">
      <div class="maritime-wrap">
        <BrandLockup /><LanguageSwitcher /><span>{{ t("maritime.footerTagline") }}</span
        ><span>{{ t("maritime.company") }}<br />© {{ year }} logisticspluscn</span>
      </div>
    </footer>
  </div>
</template>
<script setup lang="ts">
import "../maritime-public.css";
import { computed, onMounted, watch } from "vue";
import PublicSiteHeader from "./public/PublicSiteHeader.vue";
import PublicTrackingDock from "./public/PublicTrackingDock.vue";
import PublicToolsSection from "./public/PublicToolsSection.vue";
import BrandLockup from "./brand/BrandLockup.vue";
import LanguageSwitcher from "./LanguageSwitcher.vue";
import { currentLocale, t } from "../i18n";
const props = defineProps<{
  currentUser?: { role?: string; username?: string; displayName?: string } | null;
}>();
const trackingPath = import.meta.env.VITE_TRACKING_WORKBENCH_URL || "/tracking/";
const year = new Date().getFullYear();
const entryLabel = computed(() => {
  currentLocale.value;
  return t(props.currentUser ? "landing.entry.open" : "maritime.loginAction");
});
const updateTitle = () => {
  document.title = t("landing.metaTitle");
};
onMounted(updateTitle);
watch(currentLocale, updateTitle);
</script>
