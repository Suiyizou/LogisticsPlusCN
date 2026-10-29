<template>
  <PublicSiteShell :current-user="currentUser"
    ><main ref="page" class="public-service-index">
      <section class="public-page-intro public-index-hero">
        <figure>
          <img
            src="/brand/v2/maritime-1920.webp"
            :alt="t('publicSite.transportImageAlt')"
            width="1888"
            height="833"
            fetchpriority="high"
          />
        </figure>
        <div class="maritime-wrap">
          <p class="public-breadcrumb">
            <a href="/">{{ t("publicSite.crumbHome") }}</a
            ><span>/</span>{{ t("publicSite.crumbServices") }}
          </p>
          <span class="maritime-eyebrow">{{ t("publicSite.serviceIndexEyebrow") }}</span>
          <h1>{{ labels.indexTitle }}</h1>
          <p class="public-lead">{{ labels.indexBody }}</p>
        </div>
      </section>
      <section class="public-index-approach maritime-wrap" data-public-reveal>
        <div>
          <span class="maritime-eyebrow">DESIGNED AROUND YOUR WORK</span>
          <h2>{{ labels.approach }}</h2>
          <p>{{ labels.approachBody }}</p>
        </div>
        <ol>
          <li v-for="(item, index) in labels.pathways" :key="item">
            <span class="public-row-number">0{{ index + 1 }}</span>
            <div>
              <h3>{{ item }}</h3>
              <p>{{ labels.pathwayBodies[index] }}</p>
            </div>
          </li>
        </ol>
      </section>
      <div class="maritime-wrap">
        <section
          v-for="group in groups"
          :key="group.id"
          class="public-service-group"
          data-public-reveal
        >
          <header>
            <div>
              <span class="maritime-eyebrow">{{ group.id.toUpperCase() }}</span>
              <h2>{{ t("publicSite.groups." + group.id + ".title") }}</h2>
            </div>
            <p>{{ t("publicSite.groups." + group.id + ".description") }}</p>
          </header>
          <div class="public-service-grid">
            <RouterLink
              v-for="service in group.items"
              :key="service.id"
              :to="service.detailPath"
              class="public-service-tile"
              ><img
                :src="serviceImages[service.image as keyof typeof serviceImages]"
                :alt="t('publicSite.' + service.image + 'ImageAlt')"
                width="640"
                height="282"
                loading="lazy"
              /><ServiceIcon :name="service.icon" />
              <h3>{{ t("publicSite.services." + service.id + ".title") }}</h3>
              <p>{{ t("publicSite.services." + service.id + ".intro") }}</p>
              <span>{{ t("publicSite.details") }} <b aria-hidden="true">→</b></span></RouterLink
            >
          </div>
        </section>
        <p class="public-service-index__note">{{ t("publicSite.serviceIndexNote") }}</p>
      </div>
    </main></PublicSiteShell
  >
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { currentLocale, t } from "../../i18n";
import { publicServices, serviceGroups, serviceImages } from "../../public/serviceCatalog.js";
import { getPublicDetailLabels } from "../../i18n/publicServiceDetailMessages.js";
import PublicSiteShell from "./PublicSiteShell.vue";
import ServiceIcon from "./ServiceIcon.vue";
import { usePublicReveal } from "./usePublicReveal.js";
defineProps<{ currentUser?: { role?: string } | null }>();
const labels = computed(() => getPublicDetailLabels(currentLocale.value));
const page = ref<HTMLElement | null>(null);
const groups = serviceGroups.map((group) => ({
  ...group,
  items: publicServices.filter((service) => group.services.includes(service.id))
}));
usePublicReveal(page);
const title = () => {
  document.title = t("publicSite.navCapabilities") + " | logisticspluscn";
};
onMounted(title);
watch(currentLocale, title);
</script>
