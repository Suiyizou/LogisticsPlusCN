<template>
  <section id="landing-tools" class="maritime-tools" data-public-reveal>
    <div class="maritime-section-title">
      <div>
        <span class="maritime-eyebrow">{{ t("publicSite.homeSectionEyebrow") }}</span>
        <h2>{{ t("publicSite.homeSectionTitle") }}</h2>
      </div>
      <p>{{ t("publicSite.homeSectionDescription") }}</p>
    </div>
    <div class="maritime-services">
      <article v-for="(item, index) in items" :key="item.key">
        <span class="maritime-services__number">0{{ index + 1 }} / {{ item.label }}</span
        ><ServiceIcon :name="item.icon" />
        <h3>{{ t("publicSite.homeFeature" + item.key) }}</h3>
        <p>{{ t("publicSite.homeFeature" + item.key + "Body") }}</p>
        <RouterLink :to="item.href"
          >{{ t("publicSite.details") }} <span aria-hidden="true">→</span></RouterLink
        >
      </article>
    </div>
  </section>
</template>
<script setup lang="ts">
import { RouterLink } from "vue-router";
import { t } from "../../i18n";
import ServiceIcon from "./ServiceIcon.vue";
defineProps<{ trackingPath: string }>();
const items = [
  { key: "One", label: "VISIBILITY", icon: "location", href: "/services/transport" },
  { key: "Two", label: "PLANNING", icon: "box", href: "/services/planning" },
  { key: "Three", label: "COLLABORATION", icon: "users", href: "/services/operations" }
];
</script>
