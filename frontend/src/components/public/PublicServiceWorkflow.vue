<template>
  <section id="service-workflow" class="public-service-workflow" data-public-reveal>
    <div class="maritime-wrap">
      <header class="public-editorial-heading">
        <h2>{{ planning ? t("publicSite.planningDiagram") : t("publicSite.serviceSteps") }}</h2>
        <span></span>
        <p>
          {{
            t(planning ? "publicSite.editorial.planningHint" : "publicSite.editorial.workflowHint")
          }}
        </p>
      </header>
      <ol>
        <li v-for="(step, index) in steps" :key="step.title" :style="{ '--item-index': index }">
          <div class="service-workflow-copy">
            <span>{{ index + 1 }}</span>
            <div>
              <h3>{{ step.title }}</h3>
              <p>{{ step.body }}</p>
            </div>
          </div>
          <ServiceWorkflowGraphic
            :stage="index + 1"
            :planning="planning"
            :icon="icons[index] || 'document'"
          />
          <span v-if="index < 2" class="service-workflow-arrow" aria-hidden="true">→</span>
        </li>
      </ol>
    </div>
  </section>
</template>
<script setup lang="ts">
import { t } from "../../i18n";
import ServiceWorkflowGraphic from "./ServiceWorkflowGraphic.vue";
defineProps<{ planning: boolean; steps: { title: string; body: string }[]; icons: string[] }>();
</script>
