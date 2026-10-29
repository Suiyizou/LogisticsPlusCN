<script setup>
import { computed, ref, useId, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { Box, Location, Briefcase, Setting, Grid, ArrowRight } from "@element-plus/icons-vue";
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
const trackingBase = import.meta.env.VITE_TRACKING_WORKBENCH_URL || "/tracking/";
function trackingHref(view) {
  const url = new URL(trackingBase, window.location.origin);
  url.hash = view;
  return url.href;
}
const groups = computed(() => {
  if (!["ADMIN", "BUSINESS", "OVERSEA_AGENT"].includes(role.value)) return [];
  const business = modulesForRole(role.value, configuredPlatformModules);
  const admin = modulesForSurface(configuredPlatformModules, "admin", role.value);
  return [
    {
      key: "tracking",
      icon: Location,
      items: [
        { key: "overview", label: copy.value.overview, href: trackingHref("overview") },
        { key: "query", label: copy.value.query, href: trackingHref("tracking") }
      ]
    },
    {
      key: "planning",
      icon: Box,
      items: [
        { key: "cargos", label: copy.value.cargos, to: "/planner/cargos" },
        { key: "smart-import", label: copy.value.smartImport, to: "/planner/cargos?import=smart" },
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
            icon: Briefcase,
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
            icon: Setting,
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
  if (item.key === "smart-import")
    return route.path === "/planner/cargos" && route.query.import === "smart";
  if (item.key === "cargos" && route.query.import === "smart") return false;
  return item.to && (currentPath.value === item.to || currentPath.value.startsWith(`${item.to}/`));
}
const openGroups = ref(new Set());
const mobileOpen = ref(false);
watch(
  () => [currentPath.value, props.activeAdminPage, groups.value],
  () => {
    const current = groups.value.find((group) => group.items.some(isCurrent));
    if (current) openGroups.value = new Set([...openGroups.value, current.key]);
  },
  { immediate: true }
);
watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false;
  }
);
function toggle(key) {
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
    openGroups.value = new Set([...openGroups.value].filter((value) => value !== key));
    button.focus();
  } else if (event.key === "ArrowRight" && event.target === button) {
    event.preventDefault();
    openGroups.value = new Set([...openGroups.value, key]);
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
      <Grid /><span>{{ copy.menu }}</span
      ><small>{{ mobileOpen ? copy.collapse : copy.expand }}</small
      ><ArrowRight :class="{ 'is-open': mobileOpen }" />
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
        ><Grid /><span>{{ copy.home }}</span></RouterLink
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
          <component :is="group.icon" /><span>{{ copy[group.key] }}</span
          ><ArrowRight class="workspace-navigation__chevron" />
        </button>
        <div
          :id="`${id}-${group.key}`"
          v-show="openGroups.has(group.key)"
          class="workspace-navigation__children"
        >
          <a
            v-for="item in group.items"
            :key="item.key"
            :href="item.href || router.resolve(item.to).href"
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
        </div>
      </section>
    </nav>
  </div>
</template>

<style scoped>
.workspace-navigation {
  width: 100%;
  min-width: 0;
  color: #d4e1e9;
}
.workspace-navigation__nav {
  display: grid;
  align-content: start;
  gap: 5px;
  margin: 0;
  overflow: visible;
}
.workspace-navigation__mobile {
  display: none;
}
.workspace-navigation__group {
  border-bottom: 1px solid #ffffff18;
  padding-bottom: 6px;
  min-width: 0;
}
.workspace-navigation :is(.workspace-navigation__home, .workspace-navigation__trigger) {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  margin: 0;
  padding: 11px 12px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  text-decoration: none;
  cursor: pointer;
  text-align: left;
  box-sizing: border-box;
}
.workspace-navigation :is(.workspace-navigation__home, .workspace-navigation__trigger) > svg {
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
}
.workspace-navigation__home {
  margin-bottom: 12px !important;
}
.workspace-navigation__trigger > span {
  flex: 1;
}
.workspace-navigation__trigger > .workspace-navigation__chevron {
  flex-basis: 13px !important;
  width: 13px !important;
  height: 13px !important;
  transition: transform 180ms ease;
}
.workspace-navigation__trigger[aria-expanded="true"] .workspace-navigation__chevron {
  transform: rotate(90deg);
}
.workspace-navigation__group.is-current > .workspace-navigation__trigger {
  color: white;
}
.workspace-navigation__children {
  display: grid;
  gap: 2px;
  padding: 2px 0 8px;
}
.workspace-navigation a.workspace-navigation__link {
  display: flex;
  align-items: center;
  min-height: 44px;
  margin: 0;
  padding: 10px 12px 10px 44px;
  border: 0;
  border-left: 2px solid transparent;
  border-radius: 2px;
  background: transparent;
  color: #c4d4df;
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  text-decoration: none;
  box-sizing: border-box;
}
.workspace-navigation :is(a, button):hover {
  color: #fff;
  background: #ffffff0c;
}
.workspace-navigation a.is-active,
.workspace-navigation__home[aria-current] {
  border-left: 2px solid var(--color-accent, #c67556);
  color: white;
  background: #ffffff15;
}
.workspace-navigation a.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.workspace-navigation :is(a, button):focus-visible {
  outline: 2px solid #e1ab82;
  outline-offset: -2px;
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
    background: var(--color-primary, #102c40);
    box-shadow: 6px 8px 24px #071a2e33;
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
    border: 1px solid #ffffff30;
    border-radius: 3px;
    background: transparent;
    color: white;
    font: inherit;
    font-size: 13px;
    text-align: left;
  }
  .workspace-navigation__mobile > svg {
    width: 18px;
    height: 18px;
  }
  .workspace-navigation__mobile > small {
    margin-left: auto;
    font-size: 12px;
    color: #c4d4df;
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
    grid-column: 1 / -1;
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
  .workspace-navigation__chevron {
    transition: none !important;
  }
}
</style>
