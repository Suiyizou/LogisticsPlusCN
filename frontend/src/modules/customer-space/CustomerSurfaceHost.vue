<script setup lang="ts">
import "../../components/workspace/workspaceMotion.css";
import { computed, onMounted, onUnmounted, provide, reactive, readonly, ref } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { configuredPlatformModules } from "../configuredRegistry.js";
import { modulesForSurface } from "../moduleCatalog.js";
import { canAccessRoute } from "../registry.js";
import { workspaceContextKey } from "../workspaceContext.js";
import {
  clearCustomerSession,
  isCustomerSessionExpired,
  saveCustomerSession,
  storedCustomerSession,
  storedCustomerToken
} from "../../services/customerSession.js";
import { createCustomerApi } from "./customerApi.js";
import { customerApiKey } from "./customerContext.js";
import { useCustomerSurface } from "./useCustomerSurface.js";
import { currentLocale, t } from "../../i18n";
import { useWorkspaceTitle } from "../../components/workspace/useWorkspaceTitle";
import BrandLockup from "../../components/brand/BrandLockup.vue";
import WorkspacePageHeader from "../../components/workspace/WorkspacePageHeader.vue";
import LanguageSwitcher from "../../components/LanguageSwitcher.vue";
const api = createCustomerApi({
  readToken: storedCustomerToken,
  t,
  clearSession: () => {
    clearCustomerSession();
    runtime.expire();
  }
});
const runtime = useCustomerSurface({
  api,
  t,
  session: {
    readToken: storedCustomerToken,
    read: storedCustomerSession,
    clear: clearCustomerSession,
    save: saveCustomerSession,
    expired: isCustomerSessionExpired
  }
});
const { user, checked, busy, error } = runtime;
const credentials = reactive({ username: "", password: "", customerCode: "" });
const showPassword = ref(false);
const router = useRouter(),
  route = useRoute();
const allowed = computed(() => canAccessRoute(route, "CUSTOMER"));
useWorkspaceTitle(() => {
  currentLocale.value;
  return t(String(route.meta.titleKey || "customerSurface.login"));
});
const modules = computed(() =>
  modulesForSurface(configuredPlatformModules, "customer", "CUSTOMER")
);
provide(customerApiKey, api);
provide(workspaceContextKey, {
  user: readonly(user),
  announcementCount: readonly(ref(0)),
  logout: runtime.logout,
  updateUser: () => {},
  openAnnouncements: () => {}
});
async function login() {
  try {
    await runtime.login({ ...credentials });
  } finally {
    credentials.password = "";
  }
}
function openModule(name: string) {
  void router.push({ name });
}
function syncCustomerSession(event: StorageEvent) {
  if (
    event.key === "cargo-planner-customer-token" ||
    event.key === "cargo-planner-customer-session" ||
    event.key === null
  )
    void runtime.restore();
}
onMounted(() => {
  window.addEventListener("customer-auth-expired", runtime.expire);
  window.addEventListener("storage", syncCustomerSession);
  void runtime.restore();
});
onUnmounted(() => {
  window.removeEventListener("customer-auth-expired", runtime.expire);
  window.removeEventListener("storage", syncCustomerSession);
});
</script>
<template>
  <main class="customer-surface" :class="{ 'is-authenticated': user }">
    <section v-if="!user" class="customer-login-photo" :aria-label="t('maritime.loginBrandAria')">
      <BrandLockup href="/" inverse company />
      <div>
        <h2>{{ t("maritime.loginHero") }}<br />{{ t("maritime.loginHeroSecond") }}</h2>
        <p>{{ t("maritime.loginHeroDescription") }}</p>
      </div>
    </section>
    <header>
      <BrandLockup v-if="!user" class="customer-mobile-brand" href="/" compact />
      <div v-else class="customer-surface-breadcrumb">
        <RouterLink to="/">{{ t("maritime.returnHome") }}</RouterLink
        ><span>/</span><strong>{{ t("customerSurface.shipments") }}</strong>
      </div>
      <div class="customer-surface-header-actions">
        <LanguageSwitcher /><button v-if="user" type="button" @click="runtime.logout">
          {{ t("customerSurface.logout") }}</button
        ><RouterLink v-else to="/">{{ t("maritime.returnHome") }}</RouterLink>
      </div>
    </header>
    <p v-if="!checked || busy" role="status">{{ t("customerSurface.checking") }}</p>
    <p v-if="error && user" role="alert">{{ error }}</p>
    <Transition name="workspace-state" appear
      ><form v-if="checked && !user" :aria-busy="busy" @submit.prevent="login">
        <WorkspacePageHeader
          :title="t('customerSurface.login')"
          :description="t('customerSurface.loginIntro')"
        />
        <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
        <label
          >{{ t("customerSurface.account")
          }}<input v-model="credentials.username" :disabled="busy" autocomplete="username" required
        /></label>
        <label
          >{{ t("customerSurface.password")
          }}<span class="customer-password-field"
            ><input
              v-model="credentials.password"
              :disabled="busy"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              required /><button
              class="customer-password-toggle"
              type="button"
              :disabled="busy"
              :aria-label="showPassword ? t('login.hidePassword') : t('login.showPassword')"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                <path v-if="showPassword" d="m3 3 18 18" />
              </svg></button></span
        ></label>
        <label
          >{{ t("customerSurface.code")
          }}<input v-model="credentials.customerCode" :disabled="busy" required minlength="4"
        /></label>
        <button :disabled="busy" type="submit">{{ t("customerSurface.submit") }}</button>
      </form></Transition
    >
    <section v-if="user" class="customer-surface-workspace">
      <nav :aria-label="t('customerSurface.nav')">
        <BrandLockup class="customer-sidebar-brand" href="/" inverse company compact />
        <button
          v-for="module in modules"
          :key="module.id"
          type="button"
          :class="{ 'is-active': route.path.startsWith(`/customer-workspace/${module.mount}`) }"
          @click="
            openModule(module.pages.find((page) => page.path === '')?.name || module.pages[0].name)
          "
        >
          {{ t(module.labelKey) }}
        </button>
      </nav>
      <div>
        <p class="customer-surface-user">{{ user.displayName || user.username }}</p>
        <RouterView v-if="allowed" :key="String(user.id)" />
        <p v-else role="alert">{{ t("customerSurface.denied") }}</p>
      </div>
    </section>
  </main>
</template>
<style scoped>
.customer-surface {
  max-width: 1440px;
  margin: auto;
  padding: 24px;
  color: var(--color-primary, #17354c);
}
.customer-surface > header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--color-border, #dce6ee);
  padding: 0 0 24px;
  gap: 16px;
}
.customer-surface > header a {
  color: inherit;
  text-decoration: none;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.4px;
}
.customer-surface form {
  max-width: 440px;
  margin: 64px auto;
  padding: 32px;
  border: 1px solid var(--color-border, #dce6ee);
  border-radius: var(--radius-control);
  background: #fff;
  box-shadow: none;
}
.customer-surface label {
  display: grid;
  gap: 8px;
  margin: 20px 0;
  font-weight: 600;
}
.customer-surface input {
  width: 100%;
  box-sizing: border-box;
  padding: 12px;
  border: 1px solid #bccbd7;
  border-radius: var(--radius-control);
  background: #fff;
  color: inherit;
  font: inherit;
}
.customer-surface button {
  padding: 10px 16px;
  cursor: pointer;
  border: 1px solid #c9dbe6;
  border-radius: var(--radius-control);
  color: var(--color-accent, var(--color-accent));
  background: #fff;
  font: inherit;
  font-weight: 600;
}
.customer-surface button:disabled {
  opacity: 0.55;
  cursor: default;
}
.customer-surface button[type="submit"] {
  background: var(--color-accent, var(--color-accent));
  color: #fff;
  width: 100%;
}
.customer-surface-workspace {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 24px;
  margin-top: 24px;
}
.customer-surface nav {
  display: grid;
  align-content: start;
  gap: 12px;
}
.customer-surface-workspace > div {
  min-width: 0;
  padding: 24px;
  border: 1px solid var(--color-border, #dce6ee);
  border-radius: var(--radius-control);
  background: #fff;
}
.customer-surface-workspace > div > p {
  margin: 0 0 20px;
  color: #687d91;
}
@media (max-width: 640px) {
  .customer-surface-workspace {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .customer-surface nav {
    display: flex;
    flex-wrap: wrap;
  }
  .customer-surface {
    padding: 16px;
  }
  .customer-surface-workspace > div {
    padding: 16px;
  }
  .customer-surface > header a {
    font-size: 17px;
  }
}

.customer-surface {
  max-width: none;
  min-height: 100vh;
  padding: 0;
  background: var(--color-background);
}
.customer-surface > header {
  min-height: 72px;
  padding: 14px 30px;
  border-bottom: 1px solid var(--color-border);
  background: white;
}
.customer-surface > p {
  margin: 16px 30px;
}
.customer-surface form {
  margin: 64px auto;
  width: min(440px, calc(100% - 36px));
  border-radius: var(--radius-control);
  box-shadow: none;
  padding: 36px;
}
.customer-surface form h1 {
  color: var(--color-primary);
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.5px;
}
.customer-surface form > p {
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.8;
}
.customer-surface label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-muted);
}
.customer-surface input,
.customer-surface button {
  border-radius: var(--radius-control);
}
.customer-surface-workspace {
  grid-template-columns: 224px minmax(0, 1fr);
  min-height: calc(100vh - 72px);
  gap: 0;
  margin: 0;
}
.customer-surface nav {
  padding: 28px 16px;
  background: var(--color-primary);
}
.customer-surface nav button {
  border: 0;
  border-left: 3px solid var(--color-accent);
  background: #ffffff14;
  color: white;
  text-align: left;
  font-size: 12px;
  font-weight: 500;
}
.customer-surface-workspace > div {
  padding: 28px 32px;
  border: 0;
  border-radius: 0;
  background: var(--color-background);
}
.customer-surface-workspace > div > p {
  margin-bottom: 24px;
  font-size: 12px;
}
@media (max-width: 760px) {
  .customer-surface > header {
    padding: 16px;
  }
  .customer-surface-workspace {
    grid-template-columns: 1fr;
  }
  .customer-surface nav {
    padding: 12px 16px;
  }
  .customer-surface-workspace > div {
    padding: 22px 16px;
  }
}

.customer-surface form {
  width: min(520px, calc(100% - 32px));
  padding: 32px;
  border-radius: var(--radius-card);
}
.customer-surface label {
  font-size: 14px;
  gap: 10px;
  margin: 22px 0;
}
.customer-surface input {
  min-height: 46px;
  font-size: 15px;
  border-radius: var(--radius-control);
}
.customer-surface button[type="submit"] {
  min-height: 46px;
  font-size: 15px;
  border-radius: var(--radius-control);
}
.customer-surface-workspace > div > p {
  font-size: 14px;
}
.customer-surface nav button {
  font-size: 14px;
  border-radius: var(--radius-control);
}
@media (max-width: 600px) {
  .customer-surface form {
    margin: 32px auto;
    padding: 24px;
  }
}
</style>
<style scoped src="./customerSurfaceComposition.css"></style>
