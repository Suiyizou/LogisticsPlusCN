<template>
  <div data-i18n-ignore>
    <el-dialog
      :model-value="businessHandoverDialogOpen"
      :before-close="closeBusinessHandover"
      :title="t('customers.businessHandoverDialogTitle')"
      width="min(620px, 92vw)"
      append-to-body
      class="business-handover-dialog workspace-el-dialog"
      :show-close="!submittingBusinessHandover"
      :close-on-click-modal="!submittingBusinessHandover"
      :close-on-press-escape="!submittingBusinessHandover"
    >
      <div class="handover-target-summary">
        <span class="handover-agent-avatar">{{
          (businessHandoverTarget?.displayName || "?").slice(0, 1).toUpperCase()
        }}</span>
        <span>
          <small>{{ t("customers.handoverTargetBusinessOperator") }}</small>
          <b>{{ businessHandoverTarget?.displayName }} (@{{ businessHandoverTarget?.username }})</b>
        </span>
      </div>
      <el-form label-position="top">
        <el-form-item :label="t('customers.handoverCustomers')">
          <el-select
            v-model="businessHandoverForm.customerIds"
            :disabled="submittingBusinessHandover"
            class="business-select"
            popper-class="business-select-popper"
            multiple
            filterable
            collapse-tags
            :max-collapse-tags="3"
            :placeholder="t('customers.handoverCustomersPlaceholder')"
          >
            <el-option
              v-for="customer in handoverEligibleCustomers"
              :key="customer.id"
              :value="customer.id"
              :label="customerFilterOptionLabel(customer)"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('customers.handoverReason')" required>
          <el-input
            v-model="businessHandoverForm.reason"
            :disabled="submittingBusinessHandover"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            :placeholder="t('customers.handoverReasonPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <p class="handover-permission-hint">{{ t("customers.businessHandoverPermissionHint") }}</p>
      <template #footer>
        <el-button :disabled="submittingBusinessHandover" @click="closeBusinessHandover">
          {{ t("customers.cancel") }}
        </el-button>
        <el-button
          type="primary"
          :loading="submittingBusinessHandover"
          :disabled="
            handoverWriteBusy ||
            !businessHandoverForm.customerIds.length ||
            !businessHandoverForm.reason.trim()
          "
          @click="submitBusinessHandover"
          >{{ t("customers.confirmBusinessHandover") }}</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import { toRefs } from "vue";
import { useI18n } from "vue-i18n";
import { useModulePages } from "../../moduleContext.js";
const { t } = useI18n();
const workspace = useModulePages("handover").businessDialog;
const {
  businessHandoverDialogOpen,
  businessHandoverForm,
  businessHandoverTarget,
  handoverEligibleCustomers,
  handoverWriteBusy,
  submittingBusinessHandover
} = toRefs(workspace.state);
const actions = workspace.actions;
const { closeBusinessHandover, submitBusinessHandover } = actions;
const { customerFilterOptionLabel } = workspace.formatters;
</script>
<style scoped src="../../shared/styles/businessDialogs.css"></style>
<style scoped>
.handover-agent-avatar {
  display: grid;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-control);
  color: #fff;
  background: var(--color-primary);
  box-shadow: none;
  font-size: 14px;
  font-weight: 600;
  place-items: center;
}
.handover-target-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  padding: 14px 16px;
  border: 1px solid #cfe0ef;
  border-radius: var(--radius-control);
  background: var(--color-surface-subtle);
}
.handover-target-summary > span:last-child {
  display: grid;
  gap: 4px;
}
.handover-target-summary small {
  color: #72889c;
  font-size: 12px;
}
.handover-target-summary b {
  color: #1e405b;
  font-size: 14px;
}
.handover-permission-hint {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #d8e6f1;
  border-radius: var(--radius-control);
  color: #5d758a;
  background: #f7fafc;
  font-size: 12px;
  line-height: 1.6;
}
</style>

<style scoped src="../../../components/workspace/workspaceElementDialog.css"></style>
