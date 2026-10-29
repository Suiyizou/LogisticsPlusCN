<script setup>
import { computed, ref, watch } from "vue";
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
const accountMode = ref("");
watch(trackingVisible, (visible) => {
  if (visible) trackingCreated.value = true;
});
watch(
  () => route.fullPath,
  () => {
    navigationOpen.value = false;
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
  if (trackingVisible.value)
    return route.meta.trackingView === "query"
      ? t("portal.tracking.title")
      : t("portal.tracking.title");
  if (route.path.startsWith("/planner") || route.path.startsWith("/smart-import"))
    return t("portal.planner.title");
  return t("maritime.workspace");
});
</script>
<template>
  <div
    class="persistent-workspace"
    :class="{ 'is-tracking': trackingVisible, 'navigation-open': navigationOpen }"
    data-i18n-ignore
  >
    <aside class="persistent-workspace__sidebar">
      <BrandLockup
        href="/workbenches"
        class="persistent-workspace__brand"
        compact
        company
        @click.prevent="router.push('/workbenches')"
      />
      <div class="persistent-workspace__navigation">
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
        type="button"
        class="persistent-workspace__mobile"
        :aria-expanded="navigationOpen"
        :aria-label="t('maritime.workspace')"
        @click="navigationOpen = !navigationOpen"
      >
        <WorkspaceIcon name="menu" />
      </button>
      <div class="persistent-workspace__breadcrumb">
        <RouterLink to="/workbenches">{{ t("maritime.workspace") }}</RouterLink
        ><span>/</span><strong>{{ pageTitle }}</strong>
      </div>
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
        ><el-dropdown trigger="click"
          ><button
            type="button"
            class="persistent-workspace__account"
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
    <section class="persistent-workspace__body">
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
.persistent-workspace__sidebar {
  grid-row: 1/-1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  width: 250px;
  box-sizing: border-box;
  background: var(--color-surface);
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
  padding: 20px 8px;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: #d8e1ee transparent;
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
  gap: 14px;
  min-width: 0;
  font-size: 13px;
  color: var(--color-secondary);
}
.persistent-workspace__breadcrumb a {
  color: var(--color-muted);
  text-decoration: none;
}
.persistent-workspace__breadcrumb > span {
  color: #b4bfd0;
}
.persistent-workspace__breadcrumb strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
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
  .persistent-workspace__breadcrumb {
    display: none;
  }
  .persistent-workspace__actions {
    gap: 12px;
    width: 100%;
    justify-content: flex-end;
  }
  .persistent-workspace__navigation :deep(.workspace-navigation__mobile) {
    display: none;
  }
  .persistent-workspace__navigation :deep(.workspace-navigation__nav) {
    display: grid;
  }
}
@media (max-width: 620px) {
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
  .persistent-workspace__header {
    grid-column: 1;
    gap: 8px;
    padding-inline: 12px;
  }
  .persistent-workspace__actions {
    flex: 1 1 0;
    width: auto;
    min-width: 0;
    gap: 8px;
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
</style>
