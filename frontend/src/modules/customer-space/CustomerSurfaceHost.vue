<script setup lang="ts">
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
import { t } from "../../i18n";
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
const router = useRouter(),
  route = useRoute();
const allowed = computed(() => canAccessRoute(route, "CUSTOMER"));
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
  <main class="customer-surface">
    <header>
      <RouterLink to="/">{{ t("customerSurface.brand") }}</RouterLink
      ><button v-if="user" type="button" @click="runtime.logout">
        {{ t("customerSurface.logout") }}
      </button>
    </header>
    <p v-if="!checked || busy" role="status">{{ t("customerSurface.checking") }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <form v-if="checked && !user" @submit.prevent="login">
      <h1>{{ t("customerSurface.login") }}</h1>
      <p>{{ t("customerSurface.loginIntro") }}</p>
      <label
        >{{ t("customerSurface.account")
        }}<input v-model="credentials.username" autocomplete="username" required
      /></label>
      <label
        >{{ t("customerSurface.password")
        }}<input
          v-model="credentials.password"
          type="password"
          autocomplete="current-password"
          required
      /></label>
      <label
        >{{ t("customerSurface.code")
        }}<input v-model="credentials.customerCode" required minlength="4"
      /></label>
      <button :disabled="busy" type="submit">{{ t("customerSurface.submit") }}</button>
    </form>
    <section v-if="user" class="customer-surface-workspace">
      <nav :aria-label="t('customerSurface.nav')">
        <button
          v-for="module in modules"
          :key="module.id"
          type="button"
          @click="
            openModule(module.pages.find((page) => page.path === '')?.name || module.pages[0].name)
          "
        >
          {{ t(module.labelKey) }}
        </button>
      </nav>
      <div>
        <p>{{ user.displayName || user.username }}</p>
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
  font-weight: 750;
  letter-spacing: -0.4px;
}
.customer-surface form {
  max-width: 440px;
  margin: 64px auto;
  padding: 32px;
  border: 1px solid var(--color-border, #dce6ee);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 12px 40px #17354c08;
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
  border-radius: 7px;
  background: #fff;
  color: inherit;
  font: inherit;
}
.customer-surface button {
  padding: 10px 16px;
  cursor: pointer;
  border: 1px solid #c9dbe6;
  border-radius: 8px;
  color: var(--color-accent, #0369a1);
  background: #fff;
  font: inherit;
  font-weight: 600;
}
.customer-surface button:disabled {
  opacity: 0.55;
  cursor: default;
}
.customer-surface button[type="submit"] {
  background: var(--color-accent, #0369a1);
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
  border-radius: 14px;
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
</style>
