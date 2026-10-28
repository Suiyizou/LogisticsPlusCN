<script setup lang="ts">
import WorkspacePageHeader from "../../components/workspace/WorkspacePageHeader.vue";
import BrandLockup from "../../components/brand/BrandLockup.vue";
import { useId, ref, watch } from "vue";
import { useMediaQuery } from "../../composables/useMediaQuery.js";
import LanguageSwitcher from "../../components/LanguageSwitcher.vue";
import {
  Bell,
  Refresh,
  User,
  DataAnalysis,
  Document,
  OfficeBuilding,
  Switch,
  Files,
  Monitor,
  Folder,
  Setting
} from "@element-plus/icons-vue";
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
const navId = useId();
const isMobile = useMediaQuery("(max-width: 760px)");
const expandedGroups = ref(new Set(props.navGroups.map((group) => group.key)));
const navIcons = {
  overview: DataAnalysis,
  audit: Document,
  employees: User,
  platform: OfficeBuilding,
  handovers: Switch,
  tickets: Files,
  devices: Monitor,
  files: Folder,
  announcements: Bell,
  system: Setting
};
function toggleGroup(key: string) {
  const next = new Set(expandedGroups.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedGroups.value = next;
  emit("toggle", key);
}
watch(
  () => props.activePage,
  () => {
    const group = props.navGroups.find((group) =>
      group.children.some((item) => item.key === props.activePage)
    );
    if (group) expandedGroups.value = new Set([...expandedGroups.value, group.key]);
  }
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

      <nav class="admin-console-nav" :aria-label="copy.navigationLabel">
        <section
          v-for="group in navGroups"
          :key="group.key"
          class="admin-nav-accordion"
          :class="{ current: group.children.some((item) => item.key === activePage) }"
        >
          <button
            class="admin-nav-group-trigger"
            :disabled="busy"
            type="button"
            :aria-expanded="isMobile || expandedGroups.has(group.key)"
            :aria-controls="`${navId}-${group.key}`"
            @click="toggleGroup(group.key)"
          >
            <span>{{ group.no }}</span>
            <b>{{ group.label }}</b>
            <small>{{ group.description }}</small>
            <i aria-hidden="true"></i>
          </button>
          <Transition name="admin-nav-fold">
            <div
              v-if="isMobile || expandedGroups.has(group.key)"
              :id="`${navId}-${group.key}`"
              class="admin-nav-children"
            >
              <button
                v-for="item in group.children"
                :key="item.key"
                class="admin-nav-child"
                :disabled="busy"
                type="button"
                :class="{ active: activePage === item.key }"
                :aria-current="activePage === item.key ? 'page' : undefined"
                @click="emit('select', item.key)"
              >
                <el-icon
                  ><component :is="navIcons[item.key as keyof typeof navIcons] || Document"
                /></el-icon>
                <b>{{ item.label }}</b>
                <small>{{ item.description }}</small>
              </button>
            </div>
          </Transition>
        </section>
      </nav>
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
