<template>
  <section class="module-page" data-module="shipments">
    <button class="back-button" @click="navigateTo('shipments')">
      {{ t("customers.backToList") }}
    </button>

    <el-card
      v-loading="loadingShipmentDetail"
      :element-loading-text="t('customers.loadingShipmentDetail')"
      class="main-card shipment-detail-card"
      shadow="never"
    >
      <template #header>
        <div class="main-card-header">
          <div>
            <span class="main-card-eyebrow">{{ t("customers.editShipment") }}</span>
            <h2 class="main-card-title">
              {{ selectedShipment?.referenceNo || selectedShipment?.shipmentId || "—" }}
            </h2>
            <p class="main-card-subtitle">
              <span class="detail-meta-pill">{{ selectedShipment?.carrier || "—" }}</span>
              <span class="detail-meta-pill">{{
                referenceTypeLabel(selectedShipment?.referenceType)
              }}</span>
              <span class="detail-meta-pill">{{
                selectedShipment?.trackingStatus || t("customers.noStatus")
              }}</span>
            </p>
          </div>
          <div class="main-card-header-actions">
            <el-button text @click="refreshShipmentFromCarrier" :disabled="refreshingShipment">
              {{
                refreshingShipment ? t("customers.refreshing") : t("customers.refreshFromCarrier")
              }}
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
          </div>
        </div>
      </template>

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
                popper-class="business-select-popper"
              >
                <el-option value="BOOKING" :label="t('customers.referenceBooking')" />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('customers.referenceNo')">
              <el-input v-model.trim="detailForm.referenceNo" />
            </el-form-item>
          </div>

          <el-card class="pending-matches-card" shadow="never">
            <template #header>
              <div class="pending-matches-header">
                <div>
                  <b>{{ t("customers.manualSnapshotTitle") }}</b>
                  <small>{{ t("customers.manualSnapshotDescription") }}</small>
                </div>
              </div>
            </template>
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
              </el-form-item>
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
          </el-card>

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
              type="primary"
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

    <el-card v-if="isManager" class="main-card" shadow="never">
      <template #header>
        <div class="section-label">{{ t("customers.batchBindTitle") }}</div>
      </template>
      <p class="batch-bind-hint">{{ t("customers.batchBindHint") }}</p>
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
    </el-card>

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
import { toRefs } from "vue";
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
  border: 1px solid #dce1e8;
  border-radius: 6px;
  color: #5a6d80;
  background: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.back-button:hover {
  background: #f0f4f8;
  color: #1e40af;
}
.main-card {
  margin-bottom: 16px;
  border: 1px solid #dce3ec;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(15, 29, 46, 0.06);
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
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.main-card-title {
  margin: 4px 0;
  font-size: 22px;
  color: #0f1d2e;
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
  font-weight: 700;
  color: #1a2d42;
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
  border-radius: 10px;
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
  color: #1a2d42;
}
.pending-matches-header small {
  display: block;
  color: #7d93ae;
  font-size: 11px;
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
  border-radius: 10px;
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
  color: #1a2d42;
}
.checkbox-label small {
  color: #7d93ae;
  font-size: 10px;
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
  font-weight: 700;
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
  border-radius: 8px;
  margin-bottom: 4px;
  background: #f9fafb;
}
.bound-customer-row > span {
  display: grid;
  gap: 2px;
}
.bound-customer-row b {
  font-size: 12px;
  color: #1a2d42;
}
.bound-customer-row small {
  color: #7d93ae;
  font-size: 10px;
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
  border-radius: 6px;
  background: #ffffff;
  color: #4a5d75;
  font-size: 11px;
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
  border-radius: 8px;
}
.shipment-detail-fields .el-form-item {
  margin-bottom: 0;
  padding: 8px 10px;
  border: 1px solid #e1e8f0;
  border-radius: 8px;
  background: #ffffff;
}
.shipment-detail-fields :deep(.el-form-item__label) {
  padding-bottom: 4px;
  color: #5a6f86;
  font-size: 11px;
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
</style>
