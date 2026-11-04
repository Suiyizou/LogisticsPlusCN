<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { RouterView, RouterLink, useRoute, useRouter } from "vue-router";
import WorkspaceAccountDialogs from "./WorkspaceAccountDialogs.vue";
import { wt } from "./workspaceCopy";
import WorkspaceNavigation from "./WorkspaceNavigation.vue";
import WorkspaceIcon from "./WorkspaceIcon.vue";
import TrackingWorkspaceFrame from "./TrackingWorkspaceFrame.vue";
import BrandLockup from "../brand/BrandLockup.vue";
import LanguageSwitcher from "../LanguageSwitcher.vue";
import { currentLocale, t } from "../../i18n";
import { adminRouteTitle } from "../../features/admin/adminNavigation.js";
import { workspaceNavigationMessages } from "../../i18n/workspaceNavigationMessages.js";
import { useMediaQuery } from "../../composables/useMediaQuery.js";
const props = defineProps({
  currentUser: { type: Object, required: true },
  announcementCount: { type: Number, default: 0 }
});
const emit = defineEmits(["logout", "user-updated", "open-announcements"]);
const route = useRoute();
const router = useRouter();
const trackingVisible = computed(() => route.meta.workspace === "tracking");
const trackingCreated = ref(trackingVisible.value);
const navigationOpen = ref(false);
const mobileNavigation = useMediaQuery("(max-width: 760px)");
const navigationTrigger = ref(null);
const navigationPanel = ref(null);
const pageBody = ref(null);
const accountMode = ref("");
const accountMenuOpen = ref(false);
const accountMenu = ref(null);
const navigationCopy = computed(
  () => workspaceNavigationMessages[currentLocale.value] || workspaceNavigationMessages["en-US"]
);
const leafTitle = computed(() => {
  const copy = navigationCopy.value;
  if (!copy) return "";
  return (
    {
      "planner-cargos": copy.cargos,
      "planner-config": copy.config,
      "planner-results": copy.results,
      "planner-import-excel": copy.importExcel,
      "planner-import-image": copy.importImage,
      "planner-import-text": copy.importText,
      containers: copy.equipment,
      algorithm: copy.algorithm,
      "tracking-overview": copy.overview,
      "tracking-query": copy.query
    }[route.name] || ""
  );
});
async function toggleNavigation() {
  if (navigationOpen.value) return closeNavigation();
  navigationOpen.value = true;
  await nextTick();
  navigationPanel.value?.querySelector("nav a")?.focus();
}
function closeNavigation() {
  if (!navigationOpen.value) return;
  navigationOpen.value = false;
  navigationTrigger.value?.focus();
}
function keepNavigationFocus(event) {
  if (!navigationOpen.value || !mobileNavigation.value) return;
  const items = [
    navigationTrigger.value,
    ...navigationPanel.value.querySelectorAll("a[href], button:not([disabled])")
  ].filter(
    (item) => item?.getClientRects().length && item.tabIndex >= 0 && !item.closest("[inert]")
  );
  if (!items.length) return;
  const index = items.indexOf(document.activeElement);
  const nextIndex = event.shiftKey
    ? index <= 0
      ? items.length - 1
      : index - 1
    : (index + 1) % items.length;
  event.preventDefault();
  items[nextIndex].focus();
}
watch(mobileNavigation, (mobile) => {
  if (!mobile) navigationOpen.value = false;
});
watch(trackingVisible, (visible) => {
  if (visible) trackingCreated.value = true;
});
watch(
  () => route.path,
  async () => {
    const wasOpen = navigationOpen.value;
    navigationOpen.value = false;
    if (wasOpen) {
      await nextTick();
      pageBody.value?.focus();
    }
    pageBody.value?.querySelector(".persistent-workspace__page")?.scrollTo(0, 0);
  }
);
const displayName = computed(() => props.currentUser.displayName || props.currentUser.username);
const roleLabel = computed(() =>
  t(
    {
      ADMIN: "portal.roleAdmin",
      BUSINESS: "portal.roleBusiness",
      OVERSEA_AGENT: "portal.roleOverseaAgent"
    }[props.currentUser.role] || "portal.roleEmployee"
  )
);
const pageTitle = computed(() => {
  currentLocale.value;
  if (route.meta.titleKey)
    return (
      adminRouteTitle(String(route.meta.titleKey), currentLocale.value) ||
      t(String(route.meta.titleKey))
    );
  if (trackingVisible.value) return t("portal.tracking.title");
  if (route.meta.surface === "planner") return t("portal.planner.title");
  return route.name === "workbenches"
    ? navigationCopy.value?.home || t("maritime.workspace")
    : wt("preferencesSection");
});
</script>
<template>
  <div
    class="persistent-workspace"
    :class="{ 'is-tracking': trackingVisible, 'navigation-open': navigationOpen }"
    data-i18n-ignore
    @keydown.esc="closeNavigation"
    @keydown.tab="keepNavigationFocus"
  >
    <a
      class="persistent-workspace__skip"
      href="#workspace-content"
      @click.prevent="pageBody?.focus()"
    >
      {{ navigationCopy.skip }}
    </a>
    <div
      v-if="navigationOpen"
      class="persistent-workspace__backdrop"
      aria-hidden="true"
      @click="closeNavigation"
    ></div>
    <aside
      id="workspace-navigation-panel"
      ref="navigationPanel"
      class="persistent-workspace__sidebar"
    >
      <BrandLockup
        href="/workbenches"
        class="persistent-workspace__brand"
        compact
        company
        @click.prevent="router.push('/workbenches')"
      />
      <div class="persistent-workspace__navigation">
        <p class="persistent-workspace__navigation-label">{{ navigationCopy.operationsLabel }}</p>
        <WorkspaceNavigation :role="currentUser.role" />
      </div>
      <div class="persistent-workspace__identity">
        <span>{{ displayName.slice(0, 1).toUpperCase() }}</span>
        <div>
          <strong>{{ displayName }}</strong
          ><small>{{ roleLabel }}</small>
        </div>
      </div>
    </aside>
    <header class="persistent-workspace__header">
      <button
        ref="navigationTrigger"
        type="button"
        class="persistent-workspace__mobile"
        :aria-expanded="navigationOpen"
        aria-controls="workspace-navigation-panel"
        :aria-label="navigationCopy.toggle"
        @click="toggleNavigation"
      >
        <WorkspaceIcon name="menu" />
      </button>
      <nav class="persistent-workspace__breadcrumb" :aria-label="navigationCopy.breadcrumb">
        <RouterLink to="/workbenches">{{ t("maritime.workspace") }}</RouterLink
        ><WorkspaceIcon name="chevron" /> <span v-if="leafTitle">{{ pageTitle }}</span
        ><WorkspaceIcon v-if="leafTitle" name="chevron" />
        <strong aria-current="page">{{ leafTitle || pageTitle }}</strong>
      </nav>
      <div class="persistent-workspace__actions">
        <LanguageSwitcher /><button
          type="button"
          class="persistent-workspace__messages"
          :aria-label="t('customers.systemMessages')"
          :title="t('customers.systemMessages')"
          @click="emit('open-announcements')"
        >
          <WorkspaceIcon name="bell" /><b v-if="announcementCount">{{
            announcementCount
          }}</b></button
        ><el-dropdown
          ref="accountMenu"
          trigger="click"
          placement="bottom-end"
          popper-class="workspace-account-menu"
          @visible-change="accountMenuOpen = $event"
          ><button
            type="button"
            class="persistent-workspace__account"
            :class="{ 'is-open': accountMenuOpen }"
            @keydown.esc="accountMenuOpen && accountMenu?.handleClose()"
            :aria-label="`${displayName} · ${t('portal.personalInfo')}`"
          >
            <span>{{ displayName.slice(0, 1).toUpperCase() }}</span
            ><span class="persistent-workspace__account-copy"
              ><strong>{{ displayName }}</strong
              ><small>{{ roleLabel }}</small></span
            >
            <WorkspaceIcon name="chevron" class="persistent-workspace__account-chevron" /></button
          ><template #dropdown
            ><el-dropdown-menu
              ><el-dropdown-item @click="accountMode = 'profile'">{{
                t("portal.personalInfo")
              }}</el-dropdown-item
              ><el-dropdown-item @click="accountMode = 'password'">{{
                t("portal.changePassword")
              }}</el-dropdown-item
              ><el-dropdown-item
                ><RouterLink to="/home">{{
                  wt("preferencesSection")
                }}</RouterLink></el-dropdown-item
              ><el-dropdown-item divided @click="emit('logout')">{{
                t("portal.logout")
              }}</el-dropdown-item></el-dropdown-menu
            ></template
          ></el-dropdown
        >
      </div>
    </header>
    <WorkspaceAccountDialogs
      :current-user="currentUser"
      :mode="accountMode"
      @close="accountMode = ''"
      @user-updated="emit('user-updated', $event)"
    />
    <section
      id="workspace-content"
      ref="pageBody"
      class="persistent-workspace__body"
      :inert="navigationOpen"
      tabindex="-1"
    >
      <div v-show="!trackingVisible" class="persistent-workspace__page">
        <RouterView v-slot="{ Component }"
          ><component
            :is="Component"
            content-only
            :current-user="currentUser"
            :announcement-count="announcementCount"
            @logout="emit('logout')"
            @user-updated="emit('user-updated', $event)"
            @open-announcements="emit('open-announcements')"
        /></RouterView>
      </div>
      <TrackingWorkspaceFrame
        v-if="trackingCreated"
        v-show="trackingVisible"
        :visible="trackingVisible"
      />
    </section>
  </div>
</template>
<style scoped>
.persistent-workspace {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  grid-template-rows: 68px minmax(0, 1fr);
  width: 100%;
  height: 100dvh;
  overflow: hidden;
  background: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-ui);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.persistent-workspace__skip {
  position: fixed;
  top: 8px;
  left: 12px;
  z-index: 1000;
  padding: 10px 16px;
  background: var(--color-primary);
  color: var(--color-on-primary);
  border-radius: var(--radius-control);
  transform: translateY(-150%);
}
.persistent-workspace__skip:focus {
  transform: none;
}
.persistent-workspace__backdrop {
  display: none;
}
.persistent-workspace__sidebar {
  grid-row: 1/-1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  width: 250px;
  box-sizing: border-box;
  background: linear-gradient(180deg, #fff 0%, #f8faff 100%);
  border-right: 1px solid var(--color-border);
}
.persistent-workspace__brand {
  display: flex;
  align-items: center;
  min-height: 68px;
  padding: 0 22px;
  border-bottom: 1px solid #edf1f7;
  text-decoration: none;
  gap: 10px;
}
.persistent-workspace__brand :deep(.maritime-brand__wordmark) {
  font-size: 19px;
  letter-spacing: -0.65px;
}
.persistent-workspace__brand :deep(.maritime-brand__wordmark small) {
  margin-top: 3px;
  font-size: 8px;
  letter-spacing: 0;
}
.persistent-workspace__brand :deep(.maritime-brand__mark) {
  width: 44px;
  height: 32px;
  color: var(--color-primary);
}
.persistent-workspace__navigation {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 22px 9px;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: #d8e1ee transparent;
}
.persistent-workspace__navigation-label {
  margin: 0 0 10px;
  padding-inline: 13px;
  color: var(--color-secondary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.11em;
}
.persistent-workspace__identity {
  display: flex;
  gap: 11px;
  align-items: center;
  border-top: 1px solid #edf1f7;
  padding: 18px 22px;
  min-width: 0;
}
.persistent-workspace__identity > span,
.persistent-workspace__account > span:first-child {
  display: grid;
  place-items: center;
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: var(--color-primary);
  background: var(--color-accent-soft);
  font-weight: 600;
}
.persistent-workspace__identity > div {
  min-width: 0;
}
.persistent-workspace__identity strong,
.persistent-workspace__identity small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.7;
}
.persistent-workspace__identity small {
  color: var(--color-muted);
}
.persistent-workspace__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-width: 0;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  padding: 0 28px;
}
.persistent-workspace__breadcrumb {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  font-size: 13px;
  color: var(--color-secondary);
}
.persistent-workspace__breadcrumb a {
  color: var(--color-muted);
  text-decoration: none;
}
.persistent-workspace__breadcrumb > span {
  color: var(--color-muted);
}
.persistent-workspace__breadcrumb .workspace-icon {
  width: 12px;
  height: 12px;
  color: var(--color-muted);
}
.persistent-workspace__breadcrumb strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 650;
}
.persistent-workspace__actions {
  display: flex;
  align-items: center;
  gap: 22px;
  flex-shrink: 0;
}
.persistent-workspace button {
  font: inherit;
  cursor: pointer;
}
.persistent-workspace .persistent-workspace__messages {
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  min-height: 44px;
  padding: 8px;
  background: transparent;
  border: 0;
  color: var(--color-foreground);
  border-radius: 7px;
}
.persistent-workspace__messages b {
  position: absolute;
  right: 1px;
  top: 3px;
  background: var(--color-destructive);
  color: #fff;
  border: 2px solid #fff;
  border-radius: 12px;
  min-width: 16px;
  padding: 0 4px;
  font-size: 10px;
  line-height: 16px;
}
.persistent-workspace__messages:hover {
  background: var(--color-accent-soft);
}
.persistent-workspace .persistent-workspace__account {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 4px 0 4px 20px;
  background: transparent;
  border: 0;
  border-left: 1px solid var(--color-border);
  border-radius: 0;
  color: var(--color-foreground);
}
.persistent-workspace__account > span:first-child {
  color: #fff;
  background: var(--color-primary);
}
.persistent-workspace__account-copy {
  display: grid;
  gap: 1px;
  text-align: left;
}
.persistent-workspace__account-copy strong {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
}
.persistent-workspace__account-copy small {
  color: var(--color-muted);
  font-size: 11px;
}
.persistent-workspace__account-chevron {
  width: 12px;
  height: 12px;
  margin-left: 4px;
  transform: rotate(90deg);
  transition: transform var(--motion-fast) var(--motion-ease);
}
.persistent-workspace__account.is-open .persistent-workspace__account-chevron {
  transform: rotate(-90deg);
}
:global(.workspace-account-menu.el-popper) {
  border-color: var(--color-border-strong);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-overlay);
}
:global(.workspace-account-menu .el-dropdown-menu__item) {
  min-height: 38px;
  padding-inline: 14px;
}
@media (prefers-reduced-motion: reduce) {
  .persistent-workspace__account-chevron {
    transition: none;
  }
}
.persistent-workspace__body {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.persistent-workspace__page {
  width: 100%;
  height: 100%;
  overflow: auto;
  scrollbar-gutter: stable;
}
.persistent-workspace__mobile {
  display: none;
}
@media (max-width: 1050px) {
  .persistent-workspace__actions {
    gap: 14px;
  }
  .persistent-workspace__account-copy strong {
    max-width: 130px;
  }
}
@media (max-width: 850px) {
  .persistent-workspace__header {
    padding: 0 16px;
  }
  .persistent-workspace__actions {
    gap: 12px;
    justify-content: flex-end;
  }
  .persistent-workspace__navigation :deep(.workspace-navigation__mobile) {
    display: none;
  }
  .persistent-workspace__navigation :deep(.workspace-navigation__nav) {
    display: grid;
  }
}
@media (max-width: 760px) {
  .persistent-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
  .persistent-workspace__sidebar {
    display: none;
    position: absolute;
    inset: 68px auto 0 0;
    z-index: 30;
    height: calc(100dvh - 68px);
    box-shadow: 8px 0 24px #0c1c3a15;
  }
  .navigation-open .persistent-workspace__sidebar {
    display: flex;
  }
  .persistent-workspace__backdrop {
    display: block;
    position: fixed;
    inset: 68px 0 0;
    z-index: 29;
    background: rgb(12 28 58 / 32%);
  }
  .persistent-workspace__header {
    grid-column: 1;
    gap: 8px;
    padding-inline: 12px;
  }
  .persistent-workspace__actions {
    width: auto;
    min-width: 0;
    gap: 8px;
  }
  .persistent-workspace__breadcrumb {
    flex: 1 1 auto;
  }
  .persistent-workspace__breadcrumb > :not(strong) {
    display: none;
  }
  .persistent-workspace__actions :deep(.language-switcher) {
    flex-shrink: 0;
  }
  .persistent-workspace__actions :deep(.language-switcher button) {
    min-height: 44px;
  }
  .persistent-workspace .persistent-workspace__account {
    min-width: 44px;
    min-height: 44px;
    padding: 4px 2px 4px 8px;
    gap: 5px;
    white-space: nowrap;
  }
  .persistent-workspace__account-copy {
    display: none;
  }
  .persistent-workspace__account-chevron {
    width: 10px;
    margin: 0;
  }
  .persistent-workspace .persistent-workspace__mobile {
    display: grid;
    place-items: center;
    flex: 0 0 44px;
    width: 44px;
    min-height: 44px;
    border: 0;
    padding: 10px;
    background: transparent;
    color: var(--color-primary);
  }
  .persistent-workspace .persistent-workspace__messages {
    flex-shrink: 0;
    width: 36px;
    min-height: 44px;
  }
}
@media (max-width: 390px) {
  .persistent-workspace__breadcrumb strong {
    font-size: 12px;
  }
  .persistent-workspace__actions {
    gap: 4px;
  }
}
</style>
