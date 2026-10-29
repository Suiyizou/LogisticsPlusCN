<template>
  <el-dialog
    :model-value="personalProfileOpen"
    :before-close="beforeClose"
    :close-on-press-escape="!busy"
    :show-close="!busy"
    @update:model-value="updateOpen"
    class="operations-profile-dialog workspace-el-dialog"
    :title="t(section === 'password' ? 'portal.changePasswordTitle' : 'portal.personalInfoTitle')"
    width="min(860px, 94vw)"
    :close-on-click-modal="false"
  >
    <div class="operations-profile-hero">
      <span class="operations-profile-avatar">{{ displayName.slice(0, 1).toUpperCase() }}</span>
      <div>
        <b>{{ displayName }}</b>
        <small>@{{ currentUser?.username }} · {{ personalRoleLabel }}</small>
      </div>
      <el-tag type="success" effect="light">{{ t("portal.accountActive") }}</el-tag>
    </div>
    <div class="operations-profile-layout" :class="{ 'is-single-section': section !== 'all' }">
      <section v-if="section !== 'password'" class="operations-profile-section">
        <header>
          <b>{{ t("portal.basicProfile") }}</b>
          <small>{{ t("portal.basicProfileHint") }}</small>
        </header>
        <el-form
          class="operations-profile-form"
          label-position="top"
          :disabled="busy"
          @submit.prevent="savePersonalProfile"
        >
          <el-form-item :label="t('portal.accountUsername')">
            <el-input :model-value="currentUser?.username" disabled />
          </el-form-item>
          <el-form-item :label="t('portal.accountRole')">
            <el-input :model-value="personalRoleLabel" disabled />
          </el-form-item>
          <el-form-item :label="t('portal.displayName')" required>
            <el-input
              v-model.trim="personalProfileForm.displayName"
              maxlength="80"
              show-word-limit
            />
          </el-form-item>
          <el-alert
            v-if="personalProfileError"
            :title="personalProfileError"
            type="error"
            :closable="false"
            show-icon
          />
          <el-button
            type="primary"
            :loading="personalProfileSaving"
            :disabled="busy"
            @click="savePersonalProfile"
          >
            {{ t("portal.saveProfile") }}
          </el-button>
        </el-form>
      </section>
      <section v-if="section !== 'profile'" class="operations-profile-section is-security">
        <header>
          <b>{{ t("portal.accountSecurity") }}</b>
          <small>{{ t("portal.accountSecurityHint") }}</small>
        </header>
        <el-form
          class="operations-password-form"
          label-position="top"
          :disabled="busy"
          @submit.prevent="savePersonalPassword"
        >
          <el-form-item :label="t('portal.currentPassword')" required>
            <el-input
              v-model="personalPasswordForm.currentPassword"
              type="password"
              show-password
              autocomplete="current-password"
            />
          </el-form-item>
          <el-form-item :label="t('portal.newPassword')" required>
            <el-input
              v-model="personalPasswordForm.newPassword"
              type="password"
              show-password
              autocomplete="new-password"
            />
          </el-form-item>
          <el-form-item :label="t('portal.confirmNewPassword')" required>
            <el-input
              v-model="personalPasswordForm.confirmPassword"
              type="password"
              show-password
              autocomplete="new-password"
            />
          </el-form-item>
          <small class="operations-password-rule">{{ t("portal.passwordRule") }}</small>
          <el-alert
            v-if="personalPasswordError"
            :title="personalPasswordError"
            type="error"
            :closable="false"
            show-icon
          />
          <el-alert
            v-if="personalPasswordSuccess"
            :title="personalPasswordSuccess"
            type="success"
            :closable="false"
            show-icon
          />
          <el-button
            type="primary"
            plain
            :loading="personalPasswordSaving"
            :disabled="busy"
            @click="savePersonalPassword"
          >
            {{ t("portal.changePassword") }}
          </el-button>
        </el-form>
      </section>
    </div>
    <template #footer>
      <el-button :disabled="busy" @click="closePersonalProfile">
        {{ t("customers.close") }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { PersonalProfileWorkflow, FeatureTranslator } from "../../types/featureComponents";
import type { WorkspaceUser } from "../../types/workspace";
const props = withDefaults(
  defineProps<{
    workflow: PersonalProfileWorkflow;
    currentUser?: WorkspaceUser | null;
    section?: string;
    t: FeatureTranslator;
  }>(),
  { currentUser: null, section: "all" }
);
const {
  personalProfileOpen,
  personalProfileForm,
  personalProfileError,
  personalProfileSaving,
  personalPasswordForm,
  personalPasswordError,
  personalPasswordSuccess,
  personalPasswordSaving,
  busy,
  beforeClose,
  closePersonalProfile,
  savePersonalProfile,
  savePersonalPassword
} = props.workflow;
const displayName = computed(
  () =>
    props.currentUser?.displayName ||
    props.currentUser?.username ||
    props.t("customers.businessOperator")
);
const roleLabels: Record<string, string> = {
  ADMIN: "portal.roleAdmin",
  BUSINESS: "portal.roleBusiness",
  OVERSEA_AGENT: "portal.roleOverseaAgent"
};
const personalRoleLabel = computed(() =>
  props.t(roleLabels[props.currentUser?.role || ""] || "portal.roleEmployee")
);
function updateOpen(open: boolean) {
  if (!open) closePersonalProfile();
}
</script>

<style scoped>
.operations-profile-hero {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: -4px 0 18px;
  padding: 14px;
  border: 1px solid #d8e6f2;
  border-radius: var(--radius-control);
  background: linear-gradient(135deg, #f1f8ff, #f8fbff);
}
.operations-profile-avatar {
  display: grid;
  flex: 0 0 44px;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-control);
  color: #fff;
  background: var(--color-primary);
  font-size: 18px;
  font-weight: 600;
  place-items: center;
}
.operations-profile-hero > div {
  display: grid;
  flex: 1;
  gap: 3px;
}
.operations-profile-hero b {
  color: #18324b;
}
.operations-profile-hero small {
  color: #73889c;
}
.operations-profile-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
}
.operations-profile-section {
  min-width: 0;
  padding: 16px;
  border: 1px solid #dae5ee;
  border-radius: var(--radius-card);
  background: #fbfdff;
}
.operations-profile-section.is-security {
  background: linear-gradient(180deg, #fffcf7, #fff);
}
.operations-profile-section > header {
  display: grid;
  margin-bottom: 13px;
  gap: 3px;
}
.operations-profile-section header b {
  color: #23435d;
  font-size: 13px;
}
.operations-profile-section header small {
  color: #8296a8;
  font-size: 12px;
  line-height: 1.5;
}
.operations-profile-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}
.operations-profile-form .el-form-item:nth-child(3),
.operations-profile-form .el-alert {
  grid-column: 1 / -1;
}
.operations-profile-form > .el-button,
.operations-password-form > .el-button {
  justify-self: end;
}
.operations-password-form {
  display: grid;
}
.operations-password-rule {
  display: block;
  margin: -7px 0 12px;
  color: #8a785d;
  font-size: 12px;
  line-height: 1.5;
}
.operations-password-form .el-alert {
  margin-bottom: 10px;
}

@media (max-width: 900px) {
  .operations-profile-layout {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 680px) {
  .operations-profile-form {
    grid-template-columns: 1fr;
  }
  .operations-profile-form .el-form-item {
    grid-column: 1 / -1;
  }
}

.operations-profile-section {
  padding: 22px;
  background: var(--color-surface-subtle);
}
.operations-profile-section.is-security {
  background: var(--color-surface);
}
.operations-profile-section header b {
  font-size: 18px;
  font-weight: 600;
}
.operations-profile-section header small {
  font-size: 13px;
}
.operations-profile-layout {
  gap: 22px;
}
.operations-profile-hero {
  padding: 20px;
  border-radius: var(--radius-card);
}
.operations-profile-avatar {
  border-radius: var(--radius-control);
  background: var(--color-primary);
}
.operations-profile-form {
  gap: 0 20px;
}
</style>

<style scoped src="../../components/workspace/workspaceElementDialog.css"></style>

<style scoped>
.operations-profile-layout.is-single-section {
  grid-template-columns: minmax(0, 1fr);
}
</style>
