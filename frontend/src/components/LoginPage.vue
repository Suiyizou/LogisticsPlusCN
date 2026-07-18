<template>
  <main class="app-login-shell" data-i18n-ignore>
    <div class="app-login-atmosphere" aria-hidden="true">
      <span class="app-login-glow app-login-glow-one"></span>
      <span class="app-login-glow app-login-glow-two"></span>
      <span class="app-login-grid"></span>
    </div>

    <section class="app-login-brand-panel" :aria-label="t('login.brandPanelLabel')">
      <header class="app-login-brand-header">
        <div class="app-login-logo" aria-hidden="true">
          <svg viewBox="0 0 44 44" role="presentation">
            <path d="M8 13.5 22 6l14 7.5v17L22 38 8 30.5z" />
            <path d="m8 13.5 14 8 14-8M22 21.5V38" />
            <path d="m14 10.3 14 8M16 34.8v-9.2m12 9.2v-9.2" />
          </svg>
        </div>
        <div class="app-login-brand-lockup">
          <strong>CP<span>OS</span></strong>
          <small>{{ t("login.productLine") }}</small>
        </div>
      </header>

      <div class="app-login-brand-content">
        <div class="app-login-kicker">
          <i aria-hidden="true"></i>
          <span>{{ t("login.kicker") }}</span>
        </div>
        <h1>
          {{ t("login.heroTitle") }}
          <em>{{ t("login.heroAccent") }}</em>
        </h1>
        <p class="app-login-hero-copy">{{ t("login.heroDescription") }}</p>

        <div class="app-login-capabilities" aria-label="Core capabilities">
          <span>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m3 6 7-3 7 3-7 3zM3 6v8l7 3 7-3V6M10 9v8" /></svg>
            {{ t("login.capabilityPacking") }}
          </span>
          <span>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 15.5h14M5 13V8m5 5V4m5 9V7" /></svg>
            {{ t("login.capabilityBalance") }}
          </span>
          <span>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 16 5v4.3c0 3.7-2.5 6.6-6 8.2-3.5-1.6-6-4.5-6-8.2V5zM7.2 10l1.8 1.8 3.9-4" /></svg>
            {{ t("login.capabilityRules") }}
          </span>
        </div>

        <div class="app-login-visual" aria-hidden="true">
          <div class="app-login-visual-head">
            <div>
              <small>{{ t("login.visualEyebrow") }}</small>
              <strong>{{ t("login.visualTitle") }}</strong>
            </div>
            <span><i></i>{{ t("login.visualStatus") }}</span>
          </div>
          <div class="app-login-container-stage">
            <svg class="app-login-container-wireframe" viewBox="0 0 560 196" role="presentation">
              <defs>
                <linearGradient id="loginContainerFill" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#1b8fff" stop-opacity=".22" />
                  <stop offset="1" stop-color="#0fd5ff" stop-opacity=".04" />
                </linearGradient>
                <filter id="loginWireGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="1.7" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <g class="login-wire-cargo">
                <path d="M117 86 165 69l39 16-48 18zM117 86v40l39 18v-41m48-18v40l-48 19" />
                <path d="M210 65 258 48l39 16-48 18zM210 65v59l39 18V82m48-18v59l-48 19" />
                <path d="M306 91 354 74l39 16-48 18zM306 91v34l39 18v-35m48-18v34l-48 19" />
                <path d="M401 72 445 57l36 15-44 16zM401 72v54l36 16V88m44-16v53l-44 17" />
              </g>
              <g class="login-wire-container" filter="url(#loginWireGlow)">
                <path fill="url(#loginContainerFill)" d="m48 58 109-35 355 50-101 47-1 52-360-57z" />
                <path d="m48 58 109-35 355 50-101 47-361-5zM48 58l2 57 360 57 1-52m101-47-1 52-101 47" />
                <path d="M157 23v45M92 44l356 50m-354 28 1-56m45 63 1-56m45 63 1-57m45 64 1-58m45 65 1-59m45 66 1-60m45 67 1-61" opacity=".42" />
              </g>
              <g class="login-wire-route">
                <path d="M58 172h442" />
                <circle cx="58" cy="172" r="4" />
                <circle cx="500" cy="172" r="4" />
              </g>
            </svg>
            <div class="app-login-stage-meta app-login-stage-origin">
              <span>{{ t("login.routeOrigin") }}</span>
              <strong>SHA</strong>
            </div>
            <div class="app-login-stage-meta app-login-stage-destination">
              <span>{{ t("login.routeDestination") }}</span>
              <strong>RTM</strong>
            </div>
          </div>
          <div class="app-login-visual-metrics">
            <span><b>01</b>{{ t("login.metricSpace") }}</span>
            <span><b>02</b>{{ t("login.metricBalance") }}</span>
            <span><b>03</b>{{ t("login.metricConstraint") }}</span>
          </div>
        </div>
      </div>

      <footer class="app-login-brand-footer">
        <span><i aria-hidden="true"></i>{{ t("login.engineOnline") }}</span>
        <small>{{ t("login.releaseLabel") }}</small>
      </footer>
    </section>

    <section class="app-login-access-panel">
      <div class="app-login-access-topline">
        <span>{{ t("login.secureAccess") }}</span>
        <small>CP / AUTH NODE 01</small>
      </div>

      <form class="app-login-card" @submit.prevent="submit">
        <div class="app-login-route-switch" :aria-label="t('login.routeLabel')">
          <button
            type="button"
            :class="{ 'is-active': loginMode === 'employee' }"
            :aria-pressed="loginMode === 'employee'"
            @click="selectMode('employee')"
          >
            <span>{{ t("login.employeeRoute") }}</span>
            <small>{{ t("login.employeeRouteHint") }}</small>
          </button>
          <button
            type="button"
            :class="{ 'is-active': loginMode === 'customer' }"
            :aria-pressed="loginMode === 'customer'"
            @click="selectMode('customer')"
          >
            <span>{{ t("login.customerRoute") }}</span>
            <small>{{ t("login.customerRouteHint") }}</small>
          </button>
        </div>

        <div class="app-login-card-mark" aria-hidden="true">
          <svg v-if="loginMode === 'employee'" viewBox="0 0 24 24"><path d="M12 3 19 6v5c0 4.3-2.9 7.7-7 9.6C7.9 18.7 5 15.3 5 11V6zM9.2 12l1.8 1.8 4-4.2" /></svg>
          <svg v-else viewBox="0 0 24 24"><path d="M4 7.5h16v9H4zM7 11h5m-5 3h8M17 10.5v3" /></svg>
        </div>
        <div class="app-login-title">
          <span>{{ t(loginMode === "employee" ? "login.formEyebrow" : "login.customerEyebrow") }}</span>
          <h2>{{ t(loginMode === "employee" ? "login.formTitle" : "login.customerTitle") }}</h2>
          <p>{{ t(loginMode === "employee" ? "login.formDescription" : "login.customerDescription") }}</p>
        </div>

        <label v-if="loginMode === 'employee'" class="app-login-field">
          <span>{{ t("login.employeeNumberLabel") }}</span>
          <div class="app-login-input-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" /></svg>
            <input
              v-model.trim="form.username"
              autocomplete="username"
              :placeholder="t('login.employeeNumberPlaceholder')"
              :aria-label="t('login.employeeNumberLabel')"
              :disabled="loading"
              required
              autofocus
            />
          </div>
        </label>

        <label v-if="loginMode === 'employee'" class="app-login-field">
          <span>{{ t("login.passwordLabel") }}</span>
          <div class="app-login-input-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2m-11 0h12v10H6zM12 14v2" /></svg>
            <input
              v-model="form.password"
              autocomplete="current-password"
              :placeholder="t('login.passwordPlaceholder')"
              :aria-label="t('login.passwordLabel')"
              :type="showPassword ? 'text' : 'password'"
              :disabled="loading"
              required
            />
            <button
              class="app-login-password-toggle"
              type="button"
              :aria-label="showPassword ? t('login.hidePassword') : t('login.showPassword')"
              :aria-pressed="showPassword"
              :disabled="loading"
              @click="showPassword = !showPassword"
            >
              <svg v-if="!showPassword" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.3-6 9-6 9 6 9 6-3.3 6-9 6-9-6-9-6Zm9 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></svg>
              <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16M9.5 6.5A8 8 0 0 1 12 6c5.7 0 9 6 9 6a14 14 0 0 1-2.1 3M14.5 17.5A8 8 0 0 1 12 18c-5.7 0-9-6-9-6a14 14 0 0 1 2.1-3M10 10a3 3 0 0 0 4 4" /></svg>
            </button>
          </div>
        </label>

        <label v-else class="app-login-field">
          <span>{{ t("login.customerCodeLabel") }}</span>
          <div class="app-login-input-wrap app-login-input-wrap--code">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h16v9H4zM7 11h5m-5 3h8M17 10.5v3" /></svg>
            <input
              v-model.trim="customerCode"
              autocomplete="one-time-code"
              :placeholder="t('login.customerCodePlaceholder')"
              :aria-label="t('login.customerCodeLabel')"
              :disabled="loading"
              required
              autofocus
            />
          </div>
        </label>

        <div class="app-login-form-meta">
          <span><i aria-hidden="true"></i>{{ t(loginMode === "employee" ? "login.sessionNotice" : "login.customerSessionNotice") }}</span>
          <small>{{ t(loginMode === "employee" ? "login.accountNotice" : "login.customerAccountNotice") }}</small>
        </div>

        <p v-if="message" class="app-login-message" :class="{ 'is-success': success }" role="alert">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 18 17H2zM10 7v4m0 3v.1" /></svg>
          <span>{{ message }}</span>
        </p>

        <button class="app-login-submit" type="submit" :disabled="loading">
          <span v-if="loading" class="app-login-submit-loader" aria-hidden="true"></span>
          <span>{{ submitText }}</span>
          <svg v-if="!loading" viewBox="0 0 22 22" aria-hidden="true"><path d="M4 11h13m-5-5 5 5-5 5" /></svg>
        </button>

        <div class="app-login-trust-line">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 16 5v4.3c0 3.7-2.5 6.6-6 8.2-3.5-1.6-6-4.5-6-8.2V5z" /></svg>
          <span>{{ t("login.securityNotice") }}</span>
        </div>
      </form>

      <footer class="app-login-access-footer">
        <span>© 2026 {{ t("login.platformName") }}</span>
        <span>{{ t("login.footerTagline") }}</span>
      </footer>
    </section>
  </main>
</template>

<script setup>
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { loginAdmin } from "../services/adminApi";
import { clearCustomerSession, loginCustomer } from "../services/customerSession";

const emit = defineEmits(["logged-in"]);
const { t } = useI18n();

const loading = ref(false);
const message = ref("");
const success = ref(false);
const showPassword = ref(false);
const loginMode = ref("employee");
const customerCode = ref("");
const form = reactive({ username: "", password: "" });
const configuredTrackingWorkbenchUrl = import.meta.env.VITE_TRACKING_WORKBENCH_URL || "/tracking/";
const submitText = computed(() => {
  if (loading.value) return t(loginMode.value === "employee" ? "login.signingIn" : "login.customerSigningIn");
  return t(loginMode.value === "employee" ? "login.signIn" : "login.customerSignIn");
});

function selectMode(mode) {
  if (loading.value) return;
  loginMode.value = mode;
  message.value = "";
  success.value = false;
}

function customerTrackingTarget() {
  const target = new URL(configuredTrackingWorkbenchUrl, window.location.origin);
  if (target.origin !== window.location.origin) {
    throw new Error(t("login.customerTrackingSameOrigin"));
  }
  target.hash = "tracking";
  return target.href;
}

async function submit() {
  if (loading.value) return;
  loading.value = true;
  message.value = "";
  success.value = false;
  const trackingWindow = loginMode.value === "customer" ? window.open("about:blank", "_blank") : null;
  try {
    if (loginMode.value === "customer") {
      const target = customerTrackingTarget();
      await loginCustomer(customerCode.value);
      customerCode.value = "";
      success.value = true;
      message.value = t("login.customerSuccess");
      if (trackingWindow) {
        trackingWindow.opener = null;
        trackingWindow.location.replace(target);
      } else {
        message.value = t("login.customerPopupBlocked");
      }
      return;
    }
    clearCustomerSession();
    const response = await loginAdmin(form.username, form.password);
    form.password = "";
    emit("logged-in", response.user);
  } catch (error) {
    trackingWindow?.close();
    message.value = error.message || t(loginMode.value === "employee" ? "login.errorFallback" : "login.customerErrorFallback");
  } finally {
    loading.value = false;
  }
}
</script>
