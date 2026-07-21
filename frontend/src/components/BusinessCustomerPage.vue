<template>
  <main class="customer-access-page" data-i18n-ignore>
    <header class="customer-access-header">
      <RouterLink class="customer-access-brand" to="/workbenches">
        <img src="/favicon.svg" alt="" />
        <span>
          <strong>DrewesLogistics</strong>
          <small>{{ t("customers.productLine") }}</small>
        </span>
      </RouterLink>
      <div class="customer-access-header-actions">
        <LanguageSwitcher class="customer-access-language" />
        <span class="customer-access-party-pill">{{ t("customers.internalPartyAgent") }}</span>
        <div class="customer-account" :class="{ 'is-open': accountMenuOpen }">
          <button type="button" class="customer-account-trigger" @click="accountMenuOpen = !accountMenuOpen">
            <span><b>{{ displayName }}</b><small>{{ t("customers.businessOperator") }}</small></span>
            <i aria-hidden="true">&#x2304;</i>
          </button>
          <div v-if="accountMenuOpen" class="customer-account-menu">
            <RouterLink to="/workbenches" @click="accountMenuOpen = false">{{ t("customers.backWorkbench") }}</RouterLink>
            <button type="button" @click="emit('logout')">{{ t("customers.logout") }}</button>
          </div>
        </div>
      </div>
    </header>

    <p v-if="pageMessage" class="customer-access-message" :class="{ 'is-error': messageIsError }" role="status">
      {{ pageMessage }}
    </p>

    <div v-if="refreshingShipment" class="shipment-updating-overlay" role="dialog" aria-modal="true" :aria-label="t('customers.updateTrackingTitle')">
      <div class="shipment-updating-spinner" aria-hidden="true"></div>
      <p>{{ refreshTrackingStatus || t("customers.updatingTracking") }}</p>
      <button v-if="batchTrackAbortController" type="button" class="shipment-updating-cancel" @click="cancelRefreshShipment">
        {{ t("customers.cancel") }}
      </button>
    </div>

    <div v-if="refreshTrackingResponse" class="shipment-response-toast" :class="{ 'is-error': !refreshTrackingResponse.ok, 'is-success': refreshTrackingResponse.ok }" role="status">
      <button type="button" class="shipment-response-close" @click="refreshTrackingResponse = null" aria-label="Close">×</button>
      <div class="shipment-response-title">
        {{ refreshTrackingResponse.ok ? t("customers.updateTrackingSuccessToast") : t("customers.updateTrackingErrorToast") }}
      </div>
      <div class="shipment-response-body">
        <div><span>{{ t("customers.updateTrackingStatusCode") }}</span><b>{{ refreshTrackingResponse.status }}</b></div>
        <div><span>{{ t("customers.updateTrackingResponseCode") }}</span><b>{{ refreshTrackingResponse.code }}</b></div>
        <div><span>{{ t("customers.updateTrackingResponseMessage") }}</span><b>{{ refreshTrackingResponse.message }}</b></div>
        <div><span>{{ t("customers.updateTrackingNumber") }}</span><b>{{ refreshTrackingResponse.carrier }} / {{ referenceTypeLabel(refreshTrackingResponse.type) }} / {{ refreshTrackingResponse.number }}</b></div>
        <div v-if="!refreshTrackingResponse.hasDetails"><span>{{ t("customers.updateTrackingNoDetails") }}</span><b>{{ t("customers.updateTrackingNumberInvalidOrEmpty") }}</b></div>
      </div>
    </div>

    <section class="workspace-layout">
      <aside class="workspace-sidebar">
        <nav class="sidebar-nav">
          <button :class="{ active: menuItem === 'customers' }" @click="navigateTo('customers')">
            <el-icon><User /></el-icon><span>{{ t("customers.tabCustomerManagement") }}</span>
          </button>
          <button :class="{ active: menuItem === 'shipments' }" @click="navigateTo('shipments')">
            <el-icon><Document /></el-icon><span>{{ t("customers.tabShipmentManagement") }}</span>
          </button>
          <button @click="navigateTo('tracking')">
            <el-icon><Ship /></el-icon><span>{{ t("customers.trackingWorkspace") }}</span>
          </button>
        </nav>
      </aside>

      <div class="workspace-main">
        <transition name="fade" mode="out-in" appear>
        <!-- CUSTOMER MANAGEMENT -->
        <div v-if="menuItem === 'customers'" key="customers" class="workspace-view">
          <transition name="fade-slide" mode="out-in">
          <div :key="subView" class="subview-wrap">
          <!-- List view -->
          <template v-if="subView === 'list'">
            <div class="list-page list-page-full">
              <div class="list-page-header">
                <h2>{{ t("customers.directoryTitle") }}</h2>
                <div class="list-page-actions">
                  <el-input v-model="customerSearch" :placeholder="t('customers.searchCustomerPlaceholder')" prefix-icon="Search" clearable style="width:240px" />
                  <el-button type="primary" @click="createDialogOpen = true"><el-icon><Plus /></el-icon>{{ t("customers.openCreate") }}</el-button>
                  <el-button @click="openBatchImport"><el-icon><Upload /></el-icon>{{ t("customers.batchImport") }}</el-button>
                </div>
              </div>
              <el-table :data="filteredCustomers" stripe v-loading="loadingCustomers" style="width:100%" table-layout="auto" class="customer-directory-table">
                <el-table-column type="index" :label="t('customers.index')" width="60" />
                <el-table-column :label="t('customers.displayName')" min-width="180">
                  <template #default="{ row }">
                    <div class="customer-name-cell">
                      <span class="customer-table-avatar">{{ customerInitial(row) }}</span>
                      <div>
                        <b>{{ row.displayName || row.username }}</b>
                        <small>@{{ row.username }}</small>
                      </div>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column prop="clientCode" :label="t('customers.userCode')" width="120" />
                <el-table-column :label="t('customers.partyRole')" width="120">
                  <template #default="{ row }">{{ partyRoleLabel(row.partyRole) }}</template>
                </el-table-column>
                <el-table-column :label="t('customers.shipmentCount')" width="100" align="center">
                  <template #default="{ row }">{{ row.shipmentCount || 0 }}</template>
                </el-table-column>
                <el-table-column :label="t('customers.remark')" min-width="200" show-overflow-tooltip>
                  <template #default="{ row }">{{ row.remark || '—' }}</template>
                </el-table-column>
                <el-table-column :label="t('customers.status')" width="100">
                  <template #default="{ row }">
                    <el-tag :type="row.status==='ACTIVE'?'success':'danger'" size="small">{{ statusLabel(row.status) }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column :label="t('customers.createdAt')" width="170">
                  <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
                </el-table-column>
                <el-table-column :label="t('customers.actions')" width="460" fixed="right">
                  <template #default="{ row }">
                    <div class="table-action-buttons table-action-buttons--spacious">
                      <el-button type="primary" plain @click.stop="viewCustomerDetail(row)">{{ t("customers.detail") }}</el-button>
                      <el-button type="primary" plain @click.stop="openEditCustomer(row)">{{ t("customers.edit") }}</el-button>
                      <el-button type="warning" plain @click.stop="openResetPassword(row)">{{ t("customers.resetPassword") }}</el-button>
                      <el-button v-if="row.status==='ACTIVE'" type="danger" plain @click.stop="toggleCustomerStatus(row)">{{ t("customers.disable") }}</el-button>
                      <el-button v-else type="success" plain @click.stop="toggleCustomerStatus(row)">{{ t("customers.enable") }}</el-button>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </template>
          <!-- Detail view -->
          <template v-else>
            <button class="back-button" @click="subView = 'list'; selectedCustomerId = ''">{{ t("customers.backToList") }}</button>
            <el-card class="main-card" shadow="never">
              <template #header>
                <div class="main-card-header">
                  <div>
                    <span class="main-card-eyebrow">{{ t("customers.detailEyebrow") }}</span>
                    <h2 class="main-card-title">{{ selectedCustomer.displayName || selectedCustomer.username }}</h2>
                    <p class="main-card-subtitle">
                      @{{ selectedCustomer.username }}
                      <el-divider direction="vertical" />
                      {{ partyRoleLabel(selectedCustomer.partyRole) }}
                      <el-divider direction="vertical" />
                      {{ statusLabel(selectedCustomer.status) }}
                    </p>
                  </div>
                  <div class="main-card-header-actions">
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
                  </div>
                </div>
              </template>

              <section class="profile-section">
                <div class="section-label">{{ t("customers.profileTitle") }}</div>
                <el-form class="profile-form" @submit.prevent="saveCustomer" label-position="top">
                  <el-row :gutter="16">
                    <el-col :span="8">
                      <el-form-item :label="t('customers.username')">
                        <el-input v-model.trim="editForm.username" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="8">
                      <el-form-item :label="t('customers.displayName')">
                        <el-input v-model.trim="editForm.displayName" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="8">
                      <el-form-item :label="t('customers.clientCode')">
                        <div class="client-code-inline">
                          <el-tag :type="selectedCustomer.clientCode ? 'success' : 'warning'" effect="plain">
                            {{ selectedCustomer.clientCode || t("customers.missingValue") }}
                          </el-tag>
                          <el-button text size="small" @click="openClientCodeSupplement">
                            {{ selectedCustomer.clientCode ? t("customers.editSupplement") : t("customers.manualSupplement") }}
                          </el-button>
                        </div>
                      </el-form-item>
                    </el-col>
                  </el-row>
                  <el-row :gutter="16">
                    <el-col :span="8">
                      <el-form-item :label="t('customers.partyRole')">
                        <el-select v-model="editForm.partyRole" class="business-select" popper-class="business-select-popper">
                          <el-option value="SHIPPER" :label="t('customers.roleShipper')" />
                          <el-option value="CONSIGNEE" :label="t('customers.roleConsignee')" />
                          <el-option value="OVERSEA_AGENT" :label="t('customers.roleOverseaAgent')" />
                        </el-select>
                      </el-form-item>
                    </el-col>
                    <el-col :span="4" :offset="12" style="display:flex;align-items:flex-end;padding-bottom:18px;">
                      <el-button type="primary" native-type="submit" :disabled="mutatingCustomer">
                        {{ t("customers.saveProfile") }}
                      </el-button>
                    </el-col>
                  </el-row>
                </el-form>

                <el-card class="pending-matches-card" shadow="never">
                  <template #header>
                    <div class="pending-matches-header">
                      <div>
                        <b>{{ t("customers.pendingMatches") }}</b>
                        <small>{{ t("customers.pendingMatchesHint") }}</small>
                      </div>
                      <el-button text size="small" @click="loadPendingClientMatches" :disabled="loadingPendingMatches">
                        {{ t("customers.refresh") }}
                      </el-button>
                    </div>
                  </template>
                  <div v-if="!pendingClientMatches.length" class="empty-hint-compact">{{ t("customers.noPendingMatches") }}</div>
                  <div v-for="match in pendingClientMatches" v-else :key="match.id" class="pending-match-row">
                    <span><b>{{ match.clientCode }}</b><small>{{ match.reason }}</small></span>
                    <span><b>{{ match.referenceNo || match.shipmentId }}</b><small>{{ match.carrier }} · {{ referenceTypeLabel(match.referenceType) }}</small></span>
                    <el-button type="primary" size="small" @click="resolveClientMatch(match)" :disabled="resolvingMatchId === match.id">
                      {{ t("customers.bindToCurrentCustomer") }}
                    </el-button>
                  </div>
                </el-card>
              </section>
            </el-card>

            <el-card class="main-card" shadow="never">
              <template #header>
                <div class="section-label">{{ t("customers.shipmentsTitle") }}</div>
              </template>

              <el-card class="bind-form-card" shadow="never">
                <div class="bind-mode-switch">
                  <el-radio-group v-model="bindMode" size="small">
                    <el-radio-button value="reference">{{ t("customers.bindByReference") }}</el-radio-button>
                    <el-radio-button value="shipmentId">{{ t("customers.bindByShipmentId") }}</el-radio-button>
                  </el-radio-group>
                </div>
                <el-form class="bind-form" @submit.prevent="bindShipment" label-position="top">
                  <template v-if="bindMode === 'shipmentId'">
                    <el-form-item :label="t('customers.shipmentId')" class="bind-wide">
                      <el-input v-model.trim="bindForm.shipmentId" :placeholder="t('customers.shipmentIdPlaceholder')" />
                      <template #extra><small>{{ t("customers.shipmentIdHint") }}</small></template>
                    </el-form-item>
                  </template>
                  <template v-else>
                    <el-row :gutter="12">
                      <el-col :span="8">
                        <el-form-item :label="t('customers.carrier')">
                          <el-select v-model="bindForm.carrier" class="business-select" popper-class="business-select-popper">
                            <el-option value="COSCO" :label="t('customers.carrierCOSCO')" />
                            <el-option value="CMA" :label="t('customers.carrierCMA')" />
                          </el-select>
                        </el-form-item>
                      </el-col>
                      <el-col :span="8">
                        <el-form-item :label="t('customers.referenceType')">
                          <el-select v-model="bindForm.referenceType" class="business-select" popper-class="business-select-popper">
                            <el-option value="BOOKING" :label="t('customers.referenceBooking')" />
                            <el-option value="BILLOFLADING" :label="t('customers.referenceBill')" />
                          </el-select>
                        </el-form-item>
                      </el-col>
                      <el-col :span="8">
                        <el-form-item :label="t('customers.referenceNo')">
                          <el-input v-model.trim="bindForm.referenceNo" :placeholder="t('customers.referenceNoPlaceholder')" />
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
                      <b>{{ t("customers.availableShipments") }}</b>
                      <small>{{ t("customers.availableShipmentsHint") }}</small>
                    </div>
                    <div class="candidate-header-actions">
                      <el-button type="primary" size="small" @click="shipmentCreateDialogOpen = true">
                        {{ t("customers.createShipment") }}
                      </el-button>
                      <el-button size="small" @click="loadAvailableShipments" :disabled="loadingAvailableShipments">
                        {{ t("customers.refresh") }}
                      </el-button>
                    </div>
                  </div>
                </template>
                <div v-if="loadingAvailableShipments" class="empty-hint-compact">{{ t("customers.loadingAvailableShipments") }}</div>
                <div v-else-if="!unboundAvailableShipments.length" class="empty-hint-compact">{{ t("customers.emptyAvailableShipments") }}</div>
                <div v-else class="candidate-list">
                  <div v-for="shipment in unboundAvailableShipments" :key="shipment.shipmentId" class="candidate-row">
                    <span><b>{{ shipment.referenceNo || shipment.shipmentId }}</b><small>{{ shipment.carrier }} · {{ referenceTypeLabel(shipment.referenceType) }}</small></span>
                    <span>
                      <i class="shipment-status-dot"></i>{{ shipment.trackingStatus || t("customers.bound") }}
                      <small>{{ boundRoleSummary(shipment) }}</small>
                    </span>
                    <span>{{ formatDate(shipment.lastTrackedAt || shipment.updatedAt) }}</span>
                    <span class="candidate-row-actions">
                      <el-button text size="small" @click="openShipmentDetail(shipment)">{{ t("customers.details") }}</el-button>
                      <el-button type="primary" size="small" @click="quickBindShipment(shipment)" :disabled="bindingShipment">{{ t("customers.quickBind") }}</el-button>
                    </span>
                  </div>
                </div>
              </el-card>

              <el-card class="bound-table-card" shadow="never">
                <div v-if="loadingShipments" class="empty-hint-compact">{{ t("customers.loadingShipments") }}</div>
                <div v-else-if="!shipments.length" class="empty-hint-compact">{{ t("customers.emptyShipments") }}</div>
                <el-table v-else :data="shipments" class="bound-table" size="small" stripe>
                  <el-table-column :label="t('customers.shipmentReference')" min-width="180">
                    <template #default="{ row }">
                      <div class="table-ref-cell">
                        <b>{{ row.referenceNo || row.shipmentId }}</b>
                        <small>{{ row.carrier || '—' }} · {{ referenceTypeLabel(row.referenceType) }}</small>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('customers.shipmentStatus')" min-width="160">
                    <template #default="{ row }">
                      <div class="table-status-cell">
                        <span><i class="shipment-status-dot"></i>{{ row.trackingStatus || t("customers.bound") }}</span>
                        <el-tag v-if="row.note" size="small" type="info" effect="plain">{{ row.note }}</el-tag>
                        <el-tag size="small" :type="row.publicationStatus === 'PUBLISHED' ? 'success' : 'warning'" effect="plain">
                          {{ row.publicationStatus === 'PUBLISHED' ? t("customers.published") : t("customers.draft") }}
                        </el-tag>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('customers.assignedAt')" min-width="120">
                    <template #default="{ row }">
                      {{ formatDate(row.assignedAt) }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('customers.actions')" min-width="200" fixed="right">
                    <template #default="{ row }">
                      <div class="table-actions">
                        <el-button text size="small" @click="openShipmentDetail(row)">{{ t("customers.details") }}</el-button>
                        <el-button
                          v-if="needsManualSupplement(row)"
                          text
                          size="small"
                          type="warning"
                          @click="openShipmentSupplement(row)"
                        >{{ t("customers.manualSupplement") }}</el-button>
                        <el-button
                          text
                          size="small"
                          @click="togglePublication(row)"
                          :disabled="publishingShipmentId === row.shipmentId"
                        >
                          {{ row.publicationStatus === 'PUBLISHED' ? t("customers.withdraw") : t("customers.publish") }}
                        </el-button>
                        <el-button text size="small" type="danger" @click="unbindShipment(row)" :disabled="unbindingShipmentId === row.shipmentId">
                          {{ t("customers.unbind") }}
                        </el-button>
                      </div>
                    </template>
                  </el-table-column>
                </el-table>
              </el-card>
            </el-card>
          </template>
          </div>
          </transition>
        </div>

        <!-- SHIPMENT MANAGEMENT -->
        <div v-else-if="menuItem === 'shipments'" key="shipments" class="workspace-view">
          <transition name="fade-slide" mode="out-in">
          <div :key="subView" class="subview-wrap">
          <!-- List view -->
          <template v-if="subView === 'list'">
            <div class="list-page list-page-full shipment-workspace">
              <div class="shipment-workspace-main">
                <div class="list-page-header">
                  <h2>{{ t("customers.availableShipments") }}</h2>
                  <div class="list-page-actions">
                    <el-button type="primary" @click="shipmentCreateDialogOpen = true"><el-icon><Plus /></el-icon>{{ t("customers.createShipment") }}</el-button>
                    <el-button @click="toggleBatchTrackPanel" :type="batchTrackPanelOpen ? 'primary' : ''"><el-icon><Operation /></el-icon>{{ t("customers.batchTrack") }}</el-button>
                    <el-button @click="loadAvailableShipments" :disabled="loadingAvailableShipments"><el-icon><Refresh /></el-icon>{{ t("customers.refresh") }}</el-button>
                  </div>
                </div>
                <el-table :data="availableShipments" stripe v-loading="loadingAvailableShipments" style="width:100%">
                  <el-table-column type="index" :label="t('customers.index')" width="60" />
                  <el-table-column :label="t('customers.referenceNo')" min-width="200">
                    <template #default="{ row }">
                      <div>
                        <b>{{ row.referenceNo || row.shipmentId }}</b>
                        <div style="margin-top:4px"><small>{{ row.carrier }} · {{ referenceTypeLabel(row.referenceType) }}</small></div>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('customers.carrier')" width="120">
                    <template #default="{ row }">{{ row.carrier || '—' }}</template>
                  </el-table-column>
                  <el-table-column :label="t('customers.shipmentStatus')" width="160">
                    <template #default="{ row }">
                      <span><i class="shipment-status-dot"></i>{{ row.trackingStatus || '—' }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('customers.remark')" min-width="180" show-overflow-tooltip>
                    <template #default="{ row }">{{ row.remark || '—' }}</template>
                  </el-table-column>
                  <el-table-column :label="t('customers.lastTrackedAt')" width="160">
                    <template #default="{ row }">{{ formatDateTime(row.lastTrackedAt || row.updatedAt) }}</template>
                  </el-table-column>
                  <el-table-column :label="t('customers.actions')" width="400" fixed="right">
                    <template #default="{ row }">
                      <div class="table-action-buttons table-action-buttons--spacious">
                        <el-button size="small" type="primary" plain @click.stop="editShipment(row)">{{ t("customers.edit") }}</el-button>
                        <el-button size="small" type="warning" plain @click.stop="updateShipmentTracking(row)">{{ t("customers.update") }}</el-button>
                        <el-button size="small" type="info" plain @click.stop="viewShipmentDetail(row)">{{ t("customers.detail") }}</el-button>
                        <el-button size="small" type="danger" plain @click.stop="deleteShipmentRow(row)">{{ t("customers.delete") }}</el-button>
                      </div>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
              <transition name="slide-fade">
                <div v-if="batchTrackPanelOpen" class="shipment-workspace-side">
                  <div class="batch-track-panel">
                    <div class="batch-track-panel-header">
                      <h3>{{ t("customers.batchTrack") }}</h3>
                      <el-button size="small" link @click="toggleBatchTrackPanel">×</el-button>
                    </div>
                    <div class="batch-track-form">
                      <div class="customer-excel-dropzone batch-track-dropzone" :class="{ 'has-file': batchTrackFileName, 'is-dragover': batchTrackDropzoneActive }"
                        @dragover.prevent="batchTrackDropzoneActive = true"
                        @dragleave.prevent="batchTrackDropzoneActive = false"
                        @drop.prevent="handleBatchTrackDrop"
                        @click="batchTrackFileInput?.click()"
                      >
                        <input ref="batchTrackFileInput" type="file" accept=".xlsx,.xls,.csv" @change="handleBatchTrackWorkbook" style="display:none" />
                        <b>{{ batchTrackFileName || t("customers.chooseTrackExcel") }}</b>
                        <small>{{ batchTrackFileName ? t("customers.trackRowsReady", { count: batchTrackNumbers.length }) : t("customers.trackExcelColumnsHint") }}</small>
                        <small class="batch-track-excel-rule">{{ t("customers.trackExcelRule") }}</small>
                        <button v-if="batchTrackFileName" type="button" class="secondary" @click.stop="clearBatchTrackFile">
                          {{ t("customers.clearFile") }}
                        </button>
                        <button v-else type="button" @click.stop="batchTrackFileInput?.click()">{{ t("customers.chooseFile") }}</button>
                      </div>
                      <section v-if="batchTrackSelectedSheet" class="batch-track-preview">
                        <div class="batch-track-preview-controls">
                          <label>
                            <span>{{ t("customers.trackSheet") }}</span>
                            <el-select v-model="batchTrackSelectedSheetName" class="business-select" popper-class="business-select-popper">
                              <el-option v-for="sheet in batchTrackSheets" :key="sheet.name" :value="sheet.name" :label="sheet.name" />
                            </el-select>
                          </label>
                          <label>
                            <span>{{ t("customers.trackColumn") }}</span>
                            <el-select v-model="batchTrackSelectedColumnIndex" class="business-select" popper-class="business-select-popper">
                              <el-option
                                v-for="column in batchTrackSelectedSheet.columns"
                                :key="column.index"
                                :value="column.index"
                                :label="`${column.label} (${column.nonEmptyCount})`"
                              />
                            </el-select>
                          </label>
                        </div>
                        <p class="batch-track-preview-note">
                          {{ t("customers.trackColumnDecision", { trackable: batchTrackTrackableCount, manual: batchTrackManualCount }) }}
                        </p>
                        <div class="batch-track-preview-table-wrap">
                          <table class="batch-track-preview-table">
                            <thead>
                              <tr>
                                <th v-for="column in batchTrackSelectedSheet.columns" :key="column.index" :class="{ selected: column.index === batchTrackSelectedColumnIndex }">
                                  {{ column.label }}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr v-for="(row, rowIndex) in batchTrackPreviewRows" :key="rowIndex">
                                <td v-for="column in batchTrackSelectedSheet.columns" :key="column.index" :class="{ selected: column.index === batchTrackSelectedColumnIndex }">
                                  {{ row[column.index] || "—" }}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </section>
                    </div>

                    <div v-if="batchTrackRunning || batchTrackResults.length" class="batch-track-results">
                      <div class="batch-track-progress">
                        <span>{{ t("customers.batchTrackProgress", batchTrackProgress) }}</span>
                        <el-progress :percentage="batchTrackProgress.total ? Math.round(batchTrackProgress.done / batchTrackProgress.total * 100) : 0" :stroke-width="6" />
                      </div>
                      <div v-if="batchTrackResults.length" class="batch-track-result-list">
                        <div v-for="(r, idx) in batchTrackResults" :key="`${r.number}-${idx}`" class="batch-track-result-row" :class="r.status">
                          <span class="batch-track-result-meta">
                            <b>{{ r.number }}</b>
                            <el-tag v-if="r.carrier" size="small" effect="plain" type="info">{{ r.carrier }}</el-tag>
                          </span>
                          <small>{{ r.message }}</small>
                        </div>
                      </div>
                    </div>

                    <div class="batch-track-actions">
                      <button
                        class="customer-access-primary"
                        type="button"
                        :disabled="batchTrackRunning || !batchTrackSelectedSheet || !batchTrackNumbers.length"
                        @click="startBatchTrack"
                      >
                        {{ batchTrackRunning ? t("customers.batchTrackRunning") : t("customers.batchTrackStart") }}
                      </button>
                      <button
                        v-if="batchTrackRunning"
                        type="button"
                        class="secondary"
                        @click="cancelBatchTrack"
                      >
                        {{ t("customers.cancel") }}
                      </button>
                    </div>
                  </div>
                </div>
              </transition>
            </div>
          </template>
          <!-- Detail view -->
          <template v-else>
            <button class="back-button" @click="subView = 'list'; selectedShipmentId = ''; detailShipmentSnapshot = null">{{ t("customers.backToList") }}</button>

            <el-card v-loading="loadingShipmentDetail" :element-loading-text="t('customers.loadingShipmentDetail')" class="main-card shipment-detail-card" shadow="never">
              <template #header>
                <div class="main-card-header">
                  <div>
                    <span class="main-card-eyebrow">{{ t("customers.shipmentDetail") }}</span>
                    <h2 class="main-card-title">{{ selectedShipment?.referenceNo || selectedShipment?.shipmentId || "—" }}</h2>
                    <p class="main-card-subtitle">
                      <span class="detail-meta-pill">{{ selectedShipment?.carrier || "—" }}</span>
                      <span class="detail-meta-pill">{{ referenceTypeLabel(selectedShipment?.referenceType) }}</span>
                      <span class="detail-meta-pill">{{ selectedShipment?.trackingStatus || t("customers.noStatus") }}</span>
                    </p>
                  </div>
                  <div class="main-card-header-actions">
                    <el-button text @click="refreshShipmentFromCarrier" :disabled="refreshingShipment">
                      {{ refreshingShipment ? t("customers.refreshing") : t("customers.refreshFromCarrier") }}
                    </el-button>
                    <el-button text type="danger" @click="removeShipment" :disabled="deletingShipment">
                      {{ t("customers.deleteShipment") }}
                    </el-button>
                  </div>
                </div>
              </template>

              <section class="profile-section">
                <div class="section-label">{{ t("customers.shipmentDetail") }}</div>
                <el-form class="profile-form" @submit.prevent="saveShipmentDetail" label-position="top">
                  <div class="shipment-detail-single-column">
                    <el-form-item :label="t('customers.referenceType')">
                      <el-select v-model="detailForm.referenceType" class="business-select" popper-class="business-select-popper">
                        <el-option value="BOOKING" :label="t('customers.referenceBooking')" />
                        <el-option value="BILLOFLADING" :label="t('customers.referenceBill')" />
                      </el-select>
                    </el-form-item>
                    <el-form-item :label="t('customers.referenceNo')">
                      <el-input v-model.trim="detailForm.referenceNo" />
                    </el-form-item>
                    <el-form-item :label="t('customers.shipmentStatus')">
                      <el-input v-model.trim="detailForm.trackingStatus" />
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
                      <el-form-item :label="t('customers.vesselVoyage')">
                        <el-input v-model.trim="detailForm.vesselVoyage" />
                      </el-form-item>
                      <el-form-item :label="t('customers.portOfLoading')">
                        <el-input v-model.trim="detailForm.portOfLoading" />
                      </el-form-item>
                      <el-form-item :label="t('customers.portOfDischarge')">
                        <el-input v-model.trim="detailForm.portOfDischarge" />
                      </el-form-item>
                      <el-form-item :label="t('customers.clientPoNumber')">
                        <el-input v-model.trim="detailForm.clientPoNumber" />
                      </el-form-item>
                      <el-form-item :label="t('customers.volume')">
                        <el-input v-model.trim="detailForm.volume" placeholder="5*40HC" />
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
                      <el-form-item :label="t('customers.currentLocation')">
                        <el-input v-model.trim="detailForm.currentLocation" />
                      </el-form-item>
                      <el-form-item :label="t('customers.clientNameCode')">
                        <el-input v-model.trim="detailForm.clientNameCode" />
                      </el-form-item>
                    </div>
                  </el-card>

                  <el-form-item :label="t('customers.shipmentNote')" class="shipment-note-field">
                    <el-input v-model="detailForm.note" type="textarea" :rows="3" maxlength="2000" show-word-limit />
                  </el-form-item>

                  <div class="shipment-detail-actions">
                    <el-button @click="openTrackingWorkspace(selectedShipment)">
                      {{ t("customers.openLiveTracking") }}
                    </el-button>
                    <el-button @click="invalidateSnapshot" :disabled="savingShipment">
                      {{ t("customers.invalidateSnapshot") }}
                    </el-button>
                    <el-button type="primary" @click="saveManualSnapshot" :disabled="savingShipment">
                      {{ t("customers.saveManualSnapshot") }}
                    </el-button>
                    <el-button type="primary" native-type="submit" :disabled="savingShipment">
                      {{ savingShipment ? t("customers.savingShipment") : t("customers.saveShipment") }}
                    </el-button>
                  </div>
                </el-form>
              </section>
            </el-card>

            <el-card class="main-card" shadow="never">
              <template #header>
                <div class="section-label">{{ t('customers.batchBindTitle') }}</div>
              </template>
              <p class="batch-bind-hint">{{ t('customers.batchBindHint') }}</p>
              <el-checkbox-group v-model="selectedCustomerIds" class="customer-checkbox-group">
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
                    <el-tag v-if="isCustomerBoundToSelectedShipment(customer.id)" size="small" type="success" effect="plain">
                      {{ t('customers.alreadyBound') }}
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
                  {{ batchBinding ? batchBindingProgress : t('customers.batchBind') }}
                </el-button>
                <span v-if="batchBindingProgress && !batchBinding" class="batch-progress">{{ batchBindingProgress }}</span>
              </div>

              <div v-if="boundCustomersForSelectedShipment.length" class="bound-customers-section">
                <el-divider />
                <div class="section-label">{{ t('customers.boundCustomers') }}</div>
                <div v-for="cid in boundCustomersForSelectedShipment" :key="cid" class="bound-customer-row">
                  <span>
                    <b>{{ getCustomerName(cid) }}</b>
                    <small>@{{ getCustomerUsername(cid) }}</small>
                  </span>
                  <el-button text size="small" type="danger" @click="unbindCustomerFromShipment(cid)">
                    {{ t('customers.unbind') }}
                  </el-button>
                </div>
              </div>
            </el-card>

            <div class="shipment-tab-actions">
              <el-button type="primary" @click="shipmentCreateDialogOpen = true">
                <el-icon><Plus /></el-icon>
                {{ t('customers.createShipment') }}
              </el-button>
              <el-button @click="loadAvailableShipments" :disabled="loadingAvailableShipments">
                <el-icon><Refresh /></el-icon>
                {{ t('customers.refresh') }}
              </el-button>
            </div>
          </template>
          </div>
          </transition>
        </div>
        </transition>
      </div>
    </section>

    <div v-if="createDialogOpen" class="customer-code-overlay" role="presentation">
      <section class="customer-code-dialog customer-create-dialog" role="dialog" aria-modal="true" :aria-label="isEditMode ? t('customers.editTitle') : t('customers.createTitle')">
        <span class="customer-code-kicker">{{ isEditMode ? 'EDIT CUSTOMER' : 'NEW CUSTOMER' }}</span>
        <h2>{{ isEditMode ? t("customers.editTitle") : t("customers.createTitle") }}</h2>
        <p>{{ isEditMode ? t("customers.editDescription") : t("customers.createDescription") }}</p>
        <form class="customer-dialog-form" @submit.prevent="submitCustomerForm">
          <label><span>{{ t("customers.createDisplayName") }} <i class="required-star">*</i></span><input v-model.trim="createForm.displayName" :placeholder="t('customers.createDisplayNamePlaceholder')" required /></label>
          <label><span>{{ t("customers.createAccount") }} <i class="required-star">*</i></span><input v-model.trim="createForm.username" :placeholder="t('customers.createAccountPlaceholder')" required /></label>
          <label v-if="!isEditMode">
            <span>{{ t("customers.createPassword") }} <i class="required-star">*</i></span>
            <input v-model="createForm.password" type="password" minlength="8" maxlength="128" autocomplete="new-password" :placeholder="t('customers.customerPasswordPlaceholder')" required />
          </label>
          <label><span>{{ t("customers.userCode") }} <i class="required-star">*</i></span><input v-model.trim="createForm.userCode" :placeholder="t('customers.userCodePlaceholder')" required /></label>
          <label>
            <span>{{ t("customers.createPartyRole") }} <i class="required-star">*</i></span>
            <el-select v-model="createForm.partyRole" class="business-select" popper-class="business-select-popper">
              <el-option value="SHIPPER" :label="t('customers.roleShipper')" />
              <el-option value="CONSIGNEE" :label="t('customers.roleConsignee')" />
              <el-option value="OVERSEA_AGENT" :label="t('customers.roleOverseaAgent')" />
            </el-select>
          </label>
          <label>
            <span>{{ t("customers.remark") }}</span>
            <textarea v-model="createForm.remark" :placeholder="t('customers.remarkPlaceholder')" maxlength="500" rows="3"></textarea>
          </label>

          <div class="customer-dialog-actions">
            <button type="button" @click="closeCreateDialog">{{ t("customers.cancel") }}</button>
            <button class="customer-access-primary" type="submit" :disabled="creating">
              {{ creating ? t("customers.saving") : (isEditMode ? t("customers.save") : t("customers.create")) }}
            </button>
          </div>
        </form>
      </section>
    </div>

    <div v-if="batchImportDialogOpen" class="customer-code-overlay" role="presentation">
      <section class="customer-code-dialog customer-batch-dialog" role="dialog" aria-modal="true" :aria-label="t('customers.batchImport')">
        <span class="customer-code-kicker">{{ t("customers.dialogKickerProvisioning") }}</span>
        <h2>{{ t("customers.batchImport") }}</h2>
        <p>{{ t("customers.batchImportDescription") }}</p>
        <div class="customer-batch-tabs">
          <button type="button" :class="{ 'is-active': batchImportMode === 'quick' }" @click="batchImportMode = 'quick'">{{ t("customers.quickImport") }}</button>
          <button type="button" :class="{ 'is-active': batchImportMode === 'excel' }" @click="batchImportMode = 'excel'">{{ t("customers.excelImport") }}</button>
        </div>

        <label v-if="batchImportMode === 'quick'" class="customer-batch-textarea">
          <span>{{ t("customers.quickImportNames") }}</span>
          <textarea v-model="quickImportText" :placeholder="t('customers.quickImportPlaceholder')"></textarea>
          <small>{{ t("customers.quickImportHint") }}</small>
        </label>
        <div v-else class="customer-excel-dropzone" :class="{ 'has-file': batchFileName, 'is-dragover': batchDropzoneActive }"
          @dragover.prevent="batchDropzoneActive = true"
          @dragleave.prevent="batchDropzoneActive = false"
          @drop.prevent="handleBatchDrop"
          @click="batchFileInput?.click()"
        >
          <input ref="batchFileInput" type="file" accept=".xlsx,.xls,.csv" @change="handleCustomerWorkbook" style="display:none" />
          <b>{{ batchFileName || t("customers.chooseExcel") }}</b>
          <small>{{ batchFileName ? t("customers.rowsReady", { count: batchRows.length }) : t("customers.excelColumnsHint") }}</small>
          <button type="button" @click.stop="batchFileInput?.click()">{{ batchFileName ? t("customers.replaceFile") : t("customers.chooseFile") }}</button>
        </div>
        <p v-if="batchPreviewError" class="customer-batch-error">{{ batchPreviewError }}</p>
        <div class="customer-dialog-actions">
          <button type="button" @click="closeBatchImport">{{ t("customers.cancel") }}</button>
          <button class="customer-access-primary" type="button" :disabled="importingCustomers" @click="submitBatchImport">
            {{ importingCustomers ? t("customers.importing") : t("customers.confirmImport") }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="batchCredentialRows.length" class="customer-code-overlay" role="presentation">
      <section class="customer-code-dialog customer-credential-dialog" role="dialog" aria-modal="true" :aria-label="t('customers.batchCredentialTitle')">
        <span class="customer-code-kicker">{{ t("customers.dialogKickerCredentialExport") }}</span>
        <h2>{{ t("customers.batchCredentialTitle") }}</h2>
        <p>{{ t("customers.batchCredentialDescription") }}</p>
        <div class="customer-credential-table">
          <div class="customer-credential-table-head"><span>{{ t("customers.customerName") }}</span><span>{{ t("customers.initialPassword") }}</span><span>{{ t("customers.importStatus") }}</span></div>
          <div v-for="row in batchCredentialRows" :key="`${row.rowNumber}-${row.username}`" class="customer-credential-row" :class="{ 'is-failed': row.status !== 'CREATED' }">
            <span><b>{{ row.username }}</b><small>#{{ row.rowNumber }}</small></span>
            <span>{{ row.password || '—' }}</span>
            <span>{{ row.status === 'CREATED' ? t("customers.importCreated") : row.message }}</span>
          </div>
        </div>
        <div class="customer-dialog-actions">
          <button type="button" @click="downloadCredentialWorkbook">{{ t("customers.exportCredentials") }}</button>
          <button class="customer-access-primary" type="button" @click="closeBatchCredentials">{{ t("customers.confirmStored") }}</button>
        </div>
      </section>
    </div>

    <div v-if="clientCodeDialogOpen" class="customer-code-overlay" role="presentation" @click.self="clientCodeDialogOpen = false">
      <section class="customer-code-dialog customer-supplement-dialog" role="dialog" aria-modal="true" :aria-label="t('customers.manualSupplement')">
        <span class="customer-code-kicker">BUSINESS MATCHING KEY</span>
        <h2>{{ t("customers.supplementClientCode") }}</h2>
        <p>{{ t("customers.supplementClientCodeHint") }}</p>
        <form class="customer-dialog-form" @submit.prevent="saveClientCodeSupplement">
          <label><span>{{ t("customers.clientCode") }}</span><input v-model.trim="clientCodeSupplement" maxlength="64" :placeholder="t('customers.clientCodePlaceholder')" required /></label>
          <div class="customer-dialog-actions">
            <button type="button" @click="clientCodeDialogOpen = false">{{ t("customers.cancel") }}</button>
            <button class="customer-access-primary" type="submit" :disabled="mutatingCustomer">{{ t("customers.saveSupplement") }}</button>
          </div>
        </form>
      </section>
    </div>

    <div v-if="resetPasswordDialogOpen" class="customer-code-overlay" role="presentation" @click.self="closeResetPasswordDialog">
      <section class="customer-code-dialog customer-create-dialog" role="dialog" aria-modal="true" :aria-label="t('customers.resetPassword')">
        <span class="customer-code-kicker">{{ t("customers.dialogKickerSecureReset") }}</span>
        <h2>{{ t("customers.resetPassword") }}</h2>
        <p>{{ t("customers.resetPasswordDescription", { name: selectedCustomer?.displayName || selectedCustomer?.username || '' }) }}</p>
        <form class="customer-dialog-form" @submit.prevent="resetPassword">
          <label>
            <span>{{ t("customers.newPassword") }}</span>
            <input v-model="passwordResetForm.password" type="password" minlength="8" maxlength="128" autocomplete="new-password" :placeholder="t('customers.customerPasswordPlaceholder')" required />
          </label>
          <label>
            <span>{{ t("customers.confirmPassword") }}</span>
            <input v-model="passwordResetForm.confirmPassword" type="password" minlength="8" maxlength="128" autocomplete="new-password" required />
          </label>
          <div class="customer-dialog-actions">
            <button type="button" @click="closeResetPasswordDialog">{{ t("customers.cancel") }}</button>
            <button class="customer-access-primary" type="submit" :disabled="mutatingCustomer">{{ t("customers.confirmResetPassword") }}</button>
          </div>
        </form>
      </section>
    </div>

    <div v-if="shipmentCreateDialogOpen" class="customer-code-overlay" role="presentation" @click.self="shipmentCreateDialogOpen = false">
      <section class="customer-code-dialog customer-create-dialog" role="dialog" aria-modal="true" :aria-label="t('customers.createShipment')">
        <span class="customer-code-kicker">{{ t("customers.dialogKickerNewShipment") }}</span>
        <h2>{{ t("customers.createShipment") }}</h2>
        <p>{{ t("customers.createShipmentDescription") }}</p>
        <form class="customer-dialog-form" @submit.prevent="createShipment">
          <label>
            <span>{{ t("customers.carrier") }}</span>
            <el-select v-model="shipmentCreateForm.carrier" class="business-select" popper-class="business-select-popper">
              <el-option value="COSCO" :label="t('customers.carrierCOSCO')" />
              <el-option value="CMA" :label="t('customers.carrierCMA')" />
            </el-select>
          </label>
          <label>
            <span>{{ t("customers.referenceType") }}</span>
            <el-select v-model="shipmentCreateForm.referenceType" class="business-select" popper-class="business-select-popper">
              <el-option value="BOOKING" :label="t('customers.referenceBooking')" />
              <el-option value="BILLOFLADING" :label="t('customers.referenceBill')" />
            </el-select>
          </label>
          <label><span>{{ t("customers.referenceNo") }}</span><input v-model.trim="shipmentCreateForm.referenceNo" required /></label>
          <label><span>{{ t("customers.shipmentStatus") }}</span><input v-model.trim="shipmentCreateForm.trackingStatus" /></label>
          <div class="customer-manual-fields">
            <label><span>{{ t("customers.jobNumber") }}</span><input v-model.trim="shipmentCreateForm.forwarderJobNumber" /></label>
            <label><span>{{ t("customers.vesselVoyage") }}</span><input v-model.trim="shipmentCreateForm.vesselVoyage" /></label>
            <label><span>{{ t("customers.portOfLoading") }}</span><input v-model.trim="shipmentCreateForm.portOfLoading" /></label>
            <label><span>{{ t("customers.portOfDischarge") }}</span><input v-model.trim="shipmentCreateForm.portOfDischarge" /></label>
            <label><span>{{ t("customers.clientPoNumber") }}</span><input v-model.trim="shipmentCreateForm.clientPoNumber" /></label>
            <label><span>{{ t("customers.volume") }}</span><input v-model.trim="shipmentCreateForm.volume" placeholder="5*40HC" /></label>
            <label><span>{{ t("customers.estimatedDeparture") }}</span><input v-model.trim="shipmentCreateForm.estimatedDeparture" /></label>
            <label><span>{{ t("customers.estimatedArrival") }}</span><input v-model.trim="shipmentCreateForm.estimatedArrival" /></label>
            <label><span>{{ t("customers.actualDeparture") }}</span><input v-model.trim="shipmentCreateForm.actualDeparture" /></label>
            <label><span>{{ t("customers.actualArrival") }}</span><input v-model.trim="shipmentCreateForm.actualArrival" /></label>
            <label><span>{{ t("customers.actualDelivery") }}</span><input v-model.trim="shipmentCreateForm.actualDelivery" /></label>
            <label><span>{{ t("customers.currentLocation") }}</span><input v-model.trim="shipmentCreateForm.currentLocation" /></label>
            <label><span>{{ t("customers.clientNameCode") }}</span><input v-model.trim="shipmentCreateForm.clientNameCode" /></label>
          </div>
          <label><span>{{ t("customers.shipmentNote") }}</span><textarea v-model="shipmentCreateForm.note" maxlength="2000"></textarea></label>
          <div class="customer-dialog-actions">
            <button type="button" @click="shipmentCreateDialogOpen = false">{{ t("customers.cancel") }}</button>
            <button class="customer-access-primary" type="submit" :disabled="creatingShipment">{{ creatingShipment ? t("customers.savingShipment") : t("customers.createShipment") }}</button>
          </div>
        </form>
      </section>
    </div>

    <div v-if="toastMessage" class="customer-toast" role="status">{{ toastMessage }}</div>
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import * as XLSX from "xlsx";
import LanguageSwitcher from "./LanguageSwitcher.vue";
import { currentLocale } from "../i18n";
import {
  bindBusinessCustomerShipment,
  batchCreateBusinessCustomers,
  cancelShipmentBatchTask,
  createBusinessCustomer,
  createBusinessShipment,
  createShipmentBatchTask,
  deleteBusinessCustomer,
  deleteBusinessShipment,
  fetchAvailableBusinessShipments,
  fetchBusinessCustomers,
  fetchBusinessCustomerShipments,
  fetchBusinessShipmentSnapshot,
  fetchPendingClientMatches,
  fetchShipmentBatchTask,
  invalidateBusinessShipmentSnapshot,
  resetBusinessCustomerPassword,
  resolvePendingClientMatch,
  setBusinessShipmentPublication,
  unbindBusinessCustomerShipment,
  updateBusinessCustomer,
  updateBusinessShipment,
  updateBusinessShipmentManualSnapshot
} from "../services/businessCustomerApi";
import { buildShipmentBatchItems, parseShipmentBatchWorkbook } from "../services/shipmentBatchImport";
import { storedToken } from "../services/authSession";
import {
  User,
  Document,
  Plus,
  Upload,
  UserFilled,
  Ship,
  Refresh,
  Search,
  Operation
} from "@element-plus/icons-vue";

const props = defineProps({
  currentUser: { type: Object, default: null }
});
const emit = defineEmits(["logout"]);
const { t } = useI18n();

const customers = ref([]);
const selectedCustomerId = ref("");
const shipments = ref([]);
const availableShipments = ref([]);
const pendingClientMatches = ref([]);
const loadingCustomers = ref(false);
const loadingAvailableShipments = ref(false);
const loadingPendingMatches = ref(false);
const accountMenuOpen = ref(false);
const createDialogOpen = ref(false);
const batchImportDialogOpen = ref(false);
const batchImportMode = ref("quick");
const quickImportText = ref("");
const batchFileName = ref("");
const batchRows = ref([]);
const batchPreviewError = ref("");
const batchFileInput = ref(null);
const batchDropzoneActive = ref(false);
const importingCustomers = ref(false);
const batchCredentialRows = ref([]);
const clientCodeDialogOpen = ref(false);
const clientCodeSupplement = ref("");
const resetPasswordDialogOpen = ref(false);
const shipmentCreateDialogOpen = ref(false);
const detailShipmentSnapshot = ref(null);
const loadingShipmentDetail = ref(false);
const savingShipment = ref(false);
const creatingShipment = ref(false);
const deletingShipment = ref(false);
const refreshingShipment = ref(false);
const batchTrackDialogOpen = ref(false);
const batchTrackPanelOpen = ref(false);
const batchTrackDropzoneActive = ref(false);
const batchTrackText = ref("");
const batchTrackCarrier = ref("COSCO");
const batchTrackType = ref("BILLOFLADING");
const batchTrackRunning = ref(false);
const batchTrackResults = ref([]);
const batchTrackProgress = ref({ total: 0, done: 0, succeeded: 0, manual: 0, failed: 0, pending: 0, status: "" });
const batchTrackFileInput = ref(null);
const batchTrackFileName = ref("");
const batchTrackSheets = ref([]);
const batchTrackSelectedSheetName = ref("");
const batchTrackSelectedColumnIndex = ref(null);
const batchTrackTaskId = ref("");
const batchTrackCancelRequested = ref(false);
const batchTrackAbortController = ref(null);
const refreshTrackingStatus = ref("");
const refreshTrackingResponse = ref(null);
const toastMessage = ref("");
const loadingShipments = ref(false);
const creating = ref(false);
const mutatingCustomer = ref(false);
const bindingShipment = ref(false);
const unbindingShipmentId = ref("");
const publishingShipmentId = ref("");
const resolvingMatchId = ref(0);
const pageMessage = ref("");
const messageIsError = ref(false);
const bindMode = ref("reference");
const createForm = reactive({
  displayName: "",
  username: "",
  password: "",
  userCode: "",
  partyRole: "SHIPPER",
  remark: ""
});
const isEditMode = ref(false);
const editingCustomerId = ref("");
const passwordResetForm = reactive({ password: "", confirmPassword: "" });
const editForm = reactive({ username: "", displayName: "", clientCode: "", partyRole: "SHIPPER" });
const bindForm = reactive({ shipmentId: "", carrier: "COSCO", referenceType: "BOOKING", referenceNo: "" });
const shipmentCreateForm = reactive({ carrier: "COSCO", referenceType: "BOOKING", referenceNo: "", trackingStatus: "", note: "", ...emptyManualShipmentFields() });
const detailForm = reactive({ referenceType: "BOOKING", referenceNo: "", trackingStatus: "", note: "", ...emptyManualShipmentFields() });
let shipmentRequestSequence = 0;
let toastTimer = 0;

const menuItem = ref("customers");
const subView = ref("list");
const customerSearch = ref("");
const selectedShipmentId = ref("");
const selectedCustomerIds = ref([]);
const batchBinding = ref(false);
const batchBindingProgress = ref("");
const shipmentCustomerMap = ref({});

const batchTrackSelectedSheet = computed(() =>
  batchTrackSheets.value.find((sheet) => sheet.name === batchTrackSelectedSheetName.value) || null
);
const batchTrackItems = computed(() =>
  buildShipmentBatchItems(batchTrackSelectedSheet.value, batchTrackSelectedColumnIndex.value)
);
const batchTrackNumbers = computed(() => batchTrackItems.value.map((item) => item.displayNumber));
const batchTrackTrackableCount = computed(() => batchTrackItems.value.filter((item) => !item.manualOnly).length);
const batchTrackManualCount = computed(() => batchTrackItems.value.filter((item) => item.manualOnly).length);
const batchTrackPreviewRows = computed(() => batchTrackSelectedSheet.value?.rows?.slice(1, 9) || []);
const BATCH_TRACK_TASK_KEY = "business-shipment-batch-task-id";
const BATCH_TRACK_TERMINAL = new Set(["COMPLETED", "STOPPED", "FAILED"]);
let batchTrackPollTimer = 0;

const displayName = computed(() => props.currentUser?.displayName || props.currentUser?.username || t("customers.businessOperator"));
const selectedCustomer = computed(() => customers.value.find((item) => item.id === selectedCustomerId.value) || null);
const unboundAvailableShipments = computed(() => {
  const boundIds = new Set(shipments.value.map((item) => item.shipmentId));
  const role = selectedCustomer.value?.partyRole;
  return availableShipments.value.filter((item) => {
    if (boundIds.has(item.shipmentId)) return false;
    if (!["SHIPPER", "CONSIGNEE"].includes(role)) return true;
    return !item.boundRoles?.includes(role);
  });
});

const filteredCustomers = computed(() => {
  const query = customerSearch.value.toLowerCase().trim();
  if (!query) return customers.value;
  return customers.value.filter((c) =>
    (c.username || "").toLowerCase().includes(query) ||
    (c.displayName || "").toLowerCase().includes(query)
  );
});

const selectedShipment = computed(() => {
  if (detailShipmentSnapshot.value?.shipmentId === selectedShipmentId.value) {
    return detailShipmentSnapshot.value;
  }
  return availableShipments.value.find((s) => s.shipmentId === selectedShipmentId.value) || null;
});

const activeDetailShipment = computed(() => selectedShipment.value || null);

const boundCustomersForSelectedShipment = computed(() => {
  if (!selectedShipmentId.value) return [];
  return shipmentCustomerMap.value[selectedShipmentId.value] || [];
});

const boundCustomerNamesForShipment = computed(() => {
  if (!selectedShipmentId.value) return "";
  const cids = shipmentCustomerMap.value[selectedShipmentId.value] || [];
  if (!cids.length) {
    const roles = selectedShipment.value?.boundRoles || [];
    return roles.length ? roles.map(partyRoleLabel).join(", ") : "";
  }
  return cids.map(cid => getCustomerName(cid)).join(", ");
});

const shipmentDetailRows = computed(() => {
  if (!selectedShipment.value) return [];
  const s = selectedShipment.value;
  return [
    { label: t("customers.carrier"), value: s.carrier || "—" },
    { label: t("customers.referenceType"), value: referenceTypeLabel(s.referenceType) },
    { label: t("customers.referenceNo"), value: s.referenceNo || s.shipmentId || "—" },
    { label: t("customers.shipmentStatus"), value: s.trackingStatus || "—" },
    { label: t("customers.lastTrackedAt"), value: formatDate(s.lastTrackedAt || s.updatedAt) },
    { label: t("customers.jobNumber"), value: s.forwarderJobNumber || "—" },
    { label: t("customers.vesselVoyage"), value: s.vesselVoyage || "—" },
    { label: t("customers.portOfLoading"), value: s.portOfLoading || "—" },
    { label: t("customers.portOfDischarge"), value: s.portOfDischarge || "—" },
    { label: t("customers.clientPoNumber"), value: s.clientPoNumber || "—" },
    { label: t("customers.volume"), value: s.volume || "—" },
    { label: t("customers.estimatedDeparture"), value: valueOrDash(s.estimatedDeparture) },
    { label: t("customers.estimatedArrival"), value: valueOrDash(s.estimatedArrival) },
    { label: t("customers.actualDeparture"), value: valueOrDash(s.actualDeparture) },
    { label: t("customers.actualArrival"), value: valueOrDash(s.actualArrival) },
    { label: t("customers.actualDelivery"), value: valueOrDash(s.actualDelivery) },
    { label: t("customers.currentLocation"), value: s.currentLocation || "—" },
    { label: t("customers.clientNameCode"), value: s.clientNameCode || "—" },
    { label: t("customers.boundCustomers"), value: boundCustomerNamesForShipment.value || "—" },
    { label: t("customers.note"), value: s.note || "—" },
  ].filter(row => row.value !== undefined);
});

function valueOrDash(v) { return v || "—"; }

const CARRIER_PREFIX_MAP = {
  COSU: "COSCO",
  CCLU: "COSCO",
  CMAU: "CMA",
  CMDU: "CMA",
  MAEU: "MAERSK",
  MSCU: "MSC",
  HLCU: "HAPAG",
  HMM: "HMM",
  ONEY: "ONE",
  OOLU: "OOCL",
  YMLU: "YANGMING",
  WHLU: "WANHAI",
  ZIMU: "ZIM",
  EVER: "EVERGREEN",
  EGLV: "EVERGREEN"
};

const BILL_OF_LADING_PREFIXES = [
  "COSU", "CCLU", "CSCU", "COAU", "OOLU", "EGLV", "WHLC",
  "CMAU", "CMDU", "CMAC", "ANLU", "MAEU", "MSCU", "MEDU",
  "HLCU", "HMMN", "ONEY", "YMLU", "WHLU", "ZIMU", "PILU",
  "SMLU", "TSLU", "RCLU", "SAFM", "KMTU", "NCLU"
];

const BOOKING_PREFIXES = [
  "SHA", "NGB", "SZC", "YNT", "QDG", "DLC", "XMN", "TSN",
  "HKG", "NNG", "CSX", "WUH", "CGO", "CTU", "CKG"
];

function extractReferenceToken(value) {
  const raw = String(value || "").replace(/[,;\|\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const text = raw.toUpperCase();

  /* step 1: match carrier BL prefixes like COSU followed by 7-12 alphanumeric chars */
  const billPrefix = BILL_OF_LADING_PREFIXES.find((prefix) => text.includes(prefix));
  if (billPrefix) {
    const match = text.match(new RegExp(`\\b${billPrefix}[A-Z0-9]{7,12}\\b`));
    if (match) return match[0];
  }

  /* step 2: generic 4-letter prefix + 7-10 digits, prefer the longer match */
  const genericMatches = [...text.matchAll(/\b([A-Z]{4}\d{7,10})\b/g)].map((m) => m[1]);
  if (genericMatches.length) {
    return genericMatches.reduce((a, b) => (a.length >= b.length ? a : b));
  }

  /* step 3: booking number = port code + 9+ digits */
  const bookingMatch = text.match(/\b([A-Z]{3}\d{9,})\b/);
  if (bookingMatch && BOOKING_PREFIXES.some((p) => text.startsWith(p))) {
    return bookingMatch[1];
  }

  /* step 4: fallback to any 8+ alphanumeric token containing both letters and digits */
  const fallback = text.match(/\b([A-Z0-9]{8,})\b/);
  if (fallback && /[A-Z]/.test(fallback[1]) && /\d/.test(fallback[1])) {
    return fallback[1];
  }

  return "";
}

function findReferenceInRow(row) {
  for (const cell of row) {
    const token = extractReferenceToken(cell);
    if (token && token.length >= 8 && /[A-Z]/.test(token) && /\d/.test(token)) {
      return token;
    }
  }
  return "";
}

function detectCarrierFromNumber(number) {
  const upper = String(number || "").toUpperCase();
  const prefix = Object.keys(CARRIER_PREFIX_MAP).find((p) => upper.startsWith(p));
  return prefix ? CARRIER_PREFIX_MAP[prefix] : "";
}

function resolveBatchTrackRequest(number, defaultCarrier, defaultType) {
  const upper = String(number || "").toUpperCase();
  const detected = detectCarrierFromNumber(upper);
  const carrier = detected || defaultCarrier;
  let type = defaultType || "BILLOFLADING";
  if (upper.startsWith("COSU") || upper.startsWith("CCLU")) type = "BILLOFLADING";
  else if (upper.startsWith("CMAU") || upper.startsWith("CMDU")) type = "BILLOFLADING";
  else if (/^[A-Z]{4}\d{7}$/.test(upper)) type = "CONTAINER";
  return { carrier, type, number: upper };
}

function isCustomerBoundToSelectedShipment(customerId) {
  return boundCustomersForSelectedShipment.value.includes(customerId);
}

function getCustomerName(customerId) {
  const c = customers.value.find((item) => item.id === customerId);
  return c?.displayName || c?.username || customerId;
}

function getCustomerUsername(customerId) {
  const c = customers.value.find((item) => item.id === customerId);
  return c?.username || customerId;
}

function selectShipmentForBinding(shipment) {
  selectedShipmentId.value = shipment.shipmentId;
  selectedCustomerIds.value = [];
}

async function batchBindCustomers() {
  if (!selectedShipmentId.value || batchBinding.value || !selectedCustomerIds.value.length) return;
  batchBinding.value = true;
  let successCount = 0;
  const total = selectedCustomerIds.value.length;
  const shipmentId = selectedShipmentId.value;
  try {
    for (let i = 0; i < selectedCustomerIds.value.length; i++) {
      const customerId = selectedCustomerIds.value[i];
      batchBindingProgress.value = t("customers.batchBindingProgress", { current: i + 1, total });
      try {
        await bindBusinessCustomerShipment(customerId, { shipmentId });
        successCount++;
        if (!shipmentCustomerMap.value[shipmentId]) {
          shipmentCustomerMap.value[shipmentId] = [];
        }
        if (!shipmentCustomerMap.value[shipmentId].includes(customerId)) {
          shipmentCustomerMap.value[shipmentId].push(customerId);
        }
      } catch (e) {
        // continue with next customer
      }
    }
    showSuccess(t("customers.batchBindingResult", { success: successCount, total }));
    selectedCustomerIds.value = [];
    await loadAvailableShipments();
    await buildShipmentCustomerMap();
    if (selectedCustomerId.value) await selectCustomer(selectedCustomerId.value);
  } catch (error) {
    showError(error, "customers.bindFailed");
  } finally {
    batchBinding.value = false;
    batchBindingProgress.value = "";
  }
}

async function unbindCustomerFromShipment(customerId) {
  if (!selectedShipmentId.value) return;
  if (!window.confirm(t("customers.unbindConfirm"))) return;
  try {
    await unbindBusinessCustomerShipment(customerId, selectedShipmentId.value);
    if (shipmentCustomerMap.value[selectedShipmentId.value]) {
      shipmentCustomerMap.value[selectedShipmentId.value] = shipmentCustomerMap.value[selectedShipmentId.value].filter((id) => id !== customerId);
    }
    await loadAvailableShipments();
    await buildShipmentCustomerMap();
    if (selectedCustomerId.value === customerId) {
      shipments.value = shipments.value.filter((s) => s.shipmentId !== selectedShipmentId.value);
    }
    showSuccess("customers.unboundSuccess");
  } catch (error) {
    showError(error, "customers.unbindFailed");
  }
}

watch(selectedCustomer, (customer) => {
  editForm.username = customer?.username || "";
  editForm.displayName = customer?.displayName || "";
  editForm.clientCode = customer?.clientCode || "";
  editForm.partyRole = customer?.partyRole || "SHIPPER";
}, { immediate: true });

watch(availableShipments, (list) => {
  if (!list || !selectedShipmentId.value) return;
  const stillExists = list.some((s) => s.shipmentId === selectedShipmentId.value);
  if (!stillExists) {
    selectedShipmentId.value = "";
    selectedCustomerIds.value = [];
  }
});

watch(selectedShipmentId, (shipmentId) => {
  detailShipmentSnapshot.value = null;
  if (shipmentId && subView.value === "detail" && menuItem.value === "shipments") {
    void loadShipmentDetailSnapshot();
  }
}, { immediate: true });

watch(selectedShipment, (shipment) => {
  syncDetailFormFromShipment(shipment);
}, { immediate: true });

onMounted(() => {
  const requestedCustomer = new URLSearchParams(window.location.search).get("customer") || "";
  void loadCustomers(requestedCustomer);
  void loadAvailableShipments();
  void loadPendingClientMatches();
  void buildShipmentCustomerMap();
  void restoreBatchTrackTask();
});
onUnmounted(() => {
  window.clearTimeout(toastTimer);
  window.clearTimeout(batchTrackPollTimer);
});

function navigateTo(item) {
  if (item === "tracking") {
    openTrackingWorkspace();
    return;
  }
  menuItem.value = item;
  subView.value = "list";
}

function selectCustomerFromList(row) {
  selectCustomer(row.id);
  subView.value = "detail";
}

function selectShipmentFromList(row) {
  selectShipmentForBinding(row);
  subView.value = "detail";
}

async function buildShipmentCustomerMap() {
  const map = {};
  for (const customer of customers.value) {
    try {
      const response = await fetchBusinessCustomerShipments(customer.id);
      const items = Array.isArray(response?.items) ? response.items : [];
      for (const item of items) {
        if (!map[item.shipmentId]) map[item.shipmentId] = [];
        if (!map[item.shipmentId].includes(customer.id)) {
          map[item.shipmentId].push(customer.id);
        }
      }
    } catch (e) {
      // skip failed customer loads
    }
  }
  shipmentCustomerMap.value = map;
}

async function loadCustomers(preferredId = "") {
  loadingCustomers.value = true;
  clearMessage();
  try {
    const response = await fetchBusinessCustomers();
    customers.value = Array.isArray(response?.items) ? response.items : [];
    const nextId = preferredId || selectedCustomerId.value;
    if (nextId && customers.value.some((item) => item.id === nextId)) {
      await selectCustomer(nextId);
    } else if (customers.value[0]) {
      await selectCustomer(customers.value[0].id);
    } else {
      selectedCustomerId.value = "";
      shipments.value = [];
    }
  } catch (error) {
    showError(error, "customers.loadFailed");
  } finally {
    loadingCustomers.value = false;
  }
}

async function loadAvailableShipments() {
  if (loadingAvailableShipments.value) return;
  loadingAvailableShipments.value = true;
  try {
    const response = await fetchAvailableBusinessShipments();
    availableShipments.value = Array.isArray(response?.items) ? response.items : [];
  } catch (error) {
    showError(error, "customers.loadAvailableShipmentsFailed");
  } finally {
    loadingAvailableShipments.value = false;
  }
}

async function loadShipmentDetailSnapshot() {
  const shipmentId = selectedShipmentId.value;
  if (!shipmentId) {
    detailShipmentSnapshot.value = null;
    return;
  }
  loadingShipmentDetail.value = true;
  try {
    const response = await fetchBusinessShipmentSnapshot(shipmentId);
    detailShipmentSnapshot.value = response || null;
  } catch (error) {
    showError(error, "customers.loadShipmentDetailFailed");
    detailShipmentSnapshot.value = null;
  } finally {
    loadingShipmentDetail.value = false;
  }
}

async function startBatchTrack() {
  if (!batchTrackItems.value.length || batchTrackRunning.value) return;
  batchTrackRunning.value = true;
  batchTrackCancelRequested.value = false;
  batchTrackResults.value = batchTrackItems.value.map((item) => ({
    number: item.displayNumber,
    carrier: item.carrier,
    status: "pending",
    message: t("customers.trackPending")
  }));
  try {
    const task = await createShipmentBatchTask({
      sourceFileName: batchTrackFileName.value,
      items: batchTrackItems.value
    });
    rememberBatchTrackTask(task.taskId);
    applyBatchTrackTask(task);
    if (batchTrackCancelRequested.value && task.taskId) {
      applyBatchTrackTask(await cancelShipmentBatchTask(task.taskId));
      scheduleBatchTrackPoll(task.taskId, 500);
    } else {
      scheduleBatchTrackPoll(task.taskId, 800);
    }
  } catch (error) {
    batchTrackRunning.value = false;
    batchTrackCancelRequested.value = false;
    batchTrackResults.value = [{ number: "-", status: "failed", message: error?.message || t("customers.batchTrackStartFailed") }];
  }
}

async function cancelBatchTrack() {
  batchTrackCancelRequested.value = true;
  if (!batchTrackTaskId.value) return;
  try {
    applyBatchTrackTask(await cancelShipmentBatchTask(batchTrackTaskId.value));
    scheduleBatchTrackPoll(batchTrackTaskId.value, 500);
  } catch (error) {
    batchTrackCancelRequested.value = false;
    batchTrackResults.value.unshift({ number: "-", status: "failed", message: error?.message || t("customers.batchTrackCancelFailed") });
  }
}

async function handleBatchTrackWorkbook(event) {
  const file = event.target.files?.[0];
  batchTrackFileName.value = "";
  batchTrackSheets.value = [];
  batchTrackSelectedSheetName.value = "";
  batchTrackSelectedColumnIndex.value = null;
  batchTrackResults.value = [];
  if (!file) return;
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const sheets = parseShipmentBatchWorkbook(workbook, XLSX);
    if (!sheets.length) throw new Error(t("customers.noTrackNumbers"));
    const suggestedSheet = [...sheets].sort((a, b) => sheetRecommendationScore(b) - sheetRecommendationScore(a))[0];
    batchTrackSheets.value = sheets;
    batchTrackSelectedSheetName.value = suggestedSheet.name;
    batchTrackSelectedColumnIndex.value = suggestedSheet.suggestedColumnIndex;
    batchTrackFileName.value = file.name;
  } catch (error) {
    batchTrackResults.value = [{ number: "-", status: "failed", message: error?.message || t("customers.excelReadFailed") }];
  } finally {
    event.target.value = "";
  }
}

function clearBatchTrackFile() {
  batchTrackFileName.value = "";
  batchTrackSheets.value = [];
  batchTrackSelectedSheetName.value = "";
  batchTrackSelectedColumnIndex.value = null;
  batchTrackResults.value = [];
  if (batchTrackFileInput.value) batchTrackFileInput.value.value = "";
}

function clearBatchTrack() {
  batchTrackText.value = "";
  batchTrackResults.value = [];
  batchTrackProgress.value = { total: 0, done: 0, succeeded: 0, manual: 0, failed: 0, pending: 0, status: "" };
  batchTrackFileName.value = "";
  batchTrackSheets.value = [];
  batchTrackSelectedSheetName.value = "";
  batchTrackSelectedColumnIndex.value = null;
}

watch(batchTrackSelectedSheetName, () => {
  const sheet = batchTrackSelectedSheet.value;
  if (sheet) batchTrackSelectedColumnIndex.value = sheet.suggestedColumnIndex;
});

function applyBatchTrackTask(task) {
  if (!task?.taskId) return;
  batchTrackTaskId.value = task.taskId;
  const status = String(task.status || "").toUpperCase();
  batchTrackProgress.value = {
    total: Number(task.total || 0),
    done: Number(task.processed || 0),
    succeeded: Number(task.succeeded || 0),
    manual: Number(task.manual || 0),
    failed: Number(task.failed || 0),
    pending: Number(task.pending || 0),
    status
  };
  batchTrackResults.value = (task.items || []).map((item) => {
    const itemStatus = String(item.status || "PENDING").toUpperCase();
    const stopped = status === "STOPPED" && ["PENDING", "RUNNING"].includes(itemStatus);
    return {
      number: item.displayNumber || item.number,
      carrier: item.carrier,
      status: stopped ? "stopped" : itemStatus.toLowerCase(),
      message: batchTrackItemMessage(item, status)
    };
  });
  batchTrackRunning.value = !BATCH_TRACK_TERMINAL.has(status);
  if (!batchTrackRunning.value) {
    batchTrackCancelRequested.value = false;
    forgetBatchTrackTask();
    window.clearTimeout(batchTrackPollTimer);
    void loadAvailableShipments();
    void loadPendingClientMatches();
  }
}

function batchTrackItemMessage(item, taskStatus = "") {
  if (item.error) return item.error;
  const status = String(item.status || "PENDING").toUpperCase();
  if (taskStatus === "STOPPED" && ["PENDING", "RUNNING"].includes(status)) return t("customers.trackStopped");
  if (status === "SUCCEEDED") return t("customers.trackSucceeded");
  if (status === "MANUAL") return t("customers.trackManualPlaceholder");
  if (status === "FAILED") return t("customers.trackFailed");
  if (status === "RUNNING") return t("customers.trackRunning");
  return t("customers.trackPending");
}

function scheduleBatchTrackPoll(taskId, delay = 1500) {
  window.clearTimeout(batchTrackPollTimer);
  batchTrackPollTimer = window.setTimeout(() => void pollBatchTrackTask(taskId), delay);
}

async function pollBatchTrackTask(taskId) {
  if (!taskId || taskId !== batchTrackTaskId.value) return;
  try {
    const task = await fetchShipmentBatchTask(taskId);
    applyBatchTrackTask(task);
    if (batchTrackRunning.value) scheduleBatchTrackPoll(taskId);
  } catch (error) {
    if (error?.status === 404 || error?.status === 403) {
      forgetBatchTrackTask();
      batchTrackTaskId.value = "";
      batchTrackRunning.value = false;
      return;
    }
    scheduleBatchTrackPoll(taskId, 3000);
  }
}

async function restoreBatchTrackTask() {
  const taskId = rememberedBatchTrackTask();
  if (!taskId) return;
  batchTrackTaskId.value = taskId;
  batchTrackRunning.value = true;
  await pollBatchTrackTask(taskId);
}

function batchTrackStorageKey() {
  const owner = props.currentUser?.id || props.currentUser?.username || "current";
  return `${BATCH_TRACK_TASK_KEY}:${owner}`;
}

function rememberBatchTrackTask(taskId) {
  try {
    localStorage.setItem(batchTrackStorageKey(), taskId);
  } catch {
    // The backend task still runs when browser storage is unavailable.
  }
}

function rememberedBatchTrackTask() {
  try {
    return localStorage.getItem(batchTrackStorageKey()) || "";
  } catch {
    return "";
  }
}

function forgetBatchTrackTask() {
  try {
    localStorage.removeItem(batchTrackStorageKey());
  } catch {
    // Non-critical persistence cleanup failure.
  }
}

function sheetRecommendationScore(sheet) {
  return Math.max(0, ...(sheet?.columns || []).map((column) => Number(column.score || 0)));
}

function handleCloseBatchTrack() {
  if (batchTrackRunning.value) return;
  batchTrackDialogOpen.value = false;
  clearBatchTrack();
}

function toggleBatchTrackPanel() {
  batchTrackPanelOpen.value = !batchTrackPanelOpen.value;
}

function handleBatchTrackDrop(event) {
  batchTrackDropzoneActive.value = false;
  const files = event.dataTransfer?.files;
  if (!files || !files.length) return;
  const file = files[0];
  const validTypes = [".xlsx", ".xls", ".csv"];
  const isValid = validTypes.some((ext) => file.name.toLowerCase().endsWith(ext));
  if (!isValid) {
    return;
  }
  const fakeEvent = { target: { files } };
  handleBatchTrackWorkbook(fakeEvent);
}

async function loadPendingClientMatches() {
  if (loadingPendingMatches.value) return;
  loadingPendingMatches.value = true;
  try {
    const response = await fetchPendingClientMatches();
    pendingClientMatches.value = Array.isArray(response?.items) ? response.items : [];
  } catch (error) {
    showError(error, "customers.loadPendingMatchesFailed");
  } finally {
    loadingPendingMatches.value = false;
  }
}

async function selectCustomer(customerId) {
  const requestSequence = ++shipmentRequestSequence;
  selectedCustomerId.value = customerId;
  loadingShipments.value = true;
  try {
    const response = await fetchBusinessCustomerShipments(customerId);
    if (requestSequence !== shipmentRequestSequence || selectedCustomerId.value !== customerId) return;
    shipments.value = Array.isArray(response?.items) ? response.items : [];
  } catch (error) {
    if (requestSequence !== shipmentRequestSequence || selectedCustomerId.value !== customerId) return;
    shipments.value = [];
    showError(error, "customers.loadShipmentsFailed");
  } finally {
    if (requestSequence === shipmentRequestSequence) loadingShipments.value = false;
  }
}

async function createCustomer() {
  if (creating.value) return;
  creating.value = true;
  clearMessage();
  try {
    const response = await createBusinessCustomer({
      username: createForm.username,
      displayName: createForm.displayName,
      password: createForm.password,
      partyRole: createForm.partyRole,
      clientCode: createForm.userCode,
      remark: createForm.remark || null
    });
    const customer = normalizeCustomer(response);
    resetCreateForm();
    createDialogOpen.value = false;
    await loadCustomers(customer.id);
  } catch (error) {
    showError(error, "customers.createFailed");
  } finally {
    creating.value = false;
  }
}

function resetCreateForm() {
  createForm.displayName = "";
  createForm.username = "";
  createForm.password = "";
  createForm.userCode = "";
  createForm.partyRole = "SHIPPER";
  createForm.remark = "";
}

function closeCreateDialog() {
  resetCreateForm();
  isEditMode.value = false;
  editingCustomerId.value = "";
  createDialogOpen.value = false;
}

function openEditCustomer(row) {
  isEditMode.value = true;
  editingCustomerId.value = row.id;
  createForm.displayName = row.displayName || "";
  createForm.username = row.username || "";
  createForm.password = "";
  createForm.userCode = row.clientCode || "";
  createForm.partyRole = row.partyRole || "SHIPPER";
  createForm.remark = row.remark || "";
  createDialogOpen.value = true;
}

async function submitCustomerForm() {
  if (isEditMode.value) {
    await updateCustomer();
  } else {
    await createCustomer();
  }
}

async function updateCustomer() {
  if (creating.value || !editingCustomerId.value) return;
  creating.value = true;
  clearMessage();
  try {
    const response = await updateBusinessCustomer(editingCustomerId.value, {
      username: createForm.username,
      displayName: createForm.displayName,
      partyRole: createForm.partyRole,
      clientCode: createForm.userCode,
      remark: createForm.remark || null
    });
    replaceCustomer(normalizeCustomer(response));
    closeCreateDialog();
    showSuccess("customers.saved");
  } catch (error) {
    showError(error, "customers.saveFailed");
  } finally {
    creating.value = false;
  }
}

function viewCustomerDetail(row) {
  selectedCustomerId.value = row.id;
  subView.value = "detail";
}

async function toggleCustomerStatus(row) {
  if (mutatingCustomer.value) return;
  const targetStatus = row.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
  const confirmMsg = targetStatus === "DISABLED"
    ? t("customers.confirmDisable", { name: row.displayName || row.username })
    : t("customers.confirmEnable", { name: row.displayName || row.username });
  if (!window.confirm(confirmMsg)) return;
  mutatingCustomer.value = true;
  try {
    const response = await updateBusinessCustomer(row.id, { status: targetStatus });
    replaceCustomer(normalizeCustomer(response));
    showSuccess(targetStatus === "DISABLED" ? "customers.disabled" : "customers.enabled");
  } catch (error) {
    showError(error, "customers.saveFailed");
  } finally {
    mutatingCustomer.value = false;
  }
}

function formatDateTime(value) {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return value;
  }
}

async function saveCustomer() {
  if (!selectedCustomer.value || mutatingCustomer.value) return;
  mutatingCustomer.value = true;
  clearMessage();
  try {
    const response = await updateBusinessCustomer(selectedCustomer.value.id, { ...editForm });
    replaceCustomer(normalizeCustomer(response));
    showSuccess("customers.saved");
  } catch (error) {
    showError(error, "customers.saveFailed");
  } finally {
    mutatingCustomer.value = false;
  }
}

function closeResetPasswordDialog() {
  resetPasswordDialogOpen.value = false;
  passwordResetForm.password = "";
  passwordResetForm.confirmPassword = "";
}

function openResetPassword(row) {
  selectedCustomerId.value = row.id;
  passwordResetForm.password = "";
  passwordResetForm.confirmPassword = "";
  resetPasswordDialogOpen.value = true;
}

async function resetPassword() {
  if (!selectedCustomer.value || mutatingCustomer.value) return;
  if (passwordResetForm.password !== passwordResetForm.confirmPassword) {
    pageMessage.value = t("customers.passwordMismatch");
    messageIsError.value = true;
    return;
  }
  mutatingCustomer.value = true;
  clearMessage();
  try {
    await resetBusinessCustomerPassword(selectedCustomer.value.id, passwordResetForm.password);
    closeResetPasswordDialog();
    showSuccess("customers.passwordResetSuccess");
  } catch (error) {
    showError(error, "customers.passwordResetFailed");
  } finally {
    mutatingCustomer.value = false;
  }
}

async function deactivateCustomer() {
  if (!selectedCustomer.value || mutatingCustomer.value) return;
  if (!window.confirm(t("customers.deactivateConfirm"))) return;
  mutatingCustomer.value = true;
  try {
    await deleteBusinessCustomer(selectedCustomer.value.id);
    replaceCustomer({ ...selectedCustomer.value, status: "DISABLED" });
    showSuccess("customers.deactivated");
  } catch (error) {
    showError(error, "customers.deactivateFailed");
  } finally {
    mutatingCustomer.value = false;
  }
}

async function reactivateCustomer() {
  if (!selectedCustomer.value || mutatingCustomer.value) return;
  mutatingCustomer.value = true;
  try {
    const response = await updateBusinessCustomer(selectedCustomer.value.id, { status: "ACTIVE" });
    replaceCustomer(normalizeCustomer(response));
    showSuccess("customers.reactivated");
  } catch (error) {
    showError(error, "customers.reactivateFailed");
  } finally {
    mutatingCustomer.value = false;
  }
}

async function bindShipment() {
  if (!selectedCustomer.value || bindingShipment.value) return;
  bindingShipment.value = true;
  clearMessage();
  try {
    const payload = bindMode.value === "shipmentId"
      ? { shipmentId: bindForm.shipmentId }
      : {
          carrier: bindForm.carrier,
          referenceType: bindForm.referenceType,
          referenceNo: bindForm.referenceNo
        };
    await bindBusinessCustomerShipment(selectedCustomer.value.id, payload);
    bindForm.shipmentId = "";
    bindForm.referenceNo = "";
    await selectCustomer(selectedCustomer.value.id);
    await loadAvailableShipments();
    showSuccess("customers.boundSuccess");
  } catch (error) {
    showError(error, "customers.bindFailed");
  } finally {
    bindingShipment.value = false;
  }
}

async function quickBindShipment(shipment) {
  if (!selectedCustomer.value || !shipment?.shipmentId || bindingShipment.value) return;
  bindingShipment.value = true;
  clearMessage();
  try {
    await bindBusinessCustomerShipment(selectedCustomer.value.id, { shipmentId: shipment.shipmentId });
    await selectCustomer(selectedCustomer.value.id);
    await loadAvailableShipments();
    showSuccess("customers.boundSuccess");
  } catch (error) {
    showError(error, "customers.bindFailed");
  } finally {
    bindingShipment.value = false;
  }
}

async function unbindShipment(shipment) {
  if (!selectedCustomer.value || unbindingShipmentId.value) return;
  if (!window.confirm(t("customers.unbindConfirm"))) return;
  unbindingShipmentId.value = shipment.shipmentId;
  try {
    await unbindBusinessCustomerShipment(selectedCustomer.value.id, shipment.shipmentId);
    shipments.value = shipments.value.filter((item) => item.shipmentId !== shipment.shipmentId);
    showSuccess("customers.unboundSuccess");
  } catch (error) {
    showError(error, "customers.unbindFailed");
  } finally {
    unbindingShipmentId.value = "";
  }
}

async function togglePublication(shipment) {
  if (!selectedCustomer.value || !shipment?.shipmentId || publishingShipmentId.value) return;
  const published = shipment.publicationStatus !== "PUBLISHED";
  if (!window.confirm(t(published ? "customers.publishConfirm" : "customers.withdrawConfirm"))) return;
  publishingShipmentId.value = shipment.shipmentId;
  try {
    const updated = await setBusinessShipmentPublication(
      selectedCustomer.value.id, shipment.shipmentId, published
    );
    shipments.value = shipments.value.map((item) => item.shipmentId === shipment.shipmentId ? updated : item);
    showSuccess(published ? "customers.publishedSuccess" : "customers.withdrawnSuccess");
  } catch (error) {
    showError(error, published ? "customers.publishFailed" : "customers.withdrawFailed");
  } finally {
    publishingShipmentId.value = "";
  }
}

async function resolveClientMatch(match) {
  if (!selectedCustomer.value || !match?.id || resolvingMatchId.value) return;
  resolvingMatchId.value = match.id;
  try {
    await resolvePendingClientMatch(match.id, selectedCustomer.value.id);
    await Promise.all([selectCustomer(selectedCustomer.value.id), loadPendingClientMatches(), loadAvailableShipments()]);
    showSuccess("customers.pendingMatchResolved");
  } catch (error) {
    showError(error, "customers.pendingMatchResolveFailed");
  } finally {
    resolvingMatchId.value = 0;
  }
}

function isShipmentBound(shipment) {
  return shipments.value.some((item) => item.shipmentId === shipment?.shipmentId);
}

function openShipmentDetail(shipment) {
  navigateToShipmentDetail(shipment);
}

async function createShipment() {
  if (creatingShipment.value) return;
  creatingShipment.value = true;
  try {
    const created = await createBusinessShipment({ ...shipmentCreateForm });
    availableShipments.value.unshift(created);
    shipmentCreateForm.referenceNo = "";
    shipmentCreateForm.trackingStatus = "";
    shipmentCreateForm.note = "";
    Object.assign(shipmentCreateForm, emptyManualShipmentFields());
    shipmentCreateDialogOpen.value = false;
    showSuccess("customers.shipmentCreated");
  } catch (error) {
    showError(error, "customers.shipmentCreateFailed");
  } finally {
    creatingShipment.value = false;
  }
}

async function saveManualSnapshot() {
  const shipment = activeDetailShipment.value;
  if (!shipment?.shipmentId || savingShipment.value) return;
  savingShipment.value = true;
  try {
    const updated = await updateBusinessShipmentManualSnapshot(
      shipment.shipmentId,
      { ...detailForm }
    );
    replaceShipmentInLocalCollections(updated);
    await loadShipmentDetailSnapshot();
    showSuccess("customers.manualSnapshotSaved");
  } catch (error) {
    showError(error, "customers.manualSnapshotFailed");
  } finally {
    savingShipment.value = false;
  }
}

async function invalidateSnapshot() {
  const shipment = activeDetailShipment.value;
  if (!shipment?.shipmentId || savingShipment.value) return;
  const reason = window.prompt(t("customers.invalidateReasonPrompt"), "Upstream snapshot is empty or incorrect");
  if (!reason?.trim()) return;
  savingShipment.value = true;
  try {
    await invalidateBusinessShipmentSnapshot(shipment.shipmentId, reason.trim());
    await Promise.all([
      selectedCustomer.value ? selectCustomer(selectedCustomer.value.id) : Promise.resolve(),
      loadAvailableShipments(),
      loadShipmentDetailSnapshot()
    ]);
    showSuccess("customers.snapshotInvalidated");
  } catch (error) {
    showError(error, "customers.snapshotInvalidateFailed");
  } finally {
    savingShipment.value = false;
  }
}

function emptyManualShipmentFields() {
  return {
    forwarderJobNumber: "",
    vesselVoyage: "",
    portOfLoading: "",
    portOfDischarge: "",
    clientPoNumber: "",
    estimatedDeparture: "",
    estimatedArrival: "",
    actualDeparture: "",
    actualArrival: "",
    actualDelivery: "",
    currentLocation: "",
    volume: "",
    clientNameCode: ""
  };
}

function syncDetailFormFromShipment(shipment) {
  if (!shipment) {
    detailForm.referenceType = "BOOKING";
    detailForm.referenceNo = "";
    detailForm.trackingStatus = "";
    detailForm.note = "";
    Object.assign(detailForm, emptyManualShipmentFields());
    return;
  }
  detailForm.referenceType = shipment.referenceType || "BOOKING";
  detailForm.referenceNo = shipment.referenceNo || "";
  detailForm.trackingStatus = shipment.trackingStatus || "";
  detailForm.note = shipment.note || "";
  Object.assign(detailForm, {
    forwarderJobNumber: shipment.forwarderJobNumber || "",
    vesselVoyage: shipment.vesselVoyage || "",
    portOfLoading: shipment.portOfLoading || "",
    portOfDischarge: shipment.portOfDischarge || "",
    clientPoNumber: shipment.clientPoNumber || "",
    estimatedDeparture: shipment.estimatedDeparture || "",
    estimatedArrival: shipment.estimatedArrival || "",
    actualDeparture: shipment.actualDeparture || "",
    actualArrival: shipment.actualArrival || "",
    actualDelivery: shipment.actualDelivery || "",
    currentLocation: shipment.currentLocation || "",
    volume: shipment.volume || "",
    clientNameCode: shipment.clientNameCode || ""
  });
}

async function saveShipmentDetail() {
  const shipment = activeDetailShipment.value;
  if (!shipment?.shipmentId || savingShipment.value) return;
  savingShipment.value = true;
  try {
    const updated = await updateBusinessShipment(shipment.shipmentId, { ...detailForm });
    replaceShipmentInLocalCollections(updated);
    await loadShipmentDetailSnapshot();
    showSuccess("customers.shipmentSaved");
  } catch (error) {
    showError(error, "customers.shipmentSaveFailed");
  } finally {
    savingShipment.value = false;
  }
}

async function refreshShipmentFromCarrier() {
  const shipment = activeDetailShipment.value;
  if (!shipment?.carrier || !shipment?.referenceType || !shipment?.referenceNo || refreshingShipment.value) return;
  refreshingShipment.value = true;
  refreshTrackingStatus.value = t("customers.updateTrackingNodeService");
  refreshTrackingResponse.value = null;
  const controller = new AbortController();
  batchTrackAbortController.value = controller;
  try {
    const token = storedToken();
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    const resp = await fetch(`${apiBase}/api/public/shipments/track`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": token
      },
      body: JSON.stringify({
        carrier: shipment.carrier,
        channel: "AUTO",
        type: shipment.referenceType,
        number: shipment.referenceNo,
        forceRefresh: true
      })
    });
    const data = await resp.json().catch(() => ({}));
    const snapshot = data?.snapshot;
    const hasDetails = Boolean(
      snapshot?.containers?.length ||
      snapshot?.route?.length ||
      snapshot?.routingLegs?.length ||
      snapshot?.sailingSchedule?.length ||
      snapshot?.summary?.latestEvent?.name ||
      snapshot?.summary?.origin?.name ||
      snapshot?.summary?.destination?.name
    );
    refreshTrackingResponse.value = {
      status: resp.status,
      ok: resp.ok,
      code: data?.code || data?.diagnostic?.code || (resp.ok ? "SUCCESS" : data?.error) || "-",
      message:
        data?.message ||
        data?.diagnostic?.message ||
        data?.warning ||
        (resp.ok ? t("customers.updateTrackingSuccessDefault") : resp.statusText) ||
        "-",
      carrier: shipment.carrier,
      type: shipment.referenceType,
      number: shipment.referenceNo,
      hasDetails
    };
    if (!resp.ok) throw new Error(data?.message || `HTTP ${resp.status}`);
    refreshTrackingStatus.value = t("customers.updateTrackingSaving");
    await loadAvailableShipments();
    await loadShipmentDetailSnapshot();
    if (selectedCustomerId.value) {
      await selectCustomer(selectedCustomerId.value);
    }
    const updated = [...availableShipments.value, ...shipments.value]
      .find((s) => s.shipmentId === shipment.shipmentId);
    if (updated) {
      Object.assign(detailForm, {
        referenceType: updated.referenceType || detailForm.referenceType,
        referenceNo: updated.referenceNo || detailForm.referenceNo,
        trackingStatus: updated.trackingStatus || detailForm.trackingStatus
      });
    }
    refreshTrackingStatus.value = t("customers.updateTrackingComplete");
    showSuccess("customers.refreshSuccess");
  } catch (error) {
    if (error?.name === "AbortError") {
      refreshTrackingStatus.value = t("customers.updateTrackingCancelled");
      showInfo("customers.refreshCancelled");
    } else {
      refreshTrackingStatus.value = t("customers.updateTrackingFailed");
      showError(error, "customers.refreshFailed");
    }
  } finally {
    refreshingShipment.value = false;
    batchTrackAbortController.value = null;
  }
}

function cancelRefreshShipment() {
  if (batchTrackAbortController.value) {
    batchTrackAbortController.value.abort();
  }
}

function showInfo(key) {
  pageMessage.value = t(key);
  messageIsError.value = false;
  clearPageMessage();
}

async function removeShipment() {
  const shipment = activeDetailShipment.value;
  if (!shipment?.shipmentId || deletingShipment.value) return;
  if (!window.confirm(t("customers.deleteShipmentConfirm"))) return;
  deletingShipment.value = true;
  const shipmentId = shipment.shipmentId;
  try {
    await deleteBusinessShipment(shipmentId);
    shipments.value = shipments.value.filter((item) => item.shipmentId !== shipmentId);
    availableShipments.value = availableShipments.value.filter((item) => item.shipmentId !== shipmentId);
    navigateTo("shipments");
    showSuccess("customers.shipmentDeleted");
  } catch (error) {
    showError(error, "customers.shipmentDeleteFailed");
  } finally {
    deletingShipment.value = false;
  }
}

function editShipment(row) {
  navigateToShipmentDetail(row);
}

function viewShipmentDetail(row) {
  navigateToShipmentDetail(row);
}

function navigateToShipmentDetail(row) {
  if (!row?.shipmentId) return;
  selectedShipmentId.value = row.shipmentId;
  subView.value = "detail";
  menuItem.value = "shipments";
}

async function deleteShipmentRow(row) {
  if (!row?.shipmentId || deletingShipment.value) return;
  if (!window.confirm(t("customers.deleteShipmentConfirm"))) return;
  deletingShipment.value = true;
  const shipmentId = row.shipmentId;
  try {
    await deleteBusinessShipment(shipmentId);
    shipments.value = shipments.value.filter((item) => item.shipmentId !== shipmentId);
    availableShipments.value = availableShipments.value.filter((item) => item.shipmentId !== shipmentId);
    showSuccess("customers.shipmentDeleted");
  } catch (error) {
    showError(error, "customers.shipmentDeleteFailed");
  } finally {
    deletingShipment.value = false;
  }
}

async function updateShipmentTracking(row) {
  if (!row?.carrier || !row?.referenceType || !row?.referenceNo || refreshingShipment.value) return;
  refreshingShipment.value = true;
  try {
    const token = storedToken();
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    const resp = await fetch(`${apiBase}/api/public/shipments/track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": token
      },
      body: JSON.stringify({
        carrier: row.carrier,
        channel: "AUTO",
        type: row.referenceType,
        number: row.referenceNo,
        forceRefresh: true
      })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.message || `HTTP ${resp.status}`);
    await loadAvailableShipments();
    showSuccess("customers.refreshSuccess");
  } catch (error) {
    showError(error, "customers.refreshFailed");
  } finally {
    refreshingShipment.value = false;
  }
}

function trackShipmentInWorkspace(shipment) {
  openTrackingWorkspace(shipment);
}

function openTrackingWorkspace(shipment = null) {
  const returnTo = selectedCustomerId.value
    ? `/customers?customer=${encodeURIComponent(selectedCustomerId.value)}`
    : "/customers";
  const parameters = new URLSearchParams({ returnTo });
  const referenceNo = String(shipment?.referenceNo || "").trim();
  if (referenceNo) {
    parameters.set("carrier", shipment?.carrier || "COSCO");
    parameters.set("type", shipment?.referenceType || "BOOKING");
    parameters.set("number", referenceNo);
  }
  window.location.assign(`/tracking/?${parameters.toString()}${referenceNo ? "#tracking" : "#overview"}`);
}

function openClientCodeSupplement() {
  clientCodeSupplement.value = selectedCustomer.value?.clientCode || "";
  clientCodeDialogOpen.value = true;
}

async function saveClientCodeSupplement() {
  if (!selectedCustomer.value || mutatingCustomer.value) return;
  mutatingCustomer.value = true;
  try {
    const response = await updateBusinessCustomer(selectedCustomer.value.id, {
      clientCode: clientCodeSupplement.value
    });
    replaceCustomer(normalizeCustomer(response));
    clientCodeDialogOpen.value = false;
    showSuccess("customers.supplementSaved");
  } catch (error) {
    showError(error, "customers.saveFailed");
  } finally {
    mutatingCustomer.value = false;
  }
}

function needsManualSupplement(shipment) {
  return shipment?.manualSupplementRequired === true || !String(shipment?.trackingStatus || "").trim();
}

function openShipmentSupplement(shipment) {
  navigateToShipmentDetail(shipment);
}

function openBatchImport() {
  batchPreviewError.value = "";
  batchImportDialogOpen.value = true;
}

function closeBatchImport() {
  if (importingCustomers.value) return;
  batchImportDialogOpen.value = false;
  batchPreviewError.value = "";
}

function quickImportRows() {
  return quickImportText.value.split(/\r?\n/).map((line, index) => {
    const [username = "", customerCode = ""] = line.split(/[,，\t]/, 2).map((value) => value.trim());
    return { rowNumber: index + 1, username, customerCode };
  }).filter((row) => row.username);
}

function handleBatchDrop(event) {
  batchDropzoneActive.value = false;
  const files = event.dataTransfer?.files;
  if (!files || !files.length) return;
  const file = files[0];
  const validTypes = [".xlsx", ".xls", ".csv"];
  const isValid = validTypes.some((ext) => file.name.toLowerCase().endsWith(ext));
  if (!isValid) {
    batchPreviewError.value = t("customers.excelReadFailed");
    return;
  }
  const fakeEvent = { target: { files } };
  handleCustomerWorkbook(fakeEvent);
}

async function handleCustomerWorkbook(event) {
  const file = event.target.files?.[0];
  batchRows.value = [];
  batchFileName.value = "";
  batchPreviewError.value = "";
  if (!file) return;
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false });
    const headers = (rows[0] || []).map((value) => String(value).trim().toLowerCase());
    const findColumn = (aliases) => headers.findIndex((header) => aliases.includes(header));
    const usernameIndex = findColumn(["客户名", "用户名", "登录名", "customer name", "username", "login name"]);
    const passwordIndex = findColumn(["密码", "登录密码", "password"]);
    const startIndex = usernameIndex >= 0 ? 1 : 0;
    const nameColumn = usernameIndex >= 0 ? usernameIndex : 0;
    batchRows.value = rows.slice(startIndex).map((row, index) => ({
      rowNumber: index + startIndex + 1,
      username: String(row[nameColumn] || "").trim(),
      password: passwordIndex >= 0 ? String(row[passwordIndex] || "") : ""
    })).filter((row) => row.username);
    if (!batchRows.value.length) throw new Error(t("customers.noImportRows"));
    batchFileName.value = file.name;
  } catch (error) {
    batchPreviewError.value = error?.message || t("customers.excelReadFailed");
  } finally {
    event.target.value = "";
  }
}

async function submitBatchImport() {
  if (importingCustomers.value) return;
  const rows = batchImportMode.value === "quick" ? quickImportRows() : batchRows.value;
  if (!rows.length) {
    batchPreviewError.value = t("customers.noImportRows");
    return;
  }
  importingCustomers.value = true;
  batchPreviewError.value = "";
  try {
    const response = await batchCreateBusinessCustomers({
      sourceFileName: batchImportMode.value === "excel" ? batchFileName.value : "quick-entry",
      items: rows
    });
    batchCredentialRows.value = Array.isArray(response?.items) ? response.items : [];
    batchImportDialogOpen.value = false;
    quickImportText.value = "";
    batchRows.value = [];
    batchFileName.value = "";
    await loadCustomers();
  } catch (error) {
    batchPreviewError.value = error?.message || t("customers.importFailed");
  } finally {
    importingCustomers.value = false;
  }
}

function downloadCredentialWorkbook() {
  const rows = batchCredentialRows.value.map((row) => ({
    [t("customers.customerName")]: row.username,
    [t("customers.initialPassword")]: row.password || "",
    [t("customers.importStatus")]: row.status === "CREATED" ? t("customers.importCreated") : row.message
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Customer credentials");
  XLSX.writeFile(workbook, `customer-credentials-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function closeBatchCredentials() {
  batchCredentialRows.value = [];
}

function replaceShipmentInLocalCollections(shipment) {
  for (const collection of [shipments.value, availableShipments.value]) {
    const index = collection.findIndex((candidate) => candidate.shipmentId === shipment.shipmentId);
    if (index >= 0) collection.splice(index, 1, { ...collection[index], ...shipment });
  }
}

function boundRoleSummary(shipment) {
  const roles = Array.isArray(shipment?.boundRoles) ? shipment.boundRoles : [];
  return roles.length ? roles.map(partyRoleLabel).join(" / ") : t("customers.noPartiesBound");
}

function normalizeCustomer(response) {
  return response?.customer || response || {};
}

function replaceCustomer(customer) {
  if (!customer?.id) return;
  const index = customers.value.findIndex((item) => item.id === customer.id);
  if (index >= 0) customers.value.splice(index, 1, { ...customers.value[index], ...customer });
  else customers.value.unshift(customer);
}

function customerInitial(customer) {
  return String(customer.displayName || customer.username || "C").slice(0, 1).toUpperCase();
}

function partyRoleLabel(role) {
  return t({
    AGENT: "customers.roleAgent",
    OVERSEA_AGENT: "customers.roleOverseaAgent",
    SHIPPER: "customers.roleShipper",
    CONSIGNEE: "customers.roleConsignee"
  }[role] || "customers.roleShipper");
}

function statusLabel(status) {
  return t(status === "ACTIVE" ? "customers.statusActive" : "customers.statusDisabled");
}

function referenceTypeLabel(type) {
  return t({ BOOKING: "customers.referenceBooking", BILLOFLADING: "customers.referenceBill", CONTAINER: "customers.referenceContainer" }[type] || "customers.referenceUnknown");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(currentLocale.value === "en-US" ? "en-US" : "zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function clearMessage() {
  pageMessage.value = "";
  messageIsError.value = false;
}

function showSuccess(key) {
  clearMessage();
  toastMessage.value = t(key);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = "";
  }, 2600);
}

function showError(error, fallbackKey) {
  const message = String(error?.message || "");
  if (/Tracked shipment not found|Shipment not found/i.test(message)) {
    pageMessage.value = t("customers.trackedShipmentNotFound");
  } else if (/explicit operator access|permission|forbidden/i.test(message)) {
    pageMessage.value = t("customers.shipmentAccessRequired");
  } else if (/\b(?:HTTP|403|Playwright|browser|channel|timeout|ECONN|network interface)\b/i.test(message)) {
    pageMessage.value = t("customers.friendlyError");
  } else {
    pageMessage.value = message || t(fallbackKey);
  }
  messageIsError.value = true;
}
</script>

<style scoped>
.customer-access-page {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  color: #1a2d42;
  background: #f0f3f7;
}

/* ---- Header (preserved styling) ---- */
.customer-access-header {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 64px;
  padding: 0 clamp(24px, 3vw, 48px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: #0f1d2e;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
}
.customer-access-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #e8edf3;
  text-decoration: none;
}
.customer-access-brand img {
  width: 34px;
  height: 34px;
}
.customer-access-brand span {
  display: grid;
  gap: 1px;
}
.customer-access-brand strong {
  font-size: 16px;
  color: #fff;
}
.customer-access-brand small {
  color: #8899b0;
  font-size: 10px;
}
.customer-access-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.customer-access-party-pill {
  padding: 5px 10px;
  border: 1px solid rgba(100, 150, 210, 0.35);
  border-radius: 999px;
  color: #a0c4e8;
  background: rgba(255, 255, 255, 0.06);
  font-size: 10px;
  font-weight: 750;
}
.customer-access-message {
  margin: 0;
  padding: 10px 16px;
  border-bottom: 1px solid #d4e2f0;
  color: #1b5e3f;
  background: #eafaf1;
  font-size: 13px;
  text-align: center;
}
.customer-access-message.is-error {
  border-color: #f0c4cc;
  color: #a63142;
  background: #fff3f5;
}

/* ---- Shipment updating overlay ---- */
.shipment-updating-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(2px);
}
.shipment-updating-overlay p {
  margin: 0;
  color: #1a2b4a;
  font-size: 15px;
  font-weight: 500;
}
.shipment-updating-cancel {
  margin-top: 8px;
  padding: 8px 18px;
  border: 1px solid #c9d6e8;
  border-radius: 8px;
  background: #ffffff;
  color: #3a4d65;
  font-size: 13px;
  cursor: pointer;
}
.shipment-updating-cancel:hover {
  background: #f3f6fa;
}
.shipment-response-toast {
  position: fixed;
  top: 80px;
  right: 24px;
  z-index: 2001;
  width: 360px;
  padding: 16px;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 8px 30px rgba(15, 29, 46, 0.14);
  border-left: 4px solid #2563eb;
}
.shipment-response-toast.is-error {
  border-left-color: #dc2626;
}
.shipment-response-toast.is-success {
  border-left-color: #16a34a;
}
.shipment-response-close {
  position: absolute;
  top: 8px;
  right: 10px;
  border: none;
  background: transparent;
  color: #8a9bb0;
  font-size: 18px;
  cursor: pointer;
}
.shipment-response-title {
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 700;
  color: #0f1d2e;
}
.shipment-response-body > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  font-size: 12px;
  border-bottom: 1px solid #eef2f7;
}
.shipment-response-body > div:last-child {
  border-bottom: none;
}
.shipment-response-body span {
  color: #6a8096;
}
.shipment-response-body b {
  font-weight: 600;
  color: #1a2d42;
  text-align: right;
  word-break: break-word;
  max-width: 60%;
}
.shipment-updating-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e0e6f0;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: shipment-updating-spin 0.8s linear infinite;
}
@keyframes shipment-updating-spin {
  to { transform: rotate(360deg); }
}

/* ---- Account menu (preserved) ---- */
.customer-account {
  position: relative;
}
.customer-account-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 140px;
  min-height: 44px;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: #dce4ef;
  background: rgba(255, 255, 255, 0.05);
  text-align: left;
  cursor: pointer;
}
.customer-account-trigger:hover,
.customer-account.is-open .customer-account-trigger {
  border-color: rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.1);
}
.customer-account-trigger span {
  display: grid;
  flex: 1;
  gap: 1px;
}
.customer-account-trigger b {
  font-size: 12px;
  color: #fff;
}
.customer-account-trigger small {
  color: #8a9cb5;
  font-size: 10px;
}
.customer-account-trigger i {
  color: #7a90ae;
  font-style: normal;
  font-size: 14px;
}
.customer-account-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 60;
  display: grid;
  min-width: 168px;
  padding: 5px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: #152a40;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
}
.customer-account-menu a,
.customer-account-menu button {
  padding: 9px 12px;
  border: 0;
  border-radius: 6px;
  color: #c8d6e5;
  background: transparent;
  text-align: left;
  text-decoration: none;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
}
.customer-account-menu a:hover,
.customer-account-menu button:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

/* ---- Workspace Layout ---- */
.workspace-layout {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* ---- Sidebar ---- */
.workspace-sidebar {
  width: 180px;
  flex: 0 0 180px;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #f5f7fa 0%, #eceff4 100%);
  border-right: 1px solid #dce1e8;
  overflow: hidden;
  padding: 12px 0;
}
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 8px;
}
.sidebar-nav button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 10px 14px;
  border: 0;
  border-radius: 8px;
  color: #5a6d80;
  background: transparent;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
  text-align: left;
}
.sidebar-nav button:hover {
  color: #1e40af;
  background: #e0e7ff;
}
.sidebar-nav button.active {
  color: #1e40af;
  background: #e0e7ff;
  font-weight: 800;
}

/* ---- Main Content Area ---- */
.workspace-main {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  background: #f0f3f7;
}
.main-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: 60px 20px;
}
.empty-state-icon {
  display: grid;
  place-items: center;
  width: 80px;
  height: 80px;
  border-radius: 20px;
  color: #a0bcd4;
  background: #e4ecf5;
}
.main-empty-sub {
  margin: 8px 0 0;
  color: #889aaf;
  font-size: 13px;
}

/* ---- List Page ---- */
.list-page {
  max-width: none;
  width: 100%;
}
.list-page-full {
  max-width: none;
  width: 100%;
}
.list-page-full :deep(.el-table) {
  width: 100% !important;
}
.list-page-full :deep(.el-table__body-wrapper),
.list-page-full :deep(.el-table__header-wrapper) {
  width: 100%;
}
.shipment-workspace {
  display: flex;
  gap: 20px;
  min-height: 0;
}
.shipment-workspace-main {
  flex: 1;
  min-width: 0;
}
.shipment-workspace-side {
  width: 380px;
  flex: 0 0 380px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 20px;
  align-self: flex-start;
  height: calc(100vh - 104px);
}
.batch-track-panel {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  padding: 20px;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}
.batch-track-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 12px;
  margin-bottom: 4px;
}
.batch-track-panel-header h3 {
  margin: 0;
  font-size: 16px;
  color: #0f1d2e;
  font-weight: 700;
}
.batch-track-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.batch-track-dropzone {
  padding: 20px 12px;
}
.batch-track-results {
  flex: 1;
  min-height: 180px;
  max-height: none;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
}
.batch-track-results:empty {
  display: none;
}
.batch-track-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 8px;
  border-top: 1px solid #e2e8f0;
}
.batch-track-excel-rule {
  color: #6a8096;
  font-size: 11px;
  line-height: 1.5;
  max-width: 100%;
  text-align: center;
}

.batch-track-preview {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid #d7e3f2;
  border-radius: 12px;
  background: #f8fbff;
}

.batch-track-preview-controls {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 10px;
}

.batch-track-preview-controls label {
  display: grid;
  gap: 5px;
  min-width: 0;
  color: #40566f;
  font-size: 12px;
}

.batch-track-preview-note {
  margin: 0;
  color: #526d89;
  font-size: 12px;
}

.batch-track-preview-table-wrap {
  max-width: 100%;
  max-height: 260px;
  overflow: auto;
  border: 1px solid #dce6f1;
  border-radius: 9px;
  background: #fff;
}

.batch-track-preview-table {
  min-width: 920px;
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.batch-track-preview-table th,
.batch-track-preview-table td {
  max-width: 180px;
  padding: 7px 8px;
  border-bottom: 1px solid #edf2f7;
  color: #43566b;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.batch-track-preview-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #eef4fb;
  color: #263b53;
}

.batch-track-preview-table .selected {
  background: #e5f1ff;
  color: #0b63ce;
}

.batch-track-result-row.succeeded,
.batch-track-result-row.manual {
  border-color: #9fd8bd;
  background: #f1fbf6;
}

.batch-track-result-row.stopped {
  border-color: #cbd5e1;
  background: #f8fafc;
  color: #64748b;
}

@media (max-width: 900px) {
  .batch-track-preview-controls {
    grid-template-columns: 1fr;
  }
}
.slide-fade-enter-active {
  transition: all 0.3s ease;
}
.slide-fade-leave-active {
  transition: all 0.25s ease;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(20px);
  opacity: 0;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1), transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: opacity, transform;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(28px);
}
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1), transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: opacity, transform;
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(28px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-28px);
}
.workspace-view,
.subview-wrap {
  width: 100%;
  min-width: 0;
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
.list-page-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.customer-table-avatar {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: #1e40af;
  background: #bfdbfe;
  font-weight: 800;
  font-size: 11px;
}

.customer-name-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.customer-name-cell > div {
  display: flex;
  flex-direction: column;
  line-height: 1.4;
}
.customer-name-cell small {
  color: #6b7e96;
  font-size: 11px;
}

.table-action-buttons {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: center;
}
.table-action-buttons--spacious {
  gap: 20px;
  justify-content: flex-start;
}
.table-action-buttons--spacious .el-button {
  padding-left: 18px;
  padding-right: 18px;
}

.required-star {
  color: #f56c6c;
  font-style: normal;
  margin-left: 2px;
}

/* ---- Back Button ---- */
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

/* Main cards */
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

/* Main card header */
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

/* Section labels */
.section-label {
  font-size: 14px;
  font-weight: 700;
  color: #1a2d42;
  margin: 0;
}

/* Profile form */
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
.code-meta-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #f4f7fb;
  font-size: 12px;
}
.code-meta-label {
  color: #5e7794;
  font-weight: 700;
  font-size: 11px;
}
.code-meta-bar small {
  color: #889aaf;
  margin-left: auto;
}

/* Pending matches */
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
.pending-match-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fff;
  margin-bottom: 6px;
}
.pending-match-row > span {
  display: grid;
  gap: 2px;
}
.pending-match-row small {
  color: #7d93ae;
  font-size: 10px;
}
.empty-hint-compact {
  padding: 16px;
  color: #889aaf;
  font-size: 12px;
  text-align: center;
}

/* Bind form card */
.bind-form-card {
  margin-bottom: 12px;
  border: 1px solid #e0e7f0;
  border-radius: 10px;
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
  font-size: 11px;
}

/* Candidate card */
.candidate-card {
  margin-bottom: 12px;
  border: 1px solid #e0e7f0;
  border-radius: 10px;
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
}
.candidate-header b {
  font-size: 13px;
  color: #1a2d42;
}
.candidate-header small {
  display: block;
  color: #7d93ae;
  font-size: 11px;
  margin-top: 2px;
}
.candidate-header-actions {
  display: flex;
  gap: 6px;
}
.candidate-list {
  display: grid;
  gap: 6px;
}
.candidate-row {
  display: grid;
  grid-template-columns: minmax(160px, 1.3fr) minmax(110px, 0.8fr) minmax(100px, 0.6fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid #e4eaf1;
  border-radius: 8px;
  background: #fff;
  font-size: 11px;
}
.candidate-row > span:first-child {
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
}

/* Shipment status dot */
.shipment-status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 5px;
  border-radius: 50%;
  background: #56b88d;
  flex-shrink: 0;
}

/* Bound table */
.bound-table-card {
  border: 1px solid #e0e7f0;
  border-radius: 10px;
}
.bound-table-card :deep(.el-card__body) {
  padding: 0;
}
.bound-table {
  width: 100%;
}
.table-ref-cell {
  display: grid;
  gap: 2px;
}
.table-ref-cell b {
  font-size: 12px;
  color: #1a2d42;
}
.table-ref-cell small {
  color: #7d93ae;
  font-size: 10px;
}
.table-status-cell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.table-actions {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
}

/* ---- Shipment tab main area ---- */
.shipment-tab-actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

/* Batch bind */
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

/* ---- Dialogs (preserved originals with minor refinements) ---- */
.customer-code-overlay {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(8, 20, 36, 0.62);
  backdrop-filter: blur(8px);
}
.customer-code-dialog {
  display: grid;
  gap: 13px;
  width: min(520px, 100%);
  padding: 30px;
  border: 1px solid rgba(180, 200, 220, 0.5);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 64px rgba(6, 24, 44, 0.28);
}
.customer-code-dialog h2 {
  margin: 0;
  font-size: 22px;
  color: #0f1d2e;
}
.customer-code-dialog p,
.customer-code-dialog > small {
  margin: 0;
  color: #6b8095;
  line-height: 1.6;
}
.customer-code-kicker {
  color: #4086d2;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0.14em;
}
.customer-credential-list {
  display: grid;
  gap: 8px;
  margin: 0;
}
.customer-credential-list > div {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 8px;
  background: #f4f7fb;
}
.customer-credential-list dt {
  color: #5e7794;
  font-size: 11px;
  font-weight: 700;
}
.customer-credential-list dd {
  color: #0f1d2e;
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}
.customer-code-dialog > div {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
.customer-code-dialog > div button {
  flex: 1;
}
.customer-access-primary {
  min-height: 40px;
  border: 1px solid #1a4f80;
  border-radius: 8px;
  color: #fff;
  background: linear-gradient(135deg, #1a4f80, #2e7cc4);
  box-shadow: 0 8px 20px rgba(15, 50, 90, 0.18);
  font-weight: 800;
  font-size: 12px;
  cursor: pointer;
}
.customer-access-primary:hover {
  box-shadow: 0 10px 26px rgba(15, 50, 90, 0.28);
}

/* Dialog forms */
.customer-dialog-form {
  display: grid;
  gap: 12px;
}
.customer-dialog-form label,
.customer-note-editor {
  display: grid;
  gap: 5px;
}
.customer-dialog-form label > span,
.customer-note-editor > span {
  color: #435d76;
  font-size: 11px;
  font-weight: 800;
}
.customer-dialog-form input,
.customer-dialog-form textarea,
.customer-note-editor textarea {
  width: 100%;
  padding: 9px 11px;
  border: 1px solid #cfdeec;
  border-radius: 8px;
  color: #183652;
  background: #fbfdff;
  font-size: 13px;
}
.customer-dialog-form input:focus,
.customer-dialog-form textarea:focus {
  border-color: #4086d2;
  outline: 0;
  box-shadow: 0 0 0 3px rgba(64, 134, 210, 0.1);
}
.customer-dialog-form textarea,
.customer-note-editor textarea {
  min-height: 100px;
  resize: vertical;
  font: inherit;
}
.customer-note-editor > small {
  color: #889aaf;
  text-align: right;
  font-size: 11px;
}
.customer-dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.customer-dialog-actions button {
  flex: 1;
  min-height: 38px;
  border: 1px solid #cfdeec;
  border-radius: 8px;
  color: #3a5572;
  background: #fff;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
}
.customer-dialog-actions button:hover {
  background: #f4f7fb;
}
.customer-dialog-actions .is-danger {
  color: #ac3d4d;
  border-color: #edc5cc;
  background: #fff7f8;
}
.customer-dialog-actions .is-danger:hover {
  background: #ffeff1;
}
.customer-shipment-dialog {
  width: min(620px, 100%);
}
.customer-create-dialog,
.customer-shipment-dialog {
  max-height: min(86vh, 860px);
  overflow-y: auto;
}
.customer-manual-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.shipment-detail-card :deep(.el-card__body) {
  padding: 24px;
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
  grid-template-columns: 1fr;
  gap: 12px;
  margin-bottom: 16px;
}
.shipment-detail-single-column .el-form-item {
  margin-bottom: 0;
}
.shipment-detail-fields {
  grid-template-columns: 1fr;
}
.shipment-detail-fields .el-input {
  border-radius: 8px;
}
.shipment-detail-fields .el-form-item {
  margin-bottom: 0;
  padding: 12px;
  border: 1px solid #e1e8f0;
  border-radius: 10px;
  background: #ffffff;
}
.shipment-detail-fields .el-form-item__label {
  padding-bottom: 8px;
  color: #5a6f86;
  font-size: 12px;
  font-weight: 600;
}
.customer-manual-update {
  padding: 12px;
  border: 1px solid #d7e4ef;
  border-radius: 10px;
  background: #f8fbfe;
}
.customer-manual-update summary {
  cursor: pointer;
  color: #1b5e96;
  font-size: 12px;
  font-weight: 850;
}
.customer-manual-update > p {
  margin: 8px 0 12px;
  color: #71879c;
  font-size: 12px;
  line-height: 1.6;
}

/* Segmented controls (preserved) */
.customer-segmented-control {
  display: flex;
  gap: 3px;
  padding: 3px;
  border: 1px solid #d4e0ed;
  border-radius: 6px;
  background: #fff;
}
.customer-segmented-control button {
  flex: 1;
  min-height: 30px;
  padding: 5px 10px;
  border: 0;
  border-radius: 4px;
  color: #6c8196;
  background: transparent;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
}
.customer-segmented-control button.is-active {
  color: #1a4f80;
  background: #eaf3fc;
}

/* Batch import dialog */
.customer-batch-tabs {
  display: flex;
  gap: 4px;
}
.customer-batch-tabs button {
  flex: 1;
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid #d4e0ed;
  border-radius: 6px;
  color: #6c8196;
  background: #fff;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}
.customer-batch-tabs button.is-active {
  color: #1a4f80;
  border-color: #4086d2;
  background: #eaf3fc;
}
.customer-batch-policy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f4f7fb;
  font-size: 11px;
  color: #5e7794;
}
.customer-batch-textarea {
  display: grid;
  gap: 6px;
}
.customer-batch-textarea textarea {
  min-height: 120px;
  padding: 10px;
  border: 1px solid #cfdeec;
  border-radius: 8px;
  resize: vertical;
  font: inherit;
  font-size: 12px;
}
.customer-batch-textarea small {
  color: #889aaf;
  font-size: 10px;
}
.customer-excel-dropzone {
  display: grid;
  gap: 6px;
  place-items: center;
  padding: 28px 16px;
  border: 2px dashed #c8d6e2;
  border-radius: 12px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}
.customer-excel-dropzone:hover {
  border-color: #5b8def;
  background: #f5f9ff;
}
.customer-excel-dropzone.has-file {
  border-color: #56b88d;
  background: #f6fdf9;
}
.customer-excel-dropzone.is-dragover {
  border-color: #5b8def;
  background: #eef4ff;
  transform: scale(1.02);
}
.customer-excel-dropzone input {
  display: none;
}
.customer-excel-dropzone b {
  color: #1a2d42;
  font-size: 13px;
}
.customer-excel-dropzone small {
  color: #889aaf;
  font-size: 11px;
}
.customer-excel-dropzone button {
  min-height: 32px;
  padding: 6px 12px;
  border: 1px solid #cfdeec;
  border-radius: 6px;
  color: #3a5572;
  background: #fff;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.customer-batch-error {
  margin: 0;
  color: #ac3d4d;
  font-size: 12px;
}

/* Credential table */
.customer-credential-table {
  border: 1px solid #e0e7f0;
  border-radius: 10px;
  overflow: hidden;
  max-height: 340px;
  overflow-y: auto;
}
.customer-credential-table-head,
.customer-credential-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 0.8fr;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 11px;
}
.customer-credential-table-head {
  background: #f4f7fb;
  color: #5e7794;
  font-weight: 800;
  font-size: 10px;
  letter-spacing: 0.04em;
}
.customer-credential-row {
  border-bottom: 1px solid #eef2f7;
}
.customer-credential-row.is-failed {
  background: #fff8f8;
  color: #ac3d4d;
}
.customer-credential-row:last-child {
  border-bottom: 0;
}

/* Shipment detail grid */
.customer-shipment-detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.customer-shipment-detail-grid > span {
  display: grid;
  gap: 4px;
  padding: 10px;
  border-radius: 8px;
  background: #f4f7fb;
}
.customer-shipment-detail-grid small {
  color: #75899e;
  font-size: 10px;
}
.customer-shipment-detail-grid b {
  color: #183b5a;
  font-size: 12px;
}

/* Toast */
.customer-toast {
  position: fixed;
  top: 80px;
  left: 50%;
  z-index: 200;
  transform: translateX(-50%);
  padding: 10px 18px;
  border: 1px solid #a9dfca;
  border-radius: 8px;
  color: #146a4c;
  background: #effbf6;
  box-shadow: 0 12px 32px rgba(18, 94, 68, 0.14);
  font-weight: 750;
  font-size: 13px;
}

/* Element Plus overrides */
:deep(.business-select) {
  width: 100%;
}
:deep(.el-divider--vertical) {
  margin: 0 2px;
}
:deep(.el-tag) {
  font-weight: 600;
}

/* Disabled state */
button:disabled {
  cursor: wait;
  opacity: 0.55;
}

/* Scrollbar styling */
.workspace-sidebar ::-webkit-scrollbar,
.workspace-main ::-webkit-scrollbar {
  width: 5px;
}
.workspace-sidebar ::-webkit-scrollbar-track {
  background: transparent;
}
.workspace-sidebar ::-webkit-scrollbar-thumb {
  background: #c5d0dc;
  border-radius: 4px;
}
.workspace-main ::-webkit-scrollbar-track {
  background: #e8edf3;
}
.workspace-main ::-webkit-scrollbar-thumb {
  background: #c5d0dc;
  border-radius: 4px;
}

/* Responsive */
@media (max-width: 900px) {
  .workspace-sidebar {
    width: 160px;
    flex: 0 0 160px;
  }
  .workspace-main {
    padding: 14px 12px;
  }
}
@media (max-width: 680px) {
  .workspace-layout {
    flex-direction: column;
  }
  .workspace-sidebar {
    width: 100%;
    flex: 0 0 auto;
    max-height: none;
  }
  .sidebar-nav {
    flex-direction: row;
    padding: 4px 6px;
  }
  .sidebar-nav button {
    flex: 1;
    justify-content: center;
    min-height: 36px;
    padding: 6px 8px;
    font-size: 10px;
  }
  .main-card-header {
    flex-direction: column;
  }
  .candidate-row {
    grid-template-columns: 1fr auto;
  }
  .customer-manual-fields {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    transition: none !important;
  }
}

/* ---- Batch Track Dialog ---- */
.customer-batch-track-dialog {
  width: min(640px, calc(100vw - 32px));
  max-height: calc(100vh - 64px);
}
.batch-track-form {
  display: grid;
  gap: 14px;
  margin: 16px 0 18px;
}
.batch-track-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.batch-track-textarea {
  display: grid;
  gap: 6px;
}
.batch-track-textarea textarea {
  width: 100%;
  min-height: 140px;
  padding: 10px 12px;
  border: 1px solid #cfd9e4;
  border-radius: 8px;
  font-family: "SFMono-Regular", "Menlo", "Consolas", monospace;
  font-size: 13px;
  resize: vertical;
  background: #f8fafc;
}
.batch-track-textarea small {
  color: #6b7e96;
  font-size: 11px;
}
.batch-track-results {
  margin: 16px 0;
  padding: 12px 14px;
  background: #f5f8fb;
  border: 1px solid #dfe7f0;
  border-radius: 8px;
}
.batch-track-progress {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #e2e8f0;
  font-size: 12px;
  color: #3b5170;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 1;
}
.batch-track-result-list {
  max-height: none;
  overflow-y: visible;
  display: grid;
  gap: 6px;
}
.batch-track-result-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  background: #fff;
}
.batch-track-result-row.success b {
  font-family: "SFMono-Regular", "Menlo", "Consolas", monospace;
  color: #1a3a5c;
}
.batch-track-result-row.success {
  border-left: 3px solid #22c55e;
}
.batch-track-result-row.failed {
  border-left: 3px solid #ef4444;
  background: #fff3f5;
}
.batch-track-result-row.empty {
  border-left: 3px solid #f59e0b;
  background: #fffbeb;
}
.batch-track-result-row.cancelled {
  border-left: 3px solid #94a3b8;
  background: #f8fafc;
}
.batch-track-result-row.pending {
  border-left: 3px solid #94a3b8;
  opacity: 0.8;
}
.batch-track-result-row.running {
  border-left: 3px solid #3b82f6;
  background: #eff6ff;
}
.batch-track-result-row small {
  color: #6b7e96;
  text-align: left;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: normal;
}
.batch-track-result-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.batch-track-result-meta b {
  font-family: "SFMono-Regular", "Menlo", "Consolas", monospace;
  color: #1a3a5c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
