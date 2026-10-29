<template>
  <main
    class="app-login-shell"
    :class="{ 'is-customer-mode': loginMode === 'customer' }"
    data-i18n-ignore
  >
    <section class="app-login-photo" :aria-label="t('maritime.loginBrandAria')">
      <PublicBrand />
      <div class="app-login-photo-copy">
        <h2>{{ t("maritime.loginHero") }}<br />{{ t("maritime.loginHeroSecond") }}</h2>
        <p>{{ t("maritime.loginHeroDescription") }}</p>
      </div>
    </section>
    <section class="app-login-side">
      <header class="app-login-top">
        <PublicBrand class="app-login-mobile-brand" company compact /><a
          class="app-login-back"
          href="/"
          >‹ {{ t("maritime.returnHome") }}</a
        ><LanguageSwitcher />
      </header>
      <form class="app-login-form" :aria-busy="loading" @submit.prevent="submit">
        <div class="app-login-form-intro">
          <div class="app-login-title">
            <h1>{{ t(loginMode === "employee" ? "login.formTitle" : "login.customerTitle") }}</h1>
            <p>
              {{
                t(loginMode === "employee" ? "login.formDescription" : "login.customerDescription")
              }}
            </p>
          </div>
        </div>

        <div class="app-login-route-switch" :aria-label="t('login.routeLabel')">
          <button
            type="button"
            :class="{ 'is-active': loginMode === 'employee' }"
            :aria-pressed="loginMode === 'employee'"
            @click="selectMode('employee')"
          >
            <span>{{ t("login.employeeRoute") }}</span>
          </button>
          <button
            type="button"
            :class="{ 'is-active': loginMode === 'customer' }"
            :aria-pressed="loginMode === 'customer'"
            @click="selectMode('customer')"
          >
            <span>{{ t("login.customerRoute") }}</span>
          </button>
        </div>

        <label v-if="loginMode === 'employee'" class="app-login-field">
          <span>{{ t("login.employeeNumberLabel") }}</span>
          <div class="app-login-input-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" />
            </svg>
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
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 10V8a5 5 0 0 1 10 0v2m-11 0h12v10H6zM12 14v2" />
            </svg>
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
              <svg v-if="!showPassword" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M3 12s3.3-6 9-6 9 6 9 6-3.3 6-9 6-9-6-9-6Zm9 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                />
              </svg>
              <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="m4 4 16 16M9.5 6.5A8 8 0 0 1 12 6c5.7 0 9 6 9 6a14 14 0 0 1-2.1 3M14.5 17.5A8 8 0 0 1 12 18c-5.7 0-9-6-9-6a14 14 0 0 1 2.1-3M10 10a3 3 0 0 0 4 4"
                />
              </svg>
            </button>
          </div>
        </label>

        <label v-if="loginMode === 'customer'" class="app-login-field">
          <span>{{ t("login.customerUsernameLabel") }}</span>
          <div class="app-login-input-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" />
            </svg>
            <input
              v-model.trim="customerForm.username"
              autocomplete="username"
              :placeholder="t('login.customerUsernamePlaceholder')"
              :aria-label="t('login.customerUsernameLabel')"
              :disabled="loading"
              required
            />
          </div>
        </label>

        <label v-if="loginMode === 'customer'" class="app-login-field">
          <span>{{ t("login.passwordLabel") }}</span>
          <div class="app-login-input-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 10V8a5 5 0 0 1 10 0v2m-11 0h12v10H6zM12 14v2" />
            </svg>
            <input
              v-model="customerForm.password"
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
              <svg v-if="!showPassword" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M3 12s3.3-6 9-6 9 6 9 6-3.3 6-9 6-9-6-9-6Zm9 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                />
              </svg>
              <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="m4 4 16 16M9.5 6.5A8 8 0 0 1 12 6c5.7 0 9 6 9 6a14 14 0 0 1-2.1 3M14.5 17.5A8 8 0 0 1 12 18c-5.7 0-9-6-9-6a14 14 0 0 1 2.1-3M10 10a3 3 0 0 0 4 4"
                />
              </svg>
            </button>
          </div>
        </label>

        <label v-if="loginMode === 'customer'" class="app-login-field">
          <span>{{ t("login.customerCodeLabel") }}</span>
          <div class="app-login-input-wrap app-login-input-wrap--code">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7.5h16v9H4zM7 11h5m-5 3h8M17 10.5v3" />
            </svg>
            <input
              v-model.trim="customerForm.customerCode"
              autocomplete="off"
              :placeholder="t('login.customerCodePlaceholder')"
              :aria-label="t('login.customerCodeLabel')"
              :disabled="loading"
              required
              autofocus
            />
          </div>
        </label>

        <p v-if="message" class="app-login-message" :class="{ 'is-success': success }" role="alert">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 2.5 18 17H2zM10 7v4m0 3v.1" />
          </svg>
          <span>{{ message }}</span>
        </p>

        <button class="app-login-submit" type="submit" :disabled="loading">
          <span v-if="loading" class="app-login-submit-loader" aria-hidden="true"></span>
          <span>{{ submitText }}</span>
          <svg v-if="!loading" viewBox="0 0 22 22" aria-hidden="true">
            <path d="M4 11h13m-5-5 5 5-5 5" />
          </svg>
        </button>
      </form>
      <footer class="app-login-page-footer">
        <span>© {{ new Date().getFullYear() }} logisticspluscn</span
        ><span>{{ t("login.accountNotice") }}</span>
      </footer>
    </section>
  </main>
</template>

<script setup>
import { computed, reactive, ref } from "vue";
import PublicBrand from "./public/PublicBrand.vue";
import LanguageSwitcher from "./LanguageSwitcher.vue";
import { useI18n } from "vue-i18n";
import { loginAdmin } from "../services/adminApi";
import { markApiErrorHandled } from "../services/apiClient";
import { clearCustomerSession, loginCustomer } from "../services/customerSession";

const emit = defineEmits(["logged-in"]);
const { t } = useI18n();

const loading = ref(false);
const message = ref("");
const success = ref(false);
const showPassword = ref(false);
const loginMode = ref("employee");
const form = reactive({ username: "", password: "" });
const customerForm = reactive({ username: "", password: "", customerCode: "" });
const configuredTrackingWorkbenchUrl = import.meta.env.VITE_TRACKING_WORKBENCH_URL || "/tracking/";
const submitText = computed(() => {
  if (loading.value) {
    return t(loginMode.value === "employee" ? "login.signingIn" : "login.customerSigningIn");
  }
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
  // Customer sessions retain the dedicated tracking surface; the embedded workspace is employee-only.
  if (target.pathname.startsWith("/workspace/tracking/")) target.pathname = "/tracking/";
  target.hash = "overview";
  return target.href;
}

async function submit() {
  if (loading.value) return;
  loading.value = true;
  message.value = "";
  success.value = false;
  try {
    if (loginMode.value === "customer") {
      const target = customerTrackingTarget();
      await loginCustomer({ ...customerForm });
      customerForm.password = "";
      customerForm.customerCode = "";
      success.value = true;
      message.value = t("login.customerSuccess");
      window.location.assign(target);
      return;
    }
    clearCustomerSession();
    const response = await loginAdmin(form.username, form.password);
    form.password = "";
    emit("logged-in", response.user);
  } catch (error) {
    markApiErrorHandled(error);
    message.value =
      loginMode.value === "customer"
        ? t("login.customerErrorFallback")
        : error.message || t("login.errorFallback");
  } finally {
    loading.value = false;
  }
}
</script>
