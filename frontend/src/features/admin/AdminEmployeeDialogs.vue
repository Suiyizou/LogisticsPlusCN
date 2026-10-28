<script setup lang="ts">
import WorkspaceDialogTransition from "../../components/workspace/WorkspaceDialogTransition.vue";
import { computed, ref, watch } from "vue";
import { useDialogFocus } from "../../composables/useDialogFocus.js";
import type { AdminAccountWorkflow, AdminWorkflowPorts } from "../../types/adminWorkflows";
const props = defineProps<{
  workflow: AdminAccountWorkflow;
  busy: boolean;
  t: AdminWorkflowPorts["t"];
  statusText: (status: string) => string;
}>();
const {
  employeeDialogOpen,
  editingEmployeeId,
  employeeDialogError,
  employeeForm,
  editingEmployeeIsSelf,
  resetPasswordDialog,
  temporaryPasswordDialog,
  resetPasswordConfirmButtonRef,
  temporaryPasswordCopyButtonRef,
  copying,
  closeEmployeeDialog,
  handleSaveEmployee,
  closeResetPasswordDialog,
  confirmResetPassword,
  copyTemporaryPassword,
  closeTemporaryPasswordDialog
} = props.workflow;
const editing = computed(() => editingEmployeeId.value !== "");
const loading = computed(() => props.busy);
const editorElement = ref<HTMLElement | null>(null);
const resetElement = ref<HTMLElement | null>(null);
const resultElement = ref<HTMLElement | null>(null);
const editorFocus = useDialogFocus({
  dialogElement: editorElement,
  isOpen: () => employeeDialogOpen.value,
  isBusy: () => props.busy,
  close: closeEmployeeDialog
});
const resetFocus = useDialogFocus({
  dialogElement: resetElement,
  isOpen: () => resetPasswordDialog.open,
  isBusy: () => resetPasswordDialog.pending,
  close: closeResetPasswordDialog
});
const resultFocus = useDialogFocus({
  dialogElement: resultElement,
  isOpen: () => temporaryPasswordDialog.open,
  isBusy: () => false,
  close: closeTemporaryPasswordDialog
});
// Disabling the copy action can move browser focus to body. Restore only after
// this result's copy ends, and never steal focus from another dialog or field.
watch(
  copying,
  (active) => {
    if (!active && temporaryPasswordDialog.open && document.activeElement === document.body)
      temporaryPasswordCopyButtonRef.value?.focus({ preventScroll: true });
  },
  { flush: "post" }
);
</script>
<template>
  <WorkspaceDialogTransition
    ><div v-if="employeeDialogOpen" class="modal-backdrop">
      <div
        class="modal employee-modal workspace-modal--form"
        ref="editorElement"
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-dialog-title"
        tabindex="-1"
        :aria-busy="loading"
        @keydown="editorFocus.onDialogKeydown"
      >
        <header>
          <div>
            <p>Internal Account</p>
            <h2 id="employee-dialog-title">
              {{ t(editing ? "admin.employee.editTitle" : "admin.employee.createTitle") }}
            </h2>
          </div>
          <button
            type="button"
            :disabled="loading"
            :aria-label="t('common.close')"
            @click="closeEmployeeDialog"
          >
            ×
          </button>
        </header>
        <form class="admin-form-grid employee-dialog-form" @submit.prevent="handleSaveEmployee">
          <label>
            <span>{{ t("admin.list.username") }}</span>
            <input
              v-model.trim="employeeForm.username"
              autocomplete="username"
              :placeholder="t('admin.employee.usernamePlaceholder')"
              :disabled="editing || loading"
            />
          </label>
          <label>
            <span>{{ t("admin.list.displayName") }}</span>
            <input
              :disabled="loading"
              v-model.trim="employeeForm.displayName"
              :placeholder="t('adminWorkflow.displayNamePlaceholder')"
            />
          </label>
          <label v-if="!editingEmployeeIsSelf">
            <span>{{
              t(editing ? "admin.employee.newPassword" : "admin.employee.initialPassword")
            }}</span>
            <input
              v-model="employeeForm.password"
              type="password"
              autocomplete="new-password"
              :disabled="loading"
              :placeholder="
                t(
                  editing
                    ? 'admin.employee.newPasswordPlaceholder'
                    : 'admin.employee.passwordPlaceholder'
                )
              "
              @input="employeeDialogError = ''"
            />
            <small v-if="editing">{{ t("admin.employee.passwordOptionalHint") }}</small>
          </label>
          <label v-if="!editingEmployeeIsSelf">
            <span>{{ t("admin.employee.confirmPassword") }}</span>
            <input
              v-model="employeeForm.passwordConfirm"
              type="password"
              autocomplete="new-password"
              :disabled="loading"
              :placeholder="t('admin.employee.confirmPasswordPlaceholder')"
              @input="employeeDialogError = ''"
            />
          </label>
          <p v-if="editingEmployeeIsSelf" class="admin-hint">
            {{ t("admin.employee.selfPasswordEditHint") }}
          </p>
          <label>
            <span>{{ t("admin.list.systemRole") }}</span>
            <el-select
              v-model="employeeForm.role"
              :disabled="loading"
              class="business-select"
              popper-class="business-select-popper"
            >
              <el-option value="OVERSEA_AGENT" :label="t('profile.role.overseaAgent')" />
              <el-option value="BUSINESS" :label="t('profile.role.business')" />
              <el-option value="ADMIN" :label="t('profile.role.admin')" />
            </el-select>
          </label>
          <label>
            <span>{{ t("admin.employee.partyRole") }}</span>
            <el-select
              v-model="employeeForm.partyRole"
              class="business-select"
              popper-class="business-select-popper"
              :disabled="loading || employeeForm.role !== 'OVERSEA_AGENT'"
            >
              <el-option value="AGENT" :label="t('customers.roleAgent')" />
            </el-select>
            <small>{{
              t(
                employeeForm.role === "OVERSEA_AGENT"
                  ? "admin.employee.overseaAgentHint"
                  : "admin.employee.agentForcedHint"
              )
            }}</small>
          </label>
          <label>
            <span>{{ t("admin.list.status") }}</span>
            <el-select
              v-model="employeeForm.status"
              :disabled="loading"
              class="business-select"
              popper-class="business-select-popper"
            >
              <el-option value="ACTIVE" :label="statusText('ACTIVE')" />
              <el-option value="DISABLED" :label="statusText('DISABLED')" />
            </el-select>
          </label>
          <p v-if="employeeDialogError" class="employee-dialog-error" role="alert">
            {{ employeeDialogError }}
          </p>
          <div class="modal-actions">
            <button type="button" :disabled="loading" @click="closeEmployeeDialog">
              {{ t("common.cancel") }}
            </button>
            <button class="primary" type="submit" :disabled="loading">
              {{ t(editing ? "admin.employee.save" : "admin.employee.create") }}
            </button>
          </div>
        </form>
      </div>
    </div></WorkspaceDialogTransition
  >

  <WorkspaceDialogTransition
    ><div
      v-if="resetPasswordDialog.open"
      class="modal-backdrop"
      @click.self="closeResetPasswordDialog"
    >
      <div
        class="modal reset-password-modal workspace-modal--form"
        ref="resetElement"
        :aria-busy="resetPasswordDialog.pending"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-password-dialog-title"
        aria-describedby="reset-password-dialog-description"
        tabindex="-1"
        @keydown="resetFocus.onDialogKeydown"
      >
        <header>
          <div>
            <p>SECURITY ACTION</p>
            <h2 id="reset-password-dialog-title">{{ t("admin.employee.resetPassword") }}</h2>
          </div>
          <button
            type="button"
            :aria-label="t('common.close')"
            :disabled="resetPasswordDialog.pending"
            @click="closeResetPasswordDialog"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        <div class="reset-password-confirmation">
          <div class="reset-password-account">
            <span aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M12 3 5 6v5c0 4.6 2.8 8.8 7 10 4.2-1.2 7-5.4 7-10V6l-7-3Z" />
                <path d="M9.5 12.2 11.2 14l3.6-4" />
              </svg>
            </span>
            <strong>{{ resetPasswordDialog.username }}</strong>
          </div>
          <p id="reset-password-dialog-description">
            {{
              t("admin.employee.resetPasswordConfirm", { username: resetPasswordDialog.username })
            }}
          </p>
          <div class="reset-password-security-note">
            {{ t("admin.employee.temporaryPasswordWarning") }}
          </div>
          <p v-if="resetPasswordDialog.error" class="reset-password-error" role="alert">
            {{ resetPasswordDialog.error }}
          </p>
        </div>
        <div class="modal-actions reset-password-actions">
          <button
            type="button"
            :disabled="resetPasswordDialog.pending"
            @click="closeResetPasswordDialog"
          >
            {{ t("common.cancel") }}
          </button>
          <button
            ref="resetPasswordConfirmButtonRef"
            class="primary"
            type="button"
            :disabled="resetPasswordDialog.pending"
            @click="confirmResetPassword"
          >
            {{
              resetPasswordDialog.pending
                ? `${t("admin.employee.resetPassword")}…`
                : t("admin.employee.resetPassword")
            }}
          </button>
        </div>
      </div>
    </div></WorkspaceDialogTransition
  >

  <WorkspaceDialogTransition
    ><div v-if="temporaryPasswordDialog.open" class="modal-backdrop">
      <div
        class="modal temporary-password-modal workspace-modal--form"
        ref="resultElement"
        tabindex="-1"
        @keydown="resultFocus.onDialogKeydown"
        role="dialog"
        aria-modal="true"
        aria-labelledby="temporary-password-dialog-title"
        aria-describedby="temporary-password-dialog-description"
      >
        <header>
          <div>
            <p>RESET CREDENTIAL</p>
            <h2 id="temporary-password-dialog-title">
              {{ t("admin.employee.temporaryPasswordTitle") }}
            </h2>
          </div>
          <button
            type="button"
            :aria-label="t('common.close')"
            @click="closeTemporaryPasswordDialog"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        <div class="temporary-password-content">
          <p id="temporary-password-dialog-description">
            {{
              t("admin.employee.temporaryPasswordDescription", {
                username: temporaryPasswordDialog.username
              })
            }}
          </p>
          <code>{{ temporaryPasswordDialog.password }}</code>
          <strong>{{ t("admin.employee.temporaryPasswordWarning") }}</strong>
        </div>
        <div class="modal-actions">
          <button
            ref="temporaryPasswordCopyButtonRef"
            :disabled="copying"
            type="button"
            @click="copyTemporaryPassword"
          >
            {{
              t(
                temporaryPasswordDialog.copied
                  ? "admin.employee.temporaryPasswordCopied"
                  : "admin.employee.copyTemporaryPassword"
              )
            }}
          </button>
          <button class="primary" type="button" @click="closeTemporaryPasswordDialog">
            {{ t("admin.employee.temporaryPasswordStored") }}
          </button>
        </div>
      </div>
    </div></WorkspaceDialogTransition
  >
</template>
<style scoped src="./adminEmployeeDialogStyles.css"></style>

<style scoped src="../../components/workspace/workspaceDialogStyles.css"></style>
