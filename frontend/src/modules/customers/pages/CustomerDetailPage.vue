<template>
  <section v-if="selectedCustomer" class="module-page" data-module="customers">
    <button class="back-button" @click="navigateTo('customers')">
      {{ t("customers.backToList") }}
    </button>
    <WorkspacePageHeader
      :title="selectedCustomer.displayName || selectedCustomer.username"
      :eyebrow="t('customers.detailEyebrow')"
      :description="wt('directoryHint')"
      ><template #meta
        ><WorkspaceStatus
          :tone="selectedCustomer.status === 'ACTIVE' ? 'success' : 'neutral'"
          :label="statusLabel(selectedCustomer.status)"
        /><span class="customer-detail-meta"
          >@{{ selectedCustomer.username }} · {{ partyRoleLabel(selectedCustomer.partyRole) }}</span
        ></template
      ><template #actions
        ><div v-if="isManager" class="main-card-header-actions">
          <el-button text @click="resetPasswordDialogOpen = true" :disabled="mutatingCustomer">
            {{ t("customers.resetPassword") }}
          </el-button>
          <el-button
            v-if="selectedCustomer.status === 'ACTIVE'"
            text
            type="danger"
            @click="deactivateCustomer"
            :disabled="mutatingCustomer"
          >
            {{ t("customers.deactivate") }}
          </el-button>
          <el-button v-else text @click="reactivateCustomer" :disabled="mutatingCustomer">
            {{ t("customers.reactivate") }}
          </el-button>
        </div></template
      ></WorkspacePageHeader
    >
    <el-card class="main-card" shadow="never">
      <section class="profile-section">
        <h2 class="customer-profile-heading">{{ t("customers.profileTitle") }}</h2>
        <el-form
          class="profile-form"
          :disabled="!isManager || mutatingCustomer"
          @submit.prevent="saveCustomer"
          label-position="top"
        >
          <el-row :gutter="16">
            <el-col :xs="24" :sm="12" :lg="8">
              <el-form-item :label="t('customers.username')">
                <el-input v-model.trim="editForm.username" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :lg="8">
              <el-form-item :label="t('customers.displayName')">
                <el-input v-model.trim="editForm.displayName" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :lg="8">
              <el-form-item :label="t('customers.clientCode')">
                <div class="client-code-inline">
                  <el-tag
                    :type="selectedCustomer.clientCode ? 'success' : 'warning'"
                    effect="plain"
                  >
                    {{ selectedCustomer.clientCode || t("customers.missingValue") }}
                  </el-tag>
                  <el-button v-if="isManager" text size="small" @click="openClientCodeSupplement">
                    {{
                      selectedCustomer.clientCode
                        ? t("customers.editSupplement")
                        : t("customers.manualSupplement")
                    }}
                  </el-button>
                </div>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :xs="24" :sm="12" :lg="8">
              <el-form-item :label="t('customers.partyRole')">
                <el-select
                  v-model="editForm.partyRole"
                  class="business-select"
                  popper-class="business-comp-select business-select-popper"
                >
                  <el-option value="SHIPPER" :label="t('customers.roleShipper')" />
                  <el-option value="CONSIGNEE" :label="t('customers.roleConsignee')" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :lg="8">
              <el-form-item :label="t('customers.contactEmail')">
                <el-input v-model.trim="editForm.contactEmail" type="email" maxlength="254" />
              </el-form-item>
            </el-col>
            <el-col
              v-if="isManager"
              :xs="24"
              :sm="24"
              :lg="8"
              style="display: flex; align-items: flex-end; padding-bottom: 18px"
            >
              <el-button type="primary" native-type="submit" :disabled="mutatingCustomer">
                {{ t("customers.saveProfile") }}
              </el-button>
            </el-col>
          </el-row>
        </el-form>
      </section>
    </el-card>

    <el-card
      v-if="isManager && selectedCustomer.partyRole === 'OVERSEA_AGENT'"
      class="main-card"
      shadow="never"
    >
      <template #header>
        <div class="section-label">{{ t("customers.linkedCustomersTitle") }}</div>
      </template>
      <p class="section-description">
        {{ t("customers.linkedCustomersDescription") }}
      </p>
      <el-select
        v-model="linkedCustomerIds"
        class="business-select"
        popper-class="business-comp-select business-select-popper"
        multiple
        filterable
        collapse-tags
        :max-collapse-tags="3"
        :loading="loadingLinkedCustomers"
        :disabled="loadingLinkedCustomers || savingLinkedCustomers || mutatingCustomer"
        :placeholder="t('customers.linkedCustomersPlaceholder')"
      >
        <el-option
          v-for="customer in linkableCustomers"
          :key="customer.id"
          :value="customer.id"
          :label="`${customer.displayName || customer.username} · ${partyRoleLabel(customer.partyRole)}`"
        />
      </el-select>
      <div class="linked-customer-actions">
        <el-button type="primary" :loading="savingLinkedCustomers" @click="saveLinkedCustomers">{{
          t("customers.saveLinkedCustomers")
        }}</el-button>
      </div>
    </el-card>

    <el-card class="main-card" shadow="never">
      <template #header>
        <div class="section-label">{{ t("customers.shipmentsTitle") }}</div>
      </template>

      <el-card v-if="isManager" class="bind-form-card" shadow="never">
        <div class="bind-mode-switch">
          <el-radio-group :model-value="bindMode" @update:model-value="updateBindMode" size="small">
            <el-radio-button value="reference">{{
              t("customers.bindByReference")
            }}</el-radio-button>
            <el-radio-button value="shipmentId">{{
              t("customers.bindByShipmentId")
            }}</el-radio-button>
          </el-radio-group>
        </div>
        <el-form class="bind-form" @submit.prevent="bindShipment" label-position="top">
          <template v-if="bindMode === 'shipmentId'">
            <el-form-item :label="t('customers.shipmentId')" class="bind-wide">
              <el-input
                v-model.trim="bindForm.shipmentId"
                :placeholder="t('customers.shipmentIdPlaceholder')"
              />
              <template #extra
                ><small>{{ t("customers.shipmentIdHint") }}</small></template
              >
            </el-form-item>
          </template>
          <template v-else>
            <el-row :gutter="12">
              <el-col :xs="24" :sm="12" :lg="8">
                <el-form-item :label="t('customers.carrier')">
                  <el-select
                    v-model="bindForm.carrier"
                    class="business-select"
                    popper-class="business-comp-select business-select-popper"
                  >
                    <el-option
                      v-for="carrier in TRACKING_CARRIERS"
                      :key="carrier.code"
                      :value="carrier.code"
                      :label="carrier.name"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12" :lg="8">
                <el-form-item :label="t('customers.referenceType')">
                  <el-select
                    v-model="bindForm.referenceType"
                    class="business-select"
                    popper-class="business-comp-select business-select-popper"
                  >
                    <el-option value="BOOKING" :label="t('customers.referenceBooking')" />
                    <el-option
                      v-if="supportsShipmentReference(bindForm.carrier, 'BILLOFLADING')"
                      value="BILLOFLADING"
                      :label="t('customers.referenceBill')"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12" :lg="8">
                <el-form-item :label="t('customers.referenceNo')">
                  <el-input
                    v-model.trim="bindForm.referenceNo"
                    :placeholder="t('customers.referenceNoPlaceholder')"
                  />
                </el-form-item>
              </el-col>
            </el-row>
            <p class="reference-hint">{{ t("customers.referenceHint") }}</p>
          </template>
          <el-button type="primary" native-type="submit" :disabled="bindingShipment">
            {{ bindingShipment ? t("customers.binding") : t("customers.bind") }}
          </el-button>
        </el-form>
      </el-card>

      <el-card class="candidate-card" shadow="never">
        <template #header>
          <div class="candidate-header">
            <div>
              <b>{{ t("customers.customerShipmentAccess") }}</b>
              <small v-if="isManager">{{ t("customers.customerShipmentAccessHint") }}</small>
            </div>
            <div class="candidate-header-actions">
              <el-button
                v-if="isManager"
                type="success"
                size="small"
                :disabled="
                  !draftShipments.length || publishingAllShipments || !!publishingShipmentId
                "
                @click="publishAllDraftShipments"
                >{{
                  t("customers.publishAllDrafts", {
                    count: draftShipments.length
                  })
                }}</el-button
              >
              <el-button
                v-if="isManager"
                type="primary"
                size="small"
                :disabled="!selectedCandidateShipmentIds.length || bindingShipment"
                @click="batchBindSelectedShipments"
                >{{
                  t("customers.batchBindSelected", {
                    count: selectedCandidateShipmentIds.length
                  })
                }}</el-button
              >
              <el-button
                type="primary"
                size="small"
                v-if="isManager"
                :disabled="entryBusy"
                @click="openShipmentCreateDialog"
              >
                {{ t("customers.createShipment") }}
              </el-button>
              <el-button
                size="small"
                @click="loadAvailableShipments"
                :disabled="loadingAvailableShipments"
              >
                {{ t("customers.refresh") }}
              </el-button>
            </div>
          </div>
        </template>
        <div v-if="loadingAvailableShipments || loadingShipments" class="empty-hint-compact">
          {{ t("customers.loadingCustomerShipmentAccess") }}
        </div>
        <div
          v-else-if="!shipments.length && (!isManager || !unboundAvailableShipments.length)"
          class="empty-hint-compact"
        >
          {{ t("customers.emptyCustomerShipmentAccess") }}
        </div>
        <div v-else class="candidate-list">
          <div
            v-for="shipment in shipments"
            :key="`bound-${shipment.shipmentId}`"
            class="candidate-row candidate-row--bound"
          >
            <el-checkbox :model-value="false" disabled :aria-label="t('customers.bound')" />
            <span
              ><b>{{ shipment.referenceNo || shipment.shipmentId }}</b
              ><small
                >{{ shipment.carrier || "—" }} ·
                {{ referenceTypeLabel(shipment.referenceType) }}</small
              ></span
            >
            <span class="candidate-status-cell">
              <span
                ><i class="shipment-status-dot"></i
                >{{ shipment.trackingStatus || t("customers.bound") }}</span
              >
              <el-tag
                size="small"
                :type="shipment.publicationStatus === 'PUBLISHED' ? 'success' : 'warning'"
                effect="plain"
              >
                {{
                  shipment.publicationStatus === "PUBLISHED"
                    ? t("customers.published")
                    : t("customers.draft")
                }}
              </el-tag>
            </span>
            <span>{{ formatDate(shipment.assignedAt || shipment.updatedAt) }}</span>
            <span class="candidate-row-actions">
              <el-button text size="small" @click="openShipmentDetail(shipment)">{{
                t(isManager ? "customers.edit" : "customers.detail")
              }}</el-button>
              <el-button
                v-if="isManager && needsManualSupplement(shipment)"
                text
                size="small"
                type="warning"
                @click="openShipmentSupplement(shipment)"
                >{{ t("customers.manualSupplement") }}</el-button
              >
              <el-button
                v-if="isManager"
                :type="shipment.publicationStatus === 'PUBLISHED' ? 'warning' : 'success'"
                plain
                size="small"
                @click="togglePublication(shipment)"
                :disabled="publishingAllShipments || publishingShipmentId === shipment.shipmentId"
                >{{
                  shipment.publicationStatus === "PUBLISHED"
                    ? t("customers.withdraw")
                    : t("customers.publish")
                }}</el-button
              >
              <el-button
                v-if="isManager"
                text
                size="small"
                type="danger"
                @click="unbindShipment(shipment)"
                :disabled="unbindingShipmentId === shipment.shipmentId"
              >
                {{ t("customers.unbind") }}
              </el-button>
            </span>
          </div>
          <div
            v-for="shipment in isManager ? unboundAvailableShipments : []"
            :key="shipment.shipmentId"
            class="candidate-row"
          >
            <el-checkbox
              :model-value="selectedCandidateShipmentIds.includes(shipment.shipmentId)"
              :aria-label="t('customers.selectShipment')"
              @change="(checked) => toggleCandidateShipment(shipment.shipmentId, checked === true)"
            />
            <span
              ><b>{{ shipment.referenceNo || shipment.shipmentId }}</b
              ><small
                >{{ shipment.carrier }} · {{ referenceTypeLabel(shipment.referenceType) }}</small
              ></span
            >
            <span>
              <i class="shipment-status-dot"></i
              >{{ shipment.trackingStatus || t("customers.bound") }}
              <small>{{ boundRoleSummary(shipment) }}</small>
            </span>
            <span>{{ formatDate(shipment.lastTrackedAt || shipment.updatedAt) }}</span>
            <span class="candidate-row-actions">
              <el-button v-if="isManager" text size="small" @click="openShipmentDetail(shipment)">{{
                t("customers.edit")
              }}</el-button>
              <el-button
                v-if="isManager"
                type="primary"
                size="small"
                @click="quickBindShipment(shipment)"
                :disabled="bindingShipment"
                >{{ t("customers.quickBind") }}</el-button
              >
            </span>
          </div>
        </div>
        <el-pagination
          v-if="shipmentTotal > shipmentPageSize"
          class="shipment-pagination"
          background
          layout="prev, pager, next, total"
          :current-page="shipmentPage"
          :page-size="shipmentPageSize"
          :total="shipmentTotal"
          @current-change="changeShipmentPage"
        />
      </el-card>
    </el-card>
  </section>
</template>
<script setup lang="ts">
import {
  TRACKING_CARRIERS,
  supportsShipmentReference
} from "../../../services/trackingCarriers.js";
import { toRefs } from "vue";
import WorkspacePageHeader from "../../../components/workspace/WorkspacePageHeader.vue";
import WorkspaceStatus from "../../../components/workspace/WorkspaceStatus.vue";
import { wt } from "../../../components/workspace/workspaceCopy";
import { useI18n } from "vue-i18n";
import { useModulePages } from "../../moduleContext.js";
const { t } = useI18n();
const pages = useModulePages("customers");
const workspace = pages.detail;
const { isManager } = toRefs(workspace.permissions);
const {
  bindForm,
  bindMode,
  bindingShipment,
  draftShipments,
  editForm,
  entryBusy,
  linkableCustomers,
  linkedCustomerIds,
  loadingAvailableShipments,
  loadingLinkedCustomers,
  loadingShipments,
  mutatingCustomer,
  publishingAllShipments,
  publishingShipmentId,
  resetPasswordDialogOpen,
  savingLinkedCustomers,
  selectedCandidateShipmentIds,
  selectedCustomer,
  shipmentPage,
  shipmentPageSize,
  shipmentTotal,
  shipments,
  unbindingShipmentId,
  unboundAvailableShipments
} = toRefs(workspace.state);
const actions = workspace.actions;
const {
  batchBindSelectedShipments,
  bindShipment,
  changeShipmentPage,
  deactivateCustomer,
  loadAvailableShipments,
  navigateTo,
  openClientCodeSupplement,
  openShipmentCreateDialog,
  openShipmentDetail,
  openShipmentSupplement,
  publishAllDraftShipments,
  quickBindShipment,
  reactivateCustomer,
  saveCustomer,
  saveLinkedCustomers,
  toggleCandidateShipment,
  togglePublication,
  unbindShipment
} = actions;
const {
  boundRoleSummary,
  formatDate,
  needsManualSupplement,
  partyRoleLabel,
  referenceTypeLabel,
  statusLabel
} = workspace.formatters;
// The binding selector accepts only the two supported workflow modes.
function updateBindMode(value: string | number | boolean | undefined) {
  if (value === "reference" || value === "shipmentId") bindMode.value = value;
}
</script>
<style scoped>
.module-page {
  min-width: 0;
  width: 100%;
}
.is-page-switching :deep(.el-table__body-wrapper) {
  opacity: 0.52;
  transform: translateY(3px);
}
@keyframes shipment-updating-spin {
  to {
    transform: rotate(360deg);
  }
}
.assignment-customer-row .business-select {
  width: 100%;
}
@keyframes business-kpi-in {
  from {
    opacity: 0;
    transform: translateY(9px);
  }
}
.back-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  color: #5a6d80;
  background: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.back-button:hover {
  background: #f0f4f8;
  color: var(--color-primary);
}
.main-card {
  margin-bottom: 16px;
  border: 1px solid #dce3ec;
  border-radius: var(--radius-card);
  box-shadow: none;
}
.main-card :deep(.el-card__header) {
  padding: 16px 20px;
  border-bottom: 1px solid #e8edf3;
  background: #fafbfc;
}
.main-card :deep(.el-card__body) {
  padding: 20px;
}
.section-description {
  margin: 0 0 16px;
  color: #607086;
  line-height: 1.65;
}
.linked-customer-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
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
  border-radius: var(--radius-control);
  background: #fff;
  box-shadow: 0 0 0 1px var(--color-border-strong) inset;
}
.shipment-pagination :deep(.el-pagination__sizes .el-select__selected-item) {
  color: #28445e;
  font-size: 13px;
  font-weight: 600;
}
.shipment-pagination :deep(.btn-prev),
.shipment-pagination :deep(.btn-next),
.shipment-pagination :deep(.el-pager li) {
  min-width: 32px;
  height: 32px;
  border-radius: var(--radius-control) !important;
  font-size: 13px;
}
.shipment-pagination :deep(.el-pager li.is-active) {
  background: var(--color-primary);
  box-shadow: none;

  color: var(--color-on-primary);
}
.shipment-pagination :deep(.el-pagination__total) {
  margin-right: 8px;
  color: #60758a;
  font-size: 13px;
}
.main-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.main-card-eyebrow {
  color: #4086d2;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.main-card-title {
  margin: 4px 0;
  font-size: 22px;
  color: var(--color-primary);
  letter-spacing: -0.02em;
}
.main-card-subtitle {
  margin: 0;
  color: #6a8096;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.main-card-subtitle .el-divider--vertical {
  height: 12px;
}
.main-card-header-actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.section-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-foreground);
  margin: 0;
}
.profile-section {
  margin: 0;
}
.profile-form {
  margin-top: 12px;
}
.client-code-inline {
  display: flex;
  align-items: center;
  gap: 8px;
}
.empty-hint-compact {
  padding: 16px;
  color: #889aaf;
  font-size: 12px;
  text-align: center;
}
.bind-form-card {
  margin-bottom: 12px;
  border: 1px solid #e0e7f0;
  border-radius: var(--radius-card);
  background: #fafbfd;
}
.bind-form-card :deep(.el-card__body) {
  padding: 14px;
}
.bind-mode-switch {
  margin-bottom: 10px;
}
.bind-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.reference-hint {
  margin: 0;
  color: #7d93ae;
  font-size: 12px;
}
.candidate-card {
  margin-bottom: 12px;
  border: 1px solid #e0e7f0;
  border-radius: var(--radius-card);
  background: #fafbfd;
}
.candidate-card :deep(.el-card__header) {
  padding: 12px 16px;
}
.candidate-card :deep(.el-card__body) {
  padding: 10px 16px;
}
.candidate-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.candidate-header b {
  font-size: 13px;
  color: var(--color-foreground);
}
.candidate-header small {
  display: block;
  color: #7d93ae;
  font-size: 12px;
  margin-top: 2px;
}
.candidate-header-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.candidate-list {
  display: grid;
  gap: 6px;
}
.candidate-row {
  display: grid;
  grid-template-columns: 24px minmax(160px, 1.3fr) minmax(110px, 0.8fr) minmax(100px, 0.6fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid #e4eaf1;
  border-radius: var(--radius-control);
  background: #fff;
  font-size: 12px;
}
.candidate-row--bound {
  border-color: #d7e7fa;
  background: var(--color-surface-subtle);
}
.candidate-status-cell {
  display: grid;
  justify-items: start;
  gap: 4px;
}
.candidate-row > span:nth-of-type(1) {
  display: grid;
  gap: 2px;
}
.candidate-row small {
  color: #7d93ae;
}
.candidate-row-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.shipment-status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 5px;
  border-radius: 50%;
  background: #56b88d;
  flex-shrink: 0;
}
.shipment-detail-card .main-card-subtitle {
  gap: 8px;
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
  .profile-form :deep(.el-col),
  .bind-form :deep(.el-col) {
    flex: 0 0 100%;
    max-width: 100%;
    margin-left: 0;
  }
  .main-card-subtitle,
  .client-code-inline {
    flex-wrap: wrap;
  }
  .main-card-header {
    flex-direction: column;
  }
  .candidate-row {
    grid-template-columns: 24px minmax(0, 1fr);
  }
  .candidate-row > span:not(:first-of-type) {
    grid-column: 2;
  }
  .candidate-header {
    flex-direction: column;
    align-items: stretch;
  }
}
@keyframes batch-subtask-pulse {
  50% {
    opacity: 0.35;
    transform: scale(0.75);
  }
}
.shipment-pagination :deep(.el-pagination__sizes .el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px var(--color-ring) inset;
}

.customer-detail-meta {
  color: var(--color-muted);
  font-size: 13px;
}
.customer-profile-heading {
  margin: 0 0 22px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-primary);
}
.client-code-inline {
  flex-wrap: wrap;
  gap: 8px;
}
.candidate-header {
  align-items: flex-start;
  gap: 18px;
  flex-wrap: wrap;
}
.candidate-header-actions {
  flex-wrap: wrap;
  gap: 8px;
}
.candidate-row {
  min-height: 76px;
  border-radius: var(--radius-control);
  padding: 16px;
}
.candidate-row small {
  font-size: 12px;
}
.candidate-row-actions {
  flex-wrap: wrap;
  gap: 8px;
}
.main-card {
  border-radius: var(--radius-card);
}
.main-card :deep(.el-card__body) {
  padding: 24px;
}
@media (max-width: 700px) {
  .main-card :deep(.el-card__body) {
    padding: 18px;
  }
  .candidate-row {
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 12px;
  }
  .candidate-row > :nth-child(n + 3) {
    grid-column: 2;
  }
  .candidate-header-actions {
    width: 100%;
  }
  .candidate-header-actions .el-button {
    margin: 0;
  }
  .bind-form :deep(.el-col) {
    max-width: 100%;
    flex-basis: 100%;
  }
}
</style>

<style scoped src="../../../components/workspace/workspacePageStyles.css"></style>
