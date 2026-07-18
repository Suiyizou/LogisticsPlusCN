<template>
  <main class="workbench-portal" data-i18n-ignore>
    <div class="portal-atmosphere" aria-hidden="true">
      <span class="portal-glow portal-glow--one"></span>
      <span class="portal-glow portal-glow--two"></span>
      <span class="portal-grid"></span>
    </div>

    <header class="portal-header">
      <RouterLink class="portal-brand" to="/workbenches" :aria-label="t('portal.brandAria')">
        <span class="portal-brand-mark" aria-hidden="true">
          <img src="/favicon.svg" alt="" />
        </span>
        <span class="portal-brand-copy">
          <strong>DrewesLogistics</strong>
          <small>{{ t("portal.productLine") }}</small>
        </span>
      </RouterLink>

      <div class="portal-header-actions">
        <div class="portal-live-status">
          <i aria-hidden="true"></i>
          <span>{{ t("portal.systemReady") }}</span>
        </div>
        <LanguageSwitcher class="portal-language" />
        <RouterLink v-if="currentUser?.role === 'ADMIN'" class="portal-admin-link" to="/admin">
          {{ t("portal.adminConsole") }}
        </RouterLink>
        <RouterLink
          v-if="['BUSINESS', 'ADMIN'].includes(currentUser?.role)"
          class="portal-admin-link portal-customer-link"
          to="/customers"
        >
          {{ t("portal.customerWorkspace") }}
        </RouterLink>
        <div class="portal-user">
          <span class="portal-avatar">{{ userInitial }}</span>
          <span>
            <strong>{{ displayName }}</strong>
            <small>{{ roleLabel }}</small>
          </span>
        </div>
        <button class="portal-logout" type="button" @click="emit('logout')">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M8 3H4.8A1.8 1.8 0 0 0 3 4.8v10.4A1.8 1.8 0 0 0 4.8 17H8M12.5 6.5 16 10l-3.5 3.5M16 10H7" />
          </svg>
          <span>{{ t("portal.logout") }}</span>
        </button>
      </div>
    </header>

    <section class="portal-content">
      <div class="portal-hero">
        <div class="portal-hero-copy">
          <div class="portal-kicker">
            <span>OPERATIONS PORTAL</span>
            <i aria-hidden="true"></i>
            <small>{{ todayText }}</small>
          </div>
          <h1>{{ t("portal.greeting", { name: displayName }) }}</h1>
          <p>{{ t("portal.heroDescription") }}</p>
          <div class="portal-hero-meta">
            <span>
              <b>{{ ['BUSINESS', 'ADMIN'].includes(currentUser?.role) ? '03' : '02' }}</b>
              {{ t("portal.availableWorkbenches") }}
            </span>
            <span>
              <b>SSO</b>
              {{ t("portal.sharedIdentity") }}
            </span>
            <span>
              <b>24/7</b>
              {{ t("portal.operationCoverage") }}
            </span>
          </div>
        </div>

        <div class="portal-route-visual" aria-hidden="true">
          <div class="portal-route-head">
            <span>SHA</span>
            <i></i>
            <small>GLOBAL CARGO FLOW</small>
            <i></i>
            <span>RTM</span>
          </div>
          <svg viewBox="0 0 560 240" role="presentation">
            <defs>
              <linearGradient id="portalSea" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#8fe8ff" stop-opacity=".22" />
                <stop offset="1" stop-color="#4f7cff" stop-opacity=".02" />
              </linearGradient>
              <linearGradient id="portalRoute" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#63e6be" />
                <stop offset="1" stop-color="#79c7ff" />
              </linearGradient>
            </defs>
            <path class="portal-sea" d="M22 174c66-32 107-20 160-4s95 28 160 6 111-34 196-3v47H22z" fill="url(#portalSea)" />
            <path class="portal-route-path" d="M55 161C149 72 220 198 304 111s139-50 202-7" />
            <path class="portal-route-dash" d="M55 161C149 72 220 198 304 111s139-50 202-7" />
            <g class="portal-port portal-port--origin">
              <circle cx="55" cy="161" r="16" />
              <circle cx="55" cy="161" r="5" />
            </g>
            <g class="portal-port portal-port--destination">
              <circle cx="506" cy="104" r="16" />
              <circle cx="506" cy="104" r="5" />
            </g>
            <g class="portal-ship" transform="translate(275 106)">
              <path d="m-39 18 12 18h62l17-18z" />
              <path d="M-25 18V-2h51v20M-16-2v-13h14V-2M5-2v-22h13V-2" />
              <path d="M-20 8h12M-2 8h12M16 8h7" />
            </g>
            <g class="portal-cargo-stack" transform="translate(122 110)">
              <rect x="0" y="18" width="31" height="23" rx="2" />
              <rect x="34" y="18" width="31" height="23" rx="2" />
              <rect x="17" y="-8" width="31" height="23" rx="2" />
            </g>
          </svg>
          <div class="portal-route-caption">
            <span><i></i>{{ t("portal.routePlanning") }}</span>
            <span><i></i>{{ t("portal.routeTracking") }}</span>
          </div>
        </div>
      </div>

      <section class="portal-workbench-section" :aria-label="t('portal.sectionAria')">
        <header class="portal-section-head">
          <div>
            <span>{{ t("portal.sectionEyebrow") }}</span>
            <h2>{{ t("portal.sectionTitle") }}</h2>
          </div>
          <p>{{ t("portal.sectionDescription") }}</p>
        </header>

        <div class="portal-card-grid" :class="{ 'has-customer-card': ['BUSINESS', 'ADMIN'].includes(currentUser?.role) }">
          <RouterLink
            class="portal-workbench-card portal-workbench-card--planner"
            to="/planner/config"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div class="portal-card-topline">
              <span>01 / LOAD PLANNING</span>
              <small><i></i>{{ t("portal.ready") }}</small>
            </div>
            <div class="portal-card-body">
              <div class="portal-card-icon" aria-hidden="true">
                <svg viewBox="0 0 88 88">
                  <path class="icon-panel" d="m11 28 34-17 32 17v36L43 79 11 62z" />
                  <path d="m11 28 32 17 34-17M43 45v34M27 36l33-17M22 54l10 5m4-2 10 5m4-2 10 5" />
                </svg>
              </div>
              <div class="portal-card-copy">
                <span class="portal-card-label">{{ t("portal.planner.label") }}</span>
                <h3>{{ t("portal.planner.title") }}</h3>
                <p>{{ t("portal.planner.description") }}</p>
              </div>
            </div>
            <div class="portal-card-features">
              <span>{{ t("portal.planner.featurePacking") }}</span>
              <span>{{ t("portal.planner.featureBalance") }}</span>
              <span>{{ t("portal.planner.featureReport") }}</span>
            </div>
            <div class="portal-card-action">
              <span>{{ t("portal.enterWorkbench") }}</span>
              <svg viewBox="0 0 22 22" aria-hidden="true"><path d="M4 11h13m-5-5 5 5-5 5" /></svg>
            </div>
          </RouterLink>

          <a
            class="portal-workbench-card portal-workbench-card--tracking"
            :href="trackingWorkbenchUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div class="portal-card-topline">
              <span>02 / SHIPMENT VISIBILITY</span>
              <small><i></i>{{ t("portal.connected") }}</small>
            </div>
            <div class="portal-card-body">
              <div class="portal-card-icon" aria-hidden="true">
                <svg viewBox="0 0 88 88">
                  <circle class="icon-panel" cx="44" cy="44" r="32" />
                  <path d="M19 48c12-15 22-21 33-14 8 5 10 13 17 8M44 12c-2 14 3 21 14 26M31 18c5 8 5 16-1 24s-7 16-1 25M17 59h54" />
                  <circle cx="20" cy="48" r="4" /><circle cx="69" cy="42" r="4" />
                </svg>
              </div>
              <div class="portal-card-copy">
                <span class="portal-card-label">{{ t("portal.tracking.label") }}</span>
                <h3>{{ t("portal.tracking.title") }}</h3>
                <p>{{ t("portal.tracking.description") }}</p>
              </div>
            </div>
            <div class="portal-card-features">
              <span>{{ t("portal.tracking.featureReferences") }}</span>
              <span>{{ t("portal.tracking.featureRoute") }}</span>
              <span>{{ t("portal.tracking.featureChannels") }}</span>
            </div>
            <div class="portal-card-action">
              <span>{{ t("portal.enterWorkbench") }}</span>
              <svg viewBox="0 0 22 22" aria-hidden="true"><path d="M4 11h13m-5-5 5 5-5 5" /></svg>
            </div>
          </a>

          <RouterLink
            v-if="['BUSINESS', 'ADMIN'].includes(currentUser?.role)"
            class="portal-workbench-card portal-workbench-card--customers"
            to="/customers"
          >
            <div class="portal-card-topline">
              <span>03 / CUSTOMER ACCESS</span>
              <small><i></i>{{ t("portal.controlled") }}</small>
            </div>
            <div class="portal-card-body">
              <div class="portal-card-icon" aria-hidden="true">
                <svg viewBox="0 0 88 88">
                  <circle class="icon-panel" cx="34" cy="34" r="13" />
                  <circle class="icon-panel" cx="59" cy="39" r="9" />
                  <path d="M13 68c3-14 11-21 22-21s19 7 22 21M50 51c10 0 17 6 20 17M60 21v12m-6-6h12" />
                </svg>
              </div>
              <div class="portal-card-copy">
                <span class="portal-card-label">{{ t("portal.customers.label") }}</span>
                <h3>{{ t("portal.customers.title") }}</h3>
                <p>{{ t("portal.customers.description") }}</p>
              </div>
            </div>
            <div class="portal-card-features">
              <span>{{ t("portal.customers.featureCodes") }}</span>
              <span>{{ t("portal.customers.featureRoles") }}</span>
              <span>{{ t("portal.customers.featureBindings") }}</span>
            </div>
            <div class="portal-card-action">
              <span>{{ t("portal.enterWorkbench") }}</span>
              <svg viewBox="0 0 22 22" aria-hidden="true"><path d="M4 11h13m-5-5 5 5-5 5" /></svg>
            </div>
          </RouterLink>
        </div>
      </section>

      <footer class="portal-footer">
        <span>DrewesLogistics · {{ currentYear }}</span>
        <span>{{ t("portal.footerHint") }}</span>
      </footer>
    </section>
  </main>
</template>

<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import LanguageSwitcher from "./LanguageSwitcher.vue";
import { currentLocale } from "../i18n";

const props = defineProps({
  currentUser: { type: Object, default: null }
});
const emit = defineEmits(["logout"]);
const { t } = useI18n();

const trackingWorkbenchUrl = import.meta.env.VITE_TRACKING_WORKBENCH_URL || "/tracking/";
const displayName = computed(() => props.currentUser?.displayName || props.currentUser?.username || t("portal.operator"));
const userInitial = computed(() => displayName.value.slice(0, 1).toUpperCase());
const roleLabel = computed(() => t({
  ADMIN: "portal.roleAdmin",
  BUSINESS: "portal.roleBusiness",
  EMPLOYEE: "portal.roleEmployee"
}[props.currentUser?.role] || "portal.roleEmployee"));
const currentYear = new Date().getFullYear();
const todayText = computed(() => new Intl.DateTimeFormat(currentLocale.value === "en-US" ? "en-US" : "zh-CN", {
  month: "short",
  day: "2-digit",
  weekday: "short"
}).format(new Date()));
</script>

<style scoped>
.workbench-portal {
  --portal-ink: #eaf4ff;
  --portal-muted: #91a8c0;
  --portal-line: rgba(151, 190, 221, 0.18);
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  color: var(--portal-ink);
  background:
    radial-gradient(circle at 72% 8%, rgba(32, 116, 181, 0.2), transparent 28%),
    linear-gradient(145deg, #07131f 0%, #0a1b2b 52%, #07121e 100%);
}

.portal-atmosphere,
.portal-grid,
.portal-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.portal-grid {
  opacity: 0.26;
  background-image:
    linear-gradient(rgba(131, 171, 201, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(131, 171, 201, 0.08) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: linear-gradient(to bottom, #000, transparent 74%);
}

.portal-glow {
  filter: blur(1px);
}

.portal-glow--one {
  inset: -25% auto auto -12%;
  width: 620px;
  height: 620px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(27, 142, 183, 0.17), transparent 68%);
}

.portal-glow--two {
  inset: auto -15% -40% auto;
  width: 760px;
  height: 760px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(63, 91, 188, 0.18), transparent 67%);
}

.portal-header,
.portal-content {
  position: relative;
  z-index: 1;
}

.portal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 78px;
  padding: 0 clamp(24px, 4vw, 68px);
  border-bottom: 1px solid var(--portal-line);
  background: rgba(5, 17, 29, 0.68);
  backdrop-filter: blur(20px);
}

.portal-brand,
.portal-user,
.portal-header-actions,
.portal-live-status {
  display: flex;
  align-items: center;
}

.portal-brand {
  gap: 12px;
  color: inherit;
  text-decoration: none;
}

.portal-brand-mark {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid rgba(108, 213, 244, 0.34);
  border-radius: 11px;
  color: #82dcf7;
  background: linear-gradient(145deg, rgba(39, 119, 153, 0.28), rgba(20, 53, 80, 0.2));
  box-shadow: inset 0 0 20px rgba(65, 194, 231, 0.08);
}

.portal-brand-mark img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
}

.portal-brand-copy {
  display: grid;
  gap: 1px;
}

.portal-brand-copy strong {
  font-size: 16px;
  letter-spacing: 0.015em;
  white-space: nowrap;
}

.portal-brand-copy small {
  color: var(--portal-muted);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.portal-header-actions {
  gap: 12px;
}

.portal-live-status {
  gap: 7px;
  color: #98b1c9;
  font-size: 12px;
}

.portal-live-status i,
.portal-card-topline small i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #5be7ae;
  box-shadow: 0 0 0 5px rgba(91, 231, 174, 0.1), 0 0 14px rgba(91, 231, 174, 0.46);
}

.portal-language :deep(.language-switcher-trigger) {
  color: #c5d6e7;
  border-color: rgba(151, 190, 221, 0.22);
  background: rgba(16, 39, 59, 0.7);
}

.portal-admin-link,
.portal-logout {
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  border: 1px solid rgba(151, 190, 221, 0.2);
  border-radius: 9px;
  color: #b8ccde;
  background: rgba(15, 39, 59, 0.58);
  font: inherit;
  font-size: 12px;
  text-decoration: none;
  transition: 0.2s ease;
}

.portal-admin-link {
  padding: 0 13px;
}

.portal-user {
  gap: 9px;
  padding-left: 4px;
}

.portal-avatar {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid rgba(119, 205, 238, 0.35);
  border-radius: 10px;
  color: #dff8ff;
  background: linear-gradient(145deg, rgba(31, 139, 177, 0.5), rgba(58, 80, 148, 0.38));
  font-size: 14px;
  font-weight: 800;
}

.portal-user > span:last-child {
  display: grid;
  gap: 1px;
  min-width: 72px;
}

.portal-user strong {
  color: #edf7ff;
  font-size: 13px;
}

.portal-user small {
  color: #8099b2;
  font-size: 10px;
}

.portal-logout {
  gap: 7px;
  padding: 0 12px;
  cursor: pointer;
}

.portal-logout svg {
  width: 17px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
}

.portal-admin-link:hover,
.portal-logout:hover {
  border-color: rgba(106, 215, 244, 0.52);
  color: #e8f8ff;
  background: rgba(29, 82, 108, 0.42);
}

.portal-content {
  width: min(1320px, calc(100% - 48px));
  margin: 0 auto;
  padding: clamp(36px, 5vw, 74px) 0 26px;
}

.portal-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(440px, 0.95fr);
  gap: clamp(40px, 7vw, 100px);
  align-items: center;
}

.portal-kicker,
.portal-route-head,
.portal-route-caption,
.portal-hero-meta,
.portal-card-topline,
.portal-card-features,
.portal-card-action,
.portal-footer {
  display: flex;
  align-items: center;
}

.portal-kicker {
  gap: 10px;
  margin-bottom: 18px;
  color: #67d7ef;
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.18em;
}

.portal-kicker i {
  width: 42px;
  height: 1px;
  background: linear-gradient(90deg, #52cce8, transparent);
}

.portal-kicker small {
  color: #718ca5;
  font-size: 10px;
  letter-spacing: 0.08em;
}

.portal-hero-copy h1 {
  max-width: 660px;
  margin: 0;
  color: #f1f8ff;
  font-size: clamp(36px, 4.2vw, 64px);
  font-weight: 760;
  line-height: 1.1;
  letter-spacing: -0.045em;
}

.portal-hero-copy > p {
  max-width: 610px;
  margin: 20px 0 0;
  color: #91a9c0;
  font-size: 16px;
  line-height: 1.8;
}

.portal-hero-meta {
  gap: 30px;
  margin-top: 31px;
}

.portal-hero-meta span {
  display: grid;
  gap: 4px;
  color: #708aa3;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.portal-hero-meta b {
  color: #cce5f5;
  font-size: 15px;
  letter-spacing: 0.04em;
}

.portal-route-visual {
  position: relative;
  min-height: 310px;
  padding: 20px 23px 18px;
  overflow: hidden;
  border: 1px solid rgba(120, 180, 214, 0.22);
  border-radius: 22px;
  background:
    linear-gradient(145deg, rgba(21, 58, 82, 0.42), rgba(8, 25, 40, 0.74)),
    radial-gradient(circle at 70% 20%, rgba(59, 156, 196, 0.18), transparent 48%);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.22), inset 0 1px rgba(255, 255, 255, 0.035);
}

.portal-route-visual::after {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(120deg, rgba(255, 255, 255, 0.035), transparent 28%);
  content: "";
  pointer-events: none;
}

.portal-route-head {
  position: relative;
  z-index: 1;
  justify-content: space-between;
  color: #cde7f4;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.portal-route-head i {
  width: 18%;
  height: 1px;
  background: rgba(127, 182, 213, 0.2);
}

.portal-route-head small {
  color: #6f8da7;
  font-size: 9px;
  letter-spacing: 0.16em;
}

.portal-route-visual > svg {
  width: 100%;
  margin-top: 8px;
  overflow: visible;
}

.portal-route-path,
.portal-route-dash {
  fill: none;
  stroke-linecap: round;
}

.portal-route-path {
  stroke: rgba(92, 203, 225, 0.17);
  stroke-width: 12;
}

.portal-route-dash {
  stroke: url(#portalRoute);
  stroke-dasharray: 7 9;
  stroke-width: 2;
  animation: portal-route-flow 9s linear infinite;
}

.portal-port circle:first-child {
  fill: rgba(61, 197, 210, 0.12);
  stroke: rgba(98, 225, 210, 0.48);
}

.portal-port circle:last-child {
  fill: #6ee7c2;
  filter: drop-shadow(0 0 7px rgba(110, 231, 194, 0.8));
}

.portal-ship,
.portal-cargo-stack {
  fill: rgba(75, 191, 220, 0.13);
  stroke: #84dff2;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
  filter: drop-shadow(0 5px 9px rgba(8, 160, 194, 0.2));
}

.portal-cargo-stack {
  stroke: rgba(116, 220, 230, 0.52);
}

.portal-route-caption {
  justify-content: space-between;
  padding: 0 5px;
  color: #7690a8;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.portal-route-caption span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.portal-route-caption i {
  width: 12px;
  height: 1px;
  background: #54cce2;
}

.portal-workbench-section {
  margin-top: clamp(54px, 7vw, 86px);
}

.portal-section-head {
  display: flex;
  justify-content: space-between;
  gap: 40px;
  align-items: end;
  margin-bottom: 20px;
}

.portal-section-head span,
.portal-card-label {
  color: #67d7ef;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.portal-section-head h2 {
  margin: 7px 0 0;
  color: #edf7ff;
  font-size: 25px;
  letter-spacing: -0.02em;
}

.portal-section-head p {
  max-width: 480px;
  margin: 0;
  color: #7892a9;
  font-size: 13px;
  line-height: 1.7;
  text-align: right;
}

.portal-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.portal-workbench-card {
  position: relative;
  display: grid;
  min-height: 292px;
  padding: 22px;
  overflow: hidden;
  border: 1px solid rgba(127, 181, 211, 0.2);
  border-radius: 18px;
  color: inherit;
  background: linear-gradient(145deg, rgba(18, 49, 70, 0.72), rgba(8, 26, 42, 0.84));
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.035);
  text-decoration: none;
  transition: border-color 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease;
}

.portal-workbench-card::before {
  position: absolute;
  inset: 0;
  opacity: 0;
  background: radial-gradient(circle at 14% 15%, rgba(61, 192, 221, 0.18), transparent 44%);
  content: "";
  transition: opacity 0.25s ease;
}

.portal-workbench-card--tracking::before {
  background: radial-gradient(circle at 14% 15%, rgba(88, 122, 238, 0.2), transparent 46%);
}

.portal-workbench-card--customers::before {
  background: linear-gradient(90deg, #6e7cff, #24a5cd);
}

.portal-card-grid.has-customer-card {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.portal-workbench-card--customers .portal-card-icon {
  color: #566ee8;
  background: rgba(86, 110, 232, 0.11);
}

.portal-workbench-card:hover {
  z-index: 1;
  border-color: rgba(94, 211, 233, 0.5);
  box-shadow: 0 24px 54px rgba(0, 0, 0, 0.24), inset 0 1px rgba(255, 255, 255, 0.06);
  transform: translateY(-4px);
}

.portal-workbench-card:hover::before {
  opacity: 1;
}

.portal-card-topline,
.portal-card-body,
.portal-card-features,
.portal-card-action {
  position: relative;
  z-index: 1;
}

.portal-card-topline {
  justify-content: space-between;
  color: #68849d;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.15em;
}

.portal-card-topline small {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #8aa7bc;
  font-size: 10px;
  letter-spacing: 0.06em;
}

.portal-card-body {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 20px;
  align-items: center;
  margin: 24px 0 18px;
}

.portal-card-icon {
  display: grid;
  width: 78px;
  height: 78px;
  place-items: center;
  border: 1px solid rgba(105, 202, 229, 0.22);
  border-radius: 18px;
  color: #75d8ed;
  background: linear-gradient(145deg, rgba(35, 111, 140, 0.28), rgba(11, 37, 58, 0.46));
}

.portal-workbench-card--tracking .portal-card-icon {
  color: #96b5ff;
  border-color: rgba(132, 159, 238, 0.24);
  background: linear-gradient(145deg, rgba(61, 80, 158, 0.3), rgba(13, 34, 62, 0.46));
}

.portal-card-icon svg {
  width: 59px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.55;
}

.portal-card-icon .icon-panel {
  fill: currentColor;
  fill-opacity: 0.075;
}

.portal-card-copy h3 {
  margin: 7px 0 8px;
  color: #eff8ff;
  font-size: clamp(22px, 2.2vw, 31px);
  letter-spacing: -0.025em;
}

.portal-card-copy p {
  max-width: 490px;
  margin: 0;
  color: #87a0b6;
  font-size: 13px;
  line-height: 1.65;
}

.portal-card-features {
  flex-wrap: wrap;
  gap: 8px;
  align-self: end;
}

.portal-card-features span {
  padding: 6px 9px;
  border: 1px solid rgba(133, 176, 203, 0.16);
  border-radius: 7px;
  color: #8da7bb;
  background: rgba(8, 25, 39, 0.48);
  font-size: 10px;
}

.portal-card-action {
  justify-content: space-between;
  margin-top: 18px;
  padding-top: 15px;
  border-top: 1px solid rgba(137, 179, 205, 0.13);
  color: #c7e6f2;
  font-size: 12px;
  font-weight: 700;
}

.portal-card-action svg {
  width: 21px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
  transition: transform 0.2s ease;
}

.portal-workbench-card:hover .portal-card-action svg {
  transform: translateX(4px);
}

.portal-footer {
  justify-content: space-between;
  margin-top: 28px;
  padding-top: 19px;
  border-top: 1px solid rgba(132, 175, 204, 0.12);
  color: #5e7891;
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

/* Light operations theme */
.workbench-portal {
  --portal-ink: #102a46;
  --portal-muted: #68819b;
  --portal-line: rgba(77, 119, 160, 0.16);
  color: var(--portal-ink);
  background:
    radial-gradient(circle at 76% 2%, rgba(91, 167, 255, 0.16), transparent 30%),
    radial-gradient(circle at 3% 68%, rgba(85, 208, 219, 0.11), transparent 28%),
    linear-gradient(145deg, #ffffff 0%, #f5f9ff 55%, #eef5fd 100%);
}

.portal-grid {
  opacity: 0.42;
  background-image:
    linear-gradient(rgba(59, 112, 164, 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(59, 112, 164, 0.07) 1px, transparent 1px);
}

.portal-glow--one {
  background: radial-gradient(circle, rgba(77, 186, 224, 0.12), transparent 68%);
}

.portal-glow--two {
  background: radial-gradient(circle, rgba(69, 119, 231, 0.11), transparent 67%);
}

.portal-header {
  border-bottom-color: rgba(58, 103, 148, 0.13);
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 8px 26px rgba(31, 74, 119, 0.055);
}

.portal-brand-mark {
  color: #1475bf;
  border-color: rgba(32, 128, 194, 0.24);
  background: linear-gradient(145deg, #edf8ff, #e4f1ff);
  box-shadow: inset 0 0 18px rgba(37, 144, 204, 0.08);
}

.portal-brand-copy strong {
  color: #173957;
}

.portal-kicker,
.portal-section-head span,
.portal-card-label {
  color: #087ec1;
}

.portal-brand-copy small,
.portal-live-status,
.portal-user small {
  color: #7088a1;
}

.portal-language :deep(.language-switcher-trigger) {
  color: #36536e;
  border-color: rgba(67, 111, 153, 0.2);
  background: #f5f9fe;
}

.portal-admin-link,
.portal-logout {
  color: #45647f;
  border-color: rgba(59, 107, 151, 0.19);
  background: rgba(245, 249, 254, 0.92);
}

.portal-admin-link:hover,
.portal-logout:hover {
  color: #0c6eaf;
  border-color: rgba(25, 126, 190, 0.42);
  background: #edf7ff;
}

.portal-avatar {
  color: #0a6cae;
  border-color: rgba(44, 133, 196, 0.25);
  background: linear-gradient(145deg, #e7f5ff, #dcecff);
}

.portal-user strong {
  color: #173653;
}

.portal-kicker i {
  background: linear-gradient(90deg, #168bc6, transparent);
}

.portal-kicker small {
  color: #7890a7;
}

.portal-hero-copy h1 {
  max-width: 680px;
  color: #123352;
  font-size: clamp(28px, 2.4vw, 36px);
  letter-spacing: -0.035em;
  text-wrap: balance;
}

.portal-hero-copy > p {
  color: #607b95;
}

.portal-hero-meta span {
  color: #7890a7;
}

.portal-hero-meta b {
  color: #244b6e;
}

.portal-route-visual {
  border-color: rgba(68, 127, 173, 0.2);
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.96), rgba(237, 247, 255, 0.94)),
    radial-gradient(circle at 70% 20%, rgba(59, 156, 196, 0.12), transparent 48%);
  box-shadow: 0 22px 58px rgba(47, 89, 128, 0.11), inset 0 1px rgba(255, 255, 255, 0.8);
}

.portal-route-visual::after {
  background: linear-gradient(120deg, rgba(255, 255, 255, 0.58), transparent 28%);
}

.portal-route-head {
  color: #315b7c;
}

.portal-route-head i {
  background: rgba(73, 124, 165, 0.18);
}

.portal-route-head small,
.portal-route-caption {
  color: #7892a8;
}

.portal-route-path {
  stroke: rgba(48, 151, 202, 0.13);
}

.portal-section-head h2 {
  color: #153a5a;
}

.portal-section-head p {
  color: #69839c;
}

.portal-workbench-card {
  color: #163752;
  border-color: rgba(67, 117, 160, 0.18);
  background: rgba(255, 255, 255, 0.91);
  box-shadow: 0 14px 38px rgba(38, 80, 119, 0.075), inset 0 1px rgba(255, 255, 255, 0.8);
}

.portal-workbench-card::before {
  background: radial-gradient(circle at 14% 15%, rgba(53, 181, 219, 0.12), transparent 44%);
}

.portal-workbench-card--tracking::before {
  background: radial-gradient(circle at 14% 15%, rgba(73, 112, 230, 0.1), transparent 46%);
}

.portal-workbench-card:hover {
  border-color: rgba(35, 147, 205, 0.42);
  box-shadow: 0 22px 50px rgba(38, 80, 119, 0.14), inset 0 1px #fff;
}

.portal-card-topline {
  color: #7590a7;
}

.portal-card-topline small {
  color: #66849b;
}

.portal-card-icon {
  color: #147eb9;
  border-color: rgba(45, 139, 194, 0.22);
  background: linear-gradient(145deg, #effaff, #e8f4fc);
}

.portal-workbench-card--tracking .portal-card-icon {
  color: #557bd2;
  border-color: rgba(85, 123, 210, 0.22);
  background: linear-gradient(145deg, #f0f4ff, #e9f1ff);
}

.portal-card-copy h3 {
  color: #143856;
}

.portal-card-copy p {
  color: #667f96;
}

.portal-card-features span {
  color: #58758d;
  border-color: rgba(72, 119, 158, 0.15);
  background: #f5f9fd;
}

.portal-card-action {
  color: #146fa9;
  border-top-color: rgba(70, 118, 156, 0.13);
}

.portal-footer {
  color: #7890a6;
  border-top-color: rgba(62, 109, 150, 0.13);
}

@keyframes portal-route-flow {
  to { stroke-dashoffset: -128; }
}

@media (max-width: 1050px) {
  .portal-live-status,
  .portal-admin-link,
  .portal-user > span:last-child {
    display: none;
  }

  .portal-hero {
    grid-template-columns: 1fr;
  }

  .portal-route-visual {
    min-height: 270px;
  }
}

@media (max-width: 760px) {
  .portal-header {
    min-height: 68px;
    padding: 0 18px;
  }

  .portal-brand-copy small,
  .portal-logout span {
    display: none;
  }

  .portal-header-actions {
    gap: 7px;
  }

  .portal-logout {
    width: 38px;
    justify-content: center;
    padding: 0;
  }

  .portal-content {
    width: min(100% - 30px, 680px);
    padding-top: 36px;
  }

  .portal-hero-copy h1 {
    font-size: clamp(27px, 7.5vw, 34px);
  }

  .portal-hero-meta {
    gap: 18px;
  }

  .portal-route-visual {
    display: none;
  }

  .portal-workbench-section {
    margin-top: 50px;
  }

  .portal-section-head {
    display: grid;
    gap: 12px;
  }

  .portal-section-head p {
    text-align: left;
  }

  .portal-card-grid {
    grid-template-columns: 1fr;
  }

  .portal-card-grid.has-customer-card {
    grid-template-columns: 1fr;
  }

  .portal-card-body {
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 14px;
  }

  .portal-card-icon {
    width: 60px;
    height: 60px;
    border-radius: 14px;
  }

  .portal-card-icon svg {
    width: 46px;
  }

  .portal-footer {
    gap: 12px;
    align-items: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .portal-route-dash {
    animation: none;
  }

  .portal-workbench-card,
  .portal-card-action svg {
    transition: none;
  }
}
</style>
