<template>
  <el-config-provider :locale="elementPlusLocale">
    <LanguageSwitcher v-if="!authChecked" class="global-language-switcher" />
    <LoginPage v-if="authChecked && !currentUser" @logged-in="handleLoggedIn" />
    <SystemWaitOverlay v-else-if="!authChecked" :visible="true" :message="t('app.loadingAuth')" />
    <RouterView v-else-if="authorizedPage" v-slot="{ Component }">
      <component
        :is="Component"
        :key="workspaceSessionKey(currentUser)"
        :current-user="currentUser"
        :announcement-count="unreadAnnouncementCount"
        @logout="handleLogout"
        @user-updated="handleUserUpdated"
        @open-announcements="openAnnouncements"
      />
    </RouterView>
    <SystemWaitOverlay v-else :visible="true" :message="t('app.loadingPage')" />
    <SystemAnnouncementDialog
      v-if="authChecked && currentUser"
      v-model="announcementDialogOpen"
      :announcements="announcements"
      @dismiss="dismissAnnouncements"
    />
    <SystemWaitOverlay :visible="loginRedirecting" :message="loginRedirectText" />
  </el-config-provider>
</template>

<script setup>
import {
  computed,
  defineAsyncComponent,
  h,
  onMounted,
  onUnmounted,
  provide,
  readonly,
  ref,
  watch
} from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import { applicationViews } from "./modules/views.js";
import { canAccessRoute, operationsHome, postLoginDestination } from "./modules/registry.js";
import { workspaceContextKey, workspaceSessionKey } from "./modules/workspaceContext.js";
import AsyncPageError from "./components/AsyncPageError.vue";
import LanguageSwitcher from "./components/LanguageSwitcher.vue";
import SystemAnnouncementDialog from "./components/SystemAnnouncementDialog.vue";
import SystemWaitOverlay from "./components/SystemWaitOverlay.vue";
import { markApiErrorHandled } from "./services/apiClient";
import { fetchAdminMe, logoutAdmin } from "./services/adminApi";
import { fetchTodayAnnouncements, markAnnouncementRead } from "./services/announcementApi";
import { clearSession, isSessionExpired, storedToken, storedUser } from "./services/authSession";
import { currentLocale, elementPlusLocale, t } from "./i18n";
import { useWorkspaceTitle } from "./components/workspace/useWorkspaceTitle";

const route = useRoute();
useWorkspaceTitle(() => {
  currentLocale.value;
  if (route.meta.titleKey) return t(String(route.meta.titleKey));
  return t(
    route.path.startsWith("/admin")
      ? "maritime.administration"
      : route.path.startsWith("/customers")
        ? "maritime.operations"
        : "maritime.workspace"
  );
});
const router = useRouter();
const authChecked = ref(false);
const currentUser = ref(storedUser());
const loginRedirecting = ref(false);
const loginRedirectText = ref("");
const announcements = ref([]);
const announcementDialogOpen = ref(false);
const announcementLoading = ref(false);
const unreadAnnouncementCount = computed(
  () => announcements.value.filter((item) => !item?.read).length
);
let loadedAnnouncementIdentity = "";
provide(workspaceContextKey, {
  user: readonly(currentUser),
  announcementCount: readonly(unreadAnnouncementCount),
  logout: handleLogout,
  updateUser: handleUserUpdated,
  openAnnouncements
});
const authorizedPage = computed(
  () =>
    authChecked.value &&
    canAccessRoute(route, currentUser.value?.role) &&
    !(route.name === "workbenches" && currentUser.value?.role === "OVERSEA_AGENT")
);

const loadingPage = {
  name: "LoadingOperationsPage",
  inheritAttrs: false,
  setup() {
    return () =>
      h(SystemWaitOverlay, {
        visible: true,
        message: t("app.loadingPage")
      });
  }
};
const lazyPage = (loader) =>
  defineAsyncComponent({
    loader,
    delay: 120,
    timeout: 30000,
    loadingComponent: loadingPage,
    errorComponent: AsyncPageError
  });
const LoginPage = lazyPage(() => import("./components/LoginPage.vue"));

onMounted(async () => {
  window.addEventListener("auth-expired", handleAuthExpired);
  await initializeAuth();
});

onUnmounted(() => {
  window.removeEventListener("auth-expired", handleAuthExpired);
});

watch([() => route.fullPath, currentUser, authChecked], () => {
  if (!authChecked.value || !currentUser.value || authorizedPage.value) return;
  void router.replace(operationsHome(currentUser.value.role));
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
  const target = postLoginDestination(route, user?.role);
  loginRedirectText.value = t("portal.entering");
  loginRedirecting.value = true;
  try {
    await (target.startsWith("/customers")
      ? applicationViews.business()
      : applicationViews.workbenches());
    await router.replace(target);
    currentUser.value = user;
  } finally {
    loginRedirecting.value = false;
  }
}

async function handleLogout() {
  // Dispatch while the old token exists; all local state is revoked immediately.
  const request = logoutAdmin();
  clearSession();
  announcements.value = [];
  announcementDialogOpen.value = false;
  loadedAnnouncementIdentity = "";
  currentUser.value = null;
  const navigation = router.push("/workbenches");
  try {
    await request;
  } catch (error) {
    markApiErrorHandled(error);
  }
  await navigation;
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
  void Promise.allSettled([...unreadIds].filter(Boolean).map((id) => markAnnouncementRead(id)));
}
</script>
