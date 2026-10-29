<template>
  <nav :id="id" class="public-mega" :aria-label="t('publicSite.navCapabilities')">
    <div class="maritime-wrap">
      <div class="public-mega__top">
        <span class="maritime-eyebrow">{{ t("publicSite.menuEyebrow") }}</span
        ><RouterLink to="/services" @click="emit('navigate')"
          >{{ t("publicSite.navOverview") }} <span aria-hidden="true">→</span></RouterLink
        >
      </div>
      <div v-if="compact" class="public-mega-mobile-actions">
        <a href="/services/company" class="maritime-button">{{ labels.company }}</a
        ><LanguageSwitcher /><a class="maritime-button maritime-button--navy" href="/workbenches"
          >{{ t(signedIn ? "publicSite.navOpen" : "publicSite.navLogin") }}
          <span aria-hidden="true">↗</span></a
        >
      </div>
      <div class="public-mega__grid">
        <div class="public-mega__groups">
          <section v-for="group in groups" :key="group.id" class="mega-group">
            <button
              v-if="compact"
              type="button"
              class="mega-group__toggle"
              :aria-expanded="expanded === group.id"
              :aria-controls="id + '-' + group.id"
              @click="expanded = expanded === group.id ? '' : group.id"
            >
              <strong>{{ t("publicSite.groups." + group.id + ".title") }}</strong
              ><span aria-hidden="true">{{ expanded === group.id ? "−" : "+" }}</span>
            </button>
            <h3 v-else>{{ t("publicSite.groups." + group.id + ".title") }}</h3>
            <p class="mega-group__description">
              {{ t("publicSite.groups." + group.id + ".description") }}
            </p>
            <ul v-show="!compact || expanded === group.id" :id="id + '-' + group.id">
              <li
                v-for="service in group.items"
                :key="service.id"
                :class="{ 'is-selected': selected.id === service.id }"
              >
                <RouterLink
                  :to="service.detailPath"
                  @mouseenter="select(service.id)"
                  @focus="select(service.id)"
                  @click="emit('navigate')"
                  ><ServiceIcon :name="service.icon" /><span>{{
                    t("publicSite.services." + service.id + ".title")
                  }}</span
                  ><span class="mega-item-arrow" aria-hidden="true">→</span></RouterLink
                >
                <p v-if="compact" class="mega-item-description">
                  {{ t("publicSite.services." + service.id + ".summary") }}
                </p>
              </li>
            </ul>
          </section>
        </div>
        <PublicServiceCard v-if="!compact" :service="selected" @navigate="emit('navigate')" />
      </div>
      <div class="public-mega__bottom">
        <p>{{ t("publicSite.serviceIndexNote") }}</p>
        <span>{{ t("publicSite.menuDescription") }}</span>
      </div>
    </div>
  </nav>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { getPublicDetailLabels } from "../../i18n/publicServiceDetailMessages.js";
import { currentLocale, t } from "../../i18n";
import { serviceGroups, publicServices } from "../../public/serviceCatalog.js";
import PublicServiceCard from "./PublicServiceCard.vue";
import ServiceIcon from "./ServiceIcon.vue";
import LanguageSwitcher from "../LanguageSwitcher.vue";
defineProps<{ id: string; compact: boolean; signedIn?: boolean }>();
const labels = computed(() => getPublicDetailLabels(currentLocale.value));
const emit = defineEmits<{ navigate: [] }>();
const selectedId = ref("transport");
const expanded = ref("transport");
const groups = serviceGroups.map((group) => ({
  ...group,
  items: publicServices.filter((service) => group.services.includes(service.id))
}));
const selected = computed(
  () => publicServices.find((item) => item.id === selectedId.value) || publicServices[0]
);
function select(id: string) {
  selectedId.value = id;
}
</script>
