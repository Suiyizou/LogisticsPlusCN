<template>
  <div data-i18n-ignore>
    <Teleport to="body"
      ><div
        v-if="passwordResetResult.open"
        class="customer-code-overlay"
        role="presentation"
        @keydown="onDialogKeydown"
        @click.self="closePasswordResetResult"
      >
        <section
          class="customer-code-dialog password-result-dialog"
          ref="dialogElement"
          tabindex="-1"
          role="dialog"
          :aria-busy="false"
          aria-modal="true"
          :aria-label="t('customers.passwordResetResultTitle')"
        >
          <span class="customer-code-kicker">{{ t("customers.dialogKickerSecureReset") }}</span>
          <h2>{{ t("customers.passwordResetResultTitle") }}</h2>
          <p>{{ t("customers.passwordResetResultHint") }}</p>
          <dl class="password-result-grid">
            <div>
              <dt>{{ t("customers.username") }}</dt>
              <dd>{{ passwordResetResult.username }}</dd>
            </div>
            <div>
              <dt>{{ t("customers.newPassword") }}</dt>
              <dd>
                <code>{{ passwordResetResult.password }}</code>
              </dd>
            </div>
          </dl>
          <div class="customer-dialog-actions">
            <button
              type="button"
              :disabled="passwordResetResult.copying"
              @click="copyPasswordResetResult"
            >
              {{
                passwordResetResult.copied ? t("customers.copied") : t("customers.copyCredentials")
              }}
            </button>
            <button class="customer-access-primary" type="button" @click="closePasswordResetResult">
              {{ t("customers.close") }}
            </button>
          </div>
        </section>
      </div></Teleport
    >
  </div>
</template>
<script setup lang="ts">
import { toRefs, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useModulePages } from "../../moduleContext.js";
import { useDialogFocus } from "../../../composables/useDialogFocus.js";
const { t } = useI18n();
const workspace = useModulePages("customers").passwordResultDialog;
const { passwordResetResult } = toRefs(workspace.state);
const actions = workspace.actions;
const { closePasswordResetResult, copyPasswordResetResult } = actions;
const dialogElement = ref(null);
const { onDialogKeydown } = useDialogFocus({
  dialogElement,
  isOpen: () => Boolean(passwordResetResult.value.open),
  isBusy: () => Boolean(false),
  close: closePasswordResetResult
});
</script>
<style scoped src="../../shared/styles/businessDialogs.css"></style>
<style scoped>
.password-result-grid code {
  color: #0e5f97;
  font:
    800 14px/1.5 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
}
.password-result-grid {
  display: grid !important;
  gap: 8px !important;
  margin: 0;
}
.password-result-grid > div {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 12px;
  padding: 11px 12px;
  border: 1px solid #dce6ef;
  border-radius: 4px;
  background: #f7fafc;
}
.password-result-grid dt {
  color: #657b90;
  font-weight: 700;
}
.password-result-grid dd {
  margin: 0;
  color: #17314a;
  font-weight: 800;
  overflow-wrap: anywhere;
}
</style>
