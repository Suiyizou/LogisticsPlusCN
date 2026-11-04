<template>
  <PublicSiteShell :current-user="currentUser"
    ><main ref="page" class="public-service-index">
      <section class="public-page-intro public-index-hero">
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
      <nav class="public-catalogue-navigation maritime-wrap" :aria-label="labels.indexJump">
        <h2>{{ labels.indexJump }}</h2>
        <label class="public-catalogue-search">
          <span>{{ labels.indexSearch }}</span>
          <input v-model.trim="search" type="search" :placeholder="labels.indexPlaceholder" />
        </label>
        <p v-if="search" class="public-catalogue-result" role="status">{{ filteredResult }}</p>
        <ul>
          <li v-for="(group, index) in groups" v-show="group.items.length" :key="group.id">
            <RouterLink :to="{ hash: '#scope-' + group.id }">
              <span aria-hidden="true">0{{ index + 1 }}</span>
              {{ t("publicSite.groups." + group.id + ".title") }}
              <span aria-hidden="true">↓</span>
            </RouterLink>
          </li>
        </ul>
      </nav>
      <div class="maritime-wrap">
        <section
          v-for="group in groups"
          v-show="group.items.length"
          :key="group.id"
          :id="'scope-' + group.id"
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
              <small>{{ serviceAccessLabel(service.access) }}</small>
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
import { publicServices, serviceGroups } from "../../public/serviceCatalog.js";
import { getPublicDetailLabels } from "../../i18n/publicServiceDetailMessages.js";
import PublicSiteShell from "./PublicSiteShell.vue";
import ServiceIcon from "./ServiceIcon.vue";
import { usePublicReveal } from "./usePublicReveal.js";
defineProps<{ currentUser?: { role?: string } | null }>();
const labels = computed(() => getPublicDetailLabels(currentLocale.value));
const page = ref<HTMLElement | null>(null);
const search = ref("");
const groups = computed(() => {
  const query = search.value.toLocaleLowerCase(currentLocale.value);
  return serviceGroups.map((group) => ({
    ...group,
    items: publicServices.filter((service) => {
      if (!group.services.includes(service.id)) return false;
      const prefix = "publicSite.services." + service.id;
      const text = [service.id, t(prefix + ".title"), t(prefix + ".summary"), t(prefix + ".intro")];
      return !query || text.join(" ").toLocaleLowerCase(currentLocale.value).includes(query);
    })
  }));
});
const filteredResult = computed(() => {
  const count = groups.value.reduce((total, group) => total + group.items.length, 0);
  return count
    ? labels.value.indexResults.replace("{count}", String(count))
    : labels.value.indexEmpty;
});
usePublicReveal(page);
function serviceAccessLabel(access: string) {
  const accessKinds: Record<string, string> = {
    public: "accessPublic",
    authenticated: "accessAuthenticated",
    external: "accessExternal",
    context: "accessContext"
  };
  return t("publicSite." + (accessKinds[access] || "accessRegistered"));
}
const title = () => {
  document.title = t("publicSite.navCapabilities") + " | logisticspluscn";
};
onMounted(title);
watch(currentLocale, title);
</script>
