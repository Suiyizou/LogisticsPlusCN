<template>
  <PublicSiteShell :current-user="currentUser">
    <main ref="page">
      <section id="landing-top" class="maritime-hero">
        <picture class="maritime-hero__image">
          <img
            src="/brand/v4/open-voyage.webp"
            alt=""
            width="1586"
            height="992"
            fetchpriority="high"
          />
        </picture>
        <div class="maritime-wrap maritime-hero__content">
          <span class="maritime-eyebrow">{{ labels.homeEyebrow }}</span>
          <h1>
            {{ t("publicSite.heroTitle") }}<br /><span>{{ t("publicSite.heroSecond") }}</span>
          </h1>
          <p>{{ t("publicSite.heroDescription") }} {{ t("publicSite.heroDescriptionSecond") }}</p>
          <div class="maritime-hero__actions">
            <a class="maritime-button maritime-button--primary" :href="trackingPath"
              >{{ t("publicSite.heroTrack") }} <span aria-hidden="true">→</span></a
            ><RouterLink class="maritime-button maritime-button--outline" to="/services"
              >{{ t("publicSite.heroExplore") }} <span aria-hidden="true">↗</span></RouterLink
            >
          </div>
        </div>
      </section>
      <div class="public-tracking-band">
        <div class="maritime-wrap">
          <PublicTrackingDock :tracking-path="trackingPath" />
        </div>
      </div>
      <div class="maritime-wrap">
        <PublicToolsSection />
      </div>
      <section class="maritime-about" data-public-reveal>
        <figure>
          <img
            src="/brand/harbor.png"
            :alt="t('publicSite.transportImageAlt')"
            width="1280"
            height="563"
            loading="lazy"
          />
        </figure>
        <div>
          <span class="maritime-section-rule" aria-hidden="true"></span>
          <h2>{{ t("publicSite.editorial.companyTitle") }}</h2>
          <p>{{ t("publicSite.editorial.companyBody") }}</p>
          <RouterLink class="maritime-button maritime-button--light" to="/services/company"
            >{{ labels.company }} <span aria-hidden="true">→</span></RouterLink
          >
        </div>
      </section>
    </main>
  </PublicSiteShell>
</template>
<script setup lang="ts">
import "../maritime-public.css";
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import PublicSiteShell from "./public/PublicSiteShell.vue";
import PublicTrackingDock from "./public/PublicTrackingDock.vue";
import PublicToolsSection from "./public/PublicToolsSection.vue";
import { usePublicReveal } from "./public/usePublicReveal.js";
import { getPublicDetailLabels } from "../i18n/publicServiceDetailMessages.js";
import { currentLocale, t } from "../i18n";
defineProps<{ currentUser?: { role?: string; username?: string; displayName?: string } | null }>();
const labels = computed(() => getPublicDetailLabels(currentLocale.value));
const trackingPath = import.meta.env.VITE_TRACKING_WORKBENCH_URL || "/workspace/tracking/overview";
const page = ref<HTMLElement | null>(null);
usePublicReveal(page);
function title() {
  document.title = t("landing.metaTitle");
}
onMounted(title);
watch(currentLocale, title);
</script>
