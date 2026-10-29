<script setup>
import { computed, ref, useId, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import WorkspaceIcon from "./WorkspaceIcon.vue";
import { currentLocale, t } from "../../i18n";
import { workspaceNavigationMessages } from "../../i18n/workspaceNavigationMessages.js";
import { configuredPlatformModules } from "../../modules/configuredRegistry.js";
import { modulesForRole } from "../../modules/registry.js";
import { modulesForSurface } from "../../modules/moduleCatalog.js";
import { adminNavigation } from "../../features/admin/adminNavigation.js";

const props = defineProps({
  role: { type: String, default: "" },
  activeIndex: { type: String, default: "" },
  disableResults: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  interceptNavigation: { type: Boolean, default: false },
  adminItems: { type: Array, default: null },
  activeAdminPage: { type: String, default: "" },
  busy: { type: Boolean, default: false }
});
const emit = defineEmits(["navigate", "admin-select"]);
const route = useRoute();
const router = useRouter();
const id = useId();
const copy = computed(
  () => workspaceNavigationMessages[currentLocale.value] || workspaceNavigationMessages["en-US"]
);
const role = computed(() => props.role);
const groups = computed(() => {
  if (!["ADMIN", "BUSINESS", "OVERSEA_AGENT"].includes(role.value)) return [];
  const business = modulesForRole(role.value, configuredPlatformModules);
  const admin = modulesForSurface(configuredPlatformModules, "admin", role.value);
  return [
    {
      key: "tracking",
      icon: "tracking",
      items: [
        { key: "overview", label: copy.value.overview, to: "/workspace/tracking/overview" },
        { key: "query", label: copy.value.query, to: "/workspace/tracking/query" },
        ...(role.value === "OVERSEA_AGENT"
          ? []
          : [
              {
                key: "tracking-batch",
                label: copy.value.batchTasks,
                children: [
                  {
                    key: "tracking-tasks",
                    label: copy.value.taskList,
                    to: "/workspace/tracking/tasks"
                  }
                ]
              }
            ])
      ]
    },
    {
      key: "planning",
      icon: "box",
      items: [
        { key: "cargos", label: copy.value.cargos, to: "/planner/cargos" },
        {
          key: "smart-import",
          label: copy.value.smartImport,
          children: [
            { key: "import-excel", label: copy.value.importExcel, to: "/smart-import/excel" },
            { key: "import-image", label: copy.value.importImage, to: "/smart-import/image" },
            { key: "import-text", label: copy.value.importText, to: "/smart-import/text" }
          ]
        },
        {
          key: "results",
          label: copy.value.results,
          to: "/planner/results",
          disabled: props.disableResults
        },
        { key: "config", label: copy.value.config, to: "/planner/config" },
        { key: "algorithm", label: copy.value.algorithm, to: "/algorithm" },
        { key: "equipment", label: copy.value.equipment, to: "/containers" }
      ]
    },
    ...(business.length
      ? [
          {
            key: "business",
            icon: "business",
            items: business.map((module) => ({
              key: module.id,
              label: t(module.labelKey),
              to: `/customers/${module.mount}`
            }))
          }
        ]
      : []),
    ...(role.value === "ADMIN"
      ? [
          {
            key: "admin",
            icon: "settings",
            items:
              props.adminItems ||
              adminNavigation(currentLocale.value, t, configuredPlatformModules).pages.map(
                (page) => ({
                  key: page.key,
                  label: page.label,
                  to: `/admin/${admin.find((module) => module.id === page.moduleId)?.mount || page.key}`
                })
              )
          }
        ]
      : [])
  ];
});
const currentPath = computed(() => props.activeIndex || route.path);
function isCurrent(item) {
  if (props.activeAdminPage && item.adminKey) return item.adminKey === props.activeAdminPage;
  if (item.children) return item.children.some(isCurrent);
  if (item.key === "cargos" && route.query.import === "smart") return false;
  return item.to && (currentPath.value === item.to || currentPath.value.startsWith(`${item.to}/`));
}
const openGroups = ref(new Set());
const mobileOpen = ref(false);
watch(
  () => [currentPath.value, props.activeAdminPage, groups.value],
  () => {
    const current = groups.value.find((group) => group.items.some(isCurrent));
    if (current) {
      const nested = current.items.find((item) => item.children?.some(isCurrent));
      openGroups.value = new Set([current.key, ...(nested ? [nested.key] : [])]);
    }
  },
  { immediate: true }
);
watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false;
  }
);
function expandGroup(key) {
  openGroups.value = new Set([
    key,
    ...(key === "planning" && openGroups.value.has("smart-import") ? ["smart-import"] : [])
  ]);
}
function toggle(key) {
  if (groups.value.some((group) => group.key === key)) {
    if (openGroups.value.has(key)) openGroups.value = new Set();
    else expandGroup(key);
    return;
  }
  const next = new Set(openGroups.value);
  next.has(key) ? next.delete(key) : next.add(key);
  openGroups.value = next;
}
function navigate(event, item) {
  if (item.disabled || (item.adminKey && props.busy)) {
    event.preventDefault();
    return;
  }
  if (
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button > 0
  )
    return;
  mobileOpen.value = false;
  if (item.href) return;
  event.preventDefault();
  if (item.adminKey) {
    emit("admin-select", item.adminKey);
  } else if (props.interceptNavigation) emit("navigate", item.to);
  else void router.push(item.to);
}
function keydown(event) {
  const group = event.target.closest(".workspace-navigation__group");
  if (!group) return;
  const button = group.querySelector(".workspace-navigation__trigger");
  const key = group.dataset.group;
  if (event.key === "Escape" || (event.key === "ArrowLeft" && event.target === button)) {
    event.preventDefault();
    openGroups.value = new Set();
    button.focus();
  } else if (event.key === "ArrowRight" && event.target === button) {
    event.preventDefault();
    expandGroup(key);
  }
}
</script>

<template>
  <div class="workspace-navigation" :class="{ 'is-compact': compact }" data-i18n-ignore>
    <button
      class="workspace-navigation__mobile"
      type="button"
      :aria-expanded="mobileOpen"
      :aria-controls="id"
      @click="mobileOpen = !mobileOpen"
    >
      <WorkspaceIcon name="grid" /><span>{{ copy.menu }}</span
      ><small>{{ mobileOpen ? copy.collapse : copy.expand }}</small
      ><WorkspaceIcon name="chevron" :class="{ 'is-open': mobileOpen }" />
    </button>
    <nav
      :id="id"
      class="workspace-navigation__nav"
      :class="{ 'is-mobile-open': mobileOpen }"
      :aria-label="copy.label"
      @keydown="keydown"
    >
      <RouterLink
        to="/workbenches"
        class="workspace-navigation__home"
        :aria-current="route.path === '/workbenches' ? 'page' : undefined"
        ><WorkspaceIcon name="grid" /><span>{{ copy.home }}</span></RouterLink
      >
      <section
        v-for="group in groups"
        :key="group.key"
        class="workspace-navigation__group"
        :class="{ 'is-current': group.items.some(isCurrent) }"
        :data-group="group.key"
      >
        <button
          type="button"
          class="workspace-navigation__trigger"
          :aria-expanded="openGroups.has(group.key)"
          :aria-controls="`${id}-${group.key}`"
          :title="compact ? copy[group.key] : undefined"
          @click="toggle(group.key)"
        >
          <WorkspaceIcon :name="group.icon" /><span>{{ copy[group.key] }}</span
          ><WorkspaceIcon name="chevron" class="workspace-navigation__chevron" />
        </button>
        <div
          :id="`${id}-${group.key}`"
          v-show="openGroups.has(group.key)"
          class="workspace-navigation__children"
        >
          <template v-for="item in group.items" :key="item.key">
            <div v-if="item.children" class="workspace-navigation__subgroup">
              <button
                type="button"
                class="workspace-navigation__subtrigger"
                :aria-expanded="openGroups.has(item.key)"
                :aria-controls="`${id}-${item.key}`"
                @click="toggle(item.key)"
              >
                <span>{{ item.label }}</span
                ><WorkspaceIcon name="chevron" :class="{ 'is-open': openGroups.has(item.key) }" />
              </button>
              <div
                v-show="openGroups.has(item.key)"
                :id="`${id}-${item.key}`"
                class="workspace-navigation__subchildren"
              >
                <RouterLink
                  v-for="child in item.children"
                  :key="child.key"
                  :to="child.to"
                  class="workspace-navigation__link"
                  :class="{ 'is-active': isCurrent(child) }"
                  :aria-current="isCurrent(child) ? 'page' : undefined"
                  >{{ child.label }}</RouterLink
                >
              </div>
            </div>
            <a
              v-else
              :href="router.resolve(item.to).href"
              class="workspace-navigation__link"
              :class="{
                'is-active': isCurrent(item),
                'is-disabled': item.disabled || (item.adminKey && busy)
              }"
              :aria-current="isCurrent(item) ? 'page' : undefined"
              :aria-disabled="item.disabled || (item.adminKey && busy) ? 'true' : undefined"
              :tabindex="item.disabled || (item.adminKey && busy) ? -1 : undefined"
              @click="navigate($event, item)"
              >{{ item.label }}</a
            >
          </template>
        </div>
      </section>
    </nav>
  </div>
</template>

<style scoped>
.workspace-navigation {
  width: 100%;
  min-width: 0;
  color: var(--color-secondary);
}
.workspace-navigation__nav {
  display: grid;
  align-content: start;
  gap: 12px;
  margin: 0;
}
.workspace-navigation__mobile {
  display: none;
}
.workspace-navigation__group {
  min-width: 0;
}
.workspace-navigation :is(.workspace-navigation__home, .workspace-navigation__trigger) {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 48px;
  margin: 0;
  padding: 11px 18px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 15px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  text-align: left;
  box-sizing: border-box;
}
.workspace-navigation :is(.workspace-navigation__home, .workspace-navigation__trigger) > svg {
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
}
.workspace-navigation__home {
  margin-bottom: 4px !important;
}
.workspace-navigation__trigger > span {
  flex: 1;
}
.workspace-navigation__trigger > .workspace-navigation__chevron {
  flex-basis: 12px !important;
  width: 12px !important;
  height: 12px !important;
  transition: transform 180ms ease;
}
.workspace-navigation__trigger[aria-expanded="true"] .workspace-navigation__chevron {
  transform: rotate(90deg);
}
.workspace-navigation__group.is-current > .workspace-navigation__trigger {
  color: var(--color-primary);
  font-weight: 600;
}
.workspace-navigation__children {
  display: grid;
  gap: 2px;
  padding: 3px 0 5px;
}
.workspace-navigation a.workspace-navigation__link {
  display: flex;
  align-items: center;
  min-height: 44px;
  margin: 0;
  padding: 10px 14px 10px 56px;
  border: 0;
  border-left: 2px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--color-secondary);
  font: inherit;
  font-size: 14px;
  line-height: 1.6;
  text-decoration: none;
  box-sizing: border-box;
}
.workspace-navigation :is(a, button):hover {
  color: var(--color-primary);
  background: #f4f8ff;
}
.workspace-navigation a.is-active,
.workspace-navigation__home[aria-current] {
  color: var(--color-primary);
  background: var(--color-accent-soft);
  border-left-color: var(--color-primary);
  font-weight: 600;
}
.workspace-navigation a.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.workspace-navigation :is(a, button):focus-visible {
  outline: 2px solid var(--color-ring);
  outline-offset: -2px;
}
.workspace-navigation__subtrigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  border: 0;
  padding: 10px 18px 10px 56px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.workspace-navigation__subtrigger span {
  flex: 1;
}
.workspace-navigation__subtrigger svg {
  width: 12px;
  height: 12px;
  transition: transform 180ms ease;
}
.workspace-navigation__subtrigger svg.is-open {
  transform: rotate(90deg);
}
.workspace-navigation__subchildren a.workspace-navigation__link {
  padding-left: 70px;
  font-size: 14px;
}
.workspace-navigation__link,
.workspace-navigation__trigger span {
  overflow-wrap: anywhere;
}
@media (min-width: 761px) {
  .is-compact .workspace-navigation__trigger > span,
  .is-compact .workspace-navigation__home > span {
    display: none;
  }
  .is-compact .workspace-navigation__trigger {
    gap: 3px;
    padding-inline: 8px;
  }
  .is-compact .workspace-navigation__children {
    position: absolute;
    left: 62px;
    z-index: 20;
    width: 220px;
    padding: 6px;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: var(--color-surface);
    box-shadow: var(--shadow-overlay);
  }
  .is-compact .workspace-navigation__link {
    padding-left: 16px !important;
  }
  .is-compact .workspace-navigation__group {
    position: relative;
  }
}
@media (max-width: 850px) {
  .workspace-navigation__mobile {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: 7px;
    background: white;
    color: var(--color-foreground);
    font: inherit;
    font-size: 14px;
    text-align: left;
  }
  .workspace-navigation__mobile > svg {
    width: 18px;
    height: 18px;
  }
  .workspace-navigation__mobile > small {
    margin-left: auto;
    font-size: 12px;
    color: var(--color-muted);
  }
  .workspace-navigation__mobile > .is-open {
    transform: rotate(90deg);
  }
  .workspace-navigation__nav {
    display: none;
  }
  .workspace-navigation__nav.is-mobile-open {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-top: 10px;
    gap: 8px;
  }
  .workspace-navigation__home {
    grid-column: 1/-1;
    margin-bottom: 0 !important;
  }
  .workspace-navigation a.workspace-navigation__link {
    padding-left: 18px;
    white-space: normal;
  }
}
@media (max-width: 480px) {
  .workspace-navigation__nav.is-mobile-open {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (prefers-reduced-motion: reduce) {
  .workspace-navigation__chevron,
  .workspace-navigation__subtrigger svg {
    transition: none !important;
  }
}
</style>
