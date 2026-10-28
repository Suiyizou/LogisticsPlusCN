<template>
  <section id="landing-tools" class="maritime-tools" data-public-reveal>
    <div class="maritime-section-title">
      <div>
        <span class="maritime-section-rule" aria-hidden="true"></span>
        <h2>{{ t("publicSite.homeSectionTitle") }}</h2>
      </div>
      <p>{{ t("publicSite.homeSectionDescription") }}</p>
    </div>
    <div class="maritime-services">
      <article v-for="(item, index) in items" :key="item.key" :style="{ '--item-index': index }">
        <span class="maritime-services__number">0{{ index + 1 }}</span
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
  { key: "One", label: "VISIBILITY", icon: "ship", href: "/services/transport" },
  { key: "Two", label: "PLANNING", icon: "box", href: "/services/planning" },
  { key: "Three", label: "COLLABORATION", icon: "users", href: "/services/operations" }
];
</script>
