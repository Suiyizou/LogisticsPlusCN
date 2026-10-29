<template>
  <div v-if="content" class="public-extended-details">
    <section id="service-deliverables" class="public-outcomes maritime-wrap" data-public-reveal>
      <header class="public-section-heading">
        <span class="maritime-eyebrow">{{ labels.more }}</span>
        <h2>{{ labels.outcomes }}</h2>
        <p>{{ labels.outcomesBody }}</p>
      </header>
      <dl class="public-outcome-list">
        <div v-for="(item, index) in content.deliverables" :key="item[0]">
          <dt>
            <span>{{ String(index + 1).padStart(2, "0") }}</span>
            <h3>{{ item[0] }}</h3>
          </dt>
          <dd>{{ item[1] }}</dd>
        </div>
      </dl>
    </section>
    <section id="service-scenarios" class="public-scenarios" data-public-reveal>
      <div class="maritime-wrap">
        <header class="public-section-heading">
          <span class="maritime-eyebrow">IN YOUR WORKFLOW</span>
          <h2>{{ labels.scenarios }}</h2>
        </header>
        <div class="public-scenario-layout">
          <figure>
            <img :src="image" :alt="imageAlt" width="1280" height="564" loading="lazy" />
          </figure>
          <div>
            <article v-for="(item, index) in content.scenarios" :key="item[0]">
              <span class="public-row-number">0{{ index + 1 }}</span>
              <h3>{{ item[0] }}</h3>
              <p>{{ item[1] }}</p>
            </article>
          </div>
        </div>
      </div>
    </section>
    <section id="service-faq" class="public-faq maritime-wrap" data-public-reveal>
      <header class="public-section-heading">
        <span class="maritime-eyebrow">QUESTIONS, ANSWERED</span>
        <h2>{{ labels.faq }}</h2>
      </header>
      <div>
        <details v-for="item in content.faq" :key="serviceId + item[0]">
          <summary>{{ item[0] }}<span aria-hidden="true">+</span></summary>
          <p>{{ item[1] }}</p>
        </details>
      </div>
    </section>
    <section class="public-next-step" data-public-reveal>
      <div class="maritime-wrap">
        <div>
          <span class="maritime-eyebrow">YOUR NEXT STEP</span>
          <h2>{{ labels.next }}</h2>
          <p>{{ labels.nextBody }}</p>
        </div>
        <a
          class="maritime-button maritime-button--navy"
          :href="entry.href"
          :target="entry.external ? '_blank' : undefined"
          :rel="entry.external ? 'noopener noreferrer' : undefined"
          >{{ action }}<span aria-hidden="true">→</span></a
        >
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { currentLocale } from "../../i18n";
import {
  getPublicDetailContent,
  getPublicDetailLabels
} from "../../i18n/publicServiceDetailMessages.js";
const props = defineProps<{
  serviceId: string;
  image: string;
  imageAlt: string;
  action: string;
  entry: { href: string; external: boolean };
}>();
const labels = computed(() => getPublicDetailLabels(currentLocale.value));
const content = computed(() => getPublicDetailContent(props.serviceId, currentLocale.value));
</script>
