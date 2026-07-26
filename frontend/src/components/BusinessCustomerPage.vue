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
          <button :class="{ active: menuItem === 'relationships' }" @click="navigateTo('relationships')">
            <el-icon><Operation /></el-icon><span>{{ t("customers.tabCustomerRelationships") }}</span>
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
                  <el-button
                    type="warning"
                    plain
                    :disabled="!selectedCustomerRows.length"
                    @click="openCustomerTransfer"
                  >
                    <el-icon><Operation /></el-icon>
                    {{ t("customers.transferSelected", { count: selectedCustomerRows.length }) }}
                  </el-button>
                </div>
              </div>
              <el-table
                ref="customerTableRef"
                :data="filteredCustomers"
                stripe
                v-loading="loadingCustomers"
                style="width:100%"
                table-layout="auto"
                class="customer-directory-table"
                @selection-change="handleCustomerSelectionChange"
              >
                <el-table-column type="selection" width="48" :selectable="isTransferableCustomer" />
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
                <el-table-column prop="clientCode" :label="t('customers.clientCode')" width="150" />
                <el-table-column prop="responsibleAgentDisplayName" :label="t('customers.responsibleAgent')" min-width="140" />
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
                          <el-option value="OVERSEA_AGENT" :label="t('customers.roleOverseaAgent')" />
                          <el-option value="SHIPPER" :label="t('customers.roleShipper')" />
                          <el-option value="CONSIGNEE" :label="t('customers.roleConsignee')" />
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

              </section>
            </el-card>

            <el-card v-if="selectedCustomer.partyRole === 'OVERSEA_AGENT'" class="main-card" shadow="never">
              <template #header>
                <div class="section-label">{{ t("customers.linkedCustomersTitle") }}</div>
              </template>
              <p class="section-description">{{ t("customers.linkedCustomersDescription") }}</p>
              <el-select
                v-model="linkedCustomerIds"
                class="business-select"
                popper-class="business-select-popper"
                multiple
                filterable
                collapse-tags
                :max-collapse-tags="3"
                :loading="loadingLinkedCustomers"
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
                <el-button
                  type="primary"
                  :loading="savingLinkedCustomers"
                  @click="saveLinkedCustomers"
                >{{ t("customers.saveLinkedCustomers") }}</el-button>
              </div>
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
                      <b>{{ t("customers.customerShipmentAccess") }}</b>
                      <small>{{ t("customers.customerShipmentAccessHint") }}</small>
                    </div>
                    <div class="candidate-header-actions">
                      <el-button
                        type="success"
                        size="small"
                        :disabled="!draftShipments.length || publishingAllShipments || !!publishingShipmentId"
                        @click="publishAllDraftShipments"
                      >{{ t("customers.publishAllDrafts", { count: draftShipments.length }) }}</el-button>
                      <el-button
                        type="primary"
                        size="small"
                        :disabled="!selectedCandidateShipmentIds.length || bindingShipment"
                        @click="batchBindSelectedShipments"
                      >{{ t("customers.batchBindSelected", { count: selectedCandidateShipmentIds.length }) }}</el-button>
                      <el-button type="primary" size="small" @click="shipmentCreateDialogOpen = true">
                        {{ t("customers.createShipment") }}
                      </el-button>
                      <el-button size="small" @click="loadAvailableShipments" :disabled="loadingAvailableShipments">
                        {{ t("customers.refresh") }}
                      </el-button>
                    </div>
                  </div>
                </template>
                <div v-if="loadingAvailableShipments || loadingShipments" class="empty-hint-compact">{{ t("customers.loadingCustomerShipmentAccess") }}</div>
                <div v-else-if="!shipments.length && !unboundAvailableShipments.length" class="empty-hint-compact">{{ t("customers.emptyCustomerShipmentAccess") }}</div>
                <div v-else class="candidate-list">
                  <div
                    v-for="shipment in shipments"
                    :key="`bound-${shipment.shipmentId}`"
                    class="candidate-row candidate-row--bound"
                  >
                    <el-checkbox :model-value="false" disabled :aria-label="t('customers.bound')" />
                    <span><b>{{ shipment.referenceNo || shipment.shipmentId }}</b><small>{{ shipment.carrier || '—' }} · {{ referenceTypeLabel(shipment.referenceType) }}</small></span>
                    <span class="candidate-status-cell">
                      <span><i class="shipment-status-dot"></i>{{ shipment.trackingStatus || t("customers.bound") }}</span>
                      <el-tag size="small" :type="shipment.publicationStatus === 'PUBLISHED' ? 'success' : 'warning'" effect="plain">
                        {{ shipment.publicationStatus === 'PUBLISHED' ? t("customers.published") : t("customers.draft") }}
                      </el-tag>
                    </span>
                    <span>{{ formatDate(shipment.assignedAt || shipment.updatedAt) }}</span>
                    <span class="candidate-row-actions">
                      <el-button text size="small" @click="openShipmentDetail(shipment)">{{ t("customers.edit") }}</el-button>
                      <el-button
                        v-if="needsManualSupplement(shipment)"
                        text
                        size="small"
                        type="warning"
                        @click="openShipmentSupplement(shipment)"
                      >{{ t("customers.manualSupplement") }}</el-button>
                      <el-button
                        :type="shipment.publicationStatus === 'PUBLISHED' ? 'warning' : 'success'"
                        plain
                        size="small"
                        @click="togglePublication(shipment)"
                        :disabled="publishingAllShipments || publishingShipmentId === shipment.shipmentId"
                      >{{ shipment.publicationStatus === 'PUBLISHED' ? t("customers.withdraw") : t("customers.publish") }}</el-button>
                      <el-button text size="small" type="danger" @click="unbindShipment(shipment)" :disabled="unbindingShipmentId === shipment.shipmentId">
                        {{ t("customers.unbind") }}
                      </el-button>
                    </span>
                  </div>
                  <div v-for="shipment in unboundAvailableShipments" :key="shipment.shipmentId" class="candidate-row">
                    <el-checkbox
                      :model-value="selectedCandidateShipmentIds.includes(shipment.shipmentId)"
                      :aria-label="t('customers.selectShipment')"
                      @change="(checked) => toggleCandidateShipment(shipment.shipmentId, checked)"
                    />
                    <span><b>{{ shipment.referenceNo || shipment.shipmentId }}</b><small>{{ shipment.carrier }} · {{ referenceTypeLabel(shipment.referenceType) }}</small></span>
                    <span>
                      <i class="shipment-status-dot"></i>{{ shipment.trackingStatus || t("customers.bound") }}
                      <small>{{ boundRoleSummary(shipment) }}</small>
                    </span>
                    <span>{{ formatDate(shipment.lastTrackedAt || shipment.updatedAt) }}</span>
                    <span class="candidate-row-actions">
                      <el-button text size="small" @click="openShipmentDetail(shipment)">{{ t("customers.edit") }}</el-button>
                      <el-button type="primary" size="small" @click="quickBindShipment(shipment)" :disabled="bindingShipment">{{ t("customers.quickBind") }}</el-button>
                    </span>
                  </div>
                </div>
                <el-pagination
                  v-if="shipmentTotal > shipmentPageSize"
                  class="shipment-pagination"
                  background
                  layout="prev, pager, next, sizes, total"
                  :current-page="shipmentPage"
                  :page-size="shipmentPageSize"
                  :page-sizes="[10, 20, 50, 100]"
                  :total="shipmentTotal"
                  @current-change="changeShipmentPage"
                  @size-change="changeShipmentPageSize"
                />
              </el-card>
            </el-card>
          </template>
          </div>
          </transition>
        </div>

        <!-- CUSTOMER RELATIONSHIPS -->
        <div v-else-if="menuItem === 'relationships'" key="relationships" class="workspace-view">
          <CustomerRelationshipPanel :current-user="props.currentUser" />
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
                    <label class="shipment-toolbar-control">
                      <span>{{ t("customers.customerFilterLabel") }}</span>
                      <el-select
                        v-model="shipmentCustomerFilter"
                        class="shipment-customer-filter"
                        :placeholder="t('customers.filterByCustomer')"
                        clearable
                        filterable
                      >
                        <el-option
                          v-for="customer in shipmentFilterCustomers"
                          :key="customer.id"
                          :label="`${customerFilterOptionLabel(customer)} (${customer.shipmentCount})`"
                          :value="customer.id"
                        />
                        <template #label="{ value }">
                          <span class="shipment-customer-filter-label">{{ shipmentCustomerSelectedLabel(value) }}</span>
                        </template>
                      </el-select>
                    </label>
                    <label class="shipment-toolbar-control">
                      <span>{{ t("customers.trackingChannel") }}</span>
                      <el-select
                        v-model="shipmentTrackingChannel"
                        class="shipment-channel-select"
                        :disabled="batchTrackRunning || refreshingShipment"
                      >
                        <el-option :label="t('customers.trackingChannelAuto')" value="AUTO" />
                        <el-option :label="t('customers.trackingChannelProxy')" value="PROXY" />
                      </el-select>
                    </label>
                    <el-button
                      :type="refreshIssuesOnly ? 'danger' : ''"
                      :plain="!refreshIssuesOnly"
                      :disabled="!refreshIssueCount"
                      @click="refreshIssuesOnly = !refreshIssuesOnly"
                    >{{ t("customers.refreshIssuesOnly", { count: refreshIssueCount }) }}</el-button>
                    <el-button type="primary" @click="shipmentCreateDialogOpen = true"><el-icon><Plus /></el-icon>{{ t("customers.createShipment") }}</el-button>
                    <el-button
                      type="primary"
                      plain
                      :disabled="!selectedShipmentRows.length || batchSavingBusinessFields"
                      @click="openBatchBusinessFieldsEditor"
                    >{{ t("customers.batchEditBusinessFields", { count: selectedShipmentRows.length }) }}</el-button>
                    <el-button
                      type="danger"
                      plain
                      :disabled="!selectedShipmentRows.length || batchDeletingShipments"
                      @click="batchDeleteSelectedShipments"
                    >{{ t("customers.batchDeleteSelected", { count: selectedShipmentRows.length }) }}</el-button>
                    <el-button
                      type="warning"
                      plain
                      :disabled="!selectedShipmentRows.length || batchTrackRunning || refreshingShipment || batchDeletingShipments"
                      @click="startRefreshSelectedShipments"
                    ><el-icon><Refresh /></el-icon>{{ t("customers.batchRefreshSelected", { count: selectedShipmentRows.length }) }}</el-button>
                    <el-button type="success" plain :disabled="batchTrackRunning || refreshingShipment" @click="startRefreshAllShipments"><el-icon><Refresh /></el-icon>{{ t("customers.refreshAllActive") }}</el-button>
                    <el-button @click="toggleBatchTrackPanel" :type="batchTrackRunning || batchTrackDialogOpen ? 'primary' : ''"><el-icon><Operation /></el-icon>{{ batchTrackToolbarLabel }}</el-button>
                    <el-button @click="loadAvailableShipments" :disabled="loadingAvailableShipments"><el-icon><Refresh /></el-icon>{{ t("customers.refresh") }}</el-button>
                  </div>
                </div>
                <el-table
                  ref="shipmentTableRef"
                  :data="displayedAvailableShipments"
                  row-key="shipmentId"
                  stripe
                  v-loading="loadingAvailableShipments"
                  style="width:100%"
                  @selection-change="handleShipmentSelectionChange"
                >
                  <el-table-column type="selection" width="48" />
                  <el-table-column type="index" :index="shipmentRowIndex" :label="t('customers.index')" width="60" />
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
                  <el-table-column :label="t('customers.clientNoName')" min-width="170" show-overflow-tooltip>
                    <template #default="{ row }">{{ shipmentClientLabel(row) }}</template>
                  </el-table-column>
                  <el-table-column :label="t('customers.boundUsers')" min-width="210">
                    <template #default="{ row }">
                      <div v-if="shipmentBoundUsers(row).length" class="shipment-bound-user-tags">
                        <el-tag
                          v-for="user in shipmentBoundUsers(row).slice(0, 2)"
                          :key="user.id || `${user.name}-${user.role}`"
                          size="small"
                          effect="plain"
                        >{{ boundUserLabel(user) }}</el-tag>
                        <el-tooltip
                          v-if="shipmentBoundUsers(row).length > 2"
                          :content="shipmentBoundUsers(row).map(boundUserLabel).join(', ')"
                          placement="top"
                        >
                          <el-tag size="small" type="info" effect="plain">+{{ shipmentBoundUsers(row).length - 2 }}</el-tag>
                        </el-tooltip>
                      </div>
                      <span v-else>—</span>
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('customers.shipmentStatus')" width="160">
                    <template #default="{ row }">
                      <div class="shipment-status-stack">
                        <span><i class="shipment-status-dot"></i>{{ row.trackingStatus || '—' }}</span>
                        <el-tooltip
                          v-if="hasRefreshIssue(row)"
                          :content="refreshOutcomeTooltip(row)"
                          placement="top"
                        >
                          <el-tag size="small" type="danger" effect="plain">
                            {{ row.lastRefreshResult === 'FAILED' ? t("customers.refreshFailedMark") : t("customers.refreshPartialMark") }}
                          </el-tag>
                        </el-tooltip>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('customers.remark')" min-width="180" show-overflow-tooltip>
                    <template #default="{ row }">{{ row.note || row.remark || '—' }}</template>
                  </el-table-column>
                  <el-table-column :label="t('customers.lastTrackedAt')" width="160">
                    <template #default="{ row }">{{ formatDateTime(row.lastTrackedAt || row.updatedAt) }}</template>
                  </el-table-column>
                  <el-table-column :label="t('customers.actions')" width="380" fixed="right">
                    <template #default="{ row }">
                      <div class="table-action-buttons table-action-buttons--spacious">
                        <el-button size="small" type="info" plain @click.stop="trackShipmentInWorkspace(row)">{{ t("customers.view") }}</el-button>
                        <el-button size="small" type="primary" plain @click.stop="editShipment(row)">{{ t("customers.edit") }}</el-button>
                        <el-button size="small" type="warning" plain :disabled="refreshingShipment" @click.stop="updateShipmentTracking(row)">{{ t("customers.update") }}</el-button>
                        <el-button size="small" type="danger" plain @click.stop="deleteShipmentRow(row)">{{ t("customers.delete") }}</el-button>
                      </div>
                    </template>
                  </el-table-column>
                </el-table>
                <el-pagination
                  v-if="shipmentTotal > shipmentPageSize"
                  class="shipment-pagination"
                  background
                  layout="prev, pager, next, sizes, total"
                  :current-page="shipmentPage"
                  :page-size="shipmentPageSize"
                  :page-sizes="[10, 20, 50, 100]"
                  :total="shipmentTotal"
                  @current-change="changeShipmentPage"
                  @size-change="changeShipmentPageSize"
                />
                <el-dialog
                  v-model="batchBusinessFieldsDialogOpen"
                  :title="t('customers.batchEditBusinessFieldsTitle')"
                  width="min(1080px, 94vw)"
                  append-to-body
                  class="batch-business-fields-dialog"
                >
                  <p class="batch-business-fields-hint">{{ t("customers.batchEditBusinessFieldsHint") }}</p>
                  <div class="batch-business-fields-grid batch-business-fields-grid--head">
                    <span>{{ t("customers.referenceNo") }}</span>
                    <span>{{ t("customers.jobNumber") }}</span>
                    <span>{{ t("customers.clientPoNumber") }}</span>
                    <span>{{ t("customers.clientNoName") }}</span>
                  </div>
                  <div class="batch-business-fields-rows">
                    <div
                      v-for="row in batchBusinessFieldRows"
                      :key="row.shipmentId"
                      class="batch-business-fields-grid"
                    >
                      <span class="batch-business-reference"><b>{{ row.referenceNo }}</b><small>{{ row.carrier }}</small></span>
                      <el-input v-model="row.forwarderJobNumber" clearable />
                      <el-input v-model="row.clientPoNumber" clearable />
                      <el-input v-model="row.clientNameCode" clearable />
                    </div>
                  </div>
                  <template #footer>
                    <el-button @click="batchBusinessFieldsDialogOpen = false" :disabled="batchSavingBusinessFields">{{ t("customers.cancel") }}</el-button>
                    <el-button type="primary" @click="saveBatchBusinessFields" :loading="batchSavingBusinessFields">
                      {{ t("customers.saveBatchBusinessFields") }}
                    </el-button>
                  </template>
                </el-dialog>
              </div>
              <el-dialog
                v-model="batchTrackDialogOpen"
                :title="batchTrackDialogTitle"
                width="min(920px, 94vw)"
                append-to-body
                :destroy-on-close="false"
                class="batch-track-task-dialog"
              >
                <div class="shipment-workspace-side batch-track-task-dialog-body">
                  <div class="batch-track-panel">
                    <div v-show="!batchTrackRunning" class="batch-track-form">
                      <div
                        v-loading="batchTrackFileParsing"
                        :element-loading-text="t('app.loadingPage')"
                        class="customer-excel-dropzone batch-track-dropzone"
                        :class="{ 'has-file': batchTrackFileName, 'is-dragover': batchTrackDropzoneActive }"
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
                      <el-alert
                        v-if="batchTrackProgress.stopReason === 'CIRCUIT_BREAKER'"
                        type="error"
                        show-icon
                        :closable="false"
                        :title="t('customers.batchTrackCircuitOpened', {
                          count: batchTrackProgress.circuitFailureCount,
                          code: batchTrackProgress.circuitErrorCode,
                          remaining: batchTrackProgress.pending
                        })"
                      />
                      <el-alert
                        v-else-if="batchTrackProgress.status === 'PAUSED'"
                        type="warning"
                        :closable="false"
                        :title="t('customers.batchTrackPaused', { time: formatDateTime(batchTrackProgress.nextAttemptAt) })"
                      />
                      <el-alert
                        v-else-if="batchTrackProgress.nextAttemptAt"
                        type="warning"
                        :closable="false"
                        :title="t('customers.batchTrackRetryWait', { time: formatDateTime(batchTrackProgress.nextAttemptAt) })"
                      />
                      <div v-if="batchTrackResults.length" class="batch-track-result-list">
                        <div class="batch-track-result-list-head">
                          <span>{{ batchTrackProblemsOnly
                            ? t("customers.batchTrackProblemTasks", { count: batchTrackProblemResults.length })
                            : t("customers.batchTrackAllTasks", { count: batchTrackResults.length }) }}</span>
                          <el-button
                            v-if="batchTrackProblemResults.length"
                            text
                            size="small"
                            type="danger"
                            @click="batchTrackProblemsOnly = !batchTrackProblemsOnly"
                          >{{ batchTrackProblemsOnly ? t("customers.showAllTasks") : t("customers.showProblemTasks") }}</el-button>
                        </div>
                        <div v-for="r in visibleBatchTrackResults" :key="`${r.number}-${r.index}`" class="batch-track-result-row" :class="r.status">
                          <span class="batch-track-result-meta">
                            <span class="batch-track-result-index">{{ r.index }}</span>
                            <b>{{ r.number }}</b>
                            <el-tag v-if="r.carrier" size="small" effect="plain" type="info">{{ r.carrier }}</el-tag>
                            <el-tag v-if="r.errorCode" size="small" effect="plain" type="danger">{{ r.errorCode }}</el-tag>
                            <el-tag v-if="!r.manualOnly" size="small" effect="light" :type="batchStageTagType(batchMainStageStatus(r))">
                              {{ t("customers.mainQueryStage") }} · {{ batchStageStatusLabel(batchMainStageStatus(r)) }}
                            </el-tag>
                            <el-tag v-if="r.attempts" size="small" effect="plain">{{ t("customers.mainAttempts", { count: r.attempts }) }}</el-tag>
                            <el-tag v-if="r.proxyAttempts" size="small" effect="plain" type="warning">{{ t("customers.proxyAttempts", { count: r.proxyAttempts }) }}</el-tag>
                            <el-tag v-if="r.startedAt" size="small" effect="plain" type="info" class="batch-track-timer">
                              {{ t("customers.itemElapsed", { time: batchTrackElapsedText(r) }) }}
                            </el-tag>
                          </span>
                          <small>{{ r.message }}</small>
                          <div v-if="r.subtasks.length" class="batch-track-subtask-list">
                            <span
                              v-for="subtask in r.subtasks"
                              :key="`${r.index}-${subtask.type}`"
                              class="batch-track-subtask"
                              :class="String(subtask.status || 'PENDING').toLowerCase()"
                            >
                              <i aria-hidden="true"></i>
                              <b>{{ t("customers.childQueryStage") }} · {{ batchSubtaskLabel(subtask.type) }}</b>
                              <em>{{ batchStageStatusLabel(subtask.status) }}</em>
                              <small v-if="subtask.error">{{ subtask.error }}</small>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <p class="batch-track-close-hint">{{ t("customers.batchTrackCloseHint") }}</p>
                    <div class="batch-track-actions">
                      <button
                        class="customer-access-primary"
                        type="button"
                        :disabled="batchTrackRunning || !batchTrackSelectedSheet || !batchTrackNumbers.length"
                        @click="startBatchTrack"
                      >
                        {{ batchTrackRunning ? t("customers.batchTrackRunning") : t("customers.batchTrackStart") }}
                      </button>
                      <el-button native-type="button" @click="batchTrackDialogOpen = false">
                        {{ t("customers.close") }}
                      </el-button>
                      <el-button
                        v-if="batchTrackRunning"
                        type="danger"
                        :disabled="batchTrackCancelRequested || batchTrackProgress.status === 'STOPPING'"
                        @click="cancelBatchTrack"
                      >
                        {{ t("customers.batchTrackStop") }}
                      </el-button>
                    </div>
                  </div>
                </div>
              </el-dialog>
            </div>
          </template>
          <!-- Detail view -->
          <template v-else>
            <button class="back-button" @click="subView = 'list'; selectedShipmentId = ''; detailShipmentSnapshot = null">{{ t("customers.backToList") }}</button>

            <el-card v-loading="loadingShipmentDetail" :element-loading-text="t('customers.loadingShipmentDetail')" class="main-card shipment-detail-card" shadow="never">
              <template #header>
                <div class="main-card-header">
                  <div>
                    <span class="main-card-eyebrow">{{ t("customers.editShipment") }}</span>
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
                <div class="section-label">{{ t("customers.editShipment") }}</div>
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
                    <el-input v-model="detailForm.note" type="textarea" :rows="2" maxlength="2000" show-word-limit />
                  </el-form-item>

                  <div class="shipment-detail-actions">
                    <el-button @click="openTrackingWorkspace(selectedShipment)">
                      {{ t("customers.openLiveTracking") }}
                    </el-button>
                    <el-button @click="invalidateSnapshot" :disabled="savingShipment">
                      {{ t("customers.invalidateSnapshot") }}
                    </el-button>
                    <el-button type="primary" @click="saveManualSnapshot" :disabled="savingShipment" :title="t('customers.manualSaveHint')">
                      {{ t("customers.saveManualSnapshot") }}
                    </el-button>
                    <el-button type="primary" native-type="submit" :disabled="savingShipment" :title="t('customers.shipmentSaveHint')">
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
          <label>
            <span>{{ t("customers.clientCode") }} <i class="required-star">*</i></span>
            <input v-model.trim="createForm.userCode" :placeholder="t('customers.clientCodePlaceholder')" required />
            <small class="customer-code-unique-hint">{{ t("customers.customerCodeUniqueHint") }}</small>
          </label>
          <label>
            <span>{{ t("customers.createPartyRole") }} <i class="required-star">*</i></span>
            <el-select v-model="createForm.partyRole" class="business-select" popper-class="business-select-popper">
              <el-option value="OVERSEA_AGENT" :label="t('customers.roleOverseaAgent')" />
              <el-option value="SHIPPER" :label="t('customers.roleShipper')" />
              <el-option value="CONSIGNEE" :label="t('customers.roleConsignee')" />
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
        <div
          v-else
          v-loading="customerFileParsing"
          :element-loading-text="t('app.loadingPage')"
          class="customer-excel-dropzone"
          :class="{ 'has-file': batchFileName, 'is-dragover': batchDropzoneActive }"
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

    <div v-if="transferDialogOpen" class="customer-code-overlay" role="presentation" @click.self="closeCustomerTransfer">
      <section class="customer-code-dialog customer-transfer-dialog" role="dialog" aria-modal="true" :aria-label="t('customers.transferTitle')">
        <span class="customer-code-kicker">CUSTOMER HANDOVER</span>
        <h2>{{ t("customers.transferTitle") }}</h2>
        <p>{{ t("customers.transferDescription", { count: selectedCustomerRows.length }) }}</p>
        <form class="customer-dialog-form" @submit.prevent="submitCustomerTransfer">
          <label>
            <span>{{ t("customers.targetAgent") }} <i class="required-star">*</i></span>
            <el-select
              v-model="transferForm.targetAgentId"
              class="business-select"
              :placeholder="t('customers.targetAgentPlaceholder')"
              :loading="loadingTransferAgents"
              filterable
            >
              <el-option
                v-for="agent in transferAgents"
                :key="agent.id"
                :value="agent.id"
                :label="`${agent.displayName} (@${agent.username})`"
              />
            </el-select>
          </label>
          <small class="customer-transfer-hint">{{ t("customers.transferPermissionHint") }}</small>
          <div class="customer-dialog-actions">
            <button type="button" @click="closeCustomerTransfer">{{ t("customers.cancel") }}</button>
            <button
              class="customer-access-primary"
              type="submit"
              :disabled="transferringCustomers || !transferForm.targetAgentId"
            >
              {{ transferringCustomers ? t("customers.transferring") : t("customers.confirmTransfer") }}
            </button>
          </div>
        </form>
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
          <button type="button" :disabled="exportingCredentials" @click="downloadCredentialWorkbook">
            {{ exportingCredentials ? t("customers.preparingExport") : t("customers.exportCredentials") }}
          </button>
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

    <div
      v-if="shipmentCreateDialogOpen"
      class="customer-code-overlay"
      role="presentation"
      @keydown.esc.stop.prevent
    >
      <section class="customer-code-dialog customer-create-dialog manual-shipment-dialog" role="dialog" aria-modal="true" :aria-label="t('customers.createShipment')">
        <span class="customer-code-kicker">{{ t("customers.dialogKickerNewShipment") }}</span>
        <h2>{{ t("customers.createShipment") }}</h2>
        <p>{{ t("customers.createShipmentDescription") }}</p>
        <form class="customer-dialog-form manual-shipment-form" @submit.prevent="createShipment">
          <p class="manual-required-hint">{{ t("customers.manualRequiredHint") }}</p>

          <section class="manual-entry-section">
            <header class="manual-entry-section-head">
              <span><b>01</b><strong>{{ t("customers.manualSectionBasic") }}</strong></span>
              <small>{{ t("customers.manualRequiredSection") }}</small>
            </header>
            <div class="manual-entry-grid">
              <label>
                <span>{{ t("customers.carrier") }} <i class="required-star">*</i></span>
                <el-select v-model="shipmentCreateForm.carrier" class="business-select" popper-class="business-select-popper">
                  <el-option value="COSCO" :label="t('customers.carrierCOSCO')" />
                  <el-option value="CMA" :label="t('customers.carrierCMA')" />
                </el-select>
              </label>
              <label>
                <span>{{ t("customers.referenceType") }} <i class="required-star">*</i></span>
                <el-select v-model="shipmentCreateForm.referenceType" class="business-select" popper-class="business-select-popper">
                  <el-option value="BOOKING" :label="t('customers.referenceBooking')" />
                  <el-option value="BILLOFLADING" :label="t('customers.referenceBill')" />
                </el-select>
              </label>
              <label>
                <span>{{ t("customers.referenceNo") }} <i class="required-star">*</i></span>
                <input v-model.trim="shipmentCreateForm.referenceNo" maxlength="160" required />
              </label>
              <label>
                <span>{{ t("customers.latestEventName") }} <i class="required-star">*</i></span>
                <input v-model.trim="shipmentCreateForm.latestEventName" maxlength="160" required />
              </label>
              <label>
                <span>{{ t("customers.latestEventLocation") }}</span>
                <input v-model.trim="shipmentCreateForm.latestEventLocation" maxlength="160" />
              </label>
              <label>
                <span>{{ t("customers.latestEventTime") }}</span>
                <input v-model="shipmentCreateForm.latestEventTime" type="datetime-local" />
              </label>
              <label>
                <span>{{ t("customers.estimatedDeparture") }} <i class="required-star">*</i></span>
                <input v-model="shipmentCreateForm.estimatedDeparture" type="datetime-local" required />
              </label>
              <label>
                <span>{{ t("customers.estimatedArrival") }} <i class="required-star">*</i></span>
                <input v-model="shipmentCreateForm.estimatedArrival" type="datetime-local" required />
              </label>
              <label>
                <span>{{ t("customers.estimatedDelivery") }}</span>
                <input v-model="shipmentCreateForm.estimatedDelivery" type="datetime-local" />
              </label>
              <label>
                <span>{{ t("customers.actualDeparture") }}</span>
                <input v-model="shipmentCreateForm.actualDeparture" type="datetime-local" />
              </label>
              <label>
                <span>{{ t("customers.actualArrival") }}</span>
                <input v-model="shipmentCreateForm.actualArrival" type="datetime-local" />
              </label>
              <label>
                <span>{{ t("customers.actualDelivery") }}</span>
                <input v-model="shipmentCreateForm.actualDelivery" type="datetime-local" />
              </label>
            </div>
          </section>

          <section class="manual-entry-section">
            <header class="manual-entry-section-head">
              <span><b>02</b><strong>{{ t("customers.manualSectionRoute") }}</strong></span>
              <small>{{ t("customers.manualRouteHint") }}</small>
            </header>
            <div class="manual-route-list">
              <article
                v-for="(node, index) in shipmentCreateForm.routeNodes"
                :key="node.key"
                class="manual-repeat-card manual-route-card"
              >
                <header>
                  <span>
                    <b>{{ manualRouteNodeLabel(node.locationType) }}</b>
                    <small>{{ node.locationType }}</small>
                  </span>
                  <button
                    v-if="node.optional"
                    type="button"
                    class="manual-remove-button"
                    @click="removeManualRouteNode(index)"
                  >{{ t("customers.removeItem") }}</button>
                </header>
                <div class="manual-entry-grid is-route">
                  <label>
                    <span>{{ t("customers.routeLocation") }} <i v-if="node.required" class="required-star">*</i></span>
                    <input v-model.trim="node.city" maxlength="160" :required="node.required" />
                  </label>
                  <label>
                    <span>{{ t("customers.countryCode") }}</span>
                    <input v-model.trim="node.countryCode" maxlength="2" placeholder="CN / US" />
                  </label>
                  <label>
                    <span>{{ t("customers.facilityTerminal") }}</span>
                    <input v-model.trim="node.facilityCode" maxlength="160" />
                  </label>
                  <label>
                    <span>{{ t("customers.routeEvent") }}</span>
                    <input v-model.trim="node.event" maxlength="160" />
                  </label>
                  <label>
                    <span>{{ t("customers.routeEstimatedTime") }}</span>
                    <input v-model="node.estimatedTime" type="datetime-local" />
                  </label>
                  <label>
                    <span>{{ t("customers.routeActualTime") }}</span>
                    <input v-model="node.actualTime" type="datetime-local" />
                  </label>
                </div>
              </article>
            </div>
            <button type="button" class="manual-add-button" @click="addManualTransshipment">
              + {{ t("customers.addTransshipment") }}
            </button>
          </section>

          <section class="manual-entry-section">
            <header class="manual-entry-section-head">
              <span><b>03</b><strong>{{ t("customers.manualSectionBooking") }}</strong></span>
              <small>{{ t("customers.manualOptionalSection") }}</small>
            </header>
            <div class="manual-entry-grid">
              <label><span>{{ t("customers.jobNumber") }}</span><input v-model.trim="shipmentCreateForm.forwarderJobNumber" maxlength="160" /></label>
              <label><span>{{ t("customers.clientNameCode") }}</span><input v-model.trim="shipmentCreateForm.clientNameCode" maxlength="160" /></label>
              <label><span>{{ t("customers.clientPoNumber") }}</span><input v-model.trim="shipmentCreateForm.clientPoNumber" maxlength="160" /></label>
              <label><span>{{ t("customers.bookingNumber") }}</span><input v-model.trim="shipmentCreateForm.bookingNumber" maxlength="160" /></label>
              <label><span>{{ t("customers.billOfLading") }}</span><input v-model.trim="shipmentCreateForm.billOfLading" maxlength="160" /></label>
              <label><span>{{ t("customers.vesselVoyage") }}</span><input v-model.trim="shipmentCreateForm.vesselVoyage" maxlength="240" /></label>
              <label><span>{{ t("customers.trafficTerm") }}</span><input v-model.trim="shipmentCreateForm.trafficTerm" maxlength="80" placeholder="CY | CY" /></label>
            </div>
            <div class="manual-service-field">
              <span>{{ t("customers.selectedServices") }}</span>
              <div>
                <label v-for="service in manualServiceOptions" :key="service.value" class="manual-service-choice">
                  <input v-model="shipmentCreateForm.serviceScopes" type="checkbox" :value="service.value" />
                  <span>{{ t(service.labelKey) }}</span>
                </label>
              </div>
            </div>
          </section>

          <section class="manual-entry-section">
            <header class="manual-entry-section-head">
              <span><b>04</b><strong>{{ t("customers.manualSectionContainerTypes") }}</strong></span>
              <small>{{ t("customers.manualContainerTypeHint") }}</small>
            </header>
            <div class="manual-compact-list">
              <article
                v-for="(item, index) in shipmentCreateForm.containerTypes"
                :key="item.key"
                class="manual-compact-row"
              >
                <label>
                  <span>{{ t("customers.containerType") }} <i v-if="index === 0" class="required-star">*</i></span>
                  <input v-model.trim="item.type" list="manual-container-type-options" maxlength="40" :required="index === 0" placeholder="40HQ" />
                </label>
                <label>
                  <span>{{ t("customers.containerQuantity") }} <i v-if="index === 0" class="required-star">*</i></span>
                  <input v-model.number="item.quantity" type="number" min="1" max="999" :required="index === 0" />
                </label>
                <button v-if="shipmentCreateForm.containerTypes.length > 1" type="button" class="manual-remove-button" @click="removeManualListItem('containerTypes', index)">
                  {{ t("customers.removeItem") }}
                </button>
              </article>
            </div>
            <datalist id="manual-container-type-options">
              <option value="20GP"></option>
              <option value="40GP"></option>
              <option value="40HQ"></option>
              <option value="45HQ"></option>
              <option value="20RF"></option>
              <option value="40RF"></option>
            </datalist>
            <button type="button" class="manual-add-button" @click="addManualContainerType">
              + {{ t("customers.addContainerType") }}
            </button>
          </section>

          <section class="manual-entry-section">
            <header class="manual-entry-section-head">
              <span><b>05</b><strong>{{ t("customers.manualSectionRouting") }}</strong></span>
              <small>{{ t("customers.manualRoutingHint") }}</small>
            </header>
            <div v-if="shipmentCreateForm.routingLegs.length" class="manual-repeat-list">
              <article v-for="(leg, index) in shipmentCreateForm.routingLegs" :key="leg.key" class="manual-repeat-card">
                <header>
                  <span><b>{{ t("customers.routingLegNumber", { number: index + 1 }) }}</b></span>
                  <button type="button" class="manual-remove-button" @click="removeManualListItem('routingLegs', index)">{{ t("customers.removeItem") }}</button>
                </header>
                <div class="manual-entry-grid">
                  <label>
                    <span>{{ t("customers.transportMode") }}</span>
                    <select v-model="leg.mode">
                      <option value="SEA">{{ t("customers.transportModeSea") }}</option>
                      <option value="TRUCK">{{ t("customers.transportModeTruck") }}</option>
                      <option value="RAIL">{{ t("customers.transportModeRail") }}</option>
                      <option value="BARGE">{{ t("customers.transportModeBarge") }}</option>
                    </select>
                  </label>
                  <label><span>{{ t("customers.vesselName") }}</span><input v-model.trim="leg.vesselName" maxlength="160" /></label>
                  <label><span>{{ t("customers.voyage") }}</span><input v-model.trim="leg.voyage" maxlength="120" /></label>
                  <label><span>{{ t("customers.serviceRoute") }}</span><input v-model.trim="leg.service" maxlength="120" /></label>
                  <label><span>{{ t("customers.routingLoadPort") }}</span><input v-model.trim="leg.loadPort" maxlength="160" /></label>
                  <label><span>{{ t("customers.routingDischargePort") }}</span><input v-model.trim="leg.dischargePort" maxlength="160" /></label>
                  <label><span>{{ t("customers.estimatedDeparture") }}</span><input v-model="leg.estimatedDeparture" type="datetime-local" /></label>
                  <label><span>{{ t("customers.actualDeparture") }}</span><input v-model="leg.actualDeparture" type="datetime-local" /></label>
                  <label><span>{{ t("customers.estimatedArrival") }}</span><input v-model="leg.estimatedArrival" type="datetime-local" /></label>
                  <label><span>{{ t("customers.actualArrival") }}</span><input v-model="leg.actualArrival" type="datetime-local" /></label>
                </div>
              </article>
            </div>
            <p v-else class="manual-empty-copy">{{ t("customers.manualRoutingEmpty") }}</p>
            <button type="button" class="manual-add-button" @click="addManualRoutingLeg">
              + {{ t("customers.addRoutingLeg") }}
            </button>
          </section>

          <section class="manual-entry-section">
            <header class="manual-entry-section-head">
              <span><b>06</b><strong>{{ t("customers.manualSectionContainers") }}</strong></span>
              <small>{{ t("customers.manualContainerHint") }}</small>
            </header>
            <div v-if="shipmentCreateForm.containers.length" class="manual-repeat-list">
              <article v-for="(container, index) in shipmentCreateForm.containers" :key="container.key" class="manual-repeat-card">
                <header>
                  <span><b>{{ t("customers.containerNumberIndex", { number: index + 1 }) }}</b></span>
                  <button type="button" class="manual-remove-button" @click="removeManualListItem('containers', index)">{{ t("customers.removeItem") }}</button>
                </header>
                <div class="manual-entry-grid">
                  <label><span>{{ t("customers.containerNumber") }}</span><input v-model.trim="container.number" maxlength="40" /></label>
                  <label><span>{{ t("customers.containerType") }}</span><input v-model.trim="container.type" list="manual-container-type-options" maxlength="40" /></label>
                  <label><span>{{ t("customers.transportMode") }}</span><input v-model.trim="container.transportMode" maxlength="40" /></label>
                  <label><span>{{ t("customers.trafficTerm") }}</span><input v-model.trim="container.trafficTerm" maxlength="80" /></label>
                  <label><span>{{ t("customers.currentLocation") }}</span><input v-model.trim="container.currentLocation" maxlength="160" /></label>
                  <label><span>{{ t("customers.latestEventName") }}</span><input v-model.trim="container.latestEvent" maxlength="160" /></label>
                  <label><span>{{ t("customers.latestEventTime") }}</span><input v-model="container.latestEventTime" type="datetime-local" /></label>
                </div>
              </article>
            </div>
            <p v-else class="manual-empty-copy">{{ t("customers.manualContainerEmpty") }}</p>
            <button type="button" class="manual-add-button" @click="addManualContainer">
              + {{ t("customers.addContainer") }}
            </button>
          </section>

          <label class="manual-shipment-note"><span>{{ t("customers.shipmentNote") }}</span><textarea v-model="shipmentCreateForm.note" maxlength="2000"></textarea></label>
          <div class="customer-dialog-actions">
            <button type="button" @click="closeShipmentCreateDialog">{{ t("customers.cancel") }}</button>
            <button class="customer-access-primary" type="submit" :disabled="creatingShipment">{{ creatingShipment ? t("customers.savingShipment") : t("customers.createShipment") }}</button>
          </div>
        </form>
      </section>
    </div>

    <div v-if="toastMessage" class="customer-toast" role="status">{{ toastMessage }}</div>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import CustomerRelationshipPanel from "./CustomerRelationshipPanel.vue";
import LanguageSwitcher from "./LanguageSwitcher.vue";
import { currentLocale } from "../i18n";
import {
  batchUpdateBusinessShipmentFields,
  batchBindBusinessCustomerShipments,
  batchDeleteBusinessShipments,
  bindBusinessCustomerShipment,
  batchCreateBusinessCustomers,
  cancelShipmentBatchTask,
  createBusinessCustomer,
  createBusinessShipment,
  createShipmentBatchRefreshTask,
  createShipmentBatchTask,
  createShipmentRefreshAllTask,
  deleteBusinessCustomer,
  deleteBusinessShipment,
  fetchAvailableBusinessShipments,
  fetchBusinessCustomers,
  fetchBusinessCustomerShipments,
  fetchBusinessShipmentSnapshot,
  fetchCustomerTransferAgents,
  fetchOverseaAgentLinkedCustomers,
  fetchShipmentBatchTask,
  invalidateBusinessShipmentSnapshot,
  resetBusinessCustomerPassword,
  setBusinessShipmentPublication,
  transferBusinessCustomers,
  unbindBusinessCustomerShipment,
  updateBusinessCustomer,
  updateOverseaAgentLinkedCustomers,
  updateBusinessShipment,
  updateBusinessShipmentManualSnapshot
} from "../services/businessCustomerApi";
import { buildShipmentBatchItems, parseShipmentBatchWorkbook } from "../services/shipmentBatchImport";
import { storedToken } from "../services/authSession";
import { markApiErrorHandled } from "../services/apiClient";
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
let xlsxModulePromise;

function loadXlsxModule() {
  if (!xlsxModulePromise) xlsxModulePromise = import("xlsx");
  return xlsxModulePromise;
}

function waitForNextPaint() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

const customers = ref([]);
const customerTableRef = ref(null);
const selectedCustomerRows = ref([]);
const selectedCustomerId = ref("");
const shipments = ref([]);
const availableShipments = ref([]);
const loadingCustomers = ref(false);
const loadingAvailableShipments = ref(false);
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
const customerFileParsing = ref(false);
const importingCustomers = ref(false);
const batchCredentialRows = ref([]);
const exportingCredentials = ref(false);
const transferDialogOpen = ref(false);
const transferAgents = ref([]);
const loadingTransferAgents = ref(false);
const transferringCustomers = ref(false);
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
const batchTrackDropzoneActive = ref(false);
const batchTrackFileParsing = ref(false);
const batchTrackText = ref("");
const batchTrackCarrier = ref("COSCO");
const batchTrackType = ref("BILLOFLADING");
const batchTrackRunning = ref(false);
const batchTrackResults = ref([]);
const batchTrackProgress = ref({ total: 0, done: 0, succeeded: 0, partial: 0, manual: 0, failed: 0, pending: 0, status: "" });
const batchTrackFileInput = ref(null);
const batchTrackFileName = ref("");
const batchTrackSheets = ref([]);
const batchTrackSelectedSheetName = ref("");
const batchTrackSelectedColumnIndex = ref(null);
const batchTrackTaskId = ref("");
const batchTrackMode = ref("IMPORT");
const batchTrackCancelRequested = ref(false);
const batchTrackProblemsOnly = ref(false);
const batchTrackClock = ref(Date.now());
const batchTrackAbortController = ref(null);
const refreshTrackingStatus = ref("");
const refreshTrackingResponse = ref(null);
const toastMessage = ref("");
const loadingShipments = ref(false);
const linkedCustomerIds = ref([]);
const loadingLinkedCustomers = ref(false);
const savingLinkedCustomers = ref(false);
const creating = ref(false);
const mutatingCustomer = ref(false);
const bindingShipment = ref(false);
const selectedCandidateShipmentIds = ref([]);
const selectedShipmentRows = ref([]);
const shipmentTableRef = ref(null);
const batchDeletingShipments = ref(false);
const batchBusinessFieldsDialogOpen = ref(false);
const batchBusinessFieldRows = ref([]);
const batchSavingBusinessFields = ref(false);
const shipmentCustomerFilter = ref("");
const refreshIssuesOnly = ref(false);
const shipmentPage = ref(1);
const shipmentPageSize = ref(20);
const shipmentTotal = ref(0);
const shipmentRefreshIssueTotal = ref(0);
const shipmentTrackingChannel = ref("AUTO");
const unbindingShipmentId = ref("");
const publishingShipmentId = ref("");
const publishingAllShipments = ref(false);
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
const transferForm = reactive({ targetAgentId: null });
const bindForm = reactive({ shipmentId: "", carrier: "COSCO", referenceType: "BOOKING", referenceNo: "" });
let manualEntryKeySeed = 0;
const manualServiceOptions = [
  { value: "OCEAN", labelKey: "customers.serviceOcean" },
  { value: "INLAND", labelKey: "customers.serviceInland" },
  { value: "CUSTOMS", labelKey: "customers.serviceCustoms" },
  { value: "WAREHOUSE", labelKey: "customers.serviceWarehouse" }
];
const shipmentCreateForm = reactive({
  carrier: "COSCO",
  referenceType: "BOOKING",
  referenceNo: "",
  trackingStatus: "",
  note: "",
  ...emptyManualShipmentFields(),
  ...emptyDetailedManualShipmentFields()
});
const detailForm = reactive({ referenceType: "BOOKING", referenceNo: "", trackingStatus: "", note: "", ...emptyManualShipmentFields() });
let shipmentRequestSequence = 0;
let shipmentListRequestSequence = 0;
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
const batchTrackProblemResults = computed(() =>
  batchTrackResults.value.filter((item) => ["failed", "partial"].includes(item.status))
);
const visibleBatchTrackResults = computed(() =>
  batchTrackProblemsOnly.value ? batchTrackProblemResults.value : batchTrackResults.value
);
const batchTrackNumbers = computed(() => batchTrackItems.value.map((item) => item.displayNumber));
const batchTrackTrackableCount = computed(() => batchTrackItems.value.filter((item) => !item.manualOnly).length);
const batchTrackManualCount = computed(() => batchTrackItems.value.filter((item) => item.manualOnly).length);
const batchTrackPreviewRows = computed(() => batchTrackSelectedSheet.value?.rows?.slice(1, 9) || []);
const batchTrackDialogTitle = computed(() => batchTrackMode.value.startsWith("REFRESH")
  ? t("customers.batchRefreshTitle")
  : t("customers.batchTrack"));
const batchTrackToolbarLabel = computed(() => batchTrackRunning.value
  ? t(batchTrackMode.value.startsWith("REFRESH")
      ? "customers.batchRefreshToolbarProgress"
      : "customers.batchTrackToolbarProgress", {
      done: batchTrackProgress.value.done,
      total: batchTrackProgress.value.total
    })
  : t("customers.batchTrack"));
const BATCH_TRACK_TASK_KEY = "business-shipment-batch-task-id";
const BATCH_TRACK_TERMINAL = new Set(["COMPLETED", "STOPPED", "FAILED", "PAUSED"]);
let batchTrackPollTimer = 0;
let batchTrackClockTimer = 0;

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
const draftShipments = computed(() =>
  shipments.value.filter((item) => item.publicationStatus !== "PUBLISHED")
);

const filteredCustomers = computed(() => {
  const query = customerSearch.value.toLowerCase().trim();
  if (!query) return customers.value;
  return customers.value.filter((c) =>
    (c.username || "").toLowerCase().includes(query) ||
    (c.displayName || "").toLowerCase().includes(query) ||
    (c.clientCode || "").toLowerCase().includes(query) ||
    (c.responsibleAgentDisplayName || "").toLowerCase().includes(query)
  );
});

const linkableCustomers = computed(() => customers.value.filter((customer) =>
  customer.id !== selectedCustomerId.value
  && customer.status === "ACTIVE"
  && ["SHIPPER", "CONSIGNEE"].includes(customer.partyRole)
));

const shipmentFilterCustomers = computed(() =>
  customers.value.filter((customer) => Number(customer.shipmentCount || 0) > 0).sort((left, right) =>
    customerFilterOptionLabel(left).localeCompare(customerFilterOptionLabel(right))
  )
);

const refreshIssueCount = computed(() => shipmentRefreshIssueTotal.value);

const displayedAvailableShipments = computed(() => availableShipments.value);

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

function hasRefreshIssue(shipment) {
  return ["FAILED", "PARTIAL"].includes(String(shipment?.lastRefreshResult || "").toUpperCase());
}

function refreshOutcomeTooltip(shipment) {
  const parts = [
    shipment?.lastRefreshErrorCode,
    shipment?.lastRefreshError,
    shipment?.lastRefreshAttempts
      ? t("customers.mainAttempts", { count: shipment.lastRefreshAttempts })
      : "",
    shipment?.lastRefreshProxyAttempts
      ? t("customers.proxyAttempts", { count: shipment.lastRefreshProxyAttempts })
      : "",
    shipment?.lastRefreshAt ? formatDateTime(shipment.lastRefreshAt) : ""
  ].filter(Boolean);
  return parts.join(" · ");
}

function batchSubtaskLabel(type) {
  return String(type || "").toUpperCase() === "BOOKING_REFERENCE"
    ? t("customers.bookingReferenceStage")
    : t("customers.transportDetailsStage");
}

function batchStageStatusLabel(status) {
  const key = String(status || "PENDING").toUpperCase();
  if (key === "RUNNING" || key === "RETRY_WAIT") return t("customers.stageRunning");
  if (key === "SUCCEEDED") return t("customers.stageSucceeded");
  if (key === "FAILED") return t("customers.stageFailed");
  return t("customers.stagePending");
}

function batchStageTagType(status) {
  const key = String(status || "PENDING").toUpperCase();
  if (key === "SUCCEEDED") return "success";
  if (key === "FAILED") return "danger";
  if (key === "RUNNING" || key === "RETRY_WAIT") return "primary";
  return "info";
}

function batchMainStageStatus(result) {
  const status = String(result?.status || "PENDING").toUpperCase();
  const subtaskStatuses = (result?.subtasks || []).map((subtask) =>
    String(subtask.status || "PENDING").toUpperCase()
  );
  if (status === "FAILED") return "FAILED";
  if (["SUCCEEDED", "PARTIAL"].includes(status) || subtaskStatuses.some((value) => value !== "PENDING")) {
    return "SUCCEEDED";
  }
  if (Number(result?.attempts || 0) > 0 || ["RUNNING", "RETRY_WAIT"].includes(status)) {
    return "RUNNING";
  }
  return "PENDING";
}

function batchTrackElapsedText(result) {
  const startedAt = Date.parse(result?.startedAt || "");
  const finishedAt = Date.parse(result?.finishedAt || "");
  let elapsedMs = Number(result?.elapsedMs || 0);
  if (!Number.isFinite(finishedAt)) {
    const observedAt = Number(result?.elapsedObservedAt || batchTrackClock.value);
    elapsedMs += Math.max(0, batchTrackClock.value - observedAt);
  }
  if (elapsedMs <= 0 && Number.isFinite(startedAt)) {
    const end = Number.isFinite(finishedAt) ? finishedAt : batchTrackClock.value;
    elapsedMs = Math.max(0, end - startedAt);
  }
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const padded = (value) => String(value).padStart(2, "0");
  return hours > 0
    ? `${padded(hours)}:${padded(minutes)}:${padded(seconds)}`
    : `${padded(minutes)}:${padded(seconds)}`;
}

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
  selectedCandidateShipmentIds.value = [];
  editForm.username = customer?.username || "";
  editForm.displayName = customer?.displayName || "";
  editForm.clientCode = customer?.clientCode || "";
  editForm.partyRole = customer?.partyRole || "SHIPPER";
}, { immediate: true });

watch(unboundAvailableShipments, (items) => {
  const availableIds = new Set(items.map((item) => item.shipmentId));
  selectedCandidateShipmentIds.value = selectedCandidateShipmentIds.value
    .filter((shipmentId) => availableIds.has(shipmentId));
});

watch(availableShipments, (list) => {
  if (!list || !selectedShipmentId.value) return;
  const stillExists = list.some((s) => s.shipmentId === selectedShipmentId.value);
  if (!stillExists) {
    selectedShipmentId.value = "";
    selectedCustomerIds.value = [];
  }
});

watch(shipmentFilterCustomers, (items) => {
  if (!shipmentCustomerFilter.value) return;
  if (!items.some((item) => item.id === shipmentCustomerFilter.value)) {
    shipmentCustomerFilter.value = "";
  }
});

watch([shipmentCustomerFilter, refreshIssuesOnly], () => {
  shipmentPage.value = 1;
  void loadAvailableShipments();
});

watch(displayedAvailableShipments, (items) => {
  const visibleIds = new Set(items.map((item) => item.shipmentId));
  selectedShipmentRows.value = selectedShipmentRows.value
    .filter((item) => visibleIds.has(item.shipmentId));
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
  batchTrackClockTimer = window.setInterval(() => {
    batchTrackClock.value = Date.now();
  }, 1000);
  const requestedCustomer = new URLSearchParams(window.location.search).get("customer") || "";
  void loadCustomers(requestedCustomer);
  void loadAvailableShipments();
  void restoreBatchTrackTask();
});
onUnmounted(() => {
  window.clearTimeout(toastTimer);
  window.clearTimeout(batchTrackPollTimer);
  window.clearInterval(batchTrackClockTimer);
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

function buildShipmentCustomerMap() {
  const map = {};
  for (const shipment of availableShipments.value) {
    const shipmentId = shipment?.shipmentId;
    if (!shipmentId) continue;
    const boundCustomers = Array.isArray(shipment.boundCustomers) ? shipment.boundCustomers : [];
    for (const customer of boundCustomers) {
      const customerId = typeof customer === "string" ? customer : customer?.id;
      if (!customerId) continue;
      if (!map[shipmentId]) map[shipmentId] = [];
      if (!map[shipmentId].includes(customerId)) {
        map[shipmentId].push(customerId);
      }
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
    loadingCustomers.value = false;
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

function handleCustomerSelectionChange(rows) {
  selectedCustomerRows.value = Array.isArray(rows) ? rows : [];
}

function isTransferableCustomer(customer) {
  return customer?.status === "ACTIVE" && ["SHIPPER", "CONSIGNEE"].includes(customer?.partyRole);
}

async function openCustomerTransfer() {
  if (!selectedCustomerRows.value.length || loadingTransferAgents.value) return;
  transferDialogOpen.value = true;
  transferForm.targetAgentId = null;
  loadingTransferAgents.value = true;
  try {
    const response = await fetchCustomerTransferAgents();
    transferAgents.value = Array.isArray(response?.items) ? response.items : [];
  } catch (error) {
    transferDialogOpen.value = false;
    showError(error, "customers.loadTransferAgentsFailed");
  } finally {
    loadingTransferAgents.value = false;
  }
}

function closeCustomerTransfer() {
  if (transferringCustomers.value) return;
  transferDialogOpen.value = false;
  transferForm.targetAgentId = null;
}

async function submitCustomerTransfer() {
  if (!selectedCustomerRows.value.length || !transferForm.targetAgentId || transferringCustomers.value) return;
  transferringCustomers.value = true;
  try {
    const response = await transferBusinessCustomers({
      customerIds: selectedCustomerRows.value.map((customer) => customer.id),
      targetAgentId: transferForm.targetAgentId
    });
    transferDialogOpen.value = false;
    transferForm.targetAgentId = null;
    selectedCustomerRows.value = [];
    customerTableRef.value?.clearSelection?.();
    await Promise.all([loadCustomers(), loadAvailableShipments()]);
    showSuccess("customers.transferSuccess", {
      count: response?.transferred || 0,
      agent: response?.targetAgentName || "-",
      shipments: response?.relatedShipments || 0
    });
  } catch (error) {
    showError(error, "customers.transferFailed");
  } finally {
    transferringCustomers.value = false;
  }
}

function normalizeBusinessShipment(payload) {
  if (!payload || typeof payload !== "object") return null;
  const envelope = payload.item && typeof payload.item === "object" ? payload.item : payload;
  const shipment = envelope.shipment && typeof envelope.shipment === "object"
    ? envelope.shipment
    : envelope;
  const rawSnapshot = envelope.snapshot ?? shipment.snapshot ?? envelope.snapshotJson ?? shipment.snapshotJson;
  let snapshot = rawSnapshot;
  if (typeof rawSnapshot === "string") {
    try {
      snapshot = JSON.parse(rawSnapshot);
    } catch (_error) {
      snapshot = null;
    }
  }
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) snapshot = null;

  const normalized = {
    ...shipment,
    ...(envelope.shipment ? envelope : {}),
    snapshot,
    dataAvailable: envelope.dataAvailable ?? shipment.dataAvailable ?? Boolean(snapshot)
  };
  delete normalized.shipment;

  if (!snapshot) return normalized;
  const summary = snapshot.summary || {};
  const keyTimes = snapshot.keyTimes || {};
  const references = snapshot.references || {};
  const business = references.business || {};
  const firstContainer = Array.isArray(snapshot.containers) ? snapshot.containers[0] : null;
  const firstLeg = Array.isArray(snapshot.routingLegs) ? snapshot.routingLegs[0] : null;
  const vesselVoyage = [firstLeg?.vessel, firstLeg?.voyage].filter(Boolean).join(" / ");
  const details = {
    bookingNumber: (Array.isArray(references.bookingNumbers) ? references.bookingNumbers[0] : null)
      || (Array.isArray(summary.bookingNumbers) ? summary.bookingNumbers[0] : null)
      || references.booking,
    forwarderJobNumber: business.forwarderJobNumber,
    clientPoNumber: business.clientPoNumber,
    clientNameCode: business.clientNameCode,
    portOfLoading: summary.origin?.name,
    portOfDischarge: summary.destination?.name,
    vesselVoyage: summary.vesselVoyage || vesselVoyage,
    volume: summary.volume,
    estimatedDeparture: keyTimes.estimatedDeparture?.time,
    estimatedArrival: keyTimes.estimatedFinalArrival?.time || keyTimes.estimatedArrival?.time,
    actualDeparture: keyTimes.actualDeparture?.time,
    actualArrival: keyTimes.actualArrival?.time,
    actualDelivery: keyTimes.actualDelivery?.time,
    currentLocation: summary.latestEvent?.location,
    containerNumber: firstContainer?.number,
    containerType: firstContainer?.type
  };
  for (const [key, value] of Object.entries(details)) {
    if ((normalized[key] === null || normalized[key] === undefined || normalized[key] === "") && value) {
      normalized[key] = value;
    }
  }
  return normalized;
}

function deduplicateBusinessShipments(items) {
  const unique = new Map();
  for (const item of items) {
    if (!item) continue;
    const shipmentId = String(item.shipmentId || "").trim();
    const fallbackKey = [item.carrier, item.referenceType, item.referenceNo]
      .map((value) => String(value || "").trim().toUpperCase())
      .join("|");
    const key = shipmentId ? `shipment:${shipmentId}` : `reference:${fallbackKey}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

async function loadAvailableShipments() {
  const requestSequence = ++shipmentListRequestSequence;
  loadingAvailableShipments.value = true;
  try {
    const response = await fetchAvailableBusinessShipments({
      page: shipmentPage.value,
      pageSize: shipmentPageSize.value,
      customerId: shipmentCustomerFilter.value,
      refreshIssuesOnly: refreshIssuesOnly.value
    });
    if (requestSequence !== shipmentListRequestSequence) return;
    availableShipments.value = Array.isArray(response?.items)
      ? response.items.map(normalizeBusinessShipment)
      : [];
    shipmentTotal.value = Number(response?.total || 0);
    shipmentRefreshIssueTotal.value = Number(response?.refreshIssueTotal || 0);
    shipmentPage.value = Number(response?.page || shipmentPage.value);
    shipmentPageSize.value = Number(response?.pageSize || shipmentPageSize.value);
    buildShipmentCustomerMap();
  } catch (error) {
    if (requestSequence === shipmentListRequestSequence) {
      showError(error, "customers.loadAvailableShipmentsFailed");
    }
  } finally {
    if (requestSequence === shipmentListRequestSequence) {
      loadingAvailableShipments.value = false;
    }
  }
}

function changeShipmentPage(page) {
  shipmentPage.value = page;
  selectedShipmentRows.value = [];
  void loadAvailableShipments();
}

function changeShipmentPageSize(pageSize) {
  shipmentPageSize.value = pageSize;
  shipmentPage.value = 1;
  selectedShipmentRows.value = [];
  void loadAvailableShipments();
}

function shipmentRowIndex(index) {
  return (shipmentPage.value - 1) * shipmentPageSize.value + index + 1;
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
    detailShipmentSnapshot.value = normalizeBusinessShipment(response?.item || response);
  } catch (error) {
    showError(error, "customers.loadShipmentDetailFailed");
    detailShipmentSnapshot.value = null;
  } finally {
    loadingShipmentDetail.value = false;
  }
}

async function startBatchTrack() {
  if (!batchTrackItems.value.length || batchTrackRunning.value) return;
  batchTrackMode.value = "IMPORT";
  batchTrackRunning.value = true;
  batchTrackCancelRequested.value = false;
  batchTrackProblemsOnly.value = false;
  batchTrackResults.value = batchTrackItems.value.map((item, index) => ({
    index: index + 1,
    number: item.displayNumber,
    carrier: item.carrier,
    status: "pending",
    message: t("customers.trackPending"),
    failedSubtasks: []
  }));
  try {
    const task = await createShipmentBatchTask({
      sourceFileName: batchTrackFileName.value,
      channel: shipmentTrackingChannel.value,
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
    batchTrackResults.value = [{
      index: 1,
      number: "-",
      status: "failed",
      message: error?.message || t("customers.batchTrackStartFailed"),
      errorCode: error?.code || "",
      failedSubtasks: []
    }];
  }
}

function prepareShipmentRefreshTask(mode) {
  batchTrackDialogOpen.value = true;
  batchTrackRunning.value = true;
  batchTrackCancelRequested.value = false;
  batchTrackTaskId.value = "";
  batchTrackMode.value = mode;
  batchTrackProblemsOnly.value = false;
  batchTrackResults.value = [];
  batchTrackProgress.value = {
    total: 0,
    done: 0,
    succeeded: 0,
    partial: 0,
    manual: 0,
    failed: 0,
    pending: 0,
    status: "QUEUED"
  };
}

async function startShipmentRefreshTask(
  createTask,
  failureMessageKey,
  emptyMessageKey = "",
  mode = "REFRESH_ALL"
) {
  if (batchTrackRunning.value || refreshingShipment.value) return;
  prepareShipmentRefreshTask(mode);
  try {
    const task = await createTask();
    if (!task?.taskId) {
      batchTrackRunning.value = false;
      batchTrackProgress.value = {
        total: 0,
        done: 0,
        succeeded: 0,
        manual: 0,
        failed: 0,
        pending: 0,
        status: "COMPLETED"
      };
      if (emptyMessageKey) showSuccess(emptyMessageKey);
      return null;
    }
    rememberBatchTrackTask(task.taskId);
    applyBatchTrackTask(task);
    scheduleBatchTrackPoll(task.taskId, 800);
    return task;
  } catch (error) {
    batchTrackRunning.value = false;
    batchTrackResults.value = [{
      index: 1,
      number: "-",
      status: "failed",
      message: error?.message || t(failureMessageKey),
      errorCode: error?.code || "",
      failedSubtasks: []
    }];
    return null;
  }
}

async function startRefreshAllShipments() {
  await startShipmentRefreshTask(
    () => createShipmentRefreshAllTask(shipmentTrackingChannel.value),
    "customers.refreshAllFailed",
    "customers.refreshAllEmpty"
  );
}

async function startRefreshSelectedShipments() {
  const shipmentIds = [...new Set(
    selectedShipmentRows.value.map((row) => row?.shipmentId).filter(Boolean)
  )];
  if (!shipmentIds.length) return;
  const task = await startShipmentRefreshTask(
    () => createShipmentBatchRefreshTask(shipmentIds, shipmentTrackingChannel.value),
    "customers.batchRefreshFailed",
    "",
    "REFRESH_SELECTED"
  );
  if (task?.taskId) {
    selectedShipmentRows.value = [];
    shipmentTableRef.value?.clearSelection?.();
  }
}

async function cancelBatchTrack() {
  if (batchTrackCancelRequested.value || batchTrackProgress.value.status === "STOPPING") return;
  if (!window.confirm(t("customers.batchTrackStopConfirm"))) return;
  batchTrackCancelRequested.value = true;
  if (!batchTrackTaskId.value) return;
  try {
    applyBatchTrackTask(await cancelShipmentBatchTask(batchTrackTaskId.value));
    scheduleBatchTrackPoll(batchTrackTaskId.value, 500);
  } catch (error) {
    batchTrackCancelRequested.value = false;
    batchTrackResults.value.unshift({
      index: 0,
      number: "-",
      status: "failed",
      message: error?.message || t("customers.batchTrackCancelFailed"),
      errorCode: error?.code || "",
      failedSubtasks: []
    });
  }
}

async function handleBatchTrackWorkbook(event) {
  const file = event.target.files?.[0];
  batchTrackFileName.value = "";
  batchTrackSheets.value = [];
  batchTrackSelectedSheetName.value = "";
  batchTrackSelectedColumnIndex.value = null;
  batchTrackResults.value = [];
  batchTrackProblemsOnly.value = false;
  if (!file) return;
  batchTrackFileParsing.value = true;
  try {
    await waitForNextPaint();
    const XLSX = await loadXlsxModule();
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const sheets = parseShipmentBatchWorkbook(workbook, XLSX);
    if (!sheets.length) throw new Error(t("customers.noTrackNumbers"));
    const suggestedSheet = [...sheets].sort((a, b) => sheetRecommendationScore(b) - sheetRecommendationScore(a))[0];
    batchTrackSheets.value = sheets;
    batchTrackSelectedSheetName.value = suggestedSheet.name;
    batchTrackSelectedColumnIndex.value = suggestedSheet.suggestedColumnIndex;
    batchTrackFileName.value = file.name;
  } catch (error) {
    batchTrackResults.value = [{
      index: 1,
      number: "-",
      status: "failed",
      message: error?.message || t("customers.excelReadFailed"),
      errorCode: error?.code || "",
      failedSubtasks: []
    }];
  } finally {
    batchTrackFileParsing.value = false;
    event.target.value = "";
  }
}

function clearBatchTrackFile() {
  batchTrackFileName.value = "";
  batchTrackSheets.value = [];
  batchTrackSelectedSheetName.value = "";
  batchTrackSelectedColumnIndex.value = null;
  batchTrackResults.value = [];
  batchTrackProblemsOnly.value = false;
  if (batchTrackFileInput.value) batchTrackFileInput.value.value = "";
}

function clearBatchTrack() {
  batchTrackText.value = "";
  batchTrackResults.value = [];
  batchTrackProblemsOnly.value = false;
  batchTrackProgress.value = { total: 0, done: 0, succeeded: 0, partial: 0, manual: 0, failed: 0, pending: 0, status: "" };
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
  batchTrackMode.value = String(task.mode || "IMPORT").toUpperCase();
  if (["AUTO", "PROXY"].includes(String(task.channel || "").toUpperCase())) {
    shipmentTrackingChannel.value = String(task.channel).toUpperCase();
  }
  const status = String(task.status || "").toUpperCase();
  const taskObservedAt = Date.now();
  batchTrackProgress.value = {
    total: Number(task.total || 0),
    done: Number(task.processed || 0),
    succeeded: Number(task.succeeded || 0),
    partial: Number(task.partial || 0),
    manual: Number(task.manual || 0),
    failed: Number(task.failed || 0),
    pending: Number(task.pending || 0),
    status,
    stopReason: String(task.stopReason || "").toUpperCase(),
    stopMessage: task.stopMessage || "",
    circuitFailureCount: Number(task.circuitFailureCount || 0),
    circuitFailureThreshold: Number(task.circuitFailureThreshold || 0),
    circuitErrorCode: task.circuitErrorCode || "",
    nextAttemptAt: task.nextAttemptAt
      || task.cooldownUntil
      || (task.items || []).find((item) => String(item.status || "").toUpperCase() === "RETRY_WAIT")?.nextRetryAt
      || null
  };
  batchTrackResults.value = (task.items || []).map((item, index) => {
    const itemStatus = String(item.status || "PENDING").toUpperCase();
    const circuitStopped = String(task.stopReason || "").toUpperCase() === "CIRCUIT_BREAKER"
      && status === "PAUSED";
    const stopped = (status === "STOPPED" || circuitStopped)
      && ["PENDING", "RUNNING", "RETRY_WAIT"].includes(itemStatus);
    const subtasks = (item.subtasks || []).map((subtask) => ({
      ...subtask,
      status: String(subtask.status || "PENDING").toUpperCase()
    }));
    const failedSubtasks = subtasks.filter(
      (subtask) => String(subtask.status || "").toUpperCase() === "FAILED"
    );
    const subtaskErrorCodes = failedSubtasks
      .map((subtask) => subtask.errorCode)
      .filter(Boolean);
    return {
      index: index + 1,
      shipmentId: item.shipmentId,
      number: item.displayNumber || item.number,
      carrier: item.carrier,
      manualOnly: Boolean(item.manualOnly),
      status: stopped ? "stopped" : itemStatus.toLowerCase(),
      message: batchTrackItemMessage(item, status, task.stopReason),
      errorCode: item.errorCode || [...new Set(subtaskErrorCodes)].join(", "),
      attempts: Number(item.attempts || 0),
      proxyAttempts: Number(item.proxyAttempts || Math.max(
        0,
        ...failedSubtasks.map((subtask) => Number(subtask.proxyAttempts || 0))
      )),
      startedAt: item.startedAt || null,
      finishedAt: item.finishedAt || null,
      elapsedMs: Number(item.elapsedMs || 0),
      elapsedObservedAt: taskObservedAt,
      subtasks,
      failedSubtasks
    };
  });
  batchTrackRunning.value = !BATCH_TRACK_TERMINAL.has(status);
  if (!batchTrackRunning.value) {
    batchTrackProblemsOnly.value = batchTrackProblemResults.value.length > 0;
    batchTrackCancelRequested.value = false;
    forgetBatchTrackTask();
    window.clearTimeout(batchTrackPollTimer);
    void loadAvailableShipments();
  }
}

function batchTrackItemMessage(item, taskStatus = "", stopReason = "") {
  const status = String(item.status || "PENDING").toUpperCase();
  if (status === "RETRY_WAIT") return t("customers.batchTrackRetryItem");
  if (item.error) return item.error;
  if (String(stopReason || "").toUpperCase() === "CIRCUIT_BREAKER"
      && taskStatus === "PAUSED"
      && ["PENDING", "RUNNING"].includes(status)) {
    return t("customers.batchTrackCircuitSkipped");
  }
  if (taskStatus === "STOPPED" && ["PENDING", "RUNNING"].includes(status)) return t("customers.trackStopped");
  if (status === "SUCCEEDED" && item.source === "AUTO_PROXY") {
    return t("customers.trackSucceededViaProxy");
  }
  if (status === "SUCCEEDED") return t("customers.trackSucceeded");
  if (status === "PARTIAL") {
    const details = [...new Set((item.subtasks || [])
      .filter((subtask) => String(subtask.status || "").toUpperCase() === "FAILED")
      .map((subtask) => subtask.error)
      .filter(Boolean))];
    return details.join("; ") || t("customers.trackPartial");
  }
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

function toggleBatchTrackPanel() {
  batchTrackDialogOpen.value = !batchTrackDialogOpen.value;
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
  if (requestSequence === shipmentRequestSequence) {
    await loadLinkedCustomers(customerId, requestSequence);
  }
}

async function loadLinkedCustomers(customerId, requestSequence = shipmentRequestSequence) {
  const customer = customers.value.find((item) => item.id === customerId);
  linkedCustomerIds.value = [];
  if (customer?.partyRole !== "OVERSEA_AGENT") return;
  loadingLinkedCustomers.value = true;
  try {
    const response = await fetchOverseaAgentLinkedCustomers(customerId);
    if (requestSequence !== shipmentRequestSequence || selectedCustomerId.value !== customerId) return;
    linkedCustomerIds.value = Array.isArray(response?.items)
      ? response.items.map((item) => item.id).filter(Boolean)
      : [];
  } catch (error) {
    if (requestSequence === shipmentRequestSequence) {
      showError(error, "customers.loadLinkedCustomersFailed");
    }
  } finally {
    if (requestSequence === shipmentRequestSequence) loadingLinkedCustomers.value = false;
  }
}

async function saveLinkedCustomers() {
  if (!selectedCustomer.value || selectedCustomer.value.partyRole !== "OVERSEA_AGENT"
      || savingLinkedCustomers.value) return;
  savingLinkedCustomers.value = true;
  try {
    const response = await updateOverseaAgentLinkedCustomers(
      selectedCustomer.value.id,
      linkedCustomerIds.value
    );
    linkedCustomerIds.value = Array.isArray(response?.items)
      ? response.items.map((item) => item.id).filter(Boolean)
      : [];
    showSuccess("customers.linkedCustomersSaved");
  } catch (error) {
    showError(error, "customers.saveLinkedCustomersFailed");
  } finally {
    savingLinkedCustomers.value = false;
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
    const updatedCustomer = normalizeCustomer(response);
    replaceCustomer(updatedCustomer);
    if (updatedCustomer.partyRole === "OVERSEA_AGENT") {
      await loadLinkedCustomers(updatedCustomer.id);
    } else {
      linkedCustomerIds.value = [];
    }
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

function toggleCandidateShipment(shipmentId, checked) {
  const selected = new Set(selectedCandidateShipmentIds.value);
  if (checked) selected.add(shipmentId);
  else selected.delete(shipmentId);
  selectedCandidateShipmentIds.value = [...selected];
}

async function batchBindSelectedShipments() {
  if (!selectedCustomer.value || !selectedCandidateShipmentIds.value.length || bindingShipment.value) return;
  bindingShipment.value = true;
  clearMessage();
  try {
    const shipmentIds = [...selectedCandidateShipmentIds.value];
    const result = await batchBindBusinessCustomerShipments(selectedCustomer.value.id, shipmentIds);
    selectedCandidateShipmentIds.value = [];
    await Promise.all([
      selectCustomer(selectedCustomer.value.id),
      loadAvailableShipments()
    ]);
    showSuccess("customers.batchBoundSuccess", {
      bound: result?.bound ?? shipmentIds.length,
      skipped: result?.skipped ?? 0
    });
  } catch (error) {
    showError(error, "customers.batchBindFailed");
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
  if (!selectedCustomer.value || !shipment?.shipmentId || publishingShipmentId.value || publishingAllShipments.value) return;
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

async function publishAllDraftShipments() {
  if (!selectedCustomer.value || !draftShipments.value.length || publishingAllShipments.value) return;
  const pending = [...draftShipments.value];
  if (!window.confirm(t("customers.publishAllDraftsConfirm", { count: pending.length }))) return;
  publishingAllShipments.value = true;
  clearMessage();
  let published = 0;
  let failed = 0;
  try {
    for (const shipment of pending) {
      try {
        const updated = await setBusinessShipmentPublication(
          selectedCustomer.value.id, shipment.shipmentId, true
        );
        shipments.value = shipments.value.map((item) =>
          item.shipmentId === shipment.shipmentId ? updated : item
        );
        published += 1;
      } catch {
        failed += 1;
      }
    }
    if (failed) {
      showError(
        new Error(t("customers.publishAllDraftsPartial", { published, failed })),
        "customers.publishFailed"
      );
    } else {
      showSuccess("customers.publishAllDraftsSuccess", { count: published });
    }
  } finally {
    publishingAllShipments.value = false;
  }
}

function isShipmentBound(shipment) {
  return shipments.value.some((item) => item.shipmentId === shipment?.shipmentId);
}

function openShipmentDetail(shipment) {
  navigateToShipmentDetail(shipment);
}

function nextManualEntryKey(prefix) {
  manualEntryKeySeed += 1;
  return `${prefix}-${manualEntryKeySeed}`;
}

function createManualRouteNode(locationType, options = {}) {
  return {
    key: nextManualEntryKey("route"),
    locationType,
    city: "",
    countryCode: "",
    facilityCode: "",
    event: "",
    estimatedTime: "",
    actualTime: "",
    timezone: "",
    required: options.required === true,
    optional: options.optional === true
  };
}

function createManualContainerType() {
  return {
    key: nextManualEntryKey("container-type"),
    type: "",
    quantity: 1
  };
}

function createManualRoutingLeg() {
  const loadingPort = shipmentCreateForm.routeNodes
    .find((node) => ["FPOL", "POL"].includes(node.locationType))?.city || "";
  const dischargePort = shipmentCreateForm.routeNodes
    .find((node) => ["LPOD", "POD"].includes(node.locationType))?.city || "";
  return {
    key: nextManualEntryKey("routing-leg"),
    mode: "SEA",
    vesselName: "",
    service: "",
    voyage: "",
    loadPort: loadingPort,
    loadCountryCode: "",
    dischargePort,
    dischargeCountryCode: "",
    estimatedDeparture: "",
    actualDeparture: "",
    estimatedArrival: "",
    actualArrival: "",
    masterBill: ""
  };
}

function createManualContainer() {
  return {
    key: nextManualEntryKey("container"),
    number: "",
    type: shipmentCreateForm.containerTypes[0]?.type || "",
    transportMode: "",
    trafficTerm: shipmentCreateForm.trafficTerm || "",
    currentLocation: "",
    latestEvent: "",
    latestEventTime: ""
  };
}

function emptyDetailedManualShipmentFields() {
  return {
    bookingNumber: "",
    billOfLading: "",
    trafficTerm: "",
    serviceScopes: ["OCEAN"],
    estimatedDelivery: "",
    latestEventName: "",
    latestEventTime: "",
    latestEventLocation: "",
    routeNodes: [
      createManualRouteNode("POR", { required: true }),
      createManualRouteNode("FPOL", { required: true }),
      createManualRouteNode("LPOD", { required: true }),
      createManualRouteNode("FND", { required: true })
    ],
    routingLegs: [],
    containerTypes: [createManualContainerType()],
    containers: []
  };
}

function manualRouteNodeLabel(locationType) {
  const keys = {
    POR: "customers.routePlaceOfReceipt",
    FPOL: "customers.routeFirstLoadingPort",
    LPOD: "customers.routeLastDischargePort",
    FND: "customers.routeFinalDestination",
    TSP: "customers.routeTransshipment"
  };
  return t(keys[locationType] || "customers.routeTransshipment");
}

function addManualTransshipment() {
  const node = createManualRouteNode("TSP", { optional: true });
  const finalDischargeIndex = shipmentCreateForm.routeNodes
    .findIndex((item) => ["LPOD", "POD"].includes(item.locationType));
  const insertAt = finalDischargeIndex < 0
    ? Math.max(0, shipmentCreateForm.routeNodes.length - 1)
    : finalDischargeIndex;
  shipmentCreateForm.routeNodes.splice(insertAt, 0, node);
}

function removeManualRouteNode(index) {
  const node = shipmentCreateForm.routeNodes[index];
  if (!node?.optional) return;
  shipmentCreateForm.routeNodes.splice(index, 1);
}

function addManualContainerType() {
  shipmentCreateForm.containerTypes.push(createManualContainerType());
}

function addManualRoutingLeg() {
  shipmentCreateForm.routingLegs.push(createManualRoutingLeg());
}

function addManualContainer() {
  shipmentCreateForm.containers.push(createManualContainer());
}

function removeManualListItem(field, index) {
  if (!["containerTypes", "routingLegs", "containers"].includes(field)) return;
  shipmentCreateForm[field].splice(index, 1);
}

function manualRowHasValue(item, ignored = ["key"]) {
  return Object.entries(item || {}).some(([key, value]) => (
    !ignored.includes(key)
    && value !== null
    && value !== undefined
    && String(value).trim() !== ""
  ));
}

function stripManualRowState(item) {
  return Object.fromEntries(
    Object.entries(item || {}).filter(([key]) =>
      !["key", "required", "optional"].includes(key)
    )
  );
}

function buildManualShipmentPayload(form) {
  const routeNodes = form.routeNodes.map((item) => {
    const node = stripManualRowState(item);
    return {
      ...node,
      countryCode: String(node.countryCode || "").trim().toUpperCase()
    };
  });
  const firstLoadingPort = routeNodes.find((node) =>
    ["FPOL", "POL"].includes(node.locationType)
  );
  const lastDischargePort = routeNodes.find((node) =>
    ["LPOD", "POD"].includes(node.locationType)
  );
  const containerTypes = form.containerTypes
    .map((item) => ({
      type: String(item.type || "").trim().toUpperCase(),
      quantity: Number(item.quantity || 0)
    }))
    .filter((item) => item.type && item.quantity > 0);
  const volume = containerTypes
    .map((item) => `${item.type} × ${item.quantity}`)
    .join(" · ");
  const routingLegs = form.routingLegs
    .filter((item) => manualRowHasValue(item, ["key", "mode"]))
    .map(stripManualRowState);
  const containers = form.containers
    .filter((item) => manualRowHasValue(item))
    .map(stripManualRowState);

  return {
    ...form,
    trackingStatus: form.latestEventName,
    currentLocation: form.latestEventLocation,
    portOfLoading: firstLoadingPort?.city || "",
    portOfDischarge: lastDischargePort?.city || "",
    volume,
    bookingNumber: form.bookingNumber
      || (form.referenceType === "BOOKING" ? form.referenceNo : ""),
    billOfLading: form.billOfLading
      || (form.referenceType === "BILLOFLADING" ? form.referenceNo : ""),
    serviceScopes: [...form.serviceScopes],
    routeNodes,
    routingLegs,
    containerTypes,
    containers
  };
}

function resetShipmentCreateForm() {
  Object.assign(shipmentCreateForm, {
    carrier: "COSCO",
    referenceType: "BOOKING",
    referenceNo: "",
    trackingStatus: "",
    note: "",
    ...emptyManualShipmentFields(),
    ...emptyDetailedManualShipmentFields()
  });
}

function closeShipmentCreateDialog() {
  if (creatingShipment.value) return;
  shipmentCreateDialogOpen.value = false;
  resetShipmentCreateForm();
}

async function createShipment() {
  if (creatingShipment.value) return;
  creatingShipment.value = true;
  try {
    await createBusinessShipment(buildManualShipmentPayload(shipmentCreateForm));
    shipmentPage.value = 1;
    await loadAvailableShipments();
    resetShipmentCreateForm();
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
  const unsavedTicketFields = {
    referenceType: detailForm.referenceType,
    referenceNo: detailForm.referenceNo,
    note: detailForm.note
  };
  savingShipment.value = true;
  try {
    const updated = await updateBusinessShipmentManualSnapshot(
      shipment.shipmentId,
      {
        trackingStatus: detailForm.trackingStatus,
        forwarderJobNumber: detailForm.forwarderJobNumber,
        vesselVoyage: detailForm.vesselVoyage,
        portOfLoading: detailForm.portOfLoading,
        portOfDischarge: detailForm.portOfDischarge,
        clientPoNumber: detailForm.clientPoNumber,
        estimatedDeparture: detailForm.estimatedDeparture,
        estimatedArrival: detailForm.estimatedArrival,
        actualDeparture: detailForm.actualDeparture,
        actualArrival: detailForm.actualArrival,
        actualDelivery: detailForm.actualDelivery,
        currentLocation: detailForm.currentLocation,
        volume: detailForm.volume,
        clientNameCode: detailForm.clientNameCode
      }
    );
    const normalized = normalizeBusinessShipment(updated);
    replaceShipmentInLocalCollections(normalized);
    detailShipmentSnapshot.value = normalized;
    await nextTick();
    Object.assign(detailForm, unsavedTicketFields);
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
    clientNameCode: shipment.clientNameCode || primaryBoundCustomerName(shipment)
  });
}

async function saveShipmentDetail() {
  const shipment = activeDetailShipment.value;
  if (!shipment?.shipmentId || savingShipment.value) return;
  const unsavedManualFields = {
    trackingStatus: detailForm.trackingStatus,
    ...Object.fromEntries(
      Object.keys(emptyManualShipmentFields()).map((key) => [key, detailForm[key]])
    )
  };
  savingShipment.value = true;
  try {
    const updated = await updateBusinessShipment(shipment.shipmentId, {
      referenceType: detailForm.referenceType,
      referenceNo: detailForm.referenceNo,
      note: detailForm.note
    });
    const normalized = normalizeBusinessShipment(updated);
    replaceShipmentInLocalCollections(normalized);
    detailShipmentSnapshot.value = normalized;
    await nextTick();
    Object.assign(detailForm, unsavedManualFields);
    showSuccess("customers.shipmentSaved");
  } catch (error) {
    showError(error, "customers.shipmentSaveFailed");
  } finally {
    savingShipment.value = false;
  }
}

async function refreshShipmentFromCarrier() {
  const shipment = activeDetailShipment.value;
  const preferredReference = preferredTrackingReference(shipment);
  if (!shipment?.carrier || !preferredReference.number || refreshingShipment.value) return;
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
        channel: shipmentTrackingChannel.value,
        type: preferredReference.type,
        number: preferredReference.number,
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
        data?.warning || data?.diagnostic?.code === "UPSTREAM_EMPTY"
          ? t("customers.refreshReturnedNoData")
          : data?.message ||
            data?.diagnostic?.message ||
            (resp.ok ? t("customers.updateTrackingSuccessDefault") : resp.statusText) ||
            "-",
      carrier: shipment.carrier,
      type: preferredReference.type,
      number: preferredReference.number,
      hasDetails
    };
    if (!resp.ok) throw new Error(data?.message || `HTTP ${resp.status}`);
    if (data?.cacheSource === "MYSQL_STALE" || data?.warning) {
      throw new Error(data?.warning || t("customers.refreshFailed"));
    }
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
    await loadAvailableShipments();
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
    await loadAvailableShipments();
    showSuccess("customers.shipmentDeleted");
  } catch (error) {
    showError(error, "customers.shipmentDeleteFailed");
  } finally {
    deletingShipment.value = false;
  }
}

function handleShipmentSelectionChange(rows) {
  selectedShipmentRows.value = Array.isArray(rows) ? rows : [];
}

function openBatchBusinessFieldsEditor() {
  if (!selectedShipmentRows.value.length || batchSavingBusinessFields.value) return;
  batchBusinessFieldRows.value = selectedShipmentRows.value.map((row) => ({
    shipmentId: row.shipmentId,
    referenceNo: row.referenceNo || row.shipmentId,
    carrier: row.carrier || t("customers.missingValue"),
    forwarderJobNumber: row.forwarderJobNumber || "",
    clientPoNumber: row.clientPoNumber || "",
    clientNameCode: row.clientNameCode || primaryBoundCustomerName(row)
  }));
  batchBusinessFieldsDialogOpen.value = true;
}

async function saveBatchBusinessFields() {
  if (!batchBusinessFieldRows.value.length || batchSavingBusinessFields.value) return;
  batchSavingBusinessFields.value = true;
  try {
    const result = await batchUpdateBusinessShipmentFields(
      batchBusinessFieldRows.value.map((row) => ({
        shipmentId: row.shipmentId,
        forwarderJobNumber: String(row.forwarderJobNumber || "").trim() || null,
        clientPoNumber: String(row.clientPoNumber || "").trim() || null,
        clientNameCode: String(row.clientNameCode || "").trim() || null
      }))
    );
    batchBusinessFieldsDialogOpen.value = false;
    batchBusinessFieldRows.value = [];
    selectedShipmentRows.value = [];
    shipmentTableRef.value?.clearSelection?.();
    await loadAvailableShipments();
    showSuccess("customers.batchBusinessFieldsSaved", { count: result?.updated || 0 });
  } catch (error) {
    showError(error, "customers.batchBusinessFieldsSaveFailed");
  } finally {
    batchSavingBusinessFields.value = false;
  }
}

async function batchDeleteSelectedShipments() {
  if (!selectedShipmentRows.value.length || batchDeletingShipments.value) return;
  const shipmentIds = [...new Set(
    selectedShipmentRows.value.map((row) => row?.shipmentId).filter(Boolean)
  )];
  if (!shipmentIds.length) return;
  if (!window.confirm(t("customers.batchDeleteConfirm", { count: shipmentIds.length }))) return;
  batchDeletingShipments.value = true;
  try {
    await batchDeleteBusinessShipments(shipmentIds);
    const deleted = new Set(shipmentIds);
    shipments.value = shipments.value.filter((item) => !deleted.has(item.shipmentId));
    await loadAvailableShipments();
    selectedShipmentRows.value = [];
    if (deleted.has(selectedShipmentId.value)) selectedShipmentId.value = "";
    showSuccess("customers.batchDeleteSuccess", { count: shipmentIds.length });
  } catch (error) {
    showError(error, "customers.batchDeleteFailed");
  } finally {
    batchDeletingShipments.value = false;
  }
}

async function updateShipmentTracking(row) {
  const preferredReference = preferredTrackingReference(row);
  if (!row?.carrier || !preferredReference.number || refreshingShipment.value) return;
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
        channel: shipmentTrackingChannel.value,
        type: preferredReference.type,
        number: preferredReference.number,
        forceRefresh: true
      })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.message || `HTTP ${resp.status}`);
    if (data?.cacheSource === "MYSQL_STALE" || data?.warning) {
      throw new Error(data?.warning || t("customers.refreshFailed"));
    }
    await loadAvailableShipments();
    showSuccess("customers.refreshSuccess");
  } catch (error) {
    showError(error, "customers.refreshFailed");
  } finally {
    refreshingShipment.value = false;
  }
}

function preferredTrackingReference(row) {
  const bookingNumber = String(row?.bookingNumber || "").trim();
  if (bookingNumber) return { type: "BOOKING", number: bookingNumber };
  const carrier = String(row?.carrier || "").trim().toUpperCase();
  const originalType = String(row?.referenceType || "BOOKING").trim().toUpperCase();
  const originalNumber = String(row?.referenceNo || "").trim();
  const numericCoscoReference = originalNumber.replace(/^COSU/i, "");
  if (
    carrier === "COSCO"
    && originalType === "BILLOFLADING"
    && /^[0-9]{8,12}$/.test(numericCoscoReference)
  ) {
    return { type: "BOOKING", number: numericCoscoReference };
  }
  return {
    type: originalType,
    number: originalNumber
  };
}

function trackShipmentInWorkspace(shipment) {
  openTrackingWorkspace(shipment);
}

function openTrackingWorkspace(shipment = null) {
  const returnTo = selectedCustomerId.value
    ? `/customers?customer=${encodeURIComponent(selectedCustomerId.value)}`
    : "/customers";
  const parameters = new URLSearchParams({ returnTo });
  const preferredReference = preferredTrackingReference(shipment);
  const referenceNo = preferredReference.number;
  if (referenceNo) {
    parameters.set("carrier", shipment?.carrier || "COSCO");
    parameters.set("type", preferredReference.type);
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
  customerFileParsing.value = true;
  try {
    await waitForNextPaint();
    const XLSX = await loadXlsxModule();
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
    customerFileParsing.value = false;
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

async function downloadCredentialWorkbook() {
  if (exportingCredentials.value) return;
  exportingCredentials.value = true;
  try {
    await waitForNextPaint();
    const XLSX = await loadXlsxModule();
    const rows = batchCredentialRows.value.map((row) => ({
      [t("customers.customerName")]: row.username,
      [t("customers.initialPassword")]: row.password || "",
      [t("customers.importStatus")]: row.status === "CREATED" ? t("customers.importCreated") : row.message
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Customer credentials");
    XLSX.writeFile(workbook, `customer-credentials-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } finally {
    exportingCredentials.value = false;
  }
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

function shipmentClientLabel(shipment) {
  const direct = [shipment?.clientNo || shipment?.clientNameCode, shipment?.clientName]
    .filter(Boolean)
    .map(String)
    .filter((value, index, values) => values.indexOf(value) === index);
  if (direct.length) return direct.join(" / ");
  const bound = Array.isArray(shipment?.boundCustomers) ? shipment.boundCustomers : [];
  const labels = bound.map((customer) => {
    if (typeof customer === "string") return customer;
    return [customer?.clientCode || customer?.clientNo, customer?.displayName || customer?.clientName || customer?.username]
      .filter(Boolean)
      .map(String)
      .filter((value, index, values) => values.indexOf(value) === index)
      .join(" / ");
  }).filter(Boolean);
  return labels.length ? labels.join(" / ") : "—";
}

function primaryBoundCustomerName(shipment) {
  const users = shipmentBoundUsers(shipment);
  const preferred = users.find((user) => String(user.role || "").toUpperCase() === "SHIPPER")
    || users.find((user) => ["SHIPPER", "CONSIGNEE"].includes(String(user.role || "").toUpperCase()))
    || users.find((user) => String(user.role || "").toUpperCase() !== "OVERSEA_AGENT");
  return preferred?.displayName
    || preferred?.clientName
    || preferred?.name
    || preferred?.username
    || preferred?.clientCode
    || "";
}

function customerFilterOptionLabel(customer) {
  const name = customer?.displayName || customer?.username || customer?.id || t("customers.missingValue");
  const code = customer?.clientCode;
  return code && code !== name ? `${name} · ${code}` : name;
}

function shipmentCustomerSelectedLabel(customerId) {
  const customer = shipmentFilterCustomers.value.find((item) => item.id === customerId);
  if (!customer) return "";
  return `${customerFilterOptionLabel(customer)} (${customer.shipmentCount})`;
}

function shipmentBoundUsers(shipment) {
  const direct = Array.isArray(shipment?.boundUsers)
    ? shipment.boundUsers
    : Array.isArray(shipment?.participants)
      ? shipment.participants
      : Array.isArray(shipment?.boundCustomers)
        ? shipment.boundCustomers
        : [];
  const fallbackIds = shipment?.shipmentId ? shipmentCustomerMap.value[shipment.shipmentId] || [] : [];
  const source = direct.length ? direct : fallbackIds.map((id) => customers.value.find((item) => item.id === id) || { id });
  const seen = new Set();
  return source.map((user, index) => {
    const value = typeof user === "string" ? { id: user, name: user } : user || {};
    const name = value.displayName || value.name || value.username || value.clientName || value.id || `#${index + 1}`;
    const role = value.partyRole || value.relationshipRole || value.role || "";
    return { ...value, name, role };
  }).filter((user) => {
    const key = String(user.id || `${user.name}:${user.role}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function boundUserLabel(user) {
  const role = String(user?.role || "").toUpperCase();
  let roleName = "";
  if (["AGENT", "OVERSEA_AGENT", "SHIPPER", "CONSIGNEE"].includes(role)) {
    roleName = partyRoleLabel(role);
  } else if (role) {
    roleName = role.replaceAll("_", " ");
  }
  return roleName ? `${user.name} (${roleName})` : user.name;
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

function showSuccess(key, params) {
  clearMessage();
  toastMessage.value = t(key, params);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = "";
  }, 2600);
}

function showError(error, fallbackKey) {
  markApiErrorHandled(error);
  const message = String(error?.message || "");
  if (/operational data|last valid snapshot was kept/i.test(message)) {
    pageMessage.value = t("customers.refreshReturnedNoData");
  } else if (/Tracked shipment not found|Shipment not found/i.test(message)) {
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
  height: 100dvh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
  overflow: hidden;
}

/* ---- Sidebar ---- */
.workspace-sidebar {
  width: 180px;
  flex: 0 0 180px;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #f5f7fa 0%, #eceff4 100%);
  border-right: 1px solid #dce1e8;
  overflow-y: auto;
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
  min-height: 0;
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
.shipment-workspace-main > .list-page-header {
  position: sticky;
  top: -20px;
  z-index: 25;
  margin-top: -20px;
  padding: 20px 0 14px;
  background: #f0f3f7;
  box-shadow: 0 8px 14px rgba(15, 29, 46, 0.06);
}
.shipment-customer-filter {
  width: 230px;
}
.shipment-customer-filter-label {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: #18324b;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shipment-toolbar-control {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #64748b;
  font-size: 12px;
  white-space: nowrap;
}
.shipment-channel-select {
  width: 170px;
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
  overflow: visible;
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
  position: sticky;
  bottom: 0;
  z-index: 3;
  background: #fff;
}
.batch-track-close-hint {
  margin: 12px 0 0;
  color: #64748b;
  font-size: 12px;
  text-align: right;
}
.shipment-bound-user-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.shipment-status-stack {
  display: grid;
  justify-items: start;
  gap: 5px;
}
.batch-track-task-dialog-body {
  width: 100%;
  max-width: none;
  height: min(76vh, 760px);
  flex: 1 1 auto;
  position: static;
  top: auto;
  overflow-y: auto;
  padding-right: 4px;
}
:deep(.batch-track-task-dialog .el-dialog__body) {
  padding-top: 8px;
  overflow: hidden;
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
  border-left: 3px solid #22c55e;
  background: #f1fbf6;
}

.batch-track-result-row.partial,
.batch-track-result-row.failed {
  border-left: 3px solid #ef4444;
  background: #fff3f5;
}

.batch-track-result-row.stopped {
  border-left: 3px solid #94a3b8;
  background: #f8fafc;
  color: #64748b;
}

.batch-track-result-row.retry_wait {
  border-left: 3px solid #f59e0b;
  background: #fffbeb;
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
  justify-content: flex-end;
  padding: 18px 0 4px;
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
  gap: 12px;
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
  border-radius: 8px;
  background: #fff;
  font-size: 11px;
}
.candidate-row--bound {
  border-color: #d7e7fa;
  background: #f8fbff;
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
.customer-dialog-form select,
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

.customer-transfer-hint {
  display: block;
  color: #64748b;
  line-height: 1.6;
  margin-top: -4px;
}
.customer-code-unique-hint {
  color: #8a5b12;
  font-size: 11px;
  line-height: 1.5;
}
.customer-dialog-form input:focus,
.customer-dialog-form select:focus,
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

.manual-shipment-dialog {
  width: min(1120px, calc(100vw - 48px));
  max-height: min(92vh, 980px);
  padding: 24px 26px 0;
  overflow: hidden;
}

.manual-shipment-dialog > p {
  max-width: 900px;
}

.manual-shipment-form {
  min-height: 0;
  max-height: calc(min(92vh, 980px) - 132px);
  padding: 2px 8px 0 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.manual-required-hint {
  padding: 10px 12px;
  border: 1px solid #f1d59b;
  border-radius: 9px;
  color: #895b14 !important;
  background: #fff9eb;
  font-size: 11px;
}

.manual-entry-section {
  display: grid;
  padding: 16px;
  border: 1px solid #dbe6f0;
  border-radius: 12px;
  background: #f9fbfd;
  gap: 14px;
}

.manual-entry-section-head {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.manual-entry-section-head > span {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
}

.manual-entry-section-head > span > b {
  display: inline-grid;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: #2474c8;
  background: #eaf4ff;
  place-items: center;
  font-size: 10px;
}

.manual-entry-section-head strong {
  color: #1d3852;
  font-size: 14px;
}

.manual-entry-section-head > small {
  color: #7a8ea2;
  font-size: 10px;
  text-align: right;
}

.manual-entry-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.manual-entry-grid.is-route {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.manual-route-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.manual-repeat-list {
  display: grid;
  gap: 12px;
}

.manual-repeat-card {
  display: grid;
  padding: 13px;
  border: 1px solid #d9e5f0;
  border-radius: 10px;
  background: #fff;
  gap: 12px;
}

.manual-repeat-card > header {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.manual-repeat-card > header > span {
  display: inline-flex;
  min-width: 0;
  align-items: baseline;
  gap: 8px;
}

.manual-repeat-card > header b {
  color: #234867;
  font-size: 12px;
}

.manual-repeat-card > header small {
  color: #3f83c5;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: .08em;
}

.manual-add-button,
.manual-remove-button {
  min-height: 30px;
  padding: 0 11px;
  border: 1px solid #bfd4e8;
  border-radius: 7px;
  color: #276da8;
  background: #f4f9ff;
  font: inherit;
  font-size: 10px;
  font-weight: 750;
  cursor: pointer;
}

.manual-add-button {
  justify-self: start;
}

.manual-remove-button {
  flex: 0 0 auto;
  border-color: #ead0d2;
  color: #a94c56;
  background: #fff8f8;
}

.manual-service-field {
  display: grid;
  gap: 8px;
}

.manual-service-field > span {
  color: #435d76;
  font-size: 11px;
  font-weight: 800;
}

.manual-service-field > div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.manual-service-choice {
  display: inline-flex !important;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid #d2dfeb;
  border-radius: 8px;
  background: #fff;
  align-items: center;
  gap: 7px !important;
  cursor: pointer;
}

.manual-service-choice input {
  width: 15px;
  height: 15px;
  padding: 0;
  accent-color: #2877c8;
}

.manual-service-choice > span {
  color: #3a5873 !important;
  font-size: 11px !important;
}

.manual-compact-list {
  display: grid;
  gap: 8px;
}

.manual-compact-row {
  display: grid;
  padding: 10px 12px;
  border: 1px solid #dbe6f0;
  border-radius: 9px;
  background: #fff;
  grid-template-columns: minmax(180px, 1fr) minmax(120px, .35fr) auto;
  align-items: end;
  gap: 10px;
}

.manual-empty-copy {
  padding: 14px;
  border: 1px dashed #cad9e8;
  border-radius: 9px;
  color: #8193a6 !important;
  background: #fff;
  text-align: center;
  font-size: 11px;
}

.manual-shipment-note {
  padding: 14px;
  border: 1px solid #dbe6f0;
  border-radius: 10px;
  background: #f9fbfd;
}

.manual-shipment-form > .customer-dialog-actions {
  position: sticky;
  bottom: 0;
  z-index: 3;
  margin: 0 -8px 0 0;
  padding: 13px 0 16px;
  border-top: 1px solid #dce6ef;
  background: rgba(255, 255, 255, .96);
  backdrop-filter: blur(8px);
}

.manual-shipment-form > .customer-dialog-actions button {
  flex: 0 0 auto;
  min-width: 124px;
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

.batch-business-fields-hint {
  margin: -4px 0 12px;
  color: #667b91;
  font-size: 12px;
  line-height: 1.6;
}
.batch-business-fields-rows {
  max-height: 58vh;
  overflow: auto;
}
.batch-business-fields-grid {
  display: grid;
  grid-template-columns: minmax(160px, .8fr) repeat(3, minmax(180px, 1fr));
  gap: 8px;
  align-items: center;
  padding: 8px 6px;
  border-bottom: 1px solid #edf1f6;
}
.batch-business-fields-grid--head {
  position: sticky;
  top: 0;
  z-index: 2;
  color: #526b83;
  background: #f4f7fb;
  border: 1px solid #dfe7f0;
  border-radius: 8px 8px 0 0;
  font-size: 11px;
  font-weight: 750;
}
.batch-business-reference {
  display: grid;
  gap: 3px;
  min-width: 0;
  color: #183b5a;
}
.batch-business-reference b,
.batch-business-reference small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.batch-business-reference small {
  color: #7a8da0;
  font-size: 10px;
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
  .customer-access-page {
    height: auto;
    overflow: visible;
  }
  .workspace-layout {
    flex-direction: column;
    overflow: visible;
  }
  .workspace-sidebar {
    width: 100%;
    flex: 0 0 auto;
    max-height: none;
  }
  .shipment-workspace-main > .list-page-header {
    top: 0;
  }
  .shipment-customer-filter {
    width: 100%;
  }
  .shipment-toolbar-control {
    width: 100%;
  }
  .shipment-toolbar-control :deep(.el-select) {
    flex: 1;
    width: auto;
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
  .manual-shipment-dialog {
    width: calc(100vw - 16px);
    max-height: calc(100vh - 16px);
    padding: 18px 16px 0;
  }
  .manual-shipment-form {
    max-height: calc(100vh - 132px);
  }
  .manual-entry-grid,
  .manual-entry-grid.is-route,
  .manual-route-list {
    grid-template-columns: 1fr;
  }
  .manual-entry-section-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 5px;
  }
  .manual-entry-section-head > small {
    text-align: left;
  }
  .manual-compact-row {
    grid-template-columns: 1fr 1fr;
  }
  .manual-compact-row .manual-remove-button {
    grid-column: 1 / -1;
    justify-self: start;
  }
  .manual-shipment-form > .customer-dialog-actions button {
    flex: 1 1 0;
    min-width: 0;
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
.batch-track-result-list-head {
  position: sticky;
  top: 72px;
  z-index: 1;
  padding: 7px 10px;
  border-radius: 6px;
  color: #334155;
  background: #e8eef6;
  font-size: 12px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
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

.batch-track-subtask-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding-left: 32px;
}
.batch-track-subtask {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid #d9e2ec;
  border-radius: 6px;
  color: #5f7187;
  background: #f8fafc;
}
.batch-track-subtask i {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #94a3b8;
}
.batch-track-subtask b {
  overflow: hidden;
  color: #40566f;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.batch-track-subtask em {
  color: inherit;
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
}
.batch-track-subtask small {
  grid-column: 2 / -1;
  color: #9f3340 !important;
}
.batch-track-subtask.running {
  border-color: #bfdbfe;
  color: #2563eb;
  background: #eff6ff;
}
.batch-track-subtask.running i {
  background: #3b82f6;
  animation: batch-subtask-pulse 1s ease-in-out infinite;
}
.batch-track-subtask.succeeded {
  border-color: #bbf7d0;
  color: #15803d;
  background: #f0fdf4;
}
.batch-track-subtask.succeeded i {
  background: #22c55e;
}
.batch-track-subtask.failed {
  border-color: #fecdd3;
  color: #be123c;
  background: #fff1f2;
}
.batch-track-subtask.failed i {
  background: #ef4444;
}
@keyframes batch-subtask-pulse {
  50% { opacity: 0.35; transform: scale(0.75); }
}
.batch-track-timer {
  font-variant-numeric: tabular-nums;
}
.batch-track-result-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.batch-track-result-index {
  display: inline-grid;
  place-items: center;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  color: #475569;
  background: #e2e8f0;
  font-size: 10px;
  font-weight: 800;
}
.batch-track-result-meta b {
  font-family: "SFMono-Regular", "Menlo", "Consolas", monospace;
  color: #1a3a5c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 760px) {
  .batch-track-subtask-list {
    grid-template-columns: 1fr;
  }
}
</style>
