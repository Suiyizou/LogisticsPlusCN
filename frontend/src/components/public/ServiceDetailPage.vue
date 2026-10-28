<template>
  <PublicSiteShell :current-user="currentUser">
    <main v-if="service && copy" ref="page" class="public-service-detail">
      <section class="public-detail-hero">
        <div class="maritime-wrap">
          <p class="public-breadcrumb">
            <a href="/">{{ t("publicSite.crumbHome") }}</a
            ><span>/</span
            ><RouterLink to="/services">{{ t("publicSite.crumbServices") }}</RouterLink
            ><span>/</span>{{ copy.title }}
          </p>
          <div class="public-detail-hero__grid">
            <div>
              <span class="maritime-eyebrow">{{ service.id.toUpperCase() }} / LOGISTICSPLUSCN</span>
              <h1>{{ copy.title }}</h1>
              <p class="public-detail-tagline">{{ copy.summary }}</p>
              <p class="public-lead">{{ copy.intro }}</p>
              <div class="public-detail-actions">
                <a
                  class="maritime-button maritime-button--primary"
                  :href="entry.href"
                  :target="entry.external ? '_blank' : undefined"
                  :rel="entry.external ? 'noopener noreferrer' : undefined"
                  >{{ entry.allowed ? copy.cta : t("publicSite.availableWorkspaces")
                  }}<span aria-hidden="true">↗</span></a
                ><span class="public-access">{{ accessLabel }}</span>
              </div>
            </div>
            <figure>
              <img
                :src="heroImage"
                :alt="t('publicSite.' + service.image + 'ImageAlt')"
                width="1280"
                height="564"
              />
            </figure>
          </div>
        </div>
      </section>
      <div class="maritime-wrap public-detail-body">
        <div class="public-detail-primary">
          <section v-if="service.layout === 'tracking'" class="service-context" data-public-reveal>
            <span class="maritime-eyebrow">TRACK & TRACE</span>
            <h2>{{ t("publicSite.trackingDockTitle") }}</h2>
            <p>{{ t("publicSite.trackingDockBody") }}</p>
            <PublicTrackingDock :tracking-path="trackingPath" />
            <div class="service-definition-grid">
              <article
                v-for="key in ['trackingEstimate', 'trackingActual', 'trackingSource']"
                :key="key"
              >
                <h3>{{ t("publicSite." + key) }}</h3>
                <p>{{ t("publicSite." + key + "Body") }}</p>
              </article>
            </div>
          </section>
          <section
            v-else-if="service.layout === 'planning'"
            class="service-context"
            data-public-reveal
          >
            <span class="maritime-eyebrow">LOAD PLANNING</span>
            <h2>{{ t("publicSite.planningDiagram") }}</h2>
            <div class="service-planning-diagram">
              <div class="service-cargo-shapes" aria-hidden="true">
                <i></i><i></i><i></i><i></i>
              </div>
              <svg viewBox="0 0 320 170" aria-hidden="true">
                <path d="m35 66 164-41 91 37-165 43Z" fill="#b7c7cf" />
                <path d="m35 66 90 39v60l-90-39Z" fill="#385c70" />
                <path d="m125 105 165-43v61l-165 42Z" fill="#7192a3" />
                <path
                  d="m35 66 164-41 91 37v61l-165 42-90-39V66l90 39 165-43M125 105v60"
                  fill="none"
                  stroke="#15384a"
                  stroke-width="2"
                />
                <path
                  d="m145 100 0 57m20-62v57m20-63v58m20-62v57m20-63v57m20-62v57m20-63v58"
                  stroke="#476b7e"
                  stroke-width="2"
                />
              </svg>
              <div class="service-workflow-labels">
                <span>{{ t("publicSite.planningConfig") }}</span
                ><span>{{ t("publicSite.planningCargo") }}</span
                ><span>{{ t("publicSite.planningResult") }}</span>
              </div>
            </div>
            <a class="maritime-text-link" href="/algorithm"
              >{{ t("publicSite.planningAlgorithm") }} <span aria-hidden="true">→</span></a
            >
          </section>
          <section
            v-else-if="service.layout === 'containers'"
            class="service-context"
            data-public-reveal
          >
            <span class="maritime-eyebrow">EQUIPMENT REFERENCE</span>
            <h2>{{ t("publicSite.containerReference") }}</h2>
            <div class="service-equipment-grid">
              <article v-for="(kind, index) in ['Dry', 'High', 'Special']" :key="kind">
                <ServiceIcon name="equipment" /><span>{{
                  ["20GP / 40GP", "20HQ / 40HQ", "REEFER / FLAT RACK"][index]
                }}</span>
                <h3>{{ t("publicSite.container" + kind) }}</h3>
                <p>{{ t("publicSite.container" + kind + "Body") }}</p>
              </article>
            </div>
            <p class="service-source-note">{{ t("publicSite.containerSource") }}</p>
          </section>
          <section
            v-else-if="service.layout === 'overview'"
            class="service-context"
            data-public-reveal
          >
            <span class="maritime-eyebrow">OPERATIONS OVERVIEW</span>
            <h2>{{ t("publicSite.overviewTaskTitle") }}</h2>
            <div class="service-task-list">
              <article v-for="(label, index) in text.overviewTaskLabels" :key="label">
                <span>{{ String(index + 1).padStart(2, "0") }}</span>
                <div>
                  <h3>{{ label }}</h3>
                  <p>{{ text.overviewTaskBodies[index] }}</p>
                </div>
                <ServiceIcon :name="['document', 'location', 'users'][index]" />
              </article>
            </div>
          </section>
          <section
            v-else-if="service.layout === 'shipment'"
            class="service-context"
            data-public-reveal
          >
            <span class="maritime-eyebrow">SHIPMENT RECORD</span>
            <h2>{{ copy.summary }}</h2>
            <dl class="service-field-sections">
              <div v-for="(label, index) in text.shipmentSections" :key="label">
                <dt>{{ label }}</dt>
                <dd>{{ text.shipmentSectionBodies[index] }}</dd>
              </div>
            </dl>
          </section>
          <section
            v-else-if="service.layout === 'relationships'"
            class="service-context"
            data-public-reveal
          >
            <span class="maritime-eyebrow">CUSTOMER RELATIONSHIPS</span>
            <h2>{{ copy.summary }}</h2>
            <div class="service-relationship-flow">
              <article v-for="(label, index) in text.relationshipNodes" :key="label">
                <ServiceIcon :name="['users', 'user', 'document'][index]" />
                <h3>{{ label }}</h3>
                <p>{{ text.relationshipLabels[index] }}</p>
              </article>
            </div>
          </section>
          <section
            v-else-if="service.layout === 'agents'"
            class="service-context"
            data-public-reveal
          >
            <span class="maritime-eyebrow">PARTNER COLLABORATION</span>
            <h2>{{ copy.summary }}</h2>
            <div class="service-agent-path">
              <article v-for="(label, index) in text.agentSections" :key="label">
                <span>{{ String(index + 1).padStart(2, "0") }}</span>
                <h3>{{ label }}</h3>
                <p>{{ text.agentBodies[index] }}</p>
              </article>
            </div>
          </section>
          <section
            v-else-if="service.layout === 'handover'"
            class="service-context"
            data-public-reveal
          >
            <span class="maritime-eyebrow">CLEAR HANDOVERS</span>
            <h2>{{ copy.summary }}</h2>
            <div class="service-handover-scope">
              <article v-for="(label, index) in text.handoverScope" :key="label">
                <ServiceIcon :name="['users', 'transfer', 'document'][index]" /><strong>{{
                  label
                }}</strong>
              </article>
            </div>
            <p class="service-source-note">{{ t("publicSite.handoverBoundary") }}</p>
          </section>
          <section
            v-else-if="service.layout === 'files'"
            class="service-context"
            data-public-reveal
          >
            <span class="maritime-eyebrow">SHIPMENT DOCUMENTS</span>
            <h2>{{ copy.summary }}</h2>
            <div class="service-file-path">
              <article v-for="(label, index) in text.fileSections" :key="label">
                <ServiceIcon :name="['folder', 'document', 'transfer'][index]" />
                <div>
                  <h3>{{ label }}</h3>
                  <p>{{ text.fileSectionBodies[index] }}</p>
                </div>
              </article>
            </div>
          </section>
          <section
            v-else-if="service.layout === 'customer'"
            class="service-context"
            data-public-reveal
          >
            <span class="maritime-eyebrow">CUSTOMER ACCESS</span>
            <h2>{{ copy.summary }}</h2>
            <div class="service-customer-scope">
              <article>
                <h3>{{ t("publicSite.customerCanTitle") }}</h3>
                <ul>
                  <li v-for="item in text.customerCan" :key="item">{{ item }}</li>
                </ul>
              </article>
              <article>
                <ServiceIcon name="settings" />
                <h3>{{ t("publicSite.customerBoundaryTitle") }}</h3>
                <p>{{ t("publicSite.customerBoundaryBody") }}</p>
              </article>
            </div>
          </section>
          <section
            v-else-if="service.layout === 'administration'"
            class="service-context"
            data-public-reveal
          >
            <span class="maritime-eyebrow">ADMINISTRATION</span>
            <h2>{{ copy.summary }}</h2>
            <div class="service-admin-groups">
              <article v-for="(label, index) in text.adminGroups" :key="label">
                <span>{{ String(index + 1).padStart(2, "0") }}</span>
                <h3>{{ label }}</h3>
                <p>{{ text.adminGroupBodies[index] }}</p>
              </article>
            </div>
          </section>
          <section
            v-else-if="service.layout === 'external'"
            class="service-context service-external-platform"
            data-public-reveal
          >
            <span class="maritime-eyebrow">{{ t("publicSite.bookingLabel") }}</span
            ><ServiceIcon name="ship" />
            <h2>{{ t("publicSite.bookingTitle") }}</h2>
            <p>{{ t("publicSite.bookingBody") }}</p>
            <span class="service-external-domain">{{ t("publicSite.bookingDomain") }}</span
            ><a
              class="maritime-button maritime-button--navy"
              :href="service.entry"
              target="_blank"
              rel="noopener noreferrer"
              >{{ t("publicSite.bookingAction") }} <span aria-hidden="true">↗</span></a
            ><small>{{ t("publicSite.bookingNote") }}</small>
          </section>
          <section class="public-service-steps" data-public-reveal>
            <span class="maritime-eyebrow">GETTING STARTED</span>
            <h2>{{ t("publicSite.serviceSteps") }}</h2>
            <ol>
              <li v-for="(step, index) in copy.steps" :key="step.title">
                <span>{{ String(index + 1).padStart(2, "0") }}</span>
                <div>
                  <h3>{{ step.title }}</h3>
                  <p>{{ step.body }}</p>
                </div>
              </li>
            </ol>
          </section>
        </div>
        <aside class="public-service-aside">
          <section>
            <ServiceIcon :name="service.icon" />
            <h2>{{ t("publicSite.serviceCapabilities") }}</h2>
            <ul>
              <li v-for="feature in copy.features" :key="feature">{{ feature }}</li>
            </ul>
            <h3>{{ t("publicSite.serviceAccess") }}</h3>
            <p>{{ copy.scope }}</p>
            <p v-if="!entry.allowed" class="public-permission-note">
              {{ t("publicSite.serviceNoAccess") }}
            </p>
          </section>
          <section class="public-service-boundary">
            <h3>{{ t("publicSite.serviceScope") }}</h3>
            <p>{{ copy.boundary }}</p>
          </section>
        </aside>
      </div>
      <section class="public-related" data-public-reveal>
        <div class="maritime-wrap">
          <header>
            <div>
              <span class="maritime-eyebrow">CONNECTED TO YOUR WORK</span>
              <h2>{{ t("publicSite.serviceRelated") }}</h2>
            </div>
            <p>{{ t("publicSite.serviceRelatedDescription") }}</p>
          </header>
          <div class="public-related-grid">
            <RouterLink v-for="item in related" :key="item.id" :to="item.detailPath"
              ><ServiceIcon :name="item.icon" />
              <h3>{{ t("publicSite.services." + item.id + ".title") }}</h3>
              <p>{{ t("publicSite.services." + item.id + ".summary") }}</p>
              <span aria-hidden="true">→</span></RouterLink
            >
          </div>
        </div>
      </section>
    </main>
    <main v-else class="public-not-found maritime-wrap">
      <ServiceIcon name="document" />
      <h1>{{ t("publicSite.serviceNotFound") }}</h1>
      <p>{{ t("publicSite.serviceNotFoundBody") }}</p>
      <RouterLink class="maritime-button maritime-button--navy" to="/services">{{
        t("publicSite.serviceBack")
      }}</RouterLink>
    </main>
  </PublicSiteShell>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { currentLocale, t } from "../../i18n";
import { getPublicCopy, getPublicServiceCopy } from "../../i18n/publicSiteMessages.js";
import {
  findPublicService,
  publicServices,
  serviceEntry,
  serviceImages
} from "../../public/serviceCatalog.js";
import PublicSiteShell from "./PublicSiteShell.vue";
import PublicTrackingDock from "./PublicTrackingDock.vue";
import ServiceIcon from "./ServiceIcon.vue";
import { usePublicReveal } from "./usePublicReveal.js";
const props = defineProps<{ currentUser?: { role?: string } | null }>();
const route = useRoute(),
  page = ref<HTMLElement | null>(null);
const trackingPath = import.meta.env.VITE_TRACKING_WORKBENCH_URL || "/tracking/";
const service = computed(() => findPublicService(String(route.params.slug || "")));
const copy = computed(() =>
  service.value ? getPublicServiceCopy(service.value.id, currentLocale.value) : null
);
const text = computed(() => getPublicCopy(currentLocale.value));
const entry = computed(() =>
  service.value
    ? serviceEntry(service.value, props.currentUser?.role, trackingPath)
    : { href: "/services", allowed: true, external: false }
);
const heroImage = computed(() =>
  service.value
    ? serviceImages[service.value.image as keyof typeof serviceImages].replace("-640.", "-1280.")
    : ""
);
const accessKinds: Record<string, string> = {
  public: "accessPublic",
  authenticated: "accessAuthenticated",
  external: "accessExternal",
  context: "accessContext"
};
const accessLabel = computed(() =>
  t("publicSite." + (accessKinds[service.value?.access || ""] || "accessRegistered"))
);
const related = computed(() =>
  publicServices
    .filter((item) => item.id !== service.value?.id && item.group === service.value?.group)
    .slice(0, 3)
);
usePublicReveal(page);
function title() {
  document.title = (copy.value?.title || t("publicSite.serviceNotFound")) + " | logisticspluscn";
}
onMounted(title);
watch([currentLocale, () => route.params.slug], title);
</script>
