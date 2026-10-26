<template>
  <div data-i18n-ignore data-module="handover">
    <div class="workspace-view">
      <div class="list-page list-page-full business-handover-page">
        <div class="list-page-header">
          <div>
            <span class="business-overview-kicker">{{
              t("customers.businessHandoverKicker")
            }}</span>
            <h2>
              {{
                isOverseaAgent ? t("customers.businessTransfer") : t("customers.businessHandover")
              }}
            </h2>
            <p>{{ t("customers.businessHandoverHint") }}</p>
          </div>
          <el-button
            :loading="loadingBusinessHandoverAgents || loadingBusinessHandoverRequests"
            @click="refreshBusinessHandoverData"
          >
            <el-icon><Refresh /></el-icon>{{ t("customers.refresh") }}
          </el-button>
        </div>
        <p v-if="isOverseaAgent" class="business-handover-readonly">
          {{ t("customers.businessHandoverReadonlyHint") }}
        </p>
        <template v-if="canRequestBusinessHandover">
          <ol class="handover-workflow-strip" :aria-label="t('customers.businessHandover')">
            <li>
              <span>1</span>
              <div>
                <b>{{ t("customers.handoverWorkflowSubmit") }}</b
                ><small>{{ t("customers.handoverWorkflowSubmitHint") }}</small>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <b>{{ t("customers.handoverWorkflowComplete") }}</b
                ><small>{{ t("customers.handoverWorkflowCompleteHint") }}</small>
              </div>
            </li>
          </ol>

          <section class="handover-section">
            <header class="handover-section-header">
              <div>
                <h3>{{ t("customers.myHandoverRequests") }}</h3>
                <p>{{ t("customers.myHandoverRequestsHint") }}</p>
              </div>
              <el-select
                v-model="businessHandoverRequestStatus"
                class="business-select handover-status-filter"
                @change="changeBusinessHandoverRequestStatus"
              >
                <el-option value="" :label="t('customers.handoverStatusAll')" />
                <el-option value="PENDING" :label="t('customers.handoverStatusPending')" />
                <el-option value="APPROVED" :label="t('customers.handoverStatusApproved')" />
                <el-option value="REJECTED" :label="t('customers.handoverStatusRejected')" />
              </el-select>
            </header>
            <el-table
              :data="businessHandoverRequests"
              v-loading="loadingBusinessHandoverRequests"
              class="standard-information-table business-handover-request-table"
            >
              <el-table-column :label="t('customers.handoverRequestId')" width="118">
                <template #default="{ row }"
                  ><b class="handover-request-id">#{{ row.requestId }}</b></template
                >
              </el-table-column>
              <el-table-column :label="t('customers.status')" width="116">
                <template #default="{ row }">
                  <el-tag :type="businessHandoverStatusType(row.status)" effect="light">
                    {{ businessHandoverStatusLabel(row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="t('customers.handoverRoute')" min-width="230">
                <template #default="{ row }">
                  <div class="handover-route-cell">
                    <span>{{
                      row.sourceBusinessUserName || row.sourceBusinessUser?.displayName || "—"
                    }}</span>
                    <el-icon><ArrowRight /></el-icon>
                    <b>{{
                      row.targetBusinessUserName || row.targetBusinessUser?.displayName || "—"
                    }}</b>
                  </div>
                </template>
              </el-table-column>
              <el-table-column
                :label="t('customers.handoverCustomerCount')"
                width="120"
                align="center"
              >
                <template #default="{ row }">{{
                  row.customerCount || row.customerIds?.length || 0
                }}</template>
              </el-table-column>
              <el-table-column
                prop="reason"
                :label="t('customers.handoverReason')"
                min-width="230"
                show-overflow-tooltip
              />
              <el-table-column :label="t('customers.handoverRequestedAt')" width="170">
                <template #default="{ row }">{{ formatDateTime(row.requestedAt) }}</template>
              </el-table-column>
              <el-table-column
                :label="t('customers.handoverReviewComment')"
                min-width="190"
                show-overflow-tooltip
              >
                <template #default="{ row }">{{
                  formatDateTime(row.reviewedAt || row.updatedAt)
                }}</template>
              </el-table-column>
              <template #empty>
                <el-empty :description="t('customers.noHandoverRequests')" />
              </template>
            </el-table>
            <el-pagination
              v-if="businessHandoverRequestTotal > 0"
              class="shipment-pagination unified-pagination"
              background
              layout="total, sizes, prev, pager, next"
              :current-page="businessHandoverRequestPage + 1"
              :page-size="businessHandoverRequestPageSize"
              :page-sizes="[10, 20, 50]"
              :total="businessHandoverRequestTotal"
              @current-change="changeBusinessHandoverRequestPage"
              @size-change="changeBusinessHandoverRequestPageSize"
            />
          </section>
        </template>

        <section v-if="isOverseaAgent" class="handover-section">
          <header class="handover-section-header">
            <div>
              <h3>{{ t("customers.chooseHandoverReceiver") }}</h3>
              <p>{{ t("customers.chooseHandoverReceiverHint") }}</p>
            </div>
          </header>
          <el-form class="handover-agent-transfer-form" label-position="top">
            <el-form-item :label="t('customers.handoverCustomers')">
              <el-select
                v-model="overseaTransferCustomerIds"
                multiple
                filterable
                class="business-select"
                popper-class="business-select-popper"
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
          </el-form>
          <el-table
            :data="transferAgents"
            v-loading="loadingTransferAgents"
            class="standard-information-table business-handover-table"
          >
            <el-table-column type="index" :label="t('customers.index')" width="70" />
            <el-table-column :label="t('customers.targetAgent')" min-width="240">
              <template #default="{ row }">
                <div class="handover-agent-cell">
                  <span class="handover-agent-avatar">{{
                    (row.displayName || row.username || "?").slice(0, 1).toUpperCase()
                  }}</span>
                  <span>
                    <b>{{ row.displayName || row.username }}</b>
                    <small>@{{ row.username }}</small>
                  </span>
                </div>
              </template>
            </el-table-column>
            <el-table-column
              prop="linkedCustomerCount"
              :label="t('customers.ownedCustomerCount')"
              width="160"
              align="center"
            />
            <el-table-column :label="t('customers.status')" width="120">
              <template #default="{ row }">
                <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'danger'" effect="light">
                  {{ statusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column
              :label="t('customers.actions')"
              width="180"
              :fixed="compact ? undefined : 'right'"
            >
              <template #default="{ row }">
                <el-button
                  type="primary"
                  :loading="transferringCustomers && transferForm.targetAgentId === String(row.id)"
                  :disabled="
                    row.status !== 'ACTIVE' ||
                    row.current ||
                    !overseaTransferCustomerIds.length ||
                    handoverWriteBusy ||
                    loadingTransferAgents
                  "
                  @click="submitOverseaAgentTransfer(row)"
                  >{{ t("customers.confirmTransfer") }}</el-button
                >
              </template>
            </el-table-column>
            <template #empty>
              <el-empty :description="t('customers.noTransferAgents')" />
            </template>
          </el-table>
        </section>

        <section v-else class="handover-section">
          <header class="handover-section-header">
            <div>
              <h3>{{ t("customers.chooseHandoverReceiver") }}</h3>
              <p>{{ t("customers.chooseHandoverReceiverHint") }}</p>
            </div>
          </header>
          <el-table
            :data="businessHandoverAgents"
            v-loading="loadingBusinessHandoverAgents"
            class="standard-information-table business-handover-table"
          >
            <el-table-column type="index" :label="t('customers.index')" width="70" />
            <el-table-column :label="t('customers.businessOperator')" min-width="240">
              <template #default="{ row }">
                <div class="handover-agent-cell">
                  <span class="handover-agent-avatar">{{
                    (row.displayName || row.username || "?").slice(0, 1).toUpperCase()
                  }}</span>
                  <span>
                    <b>{{ row.displayName || row.username }}</b>
                    <small>@{{ row.username }}</small>
                  </span>
                  <el-tag v-if="row.current" type="info" effect="plain">{{
                    t("customers.currentBusinessOperator")
                  }}</el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column
              prop="customerCount"
              :label="t('customers.ownedCustomerCount')"
              width="160"
              align="center"
            />
            <el-table-column :label="t('customers.status')" width="120">
              <template #default="{ row }">
                <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'danger'" effect="light">
                  {{ statusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column
              v-if="canRequestBusinessHandover"
              :label="t('customers.actions')"
              width="180"
              fixed="right"
            >
              <template #default="{ row }">
                <el-button
                  type="primary"
                  :disabled="
                    row.current || row.status !== 'ACTIVE' || !handoverEligibleCustomers.length
                  "
                  @click="openBusinessHandover(row)"
                  >{{ t("customers.startBusinessHandover") }}</el-button
                >
              </template>
            </el-table-column>
            <template #empty>
              <el-empty :description="t('customers.noBusinessOperators')" />
            </template>
          </el-table>
        </section>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { toRefs } from "vue";
import { useI18n } from "vue-i18n";
import { useModulePages } from "../../moduleContext.js";
import { Refresh, ArrowRight } from "@element-plus/icons-vue";
import { useMediaQuery } from "../../../composables/useMediaQuery.js";
const { t } = useI18n();
const workspace = useModulePages("handover").page;
const { canRequestBusinessHandover, isOverseaAgent } = toRefs(workspace.permissions);
const {
  businessHandoverAgents,
  businessHandoverRequestPage,
  businessHandoverRequestPageSize,
  businessHandoverRequestStatus,
  businessHandoverRequestTotal,
  businessHandoverRequests,
  handoverEligibleCustomers,
  handoverWriteBusy,
  loadingBusinessHandoverAgents,
  loadingBusinessHandoverRequests,
  loadingTransferAgents,
  overseaTransferCustomerIds,
  transferAgents,
  transferForm,
  transferringCustomers
} = toRefs(workspace.state);
const actions = workspace.actions;
const {
  changeBusinessHandoverRequestPage,
  changeBusinessHandoverRequestPageSize,
  changeBusinessHandoverRequestStatus,
  openBusinessHandover,
  refreshBusinessHandoverData,
  submitOverseaAgentTransfer
} = actions;
const {
  businessHandoverStatusLabel,
  businessHandoverStatusType,
  customerFilterOptionLabel,
  formatDateTime,
  statusLabel
} = workspace.formatters;
const compact = useMediaQuery("(max-width: 680px)");
</script>
<style scoped>
.is-page-switching :deep(.el-table__body-wrapper) {
  opacity: 0.52;
  transform: translateY(3px);
}
@keyframes shipment-updating-spin {
  to {
    transform: rotate(360deg);
  }
}
.list-page {
  max-width: none;
  width: 100%;
}
.list-page-full {
  max-width: none;
  width: 100%;
  padding: 20px 22px 22px;
  box-sizing: border-box;
}
.list-page-full :deep(.el-table) {
  width: 100% !important;
}
.list-page-full :deep(.el-table__body-wrapper),
.list-page-full :deep(.el-table__header-wrapper) {
  width: 100%;
}
.workspace-view {
  width: 100%;
  min-width: 0;
}
.workspace-view {
  padding-inline: 2px;
}
.list-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.list-page-header h2 {
  margin: 0;
  font-size: 20px;
  color: #0f1d2e;
  letter-spacing: -0.02em;
}
.business-overview-kicker {
  display: block;
  margin-bottom: 5px;
  color: #3982be;
  font-size: 9px;
  font-weight: 850;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.standard-information-table :deep(.el-table__body-wrapper) {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}
.business-handover-readonly {
  margin: 0 0 14px;
  padding: 10px 12px;
  border: 1px solid #cddfec;
  border-radius: 8px;
  color: #46657f;
  background: #f4f9fc;
}
@keyframes business-kpi-in {
  from {
    opacity: 0;
    transform: translateY(9px);
  }
}
.shipment-pagination {
  display: flex;
  width: 100%;
  max-width: 100%;
  justify-content: flex-end;
  padding: 18px 2px 4px;
  overflow: hidden;
  flex-wrap: wrap;
  row-gap: 8px;
}
.shipment-pagination :deep(.el-pagination__sizes),
.shipment-pagination :deep(.el-select) {
  width: 96px;
  max-width: 96px;
}
.shipment-pagination :deep(.el-pagination__sizes) {
  margin: 0 6px 0 8px;
}
.shipment-pagination :deep(.el-pagination__sizes .el-select__wrapper) {
  min-height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 0 0 1px #c7d5e4 inset;
}
.shipment-pagination :deep(.el-pagination__sizes .el-select__selected-item) {
  color: #28445e;
  font-size: 13px;
  font-weight: 700;
}
.shipment-pagination :deep(.btn-prev),
.shipment-pagination :deep(.btn-next),
.shipment-pagination :deep(.el-pager li) {
  min-width: 32px;
  height: 32px;
  border-radius: 8px !important;
  font-size: 13px;
}
.shipment-pagination :deep(.el-pager li.is-active) {
  background: #287ccb;
  box-shadow: 0 5px 12px rgba(40, 124, 203, 0.22);
}
.shipment-pagination :deep(.el-pagination__total) {
  margin-right: 8px;
  color: #60758a;
  font-size: 13px;
}
.business-handover-page .list-page-header p {
  margin: 6px 0 0;
  color: #71869a;
  font-size: 13px;
}
.handover-workflow-strip {
  display: grid;
  margin: 0 0 26px;
  padding: 0;
  border: 1px solid #dbe5ee;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 4px 14px rgba(21, 48, 72, 0.04);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  list-style: none;
}
.handover-workflow-strip li {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
}
.handover-workflow-strip li + li {
  border-left: 1px solid #e2e9f0;
}
.handover-workflow-strip li > span {
  display: grid;
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: #0e699e;
  background: #e7f3f9;
  font-size: 13px;
  font-weight: 850;
  place-items: center;
}
.handover-workflow-strip li > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.handover-workflow-strip b {
  color: #193a55;
  font-size: 13px;
}
.handover-workflow-strip small {
  color: #71869a;
  font-size: 11px;
  line-height: 1.45;
}
.handover-section {
  display: grid;
  margin-top: 24px;
  gap: 12px;
}
.handover-section-header {
  display: flex;
  min-width: 0;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  padding-inline: 2px;
}
.handover-section-header h3 {
  margin: 0;
  color: #173750;
  font-size: 16px;
}
.handover-section-header p {
  margin: 5px 0 0;
  color: #74889b;
  font-size: 12px;
}
.handover-status-filter {
  width: 168px !important;
}
.business-handover-table {
  border-radius: 12px;
}
.business-handover-request-table {
  border-radius: 12px;
}
.handover-request-id {
  color: #145f8b;
  font:
    750 12px/1.4 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
}
.handover-route-cell {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}
.handover-route-cell > span,
.handover-route-cell > b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.handover-route-cell > span {
  color: #667d91;
}
.handover-route-cell > .el-icon {
  flex: 0 0 auto;
  color: #8ba0b2;
}
.handover-route-cell > b {
  color: #183d59;
}
.handover-agent-cell {
  display: flex;
  align-items: center;
  gap: 11px;
}
.handover-agent-cell > span:nth-child(2) {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.handover-agent-cell b {
  color: #203d57;
  font-size: 14px;
}
.handover-agent-cell small {
  color: #7c91a5;
  font-size: 12px;
}
.handover-agent-avatar {
  display: grid;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  color: #fff;
  background: linear-gradient(135deg, #2878bc, #56b9d2);
  box-shadow: 0 7px 16px rgba(40, 120, 188, 0.18);
  font-size: 14px;
  font-weight: 850;
  place-items: center;
}
@keyframes operations-overlay-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes operations-dialog-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
@keyframes customer-batch-shimmer {
  to {
    background-position: -200% 0;
  }
}
@keyframes customer-rule-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
:deep(.business-select) {
  width: 100%;
}
@media (max-width: 900px) {
  .shipment-pagination :deep(.el-pagination__total) {
    display: none;
  }
}
@media (max-width: 680px) {
  .workspace-view {
    padding-inline: 0;
  }
  .handover-workflow-strip {
    grid-template-columns: 1fr;
  }
  .handover-workflow-strip li + li {
    border-top: 1px solid #e2e9f0;
    border-left: 0;
  }
  .handover-section-header {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }
  .handover-status-filter {
    width: 100% !important;
  }
}
@keyframes batch-subtask-pulse {
  50% {
    opacity: 0.35;
    transform: scale(0.75);
  }
}
.workspace-view {
  min-width: 0;
  width: 100%;
}
</style>
