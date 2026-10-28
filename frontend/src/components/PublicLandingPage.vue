<template>
  <PublicSiteShell :current-user="currentUser">
    <main ref="page">
      <section id="landing-top" class="maritime-hero">
        <picture class="maritime-hero__image"
          ><source
            type="image/webp"
            srcset="
              /brand/v2/maritime-640.webp   640w,
              /brand/v2/maritime-1280.webp 1280w,
              /brand/v2/maritime-1920.webp 1920w
            "
            sizes="100vw" />
          <img
            src="/brand/v2/maritime.png"
            :alt="t('publicSite.transportImageAlt')"
            width="1888"
            height="833"
            fetchpriority="high"
        /></picture>
        <div class="maritime-wrap maritime-hero__content">
          <h1>
            {{ t("publicSite.heroTitle") }}<br /><span>{{ t("publicSite.heroSecond") }}</span>
          </h1>
          <p>
            {{ t("publicSite.heroDescription") }}<br />{{ t("publicSite.heroDescriptionSecond") }}
          </p>
          <div class="maritime-hero__actions">
            <a class="maritime-button maritime-button--primary" :href="trackingPath"
              >{{ t("publicSite.heroTrack") }} <span aria-hidden="true">→</span></a
            ><RouterLink class="maritime-button maritime-button--outline" to="/services"
              >{{ t("publicSite.heroExplore") }} <span aria-hidden="true">↗</span></RouterLink
            >
          </div>
        </div>
      </section>
      <div class="maritime-wrap">
        <PublicTrackingDock :tracking-path="trackingPath" /><PublicToolsSection
          :tracking-path="trackingPath"
        />
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
          <RouterLink class="maritime-button maritime-button--light" to="/services/operations"
            >{{ t("publicSite.homeStoryAction") }} <span aria-hidden="true">→</span></RouterLink
          >
        </div>
      </section>
    </main>
  </PublicSiteShell>
</template>
<script setup lang="ts">
import "../maritime-public.css";
import { onMounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import PublicSiteShell from "./public/PublicSiteShell.vue";
import PublicTrackingDock from "./public/PublicTrackingDock.vue";
import PublicToolsSection from "./public/PublicToolsSection.vue";
import { usePublicReveal } from "./public/usePublicReveal.js";
import { currentLocale, t } from "../i18n";
defineProps<{ currentUser?: { role?: string; username?: string; displayName?: string } | null }>();
const trackingPath = import.meta.env.VITE_TRACKING_WORKBENCH_URL || "/tracking/";
const page = ref<HTMLElement | null>(null);
usePublicReveal(page);
function title() {
  document.title = t("landing.metaTitle");
}
onMounted(title);
watch(currentLocale, title);
</script>
