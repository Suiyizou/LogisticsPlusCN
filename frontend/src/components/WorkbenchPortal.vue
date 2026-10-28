<template>
  <main class="workbench-portal" data-i18n-ignore>
    <aside class="portal-sidebar">
      <BrandLockup href="/workbenches" compact inverse />
      <p class="portal-sidebar-label">{{ t("maritime.operations") }}</p>
      <nav :aria-label="t('portal.sectionAria')">
        <RouterLink to="/workbenches" class="is-active" aria-current="page">{{
          t("maritime.workspace")
        }}</RouterLink>
        <RouterLink to="/planner/config">{{ t("portal.planner.title") }}</RouterLink>
        <a :href="trackingWorkbenchUrl" target="_blank" rel="noopener noreferrer">{{
          t("portal.tracking.title")
        }}</a>
        <RouterLink
          v-if="['BUSINESS', 'ADMIN', 'OVERSEA_AGENT'].includes(currentUser?.role)"
          to="/customers"
          >{{ t("portal.customerWorkspace") }}</RouterLink
        >
        <RouterLink v-if="currentUser?.role === 'ADMIN'" to="/admin">{{
          t("portal.adminConsole")
        }}</RouterLink>
      </nav>
      <div class="portal-sidebar-user">
        <strong>{{ displayName }}</strong
        ><small>{{ roleLabel }}</small>
      </div>
    </aside>
    <header class="portal-header">
      <span class="portal-header-title">{{ t("maritime.workspace") }}</span>

      <div class="portal-header-actions">
        <div class="portal-live-status">
          <span>{{ roleLabel }}</span>
        </div>
        <LanguageSwitcher class="portal-language" />
        <RouterLink v-if="currentUser?.role === 'ADMIN'" class="portal-admin-link" to="/admin">
          {{ t("portal.adminConsole") }}
        </RouterLink>
        <RouterLink
          v-if="['BUSINESS', 'ADMIN', 'OVERSEA_AGENT'].includes(currentUser?.role)"
          class="portal-admin-link portal-customer-link"
          to="/customers"
        >
          {{ t("portal.customerWorkspace") }}
        </RouterLink>
        <button
          class="portal-message-button"
          type="button"
          :aria-label="systemMessageLabel"
          @click="emit('open-announcements')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Zm4 12h4" />
          </svg>
          <span>{{ systemMessageLabel }}</span>
          <b v-if="announcementCount">{{ announcementCount > 99 ? "99+" : announcementCount }}</b>
        </button>
        <el-dropdown trigger="click" placement="bottom-end" popper-class="portal-account-popper">
          <button
            class="portal-user portal-account-trigger"
            type="button"
            :aria-label="t('portal.personalInfo')"
          >
            <span class="portal-avatar">{{ userInitial }}</span>
            <span class="portal-user-copy">
              <strong>{{ displayName }}</strong>
              <small>{{ roleLabel }}</small>
            </span>
            <svg class="portal-account-chevron" viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 6 4 4 4-4" />
            </svg>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="openProfileDialog">{{
                t("portal.personalInfo")
              }}</el-dropdown-item>
              <el-dropdown-item @click="openPasswordDialog">{{
                t("portal.changePassword")
              }}</el-dropdown-item>
              <el-dropdown-item class="portal-account-menu-logout" divided @click="emit('logout')">
                {{ t("portal.logout") }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>

    <section class="portal-content">
      <WorkspacePageHeader
        :title="t('portal.greeting', { name: displayName })"
        eyebrow="OPERATIONS PORTAL"
        :description="t('portal.heroDescription')"
        ><template #meta
          ><span class="portal-today">{{ todayText }}</span
          ><WorkspaceStatus :label="roleLabel" /></template
      ></WorkspacePageHeader>

      <button class="portal-task-row" type="button" @click="emit('open-announcements')">
        <span
          ><small>{{ t("customers.systemMessages") }}</small
          ><strong>{{ systemMessageLabel }}</strong></span
        >
        <b>{{ announcementCount }}</b>
        <svg viewBox="0 0 22 22" aria-hidden="true"><path d="M4 11h13m-5-5 5 5-5 5" /></svg>
      </button>

      <section class="portal-workbench-section" :aria-label="t('portal.sectionAria')">
        <header class="portal-section-head">
          <div>
            <span>{{ t("portal.sectionEyebrow") }}</span>
            <h2>{{ t("portal.sectionTitle") }}</h2>
          </div>
          <p>{{ t("portal.sectionDescription") }}</p>
        </header>

        <div
          class="portal-card-grid"
          :class="{
            'has-customer-card': ['BUSINESS', 'ADMIN', 'OVERSEA_AGENT'].includes(currentUser?.role)
          }"
        >
          <RouterLink
            class="portal-workbench-card portal-workbench-card--planner"
            to="/planner/config"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div class="portal-card-topline">
              <span>01 / LOAD PLANNING</span>
            </div>
            <div class="portal-card-body">
              <div class="portal-card-icon" aria-hidden="true">
                <svg viewBox="0 0 88 88">
                  <path class="icon-panel" d="m11 28 34-17 32 17v36L43 79 11 62z" />
                  <path d="m11 28 32 17 34-17M43 45v34M27 36l33-17M22 54l10 5m4-2 10 5m4-2 10 5" />
                </svg>
              </div>
              <div class="portal-card-copy">
                <span class="portal-card-label">{{ t("portal.planner.label") }}</span>
                <h3>{{ t("portal.planner.title") }}</h3>
                <p>{{ t("portal.planner.description") }}</p>
              </div>
            </div>
            <div class="portal-card-features">
              <span>{{ t("portal.planner.featurePacking") }}</span>
              <span>{{ t("portal.planner.featureBalance") }}</span>
              <span>{{ t("portal.planner.featureReport") }}</span>
            </div>
            <div class="portal-card-action">
              <span>{{ t("portal.enterWorkbench") }}</span>
              <svg viewBox="0 0 22 22" aria-hidden="true"><path d="M4 11h13m-5-5 5 5-5 5" /></svg>
            </div>
          </RouterLink>

          <a
            class="portal-workbench-card portal-workbench-card--tracking"
            :href="trackingWorkbenchUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div class="portal-card-topline">
              <span>02 / SHIPMENT VISIBILITY</span>
            </div>
            <div class="portal-card-body">
              <div class="portal-card-icon" aria-hidden="true">
                <svg viewBox="0 0 88 88">
                  <circle class="icon-panel" cx="44" cy="44" r="32" />
                  <path
                    d="M19 48c12-15 22-21 33-14 8 5 10 13 17 8M44 12c-2 14 3 21 14 26M31 18c5 8 5 16-1 24s-7 16-1 25M17 59h54"
                  />
                  <circle cx="20" cy="48" r="4" />
                  <circle cx="69" cy="42" r="4" />
                </svg>
              </div>
              <div class="portal-card-copy">
                <span class="portal-card-label">{{ t("portal.tracking.label") }}</span>
                <h3>{{ t("portal.tracking.title") }}</h3>
                <p>{{ t("portal.tracking.description") }}</p>
              </div>
            </div>
            <div class="portal-card-features">
              <span>{{ t("portal.tracking.featureReferences") }}</span>
              <span>{{ t("portal.tracking.featureRoute") }}</span>
              <span>{{ t("portal.tracking.featureChannels") }}</span>
            </div>
            <div class="portal-card-action">
              <span>{{ t("portal.enterWorkbench") }}</span>
              <svg viewBox="0 0 22 22" aria-hidden="true"><path d="M4 11h13m-5-5 5 5-5 5" /></svg>
            </div>
          </a>

          <RouterLink
            v-if="['BUSINESS', 'ADMIN', 'OVERSEA_AGENT'].includes(currentUser?.role)"
            class="portal-workbench-card portal-workbench-card--customers"
            to="/customers"
          >
            <div class="portal-card-topline">
              <span>03 / CUSTOMER OPERATIONS</span>
            </div>
            <div class="portal-card-body">
              <div class="portal-card-icon" aria-hidden="true">
                <svg viewBox="0 0 88 88">
                  <circle class="icon-panel" cx="34" cy="34" r="13" />
                  <circle class="icon-panel" cx="59" cy="39" r="9" />
                  <path
                    d="M13 68c3-14 11-21 22-21s19 7 22 21M50 51c10 0 17 6 20 17M60 21v12m-6-6h12"
                  />
                </svg>
              </div>
              <div class="portal-card-copy">
                <span class="portal-card-label">{{ t("portal.customers.label") }}</span>
                <h3>{{ t("portal.customers.title") }}</h3>
                <p>{{ t("portal.customers.description") }}</p>
              </div>
            </div>
            <div class="portal-card-features">
              <span>{{ t("portal.customers.featureCodes") }}</span>
              <span>{{ t("portal.customers.featureRoles") }}</span>
              <span>{{ t("portal.customers.featureBindings") }}</span>
            </div>
            <div class="portal-card-action">
              <span>{{ t("portal.enterWorkbench") }}</span>
              <svg viewBox="0 0 22 22" aria-hidden="true"><path d="M4 11h13m-5-5 5 5-5 5" /></svg>
            </div>
          </RouterLink>
          <RouterLink
            class="portal-workbench-card portal-workbench-card--booking"
            to="/services/booking"
          >
            <div class="portal-card-topline"><span>04 / EXTERNAL BOOKING</span></div>
            <div class="portal-card-body">
              <div class="portal-card-icon" aria-hidden="true">
                <svg viewBox="0 0 88 88">
                  <path class="icon-panel" d="M18 18h52v52H18z" />
                  <path d="M29 34h30M29 44h20M29 54h12M53 55l10 10m-10 0h10V55" />
                </svg>
              </div>
              <div class="portal-card-copy">
                <span class="portal-card-label">{{ wt("bookingLabel") }}</span>
                <h3>{{ wt("bookingTitle") }}</h3>
                <p>{{ wt("bookingHint") }}</p>
              </div>
            </div>
            <div class="portal-card-features">
              <span>{{ wt("bookingAccess") }}</span
              ><span>{{ wt("bookingBoundary") }}</span>
            </div>
            <div class="portal-card-action">
              <span>{{ wt("bookingAction") }}</span
              ><svg viewBox="0 0 22 22" aria-hidden="true"><path d="M4 11h13m-5-5 5 5-5 5" /></svg>
            </div>
          </RouterLink>
        </div>
      </section>

      <footer class="portal-footer">
        <span>logisticspluscn · {{ currentYear }}</span>
        <span>{{ t("portal.footerHint") }}</span>
      </footer>
    </section>

    <el-dialog
      v-model="profileDialogOpen"
      class="portal-password-dialog workspace-el-dialog"
      :title="t('portal.personalInfoTitle')"
      width="min(640px, calc(100vw - 32px))"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
    >
      <el-form class="portal-password-form" label-position="top" @submit.prevent="submitProfile">
        <el-form-item :label="t('portal.accountUsername')">
          <el-input :model-value="currentUser?.username" disabled />
        </el-form-item>
        <el-form-item :label="t('portal.accountRole')">
          <el-input :model-value="roleLabel" disabled />
        </el-form-item>
        <el-form-item :label="t('portal.displayName')">
          <el-input v-model.trim="profileForm.displayName" maxlength="80" show-word-limit />
        </el-form-item>
        <el-alert
          v-if="profileError"
          :title="profileError"
          type="error"
          :closable="false"
          show-icon
        />
      </el-form>
      <template #footer>
        <el-button :disabled="profileSaving" @click="profileDialogOpen = false">{{
          t("portal.cancel")
        }}</el-button>
        <el-button type="primary" :loading="profileSaving" @click="submitProfile">{{
          t("portal.saveProfile")
        }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="passwordDialogOpen"
      class="portal-password-dialog workspace-el-dialog"
      :title="t('portal.changePasswordTitle')"
      width="min(520px, calc(100vw - 32px))"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      destroy-on-close
    >
      <el-alert :title="t('portal.passwordRule')" type="info" :closable="false" show-icon />
      <el-form
        class="portal-password-form"
        label-position="top"
        @submit.prevent="submitPasswordChange"
      >
        <el-form-item :label="t('portal.currentPassword')">
          <el-input
            v-model="passwordForm.currentPassword"
            type="password"
            show-password
            autocomplete="current-password"
          />
        </el-form-item>
        <el-form-item :label="t('portal.newPassword')">
          <el-input
            v-model="passwordForm.newPassword"
            type="password"
            show-password
            autocomplete="new-password"
          />
        </el-form-item>
        <el-form-item :label="t('portal.confirmPassword')">
          <el-input
            v-model="passwordForm.confirmPassword"
            type="password"
            show-password
            autocomplete="new-password"
          />
        </el-form-item>
        <el-alert
          v-if="passwordError"
          :title="passwordError"
          type="error"
          :closable="false"
          show-icon
        />
      </el-form>
      <template #footer>
        <el-button :disabled="passwordSaving" @click="passwordDialogOpen = false">
          {{ t("portal.cancel") }}
        </el-button>
        <el-button type="primary" :loading="passwordSaving" @click="submitPasswordChange">
          {{ t("portal.savePassword") }}
        </el-button>
      </template>
    </el-dialog>
  </main>
</template>

<script setup>
import { wt } from "./workspace/workspaceCopy";
import WorkspacePageHeader from "./workspace/WorkspacePageHeader.vue";
import WorkspaceStatus from "./workspace/WorkspaceStatus.vue";
import BrandLockup from "./brand/BrandLockup.vue";
import { computed, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useI18n } from "vue-i18n";
import LanguageSwitcher from "./LanguageSwitcher.vue";
import { currentLocale } from "../i18n";
import { changeOwnPassword, updateOwnProfile } from "../services/adminApi";
import { saveStoredUser } from "../services/authSession";

const props = defineProps({
  currentUser: { type: Object, default: null },
  announcementCount: { type: Number, default: 0 }
});
const emit = defineEmits(["logout", "user-updated", "open-announcements"]);
const { t } = useI18n();
const passwordDialogOpen = ref(false);
const profileDialogOpen = ref(false);
const profileSaving = ref(false);
const profileError = ref("");
const passwordSaving = ref(false);
const passwordError = ref("");
const passwordForm = reactive({
  currentPassword: "",
  newPassword: "",
  confirmPassword: ""
});
const profileForm = reactive({ displayName: "" });

const trackingWorkbenchUrl = import.meta.env.VITE_TRACKING_WORKBENCH_URL || "/tracking/";
const displayName = computed(
  () => props.currentUser?.displayName || props.currentUser?.username || t("portal.operator")
);
const userInitial = computed(() => displayName.value.slice(0, 1).toUpperCase());
const roleLabel = computed(() =>
  t(
    {
      ADMIN: "portal.roleAdmin",
      BUSINESS: "portal.roleBusiness",
      OVERSEA_AGENT: "portal.roleOverseaAgent"
    }[props.currentUser?.role] || "portal.roleEmployee"
  )
);
const systemMessageLabel = computed(() => t("customers.systemMessages"));
const currentYear = new Date().getFullYear();
const todayText = computed(() =>
  new Intl.DateTimeFormat(currentLocale.value === "en-US" ? "en-US" : "zh-CN", {
    month: "short",
    day: "2-digit",
    weekday: "short"
  }).format(new Date())
);

function openPasswordDialog() {
  passwordForm.currentPassword = "";
  passwordForm.newPassword = "";
  passwordForm.confirmPassword = "";
  passwordError.value = "";
  passwordDialogOpen.value = true;
}

function openProfileDialog() {
  profileForm.displayName = props.currentUser?.displayName || "";
  profileError.value = "";
  profileDialogOpen.value = true;
}

async function submitProfile() {
  profileError.value = "";
  if (profileForm.displayName.trim().length < 2) {
    profileError.value = t("portal.displayNameRule");
    return;
  }
  profileSaving.value = true;
  try {
    const user = await updateOwnProfile(profileForm.displayName.trim());
    saveStoredUser(user);
    emit("user-updated", user);
    profileDialogOpen.value = false;
    ElMessage.success(t("portal.profileSaved"));
  } catch (error) {
    profileError.value = error?.message || t("portal.profileSaveFailed");
  } finally {
    profileSaving.value = false;
  }
}

async function submitPasswordChange() {
  passwordError.value = "";
  if (!passwordForm.currentPassword || !passwordForm.newPassword) {
    passwordError.value = t("portal.passwordRequired");
    return;
  }
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    passwordError.value = t("portal.passwordMismatch");
    return;
  }
  const strong =
    passwordForm.newPassword.length >= 8 &&
    passwordForm.newPassword.length <= 128 &&
    /[A-Za-z]/.test(passwordForm.newPassword) &&
    /\d/.test(passwordForm.newPassword);
  if (!strong) {
    passwordError.value = t("portal.passwordRule");
    return;
  }
  passwordSaving.value = true;
  try {
    await changeOwnPassword(passwordForm.currentPassword, passwordForm.newPassword);
    passwordDialogOpen.value = false;
    ElMessage.success(t("portal.passwordChanged"));
  } catch (error) {
    passwordError.value = error?.message || t("portal.passwordChangeFailed");
  } finally {
    passwordSaving.value = false;
  }
}
</script>

<style scoped>
.workbench-portal {
  display: grid;
  grid-template-columns: 228px minmax(0, 1fr);
  grid-template-rows: 72px 1fr;
  min-height: 100vh;
  color: var(--color-foreground);
  background: var(--color-background);
}
.portal-sidebar {
  grid-row: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 32px;
  padding: 28px 20px;
  background: var(--color-primary);
  color: #dce7ec;
}
.portal-sidebar-label {
  margin: 12px 12px -20px;
  font-size: 12px;
  letter-spacing: 1.5px;
  color: #9fb6c2;
}
.portal-sidebar nav {
  display: grid;
  gap: 5px;
}
.portal-sidebar nav a {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 10px 14px;
  border-left: 3px solid transparent;
  color: #c5d6df;
  text-decoration: none;
  font-size: 13px;
}
.portal-sidebar nav a:hover {
  color: white;
  background: #ffffff0c;
}
.portal-sidebar nav a.is-active {
  border-color: var(--color-accent);
  background: #ffffff12;
  color: white;
}
.portal-sidebar-user {
  display: grid;
  gap: 6px;
  margin-top: auto;
  padding: 24px 12px 0;
  border-top: 1px solid #ffffff24;
}
.portal-sidebar-user strong {
  font-size: 13px;
}
.portal-sidebar-user small {
  color: #a6bdc9;
  font-size: 12px;
}
.portal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 0 32px;
  border-bottom: 1px solid var(--color-border);
  background: #fff;
}
.portal-header-title {
  font-size: 13px;
  color: var(--color-muted);
}
.portal-header-actions,
.portal-live-status {
  display: flex;
  align-items: center;
  gap: 10px;
}
.portal-live-status {
  font-size: 12px;
  color: var(--color-muted);
  white-space: nowrap;
}
.portal-live-status i,
.portal-card-topline small i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #3f7b62;
}
.portal-admin-link,
.portal-message-button,
.portal-account-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 36px;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  color: var(--color-primary);
  background: #fff;
  text-decoration: none;
  font-size: 12px;
  box-shadow: none;
}
.portal-admin-link:hover,
.portal-message-button:hover,
.portal-account-trigger:hover {
  background: var(--color-background);
  border-color: #a9bcc6;
  box-shadow: none;
}
.portal-message-button svg {
  width: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
}
.portal-message-button b {
  background: var(--color-accent);
  color: white;
  padding: 1px 5px;
  font-size: 12px;
}
.portal-avatar {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  color: white;
  background: var(--color-primary);
  font-size: 12px;
}
.portal-user-copy {
  display: grid;
  gap: 2px;
  text-align: left;
}
.portal-user-copy strong {
  font-size: 12px;
}
.portal-user-copy small {
  color: var(--color-muted);
  font-size: 12px;
}
.portal-account-chevron {
  width: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
}
.portal-content {
  min-width: 0;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 36px 36px 26px;
}
.portal-kicker {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 14px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 1.5px;
  color: var(--color-muted);
}
.portal-kicker i {
  width: 35px;
  height: 1px;
  background: #b9c9d1;
}
.portal-kicker small {
  font-size: 12px;
  letter-spacing: 0;
}
.portal-hero-copy h1 {
  margin: 0;
  font-size: 30px;
  font-weight: 600;
  letter-spacing: -0.7px;
  color: var(--color-primary);
}
.portal-hero-copy > p {
  margin: 12px 0 0;
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.8;
}
.portal-task-row {
  display: flex;
  align-items: center;
  gap: 24px;
  width: 100%;
  margin: 28px 0 0;
  padding: 18px 22px;
  text-align: left;
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-accent);
  background: #fff;
  border-radius: var(--radius-control);
  box-shadow: none;
}
.portal-task-row > span {
  display: grid;
  gap: 5px;
}
.portal-task-row small {
  color: var(--color-muted);
  font-size: 12px;
}
.portal-task-row strong {
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 500;
}
.portal-task-row > b {
  margin-left: auto;
  font-size: 26px;
  font-weight: 500;
  color: var(--color-accent);
}
.portal-task-row svg {
  width: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
}
.portal-workbench-section {
  margin-top: 36px;
}
.portal-section-head {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 28px;
  margin-bottom: 20px;
}
.portal-section-head span,
.portal-card-label {
  color: var(--color-muted);
  font-size: 12px;
  letter-spacing: 1.3px;
}
.portal-section-head h2 {
  margin: 6px 0 0;
  font-size: 21px;
  font-weight: 600;
}
.portal-section-head p {
  margin: 0;
  max-width: 390px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-muted);
}
.portal-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}
.portal-card-grid.has-customer-card {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.portal-workbench-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: #fff;
  color: inherit;
  text-decoration: none;
  transition:
    border-color 0.18s,
    background 0.18s;
}
.portal-workbench-card:hover {
  border-color: #94aebc;
  background: #fbfcfc;
}
.portal-card-topline {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--color-muted);
}
.portal-card-topline small {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  font-size: 12px;
  letter-spacing: 0;
}
.portal-card-body {
  display: flex;
  flex-direction: column;
  gap: 22px;
  margin: 24px 0;
}
.portal-card-icon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  background: var(--color-background);
  color: var(--color-primary);
}
.portal-card-icon svg {
  width: 42px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
}
.portal-card-icon .icon-panel {
  fill: currentColor;
  fill-opacity: 0.04;
}
.portal-card-label {
  font-size: 12px;
}
.portal-card-copy h3 {
  margin: 8px 0 12px;
  color: var(--color-primary);
  font-size: 23px;
  font-weight: 600;
  letter-spacing: -0.4px;
}
.portal-card-copy p {
  margin: 0;
  font-size: 12px;
  line-height: 1.9;
  color: var(--color-muted);
}
.portal-card-features {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
}
.portal-card-features span {
  padding: 4px 7px;
  border: 1px solid var(--color-border);
  font-size: 12px;
  color: var(--color-muted);
}
.portal-card-action {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 600;
}
.portal-card-action svg {
  width: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
}
.portal-footer {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
  font-size: 12px;
  color: var(--color-muted);
}
.portal-password-form {
  margin-top: 16px;
}
:global(.portal-password-dialog) {
  border-radius: var(--radius-dialog);
}
:global(.portal-account-popper.el-popper) {
  border-radius: var(--radius-dialog);
}
:global(.portal-account-popper .portal-account-menu-logout) {
  color: var(--el-color-danger);
}
@media (max-width: 1200px) {
  .workbench-portal {
    grid-template-columns: 200px minmax(0, 1fr);
  }
  .portal-content {
    padding: 28px;
  }
  .portal-header {
    padding: 0 24px;
  }
  .portal-live-status,
  .portal-admin-link {
    display: none;
  }
  .portal-card-grid.has-customer-card {
    grid-template-columns: 1fr;
  }
  .portal-card-body {
    flex-direction: row;
  }
  .portal-card-icon {
    flex: 0 0 48px;
  }
  .portal-card-topline {
    font-size: 12px;
  }
}
@media (max-width: 760px) {
  .workbench-portal {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto 1fr;
  }
  .portal-sidebar {
    grid-row: auto;
    padding: 16px 18px;
    gap: 18px;
  }
  .portal-sidebar nav {
    display: flex;
    overflow: auto;
    gap: 6px;
  }
  .portal-sidebar nav a {
    flex: none;
    border-left: 0;
    border-bottom: 2px solid transparent;
    min-height: 40px;
    padding: 8px 10px;
    font-size: 12px;
  }
  .portal-sidebar-label,
  .portal-sidebar-user {
    display: none;
  }
  .portal-header {
    min-height: 64px;
    padding: 12px 18px;
  }
  .portal-header-title,
  .portal-user-copy {
    display: none;
  }
  .portal-header-actions {
    width: 100%;
    justify-content: space-between;
  }
  .portal-content {
    padding: 26px 18px;
  }
  .portal-hero-copy h1 {
    font-size: 25px;
  }
  .portal-section-head {
    display: block;
  }
  .portal-section-head p {
    margin-top: 12px;
  }
  .portal-card-grid {
    grid-template-columns: 1fr;
  }
  .portal-card-body {
    gap: 15px;
  }
  .portal-card-copy h3 {
    font-size: 21px;
  }
  .portal-card-topline {
    flex-wrap: wrap;
  }
  .portal-footer {
    flex-direction: column;
  }
  .portal-kicker {
    gap: 10px;
    font-size: 12px;
  }
}
@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
  }
}

.portal-content {
  padding-top: 32px;
}
.portal-today {
  color: var(--color-muted);
  font-size: 13px;
}
.portal-workbench-card {
  border-radius: var(--radius-card);
  padding: 24px;
}
.portal-card-topline {
  letter-spacing: 0;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.portal-card-body {
  gap: 20px;
}
.portal-card-copy h3 {
  font-size: 24px;
  line-height: 1.4;
}
.portal-card-copy p {
  font-size: 14px;
  line-height: 1.75;
}
.portal-card-features span {
  font-size: 12px;
  padding: 6px 9px;
  border-radius: var(--radius-control);
}
.portal-card-action {
  font-size: 14px;
}
.portal-workbench-card:hover {
  background: var(--color-surface-subtle);
  border-color: var(--color-primary);
  transform: translateY(-2px);
}
.portal-task-row {
  border-radius: var(--radius-card);
}
.portal-task-row small {
  font-size: 12px;
}
.portal-task-row strong {
  font-size: 14px;
}
.portal-header-title,
.portal-live-status,
.portal-admin-link,
.portal-message-button {
  font-size: 13px;
}
.portal-user-copy strong {
  font-size: 14px;
}
.portal-user-copy small {
  font-size: 12px;
}
.portal-sidebar nav a {
  font-size: 14px;
}
.portal-sidebar-label {
  font-size: 12px;
  letter-spacing: 0;
}
@media (prefers-reduced-motion: reduce) {
  .portal-workbench-card:hover {
    transform: none;
  }
}
</style>

<style scoped src="./workspace/workspaceElementDialog.css"></style>
