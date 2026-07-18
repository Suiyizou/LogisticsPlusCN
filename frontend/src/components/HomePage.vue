<template>
  <section class="home-page">
    <div class="home-hero">
      <div>
        <p>Workspace</p>
        <h2>你好，{{ greetingName }}，今天要做些什么呢？</h2>
        <span>常用任务和个人设置都放在这里，后续登录账号后可以同步到员工自己的工作区。</span>
      </div>
      <div class="home-clock">
        <strong>{{ todayText }}</strong>
        <small>货代装箱体积规划系统</small>
      </div>
    </div>

    <div class="home-quick-grid">
      <RouterLink class="home-action-card primary" to="/planner/config">
        <span>开始装箱计算</span>
        <strong>录入货物、选择箱型并查看三维摆放</strong>
      </RouterLink>
      <RouterLink class="home-action-card" to="/smart-import">
        <span>智能导入</span>
        <strong>手动校验或粘贴文本智能识别</strong>
      </RouterLink>
      <RouterLink class="home-action-card" to="/algorithm">
        <span>查看算法说明</span>
        <strong>理解 LAFF、极点和局部搜索流程</strong>
      </RouterLink>
      <RouterLink class="home-action-card" to="/admin">
        <span>管理后台</span>
        <strong>员工账号、设备登录和运行监控</strong>
      </RouterLink>
    </div>

    <div class="home-grid">
      <article class="home-card">
        <strong>个人工作偏好</strong>
        <div class="home-form-grid">
          <label>
            <span>显示名称</span>
            <input v-model.trim="profile.displayName" placeholder="例如：张三" />
          </label>
          <label>
            <span>默认可用率</span>
            <input v-model.number="profile.utilizationPercent" min="75" max="98" type="number" />
          </label>
          <label>
            <span>默认货物间隙 cm</span>
            <input v-model.number="profile.globalGapCm" min="0" max="8" type="number" />
          </label>
          <label>
            <span>默认首页</span>
            <el-select
              v-model="profile.startPage"
              class="business-select"
              popper-class="business-select-popper"
            >
              <el-option
                v-for="option in startPageOptions"
                :key="option.value"
                :value="option.value"
                :label="option.label"
              />
            </el-select>
          </label>
        </div>
        <button class="primary" type="button" @click="saveProfile">保存偏好</button>
        <p v-if="message" class="home-message">{{ message }}</p>
      </article>

      <article class="home-card">
        <strong>当前工作概览</strong>
        <div class="home-stat-list">
          <div>
            <span>当前货物类型</span>
            <b>{{ cargoCount }} 类</b>
          </div>
          <div>
            <span>计划可用率</span>
            <b>{{ utilizationPercent }}%</b>
          </div>
          <div>
            <span>货物间隙</span>
            <b>{{ globalGapCm }} cm</b>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
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
const greetingName = computed(() => profile.displayName || props.user?.displayName || props.user?.username || "操作员");
const startPageOptions = computed(() => [
  { value: "/home", label: t("homeOptions.workspace") },
  { value: "/planner/config", label: t("homeOptions.packing") },
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
