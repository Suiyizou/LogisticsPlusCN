<template>
  <PublicSiteShell :current-user="currentUser">
    <main ref="page" class="public-company-page">
      <section class="public-detail-hero public-company-hero">
        <figure class="public-detail-hero__image">
          <img
            src="/brand/v4/dispatch-team.webp"
            :alt="t('publicSite.collaborationImageAlt')"
            width="1586"
            height="992"
            fetchpriority="high"
          />
        </figure>
        <div class="maritime-wrap">
          <p class="public-breadcrumb">
            <a href="/">{{ t("publicSite.crumbHome") }}</a
            ><span>/</span>{{ labels.company }}
          </p>
          <div class="public-detail-hero__grid">
            <div>
              <span class="maritime-eyebrow">ABOUT LOGISTICSPLUSCN</span>
              <h1>{{ labels.companyTitle }}</h1>
              <p class="public-lead">{{ labels.companyBody }}</p>
              <RouterLink class="maritime-button maritime-button--navy" to="/services"
                >{{ labels.companyAction }}<span aria-hidden="true">→</span></RouterLink
              >
            </div>
          </div>
        </div>
      </section>
      <section class="public-company-intro maritime-wrap" data-public-reveal>
        <header class="public-section-heading">
          <span class="maritime-eyebrow">OUR COMPANY</span>
          <h2>{{ t("publicSite.footerCompany") }}</h2>
        </header>
        <div>
          <p>{{ labels.companySecond }}</p>
          <p class="public-company-english">{{ t("publicSite.editorial.companyEnglish") }}</p>
        </div>
      </section>
      <section class="public-company-values maritime-wrap" data-public-reveal>
        <article v-for="(item, index) in labels.companyValues" :key="item[0]">
          <span class="public-row-number">0{{ index + 1 }}</span>
          <h3>{{ item[0] }}</h3>
          <p>{{ item[1] }}</p>
        </article>
      </section>
      <section class="public-scenarios" data-public-reveal>
        <div class="maritime-wrap public-company-scope">
          <figure>
            <img
              src="/brand/v4/open-voyage.webp"
              :alt="t('publicSite.transportImageAlt')"
              width="1586"
              height="992"
              loading="lazy"
            />
          </figure>
          <div>
            <span class="maritime-eyebrow">CONNECTED SERVICES</span>
            <h2>{{ labels.companyScope }}</h2>
            <p>{{ labels.companyScopeBody }}</p>
            <ul class="public-company-links" :aria-label="labels.companyEntries">
              <li v-for="(path, index) in entryPaths" :key="path">
                <RouterLink :to="path"
                  >{{ labels.pathways[index] }} <span aria-hidden="true">→</span></RouterLink
                >
              </li>
            </ul>
          </div>
        </div>
      </section>
      <section class="public-next-step" data-public-reveal>
        <div class="maritime-wrap">
          <div>
            <h2>{{ labels.companyContact }}</h2>
            <p>{{ labels.companyContactBody }}</p>
          </div>
          <a class="maritime-button maritime-button--navy" href="/workbenches"
            >{{ t("publicSite.navOpen") }}<span aria-hidden="true">→</span></a
          >
        </div>
      </section>
    </main>
  </PublicSiteShell>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { currentLocale, t } from "../../i18n";
import { getPublicDetailLabels } from "../../i18n/publicServiceDetailMessages.js";
import PublicSiteShell from "./PublicSiteShell.vue";
import { usePublicReveal } from "./usePublicReveal.js";
defineProps<{ currentUser?: { role?: string } | null }>();
const entryPaths = ["/services/transport", "/services/planning", "/services#scope-collaboration"];
const page = ref<HTMLElement | null>(null);
const labels = computed(() => getPublicDetailLabels(currentLocale.value));
usePublicReveal(page);
const title = () => {
  document.title = labels.value.company + " | logisticspluscn";
};
onMounted(title);
watch(currentLocale, title);
</script>
