<template>
  <section class="home-page planning-home">
    <WorkspacePageHeader
      :title="wt('hello', { name: greetingName })"
      :eyebrow="wt('planningOverview')"
      :description="wt('planningHint')"
      ><template #actions
        ><span class="home-today">{{ todayText }}</span></template
      ></WorkspacePageHeader
    >
    <div class="planning-home-metrics">
      <article>
        <span>{{ wt("cargoTypes") }}</span
        ><strong
          >{{ cargoCount }} <small>{{ wt("typesUnit") }}</small></strong
        >
      </article>
      <article>
        <span>{{ wt("utilization") }}</span
        ><strong>{{ utilizationPercent }}<small>%</small></strong>
      </article>
      <article>
        <span>{{ wt("gap") }}</span
        ><strong>{{ globalGapCm }} <small>cm</small></strong>
      </article>
    </div>
    <div class="planning-home-tasks">
      <RouterLink to="/planner/cargos" class="is-primary"
        ><el-icon><Box /></el-icon
        ><span
          ><strong>{{ wt("planningStart") }}</strong
          ><small>{{ wt("planningStartHint") }}</small></span
        ><el-icon><ArrowRight /></el-icon
      ></RouterLink>
      <RouterLink to="/smart-import"
        ><el-icon><Upload /></el-icon
        ><span
          ><strong>{{ wt("importCargo") }}</strong
          ><small>{{ wt("importCargoHint") }}</small></span
        ><el-icon><ArrowRight /></el-icon
      ></RouterLink>
      <RouterLink to="/algorithm"
        ><el-icon><Document /></el-icon
        ><span
          ><strong>{{ wt("algorithmTitle") }}</strong
          ><small>{{ wt("methodsHint") }}</small></span
        ><el-icon><ArrowRight /></el-icon
      ></RouterLink>
      <RouterLink v-if="user?.role === 'ADMIN'" to="/admin"
        ><el-icon><Setting /></el-icon
        ><span
          ><strong>{{ wt("adminTitle") }}</strong
          ><small>{{ wt("adminHint") }}</small></span
        ><el-icon><ArrowRight /></el-icon
      ></RouterLink>
    </div>
    <DetailSection :title="wt('preferencesSection')" :description="wt('localPreferences')">
      <form @submit.prevent="saveProfile" class="planning-preference-form">
        <div class="home-form-grid">
          <label
            ><span>{{ wt("displayName") }}</span
            ><input v-model.trim="profile.displayName" :placeholder="wt('displayNamePlaceholder')"
          /></label>
          <label
            ><span>{{ wt("defaultUtilization") }}</span
            ><input v-model.number="profile.utilizationPercent" min="75" max="98" type="number"
          /></label>
          <label
            ><span>{{ wt("defaultGap") }}</span
            ><input v-model.number="profile.globalGapCm" min="0" max="8" type="number"
          /></label>
          <label
            ><span>{{ wt("defaultPage") }}</span
            ><el-select
              v-model="profile.startPage"
              class="business-select"
              popper-class="business-select-popper workspace-select-popper"
              ><el-option
                v-for="option in startPageOptions"
                :key="option.value"
                :value="option.value"
                :label="option.label" /></el-select
          ></label>
        </div>
        <div class="home-preference-actions">
          <Transition name="workspace-state"
            ><p v-if="message" class="home-message" role="status">{{ message }}</p></Transition
          ><el-button type="primary" native-type="submit">{{ wt("savePreferences") }}</el-button>
        </div>
      </form>
    </DetailSection>
  </section>
</template>

<script setup>
import WorkspacePageHeader from "./workspace/WorkspacePageHeader.vue";
import DetailSection from "./workspace/DetailSection.vue";
import { wt } from "./workspace/workspaceCopy";
import { Box, Upload, Document, Setting, ArrowRight } from "@element-plus/icons-vue";
import { computed, reactive, ref } from "vue";
import { currentLocale, t } from "../i18n";
import { translateLegacyText } from "../i18n/legacyText";

const STORAGE_KEY = "cargo-planner-user-profile";
const props = defineProps({
  cargoCount: { type: Number, default: 0 },
  utilizationPercent: { type: Number, default: 90 },
  globalGapCm: { type: Number, default: 1 },
  user: { type: Object, default: null }
});
const emit = defineEmits(["save-settings"]);

const profile = reactive(loadProfile());
const message = ref("");
const greetingName = computed(
  () =>
    profile.displayName || props.user?.displayName || props.user?.username || t("portal.operator")
);
const startPageOptions = computed(() => [
  { value: "/home", label: t("homeOptions.workspace") },
  { value: "/planner/cargos", label: t("homeOptions.packing") },
  { value: "/smart-import", label: t("homeOptions.smartImport") }
]);
const todayText = computed(() =>
  new Intl.DateTimeFormat(currentLocale.value === "en-US" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(new Date())
);

function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      displayName: saved.displayName || "",
      utilizationPercent: saved.utilizationPercent ?? props.utilizationPercent,
      globalGapCm: saved.globalGapCm ?? props.globalGapCm,
      startPage: saved.startPage || "/home"
    };
  } catch {
    return {
      displayName: "",
      utilizationPercent: props.utilizationPercent,
      globalGapCm: props.globalGapCm,
      startPage: "/home"
    };
  }
}

function saveProfile() {
  profile.utilizationPercent = clamp(profile.utilizationPercent, 75, 98);
  profile.globalGapCm = clamp(profile.globalGapCm, 0, 8);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  emit("save-settings", {
    displayName: profile.displayName,
    utilizationPercent: profile.utilizationPercent,
    globalGapCm: profile.globalGapCm
  });
  message.value = translateLegacyText("偏好已保存", currentLocale.value);
  window.clearTimeout(saveProfile.timer);
  saveProfile.timer = window.setTimeout(() => (message.value = ""), 1800);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || min)));
}
</script>

<style scoped>
.planning-home {
  display: block;
}
.home-today {
  color: var(--color-muted);
  font-size: 13px;
  padding-top: 8px;
}
.planning-home-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  overflow: hidden;
}
.planning-home-metrics article {
  display: grid;
  gap: 12px;
  padding: 24px;
  border-right: 1px solid var(--color-border);
}
.planning-home-metrics article:last-child {
  border: 0;
}
.planning-home-metrics span {
  color: var(--color-muted);
  font-size: 13px;
}
.planning-home-metrics strong {
  color: var(--color-primary);
  font-size: 32px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.planning-home-metrics small {
  font-size: 14px;
  font-weight: 400;
}
.planning-home-tasks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}
.planning-home-tasks a {
  display: flex;
  align-items: center;
  gap: 18px;
  min-height: 138px;
  padding: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  text-decoration: none;
  background: var(--color-surface);
  color: var(--color-primary);
  transition:
    background 180ms ease,
    border-color 180ms ease,
    transform 180ms ease;
}
.planning-home-tasks a:hover {
  border-color: var(--color-primary);
  transform: translateY(-2px);
}
.planning-home-tasks a > .el-icon {
  font-size: 24px;
}
.planning-home-tasks a > .el-icon:last-child {
  margin-left: auto;
  font-size: 18px;
}
.planning-home-tasks span {
  display: grid;
  gap: 9px;
}
.planning-home-tasks strong {
  font-size: 18px;
  font-weight: 600;
}
.planning-home-tasks small {
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.7;
}
.planning-home-tasks .is-primary {
  background: var(--color-primary);
  color: var(--color-on-primary);
}
.planning-home-tasks .is-primary small {
  color: #cfdee6;
}
.home-form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
}
.home-form-grid label {
  font-size: 13px;
  font-weight: 500;
}
.home-form-grid input {
  min-height: 44px;
  border-radius: var(--radius-control);
}
.home-preference-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 18px;
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid var(--color-border);
}
.home-preference-actions p {
  margin: 0 auto 0 0;
}
@media (max-width: 680px) {
  .planning-home-metrics article {
    padding: 16px 12px;
  }
  .planning-home-metrics strong {
    font-size: 25px;
  }
  .planning-home-tasks,
  .home-form-grid {
    grid-template-columns: 1fr;
  }
  .planning-home-tasks a {
    padding: 20px;
    min-height: 112px;
  }
  .home-preference-actions {
    flex-wrap: wrap;
  }
}
@media (prefers-reduced-motion: reduce) {
  .planning-home-tasks a {
    transition: background 80ms linear;
  }
  .planning-home-tasks a:hover {
    transform: none;
  }
}
</style>
