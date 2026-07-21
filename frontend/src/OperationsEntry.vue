<template>
  <el-config-provider :locale="elementPlusLocale">
    <LanguageSwitcher v-if="!authChecked || !currentUser" class="global-language-switcher" />
    <LoginPage v-if="authChecked && !currentUser" @logged-in="handleLoggedIn" />
    <SystemWaitOverlay
      v-else-if="!authChecked"
      :visible="true"
      :message="t('app.loadingAuth')"
    />
    <AdminDashboard
      v-else-if="activePage === 'admin' && currentUser?.role === 'ADMIN'"
      :current-user="currentUser"
      @logout="handleLogout"
      @user-updated="handleUserUpdated"
    />
    <BusinessCustomerPage
      v-else-if="activePage === 'customers' && ['BUSINESS', 'ADMIN'].includes(currentUser?.role)"
      :current-user="currentUser"
      @logout="handleLogout"
    />
    <WorkbenchPortal
      v-else
      :current-user="currentUser"
      @logout="handleLogout"
    />
    <SystemWaitOverlay
      :visible="loginRedirecting"
      :message="loginRedirectText"
    />
  </el-config-provider>
</template>

<script setup>
import { computed, defineAsyncComponent, h, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AsyncPageError from "./components/AsyncPageError.vue";
import LanguageSwitcher from "./components/LanguageSwitcher.vue";
import SystemWaitOverlay from "./components/SystemWaitOverlay.vue";
import { fetchAdminMe, logoutAdmin } from "./services/adminApi";
import { clearSession, isSessionExpired, storedToken, storedUser } from "./services/authSession";
import { elementPlusLocale, t } from "./i18n";

const route = useRoute();
const router = useRouter();
const authChecked = ref(false);
const currentUser = ref(storedUser());
const loginRedirecting = ref(false);
const loginRedirectText = ref("");
const activePage = computed(() => String(route.name || "workbenches"));

const loadingPage = {
  name: "LoadingOperationsPage",
  inheritAttrs: false,
  setup() {
    return () => h(SystemWaitOverlay, {
      visible: true,
      message: t("app.loadingPage")
    });
  }
};
const lazyPage = (loader) => defineAsyncComponent({
  loader,
  delay: 120,
  timeout: 30000,
  loadingComponent: loadingPage,
  errorComponent: AsyncPageError
});
const loadAdminDashboard = () => import("./components/AdminDashboard.vue");
const loadBusinessCustomerPage = () => import("./components/BusinessCustomerPage.vue");
const loadLoginPage = () => import("./components/LoginPage.vue");
const loadWorkbenchPortal = () => import("./components/WorkbenchPortal.vue");
const AdminDashboard = lazyPage(loadAdminDashboard);
const BusinessCustomerPage = lazyPage(loadBusinessCustomerPage);
const LoginPage = lazyPage(loadLoginPage);
const WorkbenchPortal = lazyPage(loadWorkbenchPortal);

onMounted(async () => {
  window.addEventListener("auth-expired", handleAuthExpired);
  await initializeAuth();
});

onUnmounted(() => {
  window.removeEventListener("auth-expired", handleAuthExpired);
});

watch([activePage, currentUser, authChecked], () => {
  if (!authChecked.value || !currentUser.value) return;
  if (activePage.value === "admin" && currentUser.value.role !== "ADMIN") {
    void router.replace("/workbenches");
  } else if (activePage.value === "customers" && !["BUSINESS", "ADMIN"].includes(currentUser.value.role)) {
    void router.replace("/workbenches");
  }
});

async function initializeAuth() {
  const cachedUser = storedUser();
  if (!storedToken() || isSessionExpired()) {
    clearSession();
    currentUser.value = null;
    authChecked.value = true;
    return;
  }
  try {
    currentUser.value = await fetchAdminMe();
  } catch (error) {
    if (cachedUser && storedToken() && error?.retryable !== false) {
      currentUser.value = cachedUser;
    } else {
      clearSession();
      currentUser.value = null;
    }
  } finally {
    authChecked.value = true;
  }
}

async function handleLoggedIn(user) {
  const isAdmin = user?.role === "ADMIN";
  loginRedirectText.value = t(isAdmin ? "portal.enteringAdmin" : "portal.entering");
  loginRedirecting.value = true;
  try {
    await (isAdmin ? loadAdminDashboard() : loadWorkbenchPortal());
    await router.replace(isAdmin ? "/admin" : "/workbenches");
    currentUser.value = user;
  } finally {
    loginRedirecting.value = false;
  }
}

async function handleLogout() {
  try {
    await logoutAdmin();
  } catch {
    clearSession();
  }
  currentUser.value = null;
  await router.push("/workbenches");
}

function handleAuthExpired() {
  clearSession();
  currentUser.value = null;
}

function handleUserUpdated(user) {
  if (user) currentUser.value = user;
}
</script>
