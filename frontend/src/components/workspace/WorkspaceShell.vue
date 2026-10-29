<script setup>
import { computed, ref, watch } from "vue";
import { RouterView, RouterLink, useRoute, useRouter } from "vue-router";
import WorkspaceAccountDialogs from "./WorkspaceAccountDialogs.vue";
import { wt } from "./workspaceCopy";
import WorkspaceNavigation from "./WorkspaceNavigation.vue";
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
        ☰
      </button>
      <div class="persistent-workspace__breadcrumb">
        <RouterLink to="/workbenches">{{ t("maritime.workspace") }}</RouterLink
        ><span>/</span><strong>{{ pageTitle }}</strong>
      </div>
      <div class="persistent-workspace__actions">
        <LanguageSwitcher /><button
          type="button"
          class="persistent-workspace__messages"
          @click="emit('open-announcements')"
        >
          {{ t("customers.systemMessages")
          }}<b v-if="announcementCount">{{ announcementCount }}</b></button
        ><el-dropdown trigger="click"
          ><button
            type="button"
            class="persistent-workspace__account"
            :aria-label="`${displayName} · ${t('portal.personalInfo')}`"
          >
            <span>{{ displayName.slice(0, 1).toUpperCase() }}</span
            ><strong>{{ displayName }}</strong
            ><small>⌄</small></button
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
  --font-data: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
  --color-primary: #17374d;
  --color-accent: #246b91;
  --color-accent-soft: #eaf3fb;
  --color-background: #f4f7fa;
  --color-surface: #fff;
  --color-border: #e1e8ef;
  --color-muted: #6c7e8d;
  --color-foreground: #19354a;
  --el-color-primary: #246b91;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  grid-template-rows: 68px minmax(0, 1fr);
  width: 100%;
  height: 100dvh;
  overflow: hidden;
  background: #f4f7fa;
  color: #19354a;
  font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
}
.persistent-workspace__sidebar {
  grid-row: 1 / -1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  width: 260px;
  box-sizing: border-box;
  background: #fff;
  border-right: 1px solid #e1e8ef;
}
.persistent-workspace__brand {
  display: flex;
  align-items: center;
  min-height: 68px;
  padding: 0 20px;
  border-bottom: 1px solid #edf1f5;
  text-decoration: none;
}
.persistent-workspace__brand {
  gap: 9px;
}
.persistent-workspace__brand :deep(.maritime-brand__wordmark) {
  font-size: 18px;
  letter-spacing: -0.4px;
}
.persistent-workspace__brand :deep(.maritime-brand__wordmark small) {
  font-size: 10px;
  letter-spacing: 0;
}
.persistent-workspace__brand :deep(.maritime-brand__mark) {
  width: 30px;
  height: 31px;
  font-size: 16px;
  color: #246b91;
}
.persistent-workspace__navigation {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 22px 12px;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: #d3dde6 transparent;
}
.persistent-workspace__identity {
  display: flex;
  gap: 12px;
  align-items: center;
  border-top: 1px solid #edf1f5;
  padding: 17px 22px;
}
.persistent-workspace__identity > span,
.persistent-workspace__account > span {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: #246b91;
  background: #eaf3fb;
  font-weight: 600;
}
.persistent-workspace__identity strong,
.persistent-workspace__identity small {
  display: block;
  font-size: 12px;
  line-height: 1.7;
}
.persistent-workspace__identity small {
  color: #718394;
}
.persistent-workspace__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-width: 0;
  background: #fff;
  border-bottom: 1px solid #e1e8ef;
  padding: 0 28px;
}
.persistent-workspace__breadcrumb {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  font-size: 13px;
}
.persistent-workspace__breadcrumb a {
  color: #6c7e8d;
  text-decoration: none;
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
  gap: 20px;
  flex-shrink: 0;
}
.persistent-workspace button {
  font: inherit;
  cursor: pointer;
}
.persistent-workspace__messages {
  display: flex;
  align-items: center;
  gap: 7px;
  background: transparent;
  border: 0;
  color: #526578;
  font-size: 12px !important;
}
.persistent-workspace__messages b {
  background: #cf6339;
  color: #fff;
  border-radius: 8px;
  padding: 0 5px;
}
.persistent-workspace__account {
  display: flex;
  align-items: center;
  gap: 9px;
  background: transparent;
  border: 0;
  color: #19354a;
}
.persistent-workspace__account strong {
  font-size: 13px;
  font-weight: 500;
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
@media (max-width: 850px) {
  .persistent-workspace {
    grid-template-columns: 260px minmax(0, 1fr);
  }
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
    box-shadow: 8px 0 24px #17374d15;
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
  .persistent-workspace__account {
    min-width: 44px;
    min-height: 44px;
    padding: 4px 2px;
    gap: 6px;
    white-space: nowrap;
  }
  .persistent-workspace__account strong {
    display: none;
  }
  .persistent-workspace__mobile {
    display: block;
    flex: 0 0 44px;
    width: 44px;
    min-height: 44px;
    border: 0;
    background: transparent;
    color: #246b91;
    font-size: 21px !important;
  }
  .persistent-workspace__messages {
    flex-shrink: 0;
    min-height: 44px;
    padding: 4px 6px;
    gap: 4px;
    white-space: nowrap;
    font-size: 11px !important;
  }
}
</style>
