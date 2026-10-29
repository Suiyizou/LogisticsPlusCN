<script setup lang="ts">
import WorkspaceNavigation from "../../components/workspace/WorkspaceNavigation.vue";
import WorkspacePageHeader from "../../components/workspace/WorkspacePageHeader.vue";
import BrandLockup from "../../components/brand/BrandLockup.vue";
import { computed } from "vue";
import LanguageSwitcher from "../../components/LanguageSwitcher.vue";
import { Bell, Refresh, User } from "@element-plus/icons-vue";
import { RouterLink } from "vue-router";
import type { WorkspaceUser } from "../../types/workspace";
import type { AdminConsoleCopy, AdminNavGroup, AdminPageMeta } from "../../types/adminShell";
const props = withDefaults(
  defineProps<{
    currentUser: WorkspaceUser;
    displayName: string;
    navGroups: AdminNavGroup[];
    activePage: string;
    expandedGroup: string;
    meta: AdminPageMeta;
    busy: boolean;
    message: string;
    hasError: boolean;
    announcementCount: number;
    systemMessages: string;
    copy: AdminConsoleCopy;
    transitioning?: boolean;
  }>(),
  { transitioning: false }
);
const emit = defineEmits<{
  select: [page: string];
  toggle: [group: string];
  refresh: [];
  logout: [];
  "open-announcements": [];
}>();
const navigationItems = computed(() =>
  props.navGroups.flatMap((group) =>
    group.children.map((item) => ({
      key: item.key,
      adminKey: item.key,
      label: item.label,
      to: `/admin/${item.key}`
    }))
  )
);
function refresh() {
  if (!props.busy) emit("refresh");
}
</script>
<template>
  <section class="admin-console-shell" :class="{ 'is-table-page-switching': transitioning }">
    <aside class="admin-console-sidebar">
      <BrandLockup class="admin-console-brand" href="/workbenches" compact inverse />

      <div class="admin-profile-card">
        <span>{{ copy.currentAdmin }}</span>
        <strong>{{ displayName }}</strong>
        <small
          >{{ currentUser.username }} ·
          {{ copy.roleLabels[currentUser.role] || currentUser.role }}</small
        >
      </div>

      <WorkspaceNavigation
        :role="currentUser.role"
        :admin-items="navigationItems"
        :active-admin-page="activePage"
        :busy="busy"
        @admin-select="emit('select', $event)"
      />
    </aside>

    <main class="admin-console-main">
      <header class="admin-app-bar">
        <RouterLink to="/workbenches">{{ copy.switchWorkbench }}</RouterLink
        ><span aria-hidden="true">/</span><strong>{{ meta.title }}</strong>
        <div class="admin-app-bar-actions">
          <LanguageSwitcher /><button
            type="button"
            class="admin-system-message-button"
            :aria-label="systemMessages"
            @click="emit('open-announcements')"
          >
            <el-icon><Bell /></el-icon
            ><em v-if="announcementCount">{{ announcementCount }}</em></button
          ><span class="admin-app-avatar"
            ><el-icon><User /></el-icon></span
          ><span class="admin-app-account"
            ><strong>{{ displayName }}</strong
            ><small>{{ copy.roleLabels[currentUser.role] || currentUser.role }}</small></span
          ><button type="button" @click="emit('logout')">{{ copy.logout }}</button>
        </div>
      </header>
      <WorkspacePageHeader
        class="admin-console-page-head"
        :title="meta.title"
        :eyebrow="meta.eyebrow"
        :description="meta.subtitle"
        ><template #actions
          ><div class="admin-top-actions">
            <button type="button" :disabled="busy" data-i18n-ignore @click="refresh">
              <el-icon><Refresh /></el-icon>{{ busy ? copy.refreshing : copy.refresh }}
            </button>
          </div></template
        ></WorkspacePageHeader
      >

      <Transition name="workspace-state"
        ><p
          v-if="message"
          class="admin-message"
          :class="{ error: hasError }"
          :role="hasError ? 'alert' : 'status'"
          :aria-live="hasError ? 'assertive' : 'polite'"
        >
          {{ message }}
        </p></Transition
      >

      <slot />
    </main>
  </section>
</template>
<style scoped src="./adminConsoleShellStyles.css"></style>
