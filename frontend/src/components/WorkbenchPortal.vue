<template>
  <main class="workbench-portal" :class="{ 'is-content-only': contentOnly }" data-i18n-ignore>
    <aside v-if="!contentOnly" class="portal-sidebar">
      <BrandLockup href="/workbenches" compact inverse />
      <p class="portal-sidebar-label">{{ t("maritime.operations") }}</p>
      <WorkspaceNavigation :role="currentUser?.role" />
      <div class="portal-sidebar-user">
        <strong>{{ displayName }}</strong
        ><small>{{ roleLabel }}</small>
      </div>
    </aside>
    <header v-if="!contentOnly" class="portal-header">
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
        :description="t('portal.heroDescription')"
        ><template #meta
          ><span class="portal-today">{{ todayText }}</span></template
        ></WorkspacePageHeader
      >

      <button class="portal-task-row" type="button" @click="emit('open-announcements')">
        <span
          ><small>{{ t("customers.systemMessages") }}</small
          ><strong>{{
            announcementCount
              ? wt("announcementSummary", { count: announcementCount })
              : wt("noAnnouncements")
          }}</strong></span
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

        <div class="portal-card-grid">
          <WorkbenchEntryCard
            index="01"
            kind="planner"
            eyebrow="LOAD PLANNING"
            :title="wt('workbenchPlannerTitle')"
            :description="wt('workbenchPlannerDescription')"
            :features="[
              t('portal.planner.featurePacking'),
              t('portal.planner.featureBalance'),
              t('portal.planner.featureReport')
            ]"
            :action="wt('workbenchPlannerAction')"
            to="/planner/cargos"
          />
          <WorkbenchEntryCard
            index="02"
            kind="tracking"
            eyebrow="SHIPMENT VISIBILITY"
            :title="wt('workbenchTrackingTitle')"
            :description="wt('workbenchTrackingDescription')"
            :features="[
              t('portal.tracking.featureReferences'),
              t('portal.tracking.featureRoute'),
              t('portal.tracking.featureChannels')
            ]"
            :action="wt('workbenchTrackingAction')"
            to="/workspace/tracking/overview"
          />
          <WorkbenchEntryCard
            v-if="['BUSINESS', 'ADMIN', 'OVERSEA_AGENT'].includes(currentUser?.role)"
            index="03"
            kind="customers"
            eyebrow="CUSTOMER OPERATIONS"
            :title="wt('workbenchCustomersTitle')"
            :description="wt('workbenchCustomersDescription')"
            :features="[wt('customerData'), wt('shipmentAccess'), wt('businessHandover')]"
            :action="wt('workbenchCustomersAction')"
            to="/customers"
          />
          <WorkbenchEntryCard
            index="04"
            kind="booking"
            eyebrow="EXTERNAL BOOKING"
            :title="wt('bookingTitle')"
            :description="wt('bookingHint')"
            :features="[wt('bookingAccess'), wt('bookingBoundary')]"
            :action="wt('bookingAction')"
            to="/services/booking"
          />
        </div>
      </section>

      <section class="portal-quick-links" :aria-label="wt('quickLinks')">
        <h2>{{ wt("quickLinks") }}</h2>
        <div>
          <RouterLink
            v-if="['BUSINESS', 'ADMIN', 'OVERSEA_AGENT'].includes(currentUser?.role)"
            to="/customers/directory"
            ><strong>{{ t("portal.customers.title") }}</strong
            ><small>{{ wt("customerDirectoryQuick") }}</small
            ><span aria-hidden="true">›</span></RouterLink
          ><RouterLink
            v-if="['BUSINESS', 'ADMIN', 'OVERSEA_AGENT'].includes(currentUser?.role)"
            to="/customers/shipments"
            ><strong>{{ wt("shipmentQuick") }}</strong
            ><small>{{ wt("shipmentQuickHint") }}</small
            ><span aria-hidden="true">›</span></RouterLink
          ><RouterLink to="/containers"
            ><strong>{{ wt("equipmentQuick") }}</strong
            ><small>{{ wt("equipmentQuickHint") }}</small
            ><span aria-hidden="true">›</span></RouterLink
          ><RouterLink to="/algorithm"
            ><strong>{{ wt("algorithmTitle") }}</strong
            ><small>{{ wt("algorithmQuickHint") }}</small
            ><span aria-hidden="true">›</span></RouterLink
          >
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
import WorkspaceNavigation from "./workspace/WorkspaceNavigation.vue";
import WorkspacePageHeader from "./workspace/WorkspacePageHeader.vue";
import WorkbenchEntryCard from "./workspace/WorkbenchEntryCard.vue";
import BrandLockup from "./brand/BrandLockup.vue";
import { computed, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useI18n } from "vue-i18n";
import LanguageSwitcher from "./LanguageSwitcher.vue";
import { currentLocale } from "../i18n";
import { changeOwnPassword, updateOwnProfile } from "../services/adminApi";
import { saveStoredUser } from "../services/authSession";

const props = defineProps({
  contentOnly: Boolean,
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
  margin: 16px 0 0;
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
  font-size: 20px;
  line-height: 24px;
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
  margin-top: 20px;
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

<style scoped>
.workbench-portal {
  grid-template-columns: 260px minmax(0, 1fr);
  grid-template-rows: 64px minmax(0, 1fr);
}
.portal-sidebar {
  padding: 22px 14px;
}
.portal-header {
  min-height: 64px;
  padding: 0 28px;
}
.portal-content {
  padding: 32px 28px 16px;
  gap: 20px;
}
.portal-content :deep(.workspace-page-header) {
  margin-bottom: 0;
}
.portal-content :deep(.workspace-page-header__title) {
  font-size: 36px;
}
.portal-content :deep(.workspace-page-header__description) {
  font-size: 16px;
  line-height: 1.65;
  margin-top: 8px;
}
.portal-content :deep(.workspace-page-header__meta) {
  margin-top: 12px;
}
.portal-task-row {
  min-height: 46px;
  padding: 10px 16px;
  border-color: var(--accent-line);
  background: var(--color-accent-soft);
  gap: 16px;
}
.portal-task-row > span {
  display: flex;
  align-items: center;
  gap: 20px;
}
.portal-task-row small {
  color: var(--color-accent);
  font-size: 14px;
}
.portal-task-row strong {
  font-size: 14px;
  font-weight: 400;
}
.portal-task-row > b {
  margin-left: auto;
  color: var(--color-accent);
  background: transparent;
}
.portal-card-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.portal-section-head {
  margin-bottom: 14px;
}
.portal-section-head h2 {
  font-size: 24px;
  margin: 3px 0 0;
}
.portal-section-head p {
  display: none;
}
.portal-sidebar nav a.is-active {
  background: var(--color-accent);
  border-color: transparent;
}
.portal-quick-links {
  margin-top: 20px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
}
.portal-quick-links h2 {
  font-size: 16px;
  margin: 0 0 8px;
}
.portal-quick-links > div {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.portal-quick-links a {
  position: relative;
  display: grid;
  gap: 5px;
  padding: 6px 26px 6px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  text-decoration: none;
  color: var(--color-primary);
}
.portal-quick-links strong {
  font-size: 14px;
  font-weight: 600;
}
.portal-quick-links small {
  font-size: 12px;
  color: var(--color-muted);
}
.portal-quick-links a > span {
  position: absolute;
  right: 12px;
  top: 18px;
}
.portal-quick-links a:hover {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}
.portal-footer {
  margin-top: 20px;
  padding: 0 2px;
  font-size: 12px;
}
.portal-message-button > span,
.portal-live-status,
.portal-header .portal-admin-link {
  display: none;
}
@media (max-width: 1100px) {
  .workbench-portal {
    grid-template-columns: 220px minmax(0, 1fr);
  }
  .portal-content {
    padding: 24px;
  }
  .portal-quick-links > div {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 850px) {
  .workbench-portal {
    grid-template-columns: 1fr;
  }
  .portal-card-grid {
    grid-template-columns: 1fr;
  }
  .portal-content :deep(.workspace-page-header__title) {
    font-size: 30px;
  }
}
@media (max-width: 600px) {
  .portal-content {
    padding: 22px 16px;
    gap: 18px;
  }
  .portal-header {
    padding: 0 16px;
  }
  .portal-quick-links > div {
    grid-template-columns: 1fr;
  }
  .portal-task-row > span {
    gap: 8px;
    flex-wrap: wrap;
  }
  .portal-content :deep(.workspace-page-header__description) {
    font-size: 14px;
  }
}
</style>

<style scoped>
.portal-sidebar nav a {
  display: flex;
  align-items: center;
  gap: 18px;
  min-height: 48px;
  padding: 12px 18px;
  border-radius: var(--radius-control);
  font-size: 15px;
}
.portal-sidebar nav .el-icon {
  font-size: 23px;
  width: 24px;
}
.portal-sidebar-label {
  display: none;
}
.portal-sidebar nav {
  margin-top: 16px;
  gap: 8px;
}
.portal-sidebar-user {
  margin-top: auto;
}
</style>

<style scoped>
@media (max-width: 850px) {
  .workbench-portal {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  .portal-sidebar {
    grid-row: auto;
    display: block;
    padding: 14px 16px;
  }
  .portal-sidebar nav {
    display: flex;
    overflow-x: auto;
    margin-top: 12px;
    gap: 6px;
    padding-bottom: 4px;
  }
  .portal-sidebar nav a {
    flex: 0 0 auto;
    white-space: nowrap;
    font-size: 13px;
    min-height: 40px;
    padding: 8px 12px;
    gap: 8px;
  }
  .portal-sidebar nav .el-icon {
    font-size: 18px;
    width: 18px;
  }
  .portal-sidebar-user {
    display: none;
  }
  .portal-header {
    flex: none;
    min-height: 56px;
    padding: 10px 16px;
  }
  .portal-content {
    flex: 1;
    min-width: 0;
    width: 100%;
  }
}
</style>

<style scoped>
.workbench-portal.is-content-only {
  display: block;
  min-height: 0;
  background: transparent;
}
.is-content-only .portal-content {
  padding: 28px;
}
.is-content-only .portal-content :deep(.workspace-page-header__title) {
  font-size: 28px;
  line-height: 1.4;
}
.is-content-only .portal-workbench-section {
  min-width: 0;
}
</style>

<style scoped>
/* The portal shares the quiet white surfaces and blue accents of the reference workspace. */
.is-content-only .portal-content {
  padding: 28px;
}
.is-content-only .portal-content :deep(.workspace-page-header__title) {
  font-size: 32px;
  font-weight: 650;
  line-height: 1.4;
  color: var(--color-foreground);
}
.portal-content :deep(.workspace-page-header__description) {
  font-size: 14px;
}
.portal-task-row {
  border-color: #dce8fa;
  border-radius: 10px;
  background: #edf4ff;
  min-height: 56px;
  padding: 12px 20px;
}
.portal-workbench-section {
  margin-top: 24px;
}
.portal-section-head {
  margin-bottom: 18px;
}
.portal-section-head h2 {
  font-size: 20px;
  color: var(--color-foreground);
}
.portal-section-head > div > span {
  color: var(--color-muted);
  font-size: 11px;
  letter-spacing: 0.08em;
}
.portal-card-grid {
  gap: 18px;
}
.portal-quick-links {
  padding: 20px;
  margin-top: 24px;
}
.portal-quick-links h2 {
  margin-bottom: 14px;
  font-size: 16px;
  color: var(--color-foreground);
}
.portal-quick-links a {
  padding: 13px 30px 13px 14px;
  border-color: var(--color-border);
  color: var(--color-foreground);
}
.portal-quick-links small {
  line-height: 1.6;
}
.portal-today {
  font-size: 13px;
  color: var(--color-muted);
}
@media (max-width: 1100px) {
  .is-content-only .portal-content {
    padding: 24px;
  }
}
@media (max-width: 620px) {
  .is-content-only .portal-content {
    padding: 22px 16px;
  }
  .is-content-only .portal-content :deep(.workspace-page-header__title) {
    font-size: 28px;
  }
  .portal-card-grid {
    gap: 14px;
  }
  .portal-quick-links {
    padding: 16px;
  }
}
</style>
