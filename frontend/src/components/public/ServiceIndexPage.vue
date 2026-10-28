<template>
  <PublicSiteShell :current-user="currentUser"
    ><main ref="page" class="public-service-index">
      <section class="public-page-intro">
        <div class="maritime-wrap">
          <p class="public-breadcrumb">
            <a href="/">{{ t("publicSite.crumbHome") }}</a
            ><span>/</span>{{ t("publicSite.crumbServices") }}
          </p>
          <span class="maritime-eyebrow">{{ t("publicSite.serviceIndexEyebrow") }}</span>
          <h1>{{ t("publicSite.serviceIndexTitle") }}</h1>
          <p class="public-lead">{{ t("publicSite.serviceIndexDescription") }}</p>
        </div>
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
              ><ServiceIcon :name="service.icon" />
              <h3>{{ t("publicSite.services." + service.id + ".title") }}</h3>
              <p>{{ t("publicSite.services." + service.id + ".summary") }}</p>
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
import { onMounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { currentLocale, t } from "../../i18n";
import { publicServices, serviceGroups } from "../../public/serviceCatalog.js";
import PublicSiteShell from "./PublicSiteShell.vue";
import ServiceIcon from "./ServiceIcon.vue";
import { usePublicReveal } from "./usePublicReveal.js";
defineProps<{ currentUser?: { role?: string } | null }>();
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
