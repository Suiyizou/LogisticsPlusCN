<template>
  <section id="landing-tools" class="maritime-tools">
    <div class="maritime-section-title">
      <div>
        <span class="maritime-eyebrow">{{ t("maritime.toolsEyebrow") }}</span>
        <h2>{{ t("maritime.toolsTitle") }}</h2>
      </div>
      <p>{{ t("maritime.toolsDescription") }}</p>
    </div>
    <div class="maritime-services">
      <article v-for="item in items" :key="item.key">
        <span class="maritime-services__number">{{ item.number }}</span>
        <h3>{{ t("maritime." + item.key + "Title") }}</h3>
        <p>{{ t("maritime." + item.key + "Description") }}</p>
        <a :href="item.href"
          >{{ t("maritime." + item.key + "Action") }} <span aria-hidden="true">↗</span></a
        >
      </article>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { t } from "../../i18n";
const props = defineProps<{ trackingPath: string }>();
const items = computed(() => [
  { key: "visibility", number: "01 / VISIBILITY", href: props.trackingPath },
  { key: "planning", number: "02 / PLANNING", href: "/planner" },
  { key: "collaboration", number: "03 / COLLABORATION", href: "/workbenches" }
]);
</script>
