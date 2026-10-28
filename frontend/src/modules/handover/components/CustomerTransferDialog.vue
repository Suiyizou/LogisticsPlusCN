<template>
  <div data-i18n-ignore>
    <Teleport to="body"
      ><div
        v-if="transferDialogOpen"
        class="customer-code-overlay"
        role="presentation"
        @keydown="onDialogKeydown"
        @click.self="closeCustomerTransfer"
      >
        <section
          class="customer-code-dialog customer-transfer-dialog"
          ref="dialogElement"
          tabindex="-1"
          role="dialog"
          :aria-busy="transferringCustomers"
          aria-modal="true"
          :aria-label="t('customers.transferTitle')"
        >
          <span class="customer-code-kicker">OVERSEA AGENT ASSIGNMENT</span>
          <h2>{{ t("customers.transferTitle") }}</h2>
          <p>{{ t("customers.transferDescription", { count: transferCustomerIds.length }) }}</p>
          <form class="customer-dialog-form" @submit.prevent="submitCustomerTransfer">
            <label>
              <span>{{ t("customers.targetAgent") }} <i class="required-star">*</i></span>
              <el-select
                v-model="transferForm.targetAgentId"
                :disabled="transferringCustomers"
                class="business-select"
                :placeholder="t('customers.targetAgentPlaceholder')"
                :loading="loadingTransferAgents"
                filterable
              >
                <el-option
                  v-for="agent in activeTransferAgents"
                  :key="agent.id"
                  :value="String(agent.id)"
                  :label="`${agent.displayName} (@${agent.username})`"
                />
                <template #label="{ value }">
                  <span class="business-select-value">{{ selectedAgentOptionLabel(value) }}</span>
                </template>
              </el-select>
            </label>
            <small class="customer-transfer-hint">{{
              t("customers.transferPermissionHint")
            }}</small>
            <div class="customer-dialog-actions">
              <button type="button" @click="closeCustomerTransfer">
                {{ t("customers.cancel") }}
              </button>
              <button
                class="customer-access-primary"
                type="submit"
                :disabled="
                  handoverWriteBusy || loadingTransferAgents || !transferForm.targetAgentId
                "
              >
                {{
                  transferringCustomers
                    ? t("customers.transferring")
                    : t("customers.confirmTransfer")
                }}
              </button>
            </div>
          </form>
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
const workspace = useModulePages("handover").transferDialog;
const {
  activeTransferAgents,
  handoverWriteBusy,
  loadingTransferAgents,
  transferCustomerIds,
  transferDialogOpen,
  transferForm,
  transferringCustomers
} = toRefs(workspace.state);
const actions = workspace.actions;
const { closeCustomerTransfer, submitCustomerTransfer } = actions;
const { selectedAgentOptionLabel } = workspace.formatters;
const dialogElement = ref(null);
const { onDialogKeydown } = useDialogFocus({
  dialogElement,
  isOpen: () => Boolean(transferDialogOpen.value),
  isBusy: () => Boolean(transferringCustomers.value),
  close: closeCustomerTransfer
});
</script>
<style scoped src="../../shared/styles/businessDialogs.css"></style>
<style scoped>
.business-select-value {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: #18324b;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.customer-transfer-hint {
  display: block;
  color: var(--color-muted);
  line-height: 1.6;
  margin-top: -4px;
}
</style>
