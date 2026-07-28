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
      :announcement-count="unreadAnnouncementCount"
      @logout="handleLogout"
      @user-updated="handleUserUpdated"
      @open-announcements="openAnnouncements"
    />
    <BusinessCustomerPage
      v-else-if="(activePage === 'customers' || (activePage === 'workbenches' && currentUser?.role === 'OVERSEA_AGENT'))
        && ['BUSINESS', 'ADMIN', 'OVERSEA_AGENT'].includes(currentUser?.role)"
      :current-user="currentUser"
      :announcement-count="unreadAnnouncementCount"
      @logout="handleLogout"
      @user-updated="handleUserUpdated"
      @open-announcements="openAnnouncements"
    />
    <WorkbenchPortal
      v-else
      :current-user="currentUser"
      :announcement-count="unreadAnnouncementCount"
      @logout="handleLogout"
      @user-updated="handleUserUpdated"
      @open-announcements="openAnnouncements"
    />
    <SystemAnnouncementDialog
      v-if="authChecked && currentUser"
      v-model="announcementDialogOpen"
      :announcements="announcements"
      @dismiss="dismissAnnouncements"
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
import SystemAnnouncementDialog from "./components/SystemAnnouncementDialog.vue";
import SystemWaitOverlay from "./components/SystemWaitOverlay.vue";
import { fetchAdminMe, logoutAdmin } from "./services/adminApi";
import { fetchTodayAnnouncements, markAnnouncementRead } from "./services/announcementApi";
import { clearSession, isSessionExpired, storedToken, storedUser } from "./services/authSession";
import { elementPlusLocale, t } from "./i18n";

const route = useRoute();
const router = useRouter();
const authChecked = ref(false);
const currentUser = ref(storedUser());
const loginRedirecting = ref(false);
const loginRedirectText = ref("");
const announcements = ref([]);
const announcementDialogOpen = ref(false);
const announcementLoading = ref(false);
const unreadAnnouncementCount = computed(() =>
  announcements.value.filter((item) => !item?.read).length
);
let loadedAnnouncementIdentity = "";
const operationsPageNames = new Set(["workbenches", "customers", "admin"]);
const operationsPageByPath = {
  "/workbenches": "workbenches",
  "/customers": "customers",
  "/admin": "admin"
};
const normalizeOperationsPath = (path) => String(path || "").replace(/\/+$/, "") || "/";
const activePage = computed(() => {
  const routeName = String(route.name || "");
  if (operationsPageNames.has(routeName)) return routeName;

  // The first render can run before vue-router resolves its initial location.
  // Fall back to the actual browser path instead of briefly mounting workbenches.
  const routePath = normalizeOperationsPath(route.path);
  const browserPath = normalizeOperationsPath(window.location.pathname);
  return operationsPageByPath[routePath] || operationsPageByPath[browserPath] || "workbenches";
});

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
  const overseaHome = currentUser.value.role === "OVERSEA_AGENT" ? "/customers" : "/workbenches";
  if (activePage.value === "admin" && currentUser.value.role !== "ADMIN") {
    void router.replace(overseaHome);
  } else if (activePage.value === "customers" && !["BUSINESS", "ADMIN", "OVERSEA_AGENT"].includes(currentUser.value.role)) {
    void router.replace("/workbenches");
  } else if (activePage.value === "workbenches" && currentUser.value.role === "OVERSEA_AGENT") {
    void router.replace("/customers");
  }
});

watch(
  [authChecked, () => currentUser.value?.id, () => currentUser.value?.username],
  ([checked, id, username]) => {
    if (!checked || (!id && !username)) return;
    const identity = `${id || ""}:${username || ""}`;
    if (identity === loadedAnnouncementIdentity) return;
    loadedAnnouncementIdentity = identity;
    void loadAnnouncements({ autoOpen: true });
  },
  { immediate: true }
);

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
  const isOverseaAgent = user?.role === "OVERSEA_AGENT";
  const target = isAdmin ? "/admin" : isOverseaAgent ? "/customers" : "/workbenches";
  loginRedirectText.value = t(isAdmin ? "portal.enteringAdmin" : "portal.entering");
  loginRedirecting.value = true;
  try {
    await (isAdmin
      ? loadAdminDashboard()
      : isOverseaAgent
        ? loadBusinessCustomerPage()
        : loadWorkbenchPortal());
    await router.replace(target);
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
  announcements.value = [];
  announcementDialogOpen.value = false;
  loadedAnnouncementIdentity = "";
  currentUser.value = null;
  await router.push("/workbenches");
}

function handleAuthExpired() {
  clearSession();
  announcements.value = [];
  announcementDialogOpen.value = false;
  loadedAnnouncementIdentity = "";
  currentUser.value = null;
}

function handleUserUpdated(user) {
  if (user) currentUser.value = user;
}

function localReadKey(item) {
  const identity = currentUser.value?.id || currentUser.value?.username || "anonymous";
  const date = String(item?.displayDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  return `cargo-planner-announcement-read:${identity}:${date}:${item?.id ?? "unknown"}`;
}

function wasReadLocally(item) {
  try {
    return localStorage.getItem(localReadKey(item)) === "1";
  } catch {
    return false;
  }
}

function rememberReadLocally(item) {
  try {
    localStorage.setItem(localReadKey(item), "1");
  } catch {
    // The server-side read record remains authoritative when storage is unavailable.
  }
}

async function loadAnnouncements({ autoOpen = false } = {}) {
  if (!currentUser.value || announcementLoading.value) return;
  announcementLoading.value = true;
  try {
    const items = await fetchTodayAnnouncements();
    announcements.value = items.map((item) => ({
      ...item,
      read: Boolean(item?.read || wasReadLocally(item))
    }));
    if (autoOpen && announcements.value.some((item) => !item.read)) {
      announcementDialogOpen.value = true;
    }
  } catch {
    announcements.value = [];
  } finally {
    announcementLoading.value = false;
  }
}

async function openAnnouncements() {
  await loadAnnouncements({ autoOpen: false });
  announcementDialogOpen.value = true;
}

function dismissAnnouncements(items = announcements.value) {
  const unreadIds = new Set(
    items.filter((item) => !item?.read).map((item) => String(item?.id ?? ""))
  );
  if (!unreadIds.size) return;
  announcements.value = announcements.value.map((item) => {
    if (!unreadIds.has(String(item?.id ?? ""))) return item;
    rememberReadLocally(item);
    return { ...item, read: true };
  });
  void Promise.allSettled(
    [...unreadIds].filter(Boolean).map((id) => markAnnouncementRead(id))
  );
}
</script>
