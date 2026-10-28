<template>
  <div data-i18n-ignore>
    <Teleport to="body"
      ><WorkspaceDialogTransition
        ><div
          v-if="resetPasswordDialogOpen"
          class="customer-code-overlay"
          role="presentation"
          @keydown="onDialogKeydown"
          @click.self="closeResetPasswordDialog"
        >
          <section
            class="customer-code-dialog customer-create-dialog workspace-modal--confirm"
            ref="dialogElement"
            tabindex="-1"
            role="dialog"
            :aria-busy="mutatingCustomer"
            aria-modal="true"
            :aria-label="t('customers.resetPassword')"
          >
            <span class="customer-code-kicker">{{ t("customers.dialogKickerSecureReset") }}</span>
            <h2>{{ t("customers.resetPassword") }}</h2>
            <p>
              {{
                t("customers.resetPasswordDescription", {
                  name: selectedCustomer?.displayName || selectedCustomer?.username || ""
                })
              }}
            </p>
            <WorkspaceDialogFeedback />
            <form class="customer-dialog-form" @submit.prevent="resetPassword">
              <div class="password-rule-preview">
                <span>{{ t("customers.defaultPasswordRule") }}</span>
                <code>{{ selectedCustomer?.username }}!@#2026</code>
              </div>
              <div class="customer-dialog-actions">
                <button type="button" @click="closeResetPasswordDialog">
                  {{ t("customers.cancel") }}
                </button>
                <button class="customer-access-primary" type="submit" :disabled="mutatingCustomer">
                  {{ t("customers.confirmResetPassword") }}
                </button>
              </div>
            </form>
          </section>
        </div></WorkspaceDialogTransition
      ></Teleport
    >
  </div>
</template>
<script setup lang="ts">
import WorkspaceDialogFeedback from "../../../components/workspace/WorkspaceDialogFeedback.vue";
import WorkspaceDialogTransition from "../../../components/workspace/WorkspaceDialogTransition.vue";
import { toRefs, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useModulePages } from "../../moduleContext.js";
import { useDialogFocus } from "../../../composables/useDialogFocus.js";
const { t } = useI18n();
const workspace = useModulePages("customers").passwordDialog;
const { mutatingCustomer, resetPasswordDialogOpen, selectedCustomer } = toRefs(workspace.state);
const actions = workspace.actions;
const { closeResetPasswordDialog, resetPassword } = actions;
const dialogElement = ref(null);
const { onDialogKeydown } = useDialogFocus({
  dialogElement,
  isOpen: () => Boolean(resetPasswordDialogOpen.value),
  isBusy: () => Boolean(mutatingCustomer.value),
  close: closeResetPasswordDialog
});
</script>
<style scoped src="../../shared/styles/businessDialogs.css"></style>
<style scoped>
.password-rule-preview {
  display: grid !important;
  gap: 8px !important;
  padding: 14px;
  border: 1px solid #d6e3ee;
  border-radius: var(--radius-control);
  color: #5c7186;
  background: #f6f9fc;
}
.password-rule-preview code {
  color: #0e5f97;
  font:
    800 14px/1.5 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
}
</style>

<style scoped src="../../../components/workspace/workspaceDialogStyles.css"></style>
