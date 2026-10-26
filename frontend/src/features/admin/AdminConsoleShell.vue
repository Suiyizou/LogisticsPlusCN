<script setup lang="ts">
import { useId } from "vue";
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
function refresh() {
  if (!props.busy) emit("refresh");
}
</script>
<template>
  <section class="admin-console-shell" :class="{ 'is-table-page-switching': transitioning }">
    <aside class="admin-console-sidebar">
      <RouterLink class="admin-console-brand" to="/workbenches">
        <span class="brand-mark"><img src="/favicon.svg" alt="" /></span>
        <div>
          <p>Browser / Server</p>
          <strong>{{ copy.adminTitle }}</strong>
        </div>
      </RouterLink>

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
            :aria-expanded="expandedGroup === group.key"
            :aria-controls="`${navId}-${group.key}`"
            @click="emit('toggle', group.key)"
          >
            <span>{{ group.no }}</span>
            <b>{{ group.label }}</b>
            <small>{{ group.description }}</small>
            <i aria-hidden="true"></i>
          </button>
          <Transition name="admin-nav-fold">
            <div
              v-if="expandedGroup === group.key"
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
                <span>{{ item.no }}</span>
                <b>{{ item.label }}</b>
                <small>{{ item.description }}</small>
              </button>
            </div>
          </Transition>
        </section>
      </nav>
    </aside>

    <main class="admin-console-main">
      <header class="admin-console-topbar">
        <div>
          <p>{{ meta.eyebrow }}</p>
          <h1>{{ meta.title }}</h1>
          <span>{{ meta.subtitle }}</span>
        </div>
        <div class="admin-top-actions">
          <button
            class="admin-system-message-button"
            type="button"
            @click="emit('open-announcements')"
          >
            {{ systemMessages }}
            <em v-if="announcementCount > 0">{{
              announcementCount > 99 ? "99+" : announcementCount
            }}</em>
          </button>
          <button type="button" :disabled="busy" @click="refresh">
            {{ busy ? copy.refreshing : copy.refresh }}
          </button>
          <button type="button" @click="emit('logout')">{{ copy.logout }}</button>
        </div>
      </header>

      <p
        v-if="message"
        class="admin-message"
        :class="{ error: hasError }"
        :role="hasError ? 'alert' : 'status'"
        :aria-live="hasError ? 'assertive' : 'polite'"
      >
        {{ message }}
      </p>

      <slot />
    </main>
  </section>
</template>
<style scoped src="./adminConsoleShellStyles.css"></style>
