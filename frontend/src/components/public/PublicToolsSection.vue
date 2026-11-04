<template>
  <section id="landing-tools" class="maritime-tools" data-public-reveal>
    <header class="maritime-section-title">
      <div>
        <span class="maritime-eyebrow">{{ labels.capabilityEyebrow }}</span>
        <h2>{{ t("publicSite.homeSectionTitle") }}</h2>
      </div>
      <p>{{ t("publicSite.homeSectionDescription") }}</p>
    </header>
    <div class="public-home-capabilities">
      <article v-for="(item, index) in items" :key="item.image">
        <RouterLink class="public-home-capability__entry" :to="item.href">
          <img :src="serviceImages[item.image]" alt="" width="1586" height="992" loading="lazy" />
          <div class="public-home-capability__body">
            <div class="public-home-capability__index">
              <ServiceIcon :name="item.icon" /><span aria-hidden="true">0{{ index + 1 }}</span>
            </div>
            <h3>{{ labels.pathways[index] }}</h3>
            <p>{{ labels.pathwayBodies[index] }}</p>
            <ul :aria-label="labels.outcomes">
              <li v-for="output in labels.homeOutputs[index]" :key="output">{{ output }}</li>
            </ul>
            <span class="public-home-capability__link">
              {{ labels.homeActions[index] }} <span aria-hidden="true">→</span>
            </span>
          </div>
        </RouterLink>
      </article>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { currentLocale, t } from "../../i18n";
import { getPublicDetailLabels } from "../../i18n/publicServiceDetailMessages.js";
import { serviceImages } from "../../public/serviceCatalog.js";
import ServiceIcon from "./ServiceIcon.vue";

const labels = computed(() => getPublicDetailLabels(currentLocale.value));
const items = [
  { image: "transport", icon: "ship", href: "/services/transport" },
  { image: "planning", icon: "box", href: "/services/planning" },
  { image: "collaboration", icon: "users", href: "/services#scope-collaboration" }
] as const;
</script>
