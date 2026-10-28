<template>
  <section class="module-page" data-module="shipments">
    <button class="back-button" @click="navigateTo('shipments')">
      {{ t("customers.backToList") }}
    </button>

    <WorkspacePageHeader
      :title="selectedShipment?.referenceNo || selectedShipment?.shipmentId || '—'"
      :eyebrow="t('customers.editShipment')"
      :description="wt('shipmentIdentityHint')"
    >
      <template #meta
        ><WorkspaceStatus :label="selectedShipment?.trackingStatus || wt('statusUnknown')" /><span
          class="shipment-identity-meta"
          >{{ selectedShipment?.carrier || "—" }} ·
          {{ referenceTypeLabel(selectedShipment?.referenceType) }}</span
        ></template
      >
      <template #actions
        ><div class="main-card-header-actions">
          <el-button text @click="refreshShipmentFromCarrier" :disabled="refreshingShipment">
            {{ refreshingShipment ? t("customers.refreshing") : t("customers.refreshFromCarrier") }}
          </el-button>
          <el-button
            v-if="isManager"
            text
            type="danger"
            @click="removeShipment"
            :disabled="
              savingShipment || loadingShipmentDetail || refreshingShipment || deletingShipment
            "
          >
            {{ t("customers.deleteShipment") }}
          </el-button>
        </div></template
      >
    </WorkspacePageHeader>
    <el-card
      v-loading="loadingShipmentDetail"
      :element-loading-text="t('customers.loadingShipmentDetail')"
      class="main-card shipment-detail-card"
      shadow="never"
    >
      <section class="profile-section">
        <div class="section-label">{{ t("customers.editShipment") }}</div>
        <el-form
          class="profile-form"
          @submit.prevent="saveShipmentDetail"
          label-position="top"
          :disabled="
            !isManager ||
            savingShipment ||
            loadingShipmentDetail ||
            refreshingShipment ||
            deletingShipment
          "
        >
          <div class="shipment-detail-single-column">
            <el-form-item :label="t('customers.referenceType')">
              <el-select
                v-model="detailForm.referenceType"
                class="business-select"
                popper-class="business-comp-select business-select-popper"
              >
                <el-option value="BOOKING" :label="t('customers.referenceBooking')" />
                <el-option
                  v-if="supportsShipmentReference(selectedShipment?.carrier || '', 'BILLOFLADING')"
                  value="BILLOFLADING"
                  :label="t('customers.referenceBill')"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('customers.referenceNo')">
              <el-input v-model.trim="detailForm.referenceNo" />
            </el-form-item>
          </div>

          <DetailSection :title="wt('businessFields')" :description="wt('businessFieldsHint')">
            <div class="customer-manual-fields shipment-detail-fields">
              <el-form-item :label="t('customers.jobNumber')">
                <el-input v-model.trim="detailForm.forwarderJobNumber" />
              </el-form-item>
              <el-form-item :label="t('customers.clientPoNumber')">
                <el-input v-model.trim="detailForm.clientPoNumber" />
              </el-form-item>
              <el-form-item :label="t('customers.clientNoName')">
                <el-input v-model.trim="detailForm.clientNameCode" />
              </el-form-item>
              <el-form-item :label="t('customers.shipmentStatus')">
                <el-input v-model.trim="detailForm.trackingStatus" />
              </el-form-item></div
          ></DetailSection>
          <DetailSection :title="wt('routeFields')" :description="wt('routeFieldsHint')"
            ><div class="customer-manual-fields shipment-detail-fields">
              <el-form-item :label="t('customers.vesselVoyage')">
                <el-input v-model.trim="detailForm.vesselVoyage" />
              </el-form-item>
              <el-form-item :label="t('customers.volume')">
                <el-input v-model.trim="detailForm.volume" placeholder="5*40HC" />
              </el-form-item>
              <el-form-item :label="t('customers.portOfLoading')">
                <el-input v-model.trim="detailForm.portOfLoading" />
              </el-form-item>
              <el-form-item :label="t('customers.portOfDischarge')">
                <el-input v-model.trim="detailForm.portOfDischarge" />
              </el-form-item>
              <el-form-item :label="t('customers.currentLocation')">
                <el-input v-model.trim="detailForm.currentLocation" />
              </el-form-item>
              <el-form-item :label="t('customers.estimatedDeparture')">
                <el-input v-model.trim="detailForm.estimatedDeparture" />
              </el-form-item>
              <el-form-item :label="t('customers.estimatedArrival')">
                <el-input v-model.trim="detailForm.estimatedArrival" />
              </el-form-item>
              <el-form-item :label="t('customers.actualDeparture')">
                <el-input v-model.trim="detailForm.actualDeparture" />
              </el-form-item>
              <el-form-item :label="t('customers.actualArrival')">
                <el-input v-model.trim="detailForm.actualArrival" />
              </el-form-item>
              <el-form-item :label="t('customers.actualDelivery')">
                <el-input v-model.trim="detailForm.actualDelivery" />
              </el-form-item>
            </div>
          </DetailSection>

          <el-form-item :label="t('customers.shipmentNote')" class="shipment-note-field">
            <el-input
              v-model="detailForm.note"
              type="textarea"
              :rows="2"
              maxlength="2000"
              show-word-limit
            />
          </el-form-item>

          <div v-if="isManager" class="shipment-detail-actions">
            <el-button @click="openTrackingWorkspace(selectedShipment)">
              {{ t("customers.openLiveTracking") }}
            </el-button>
            <el-button @click="invalidateSnapshot" :disabled="savingShipment">
              {{ t("customers.invalidateSnapshot") }}
            </el-button>
            <el-button
              plain
              @click="saveManualSnapshot"
              :disabled="savingShipment"
              :title="t('customers.manualSaveHint')"
            >
              {{ t("customers.saveManualSnapshot") }}
            </el-button>
            <el-button
              type="primary"
              native-type="submit"
              :disabled="savingShipment"
              :title="t('customers.shipmentSaveHint')"
            >
              {{ savingShipment ? t("customers.savingShipment") : t("customers.saveShipment") }}
            </el-button>
          </div>
        </el-form>
      </section>
    </el-card>

    <DetailSection
      v-if="isManager"
      :title="wt('customerAccess')"
      :description="wt('customerAccessHint')"
    >
      <el-checkbox-group
        :model-value="selectedCustomerIds"
        @update:model-value="updateCustomerSelection"
        :disabled="batchBinding"
        class="customer-checkbox-group"
      >
        <el-checkbox
          v-for="customer in customers"
          :key="customer.id"
          :value="customer.id"
          :label="customer.id"
          :disabled="isCustomerBoundToSelectedShipment(customer.id)"
        >
          <span class="checkbox-label">
            <b>{{ customer.displayName || customer.username }}</b>
            <small>@{{ customer.username }} · {{ partyRoleLabel(customer.partyRole) }}</small>
            <el-tag
              v-if="isCustomerBoundToSelectedShipment(customer.id)"
              size="small"
              type="success"
              effect="plain"
            >
              {{ t("customers.alreadyBound") }}
            </el-tag>
          </span>
        </el-checkbox>
      </el-checkbox-group>
      <div class="batch-bind-actions">
        <el-button
          type="primary"
          @click="batchBindCustomers"
          :disabled="batchBinding || !selectedCustomerIds.length"
          :loading="batchBinding"
        >
          {{ batchBinding ? batchBindingProgress : t("customers.batchBind") }}
        </el-button>
        <span v-if="batchBindingProgress && !batchBinding" class="batch-progress">{{
          batchBindingProgress
        }}</span>
      </div>

      <div v-if="boundCustomersForSelectedShipment.length" class="bound-customers-section">
        <el-divider />
        <div class="section-label">{{ t("customers.boundCustomers") }}</div>
        <div v-for="cid in boundCustomersForSelectedShipment" :key="cid" class="bound-customer-row">
          <span>
            <b>{{ getCustomerName(cid) }}</b>
            <small>@{{ getCustomerUsername(cid) }}</small>
          </span>
          <el-button
            text
            size="small"
            type="danger"
            :disabled="batchBinding"
            @click="unbindCustomerFromShipment(cid)"
          >
            {{ t("customers.unbind") }}
          </el-button>
        </div>
      </div>
    </DetailSection>

    <div class="shipment-tab-actions">
      <el-button
        type="primary"
        v-if="isManager"
        :disabled="entryBusy"
        @click="openShipmentCreateDialog"
      >
        <el-icon><Plus /></el-icon>
        {{ t("customers.createShipment") }}
      </el-button>
      <el-button @click="loadAvailableShipments" :disabled="loadingAvailableShipments">
        <el-icon><Refresh /></el-icon>
        {{ t("customers.refresh") }}
      </el-button>
    </div>
  </section>
</template>
<script setup lang="ts">
import {
  TRACKING_CARRIERS,
  supportsShipmentReference
} from "../../../services/trackingCarriers.js";
import { toRefs } from "vue";
import WorkspacePageHeader from "../../../components/workspace/WorkspacePageHeader.vue";
import DetailSection from "../../../components/workspace/DetailSection.vue";
import WorkspaceStatus from "../../../components/workspace/WorkspaceStatus.vue";
import { wt } from "../../../components/workspace/workspaceCopy";
import { useI18n } from "vue-i18n";
import { useModulePages } from "../../moduleContext.js";
import { Plus, Refresh } from "@element-plus/icons-vue";
const { t } = useI18n();
const pages = useModulePages("shipments");
const workspace = pages.detail;
const { isManager } = toRefs(workspace.permissions);
const {
  batchBinding,
  batchBindingProgress,
  boundCustomersForSelectedShipment,
  customers,
  deletingShipment,
  detailForm,
  entryBusy,
  loadingAvailableShipments,
  loadingShipmentDetail,
  refreshingShipment,
  savingShipment,
  selectedCustomerIds,
  selectedShipment
} = toRefs(workspace.state);
const actions = workspace.actions;
const {
  batchBindCustomers,
  invalidateSnapshot,
  loadAvailableShipments,
  navigateTo,
  openShipmentCreateDialog,
  openTrackingWorkspace,
  refreshShipmentFromCarrier,
  removeShipment,
  saveManualSnapshot,
  saveShipmentDetail,
  unbindCustomerFromShipment
} = actions;
const {
  getCustomerName,
  getCustomerUsername,
  isCustomerBoundToSelectedShipment,
  partyRoleLabel,
  referenceTypeLabel
} = workspace.formatters;

// Element Plus also supports boolean checkbox values; this list binds customer IDs only.
function updateCustomerSelection(values: (string | number | boolean)[]) {
  selectedCustomerIds.value = values.filter(
    (value): value is string | number => typeof value === "string" || typeof value === "number"
  );
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
.pending-matches-card {
  margin-top: 16px;
  border: 1px solid #e0e7f0;
  border-radius: var(--radius-card);
  background: #fafbfd;
}
.pending-matches-card :deep(.el-card__header) {
  padding: 12px 16px;
}
.pending-matches-card :deep(.el-card__body) {
  padding: 10px 16px;
}
.pending-matches-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pending-matches-header b {
  font-size: 13px;
  color: var(--color-foreground);
}
.pending-matches-header small {
  display: block;
  color: #7d93ae;
  font-size: 12px;
  margin-top: 2px;
}
.shipment-tab-actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}
.batch-bind-hint {
  margin: 0 0 12px;
  color: #7d93ae;
  font-size: 12px;
}
.customer-checkbox-group {
  display: grid;
  gap: 4px;
  max-height: 360px;
  overflow-y: auto;
  padding: 8px 12px;
  border: 1px solid #e0e7f0;
  border-radius: var(--radius-control);
  background: #fafbfd;
}
.customer-checkbox-group :deep(.el-checkbox) {
  margin-right: 0;
  padding: 6px 0;
}
.customer-checkbox-group :deep(.el-checkbox.is-disabled) {
  opacity: 0.55;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.checkbox-label b {
  font-size: 12px;
  color: var(--color-foreground);
}
.checkbox-label small {
  color: #7d93ae;
  font-size: 12px;
}
.batch-bind-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}
.batch-progress {
  color: #4086d2;
  font-size: 12px;
  font-weight: 600;
}
.bound-customers-section {
  margin-top: 4px;
}
.bound-customer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border: 1px solid #e0e7f0;
  border-radius: var(--radius-control);
  margin-bottom: 4px;
  background: #f9fafb;
}
.bound-customer-row > span {
  display: grid;
  gap: 2px;
}
.bound-customer-row b {
  font-size: 12px;
  color: var(--color-foreground);
}
.bound-customer-row small {
  color: #7d93ae;
  font-size: 12px;
}
.customer-manual-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.shipment-detail-card :deep(.el-card__body) {
  padding: 18px;
}
.shipment-detail-card .main-card-subtitle {
  gap: 8px;
}
.detail-meta-pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border: 1px solid #d3dde9;
  border-radius: var(--radius-control);
  background: #ffffff;
  color: #4a5d75;
  font-size: 12px;
  font-weight: 600;
}
.shipment-detail-single-column {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}
.shipment-detail-single-column .el-form-item {
  margin-bottom: 0;
}
.shipment-detail-fields {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.shipment-detail-fields .el-input {
  border-radius: var(--radius-control);
}
.shipment-detail-fields .el-form-item {
  margin-bottom: 0;
  padding: 8px 10px;
  border: 1px solid #e1e8f0;
  border-radius: var(--radius-control);
  background: #ffffff;
}
.shipment-detail-fields :deep(.el-form-item__label) {
  padding-bottom: 4px;
  color: #5a6f86;
  font-size: 12px;
  font-weight: 600;
}
.shipment-detail-fields :deep(.el-input__wrapper) {
  min-height: 32px;
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
@media (max-width: 680px) {
  .shipment-detail-single-column {
    grid-template-columns: 1fr;
  }
  .main-card-header {
    flex-direction: column;
  }
  .customer-manual-fields {
    grid-template-columns: 1fr;
  }
}
@keyframes batch-subtask-pulse {
  50% {
    opacity: 0.35;
    transform: scale(0.75);
  }
}

.shipment-identity-meta {
  color: var(--color-muted);
  font-size: 13px;
}
.shipment-detail-card {
  border-radius: var(--radius-card);
}
.shipment-detail-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 24px;
}
.shipment-detail-single-column {
  display: grid;
  grid-template-columns: minmax(140px, 0.7fr) minmax(0, 1.3fr);
  gap: 24px;
  padding-bottom: 24px;
}
.shipment-detail-actions {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  padding: 18px 0 0;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}
.customer-checkbox-group {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.customer-checkbox-group :deep(.el-checkbox) {
  height: auto;
  min-height: 58px;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}
.checkbox-label small {
  font-size: 12px;
}
@media (max-width: 700px) {
  .shipment-detail-fields,
  .shipment-detail-single-column,
  .customer-checkbox-group {
    grid-template-columns: 1fr;
  }
  .shipment-detail-single-column {
    gap: 0;
  }
  .main-card-header-actions {
    flex-wrap: wrap;
  }
  .shipment-detail-actions .el-button {
    flex: 1 1 auto;
    margin: 0;
  }
  .main-card :deep(.el-card__body) {
    padding: 18px;
  }
}
</style>

<style scoped src="../../../components/workspace/workspacePageStyles.css"></style>
