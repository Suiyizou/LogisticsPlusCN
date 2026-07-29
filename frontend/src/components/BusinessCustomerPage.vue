<template>
  <main class="customer-access-page" data-i18n-ignore>
    <header class="customer-access-header">
      <RouterLink class="customer-access-brand" :to="roleHomePath">
        <img src="/favicon.svg" alt="" />
        <span>
          <strong>DrewesLogistics</strong>
          <small>{{ t("customers.productLine") }}</small>
        </span>
      </RouterLink>
      <div class="customer-access-header-actions">
        <LanguageSwitcher class="customer-access-language" />
        <span class="customer-access-party-pill">{{ t("customers.internalPartyAgent") }}</span>
        <button type="button" class="system-message-button" @click="emit('open-announcements')">
          <el-icon><Bell /></el-icon>
          <span>{{ t("customers.systemMessages") }}</span>
          <i v-if="announcementCount > 0">{{ announcementCount > 99 ? "99+" : announcementCount }}</i>
        </button>
        <div class="customer-account" :class="{ 'is-open': accountMenuOpen }">
          <button type="button" class="customer-account-trigger" @click="accountMenuOpen = !accountMenuOpen">
            <span><b>{{ displayName }}</b><small>{{ isManager ? t("customers.businessOperator") : t("customers.overseaAgentEmployee") }}</small></span>
            <i aria-hidden="true">&#x2304;</i>
          </button>
          <div v-if="accountMenuOpen" class="customer-account-menu">
            <RouterLink v-if="isManager" to="/workbenches" @click="accountMenuOpen = false">{{ t("customers.backWorkbench") }}</RouterLink>
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
          <button v-if="isManager" :class="{ active: menuItem === 'overview' }" @click="navigateTo('overview')">
            <el-icon><DataBoard /></el-icon><span>{{ t("customers.overview") }}</span>
          </button>
          <button :class="{ active: menuItem === 'customers' }" @click="navigateTo('customers')">
            <el-icon><User /></el-icon><span>{{ t("customers.tabCustomerManagement") }}</span>
          </button>
          <button v-if="isManager || isOverseaAgent" :class="{ active: menuItem === 'handover' }" @click="navigateTo('handover')">
            <el-icon><Operation /></el-icon><span>{{ isOverseaAgent ? t("customers.businessTransfer") : t("customers.businessHandover") }}</span>
          </button>
          <button :class="{ active: menuItem === 'shipments' }" @click="navigateTo('shipments')">
            <el-icon><Document /></el-icon><span>{{ isOverseaAgent ? t("customers.shipmentOverview") : t("customers.tabShipmentManagement") }}</span>
          </button>
          <button v-if="isManager" :class="{ active: menuItem === 'agents' }" @click="navigateTo('agents')">
            <el-icon><UserFilled /></el-icon><span>{{ t("customers.overseaAgentManagement") }}</span>
          </button>
        </nav>
        <button type="button" class="sidebar-profile-card" @click="openPersonalProfile">
          <span class="sidebar-profile-avatar">{{ displayName.slice(0, 1).toUpperCase() }}</span>
          <span class="sidebar-profile-copy">
            <b>{{ displayName }}</b>
            <small>{{ personalRoleLabel }}</small>
          </span>
          <el-icon><ArrowRight /></el-icon>
        </button>
      </aside>

      <div class="workspace-main">
        <transition name="fade" mode="out-in" appear @after-enter="handleWorkspaceViewEntered">
        <!-- CUSTOMER MANAGEMENT -->
        <div v-if="menuItem === 'overview'" key="overview" class="workspace-view">
          <div class="list-page list-page-full business-overview" v-loading="loadingOverviewMetrics">
            <div class="list-page-header business-overview-header">
              <div>
                <span class="business-overview-kicker">{{ t("customers.overviewKicker") }}</span>
                <h2>{{ t("customers.overview") }}</h2>
                <p>{{ t("customers.overviewHint") }}</p>
              </div>
              <el-button :loading="loadingOverviewMetrics" @click="loadOverviewMetrics">
                <el-icon><Refresh /></el-icon>{{ t("customers.refresh") }}
              </el-button>
            </div>
            <div class="business-kpi-grid">
              <article
                v-for="metric in overviewKpis"
                :key="metric.key"
                class="business-kpi-card"
                :class="`is-${metric.tone}`"
              >
                <div class="business-kpi-card__top">
                  <span class="business-kpi-card__icon" aria-hidden="true">
                    <el-icon><component :is="metric.icon" /></el-icon>
                  </span>
                  <span>{{ metric.label }}</span>
                </div>
                <div class="business-kpi-card__value">
                  <b>{{ metric.value }}</b>
                  <small>{{ metric.hint }}</small>
                </div>
              </article>
            </div>
            <div class="business-chart-grid">
              <section class="business-chart-card business-chart-card--trend">
                <header>
                  <div>
                    <b>{{ t("customers.overviewSevenDayTrend") }}</b>
                    <small>{{ t("customers.overviewTrendHint") }}</small>
                  </div>
                </header>
                <div class="business-chart-body" v-loading="loadingOverviewMetrics">
                  <div
                    ref="overviewTrendChartRef"
                    class="business-echart"
                    role="img"
                    :aria-label="t('customers.overviewSevenDayTrend')"
                  ></div>
                  <div v-if="!loadingOverviewMetrics && !overviewTrendHasData" class="business-chart-empty">
                    <el-empty :image-size="68" :description="t('customers.overviewNoData')" />
                  </div>
                </div>
              </section>
              <section class="business-chart-card">
                <header>
                  <div>
                    <b>{{ t("customers.overviewTodayCompositionTitle") }}</b>
                    <small>{{ t("customers.overviewTodayCompositionHint") }}</small>
                  </div>
                </header>
                <div class="business-chart-body" v-loading="loadingOverviewMetrics">
                  <div
                    ref="overviewTodayChartRef"
                    class="business-echart"
                    role="img"
                    :aria-label="t('customers.overviewTodayCompositionTitle')"
                  ></div>
                  <div v-if="!loadingOverviewMetrics && !overviewTodayHasData" class="business-chart-empty">
                    <el-empty :image-size="68" :description="t('customers.overviewNoData')" />
                  </div>
                </div>
              </section>
              <section class="business-chart-card business-chart-card--resources">
                <header>
                  <div>
                    <b>{{ t("customers.overviewResourceTitle") }}</b>
                    <small>{{ t("customers.overviewDataSource") }}</small>
                  </div>
                </header>
                <div class="business-chart-body" v-loading="loadingOverviewMetrics">
                  <div
                    ref="overviewResourcesChartRef"
                    class="business-echart"
                    role="img"
                    :aria-label="t('customers.overviewResourceTitle')"
                  ></div>
                  <div v-if="!loadingOverviewMetrics && !overviewResourcesHaveData" class="business-chart-empty">
                    <el-empty :image-size="68" :description="t('customers.overviewNoData')" />
                  </div>
                </div>
              </section>
              <section class="business-chart-card">
                <header>
                  <div>
                    <b>{{ t("customers.overviewShipmentStatusTitle") }}</b>
                    <small>{{ t("customers.overviewShipmentStatusHint") }}</small>
                  </div>
                </header>
                <div class="business-chart-body" v-loading="loadingOverviewMetrics">
                  <div
                    ref="overviewStatusChartRef"
                    class="business-echart"
                    role="img"
                    :aria-label="t('customers.overviewShipmentStatusTitle')"
                  ></div>
                  <div v-if="!loadingOverviewMetrics && !overviewStatusHasData" class="business-chart-empty">
                    <el-empty :image-size="68" :description="t('customers.overviewNoData')" />
                  </div>
                </div>
              </section>
            </div>
            <p v-if="overviewMetricsError" class="business-overview-warning" role="status">
              {{ overviewMetricsError }}
            </p>
          </div>
        </div>
        <div v-else-if="menuItem === 'customers'" key="customers" class="workspace-view">
          <transition name="fade-slide" mode="out-in">
          <div :key="subView" class="subview-wrap">
          <!-- List view -->
          <template v-if="subView === 'list'">
            <div class="list-page list-page-full">
              <div class="list-page-header">
                <h2>{{ t("customers.directoryTitle") }}</h2>
                <div v-if="isManager" class="list-page-actions">
                  <el-input v-model="customerSearch" :placeholder="t('customers.searchCustomerPlaceholder')" prefix-icon="Search" clearable style="width:240px" />
                  <el-button type="primary" @click="createDialogOpen = true"><el-icon><Plus /></el-icon>{{ t("customers.openCreate") }}</el-button>
                  <el-button @click="openBatchImport"><el-icon><Upload /></el-icon>{{ t("customers.batchImport") }}</el-button>
                  <el-button
                    type="success"
                    plain
                    :disabled="!selectedCustomerRows.length"
                    @click="openCustomerTransfer(selectedCustomerRows[0], true)"
                  >{{ t("customers.transferSelected", { count: selectedCustomerRows.length }) }}</el-button>
                  <el-button
                    type="danger"
                    plain
                    :disabled="!selectedCustomerRows.length || mutatingCustomer"
                    @click="deleteSelectedCustomers"
                  >{{ t("customers.deleteSelectedCustomers", { count: selectedCustomerRows.length }) }}</el-button>
                </div>
              </div>
              <el-table
                ref="customerTableRef"
                :data="paginatedCustomers"
                stripe
                v-loading="loadingCustomers"
                style="width:100%"
                class="customer-directory-table"
                :class="{ 'is-page-switching': tablePageTransitioning }"
                @selection-change="handleCustomerSelectionChange"
              >
                <el-table-column v-if="isManager" type="selection" width="44" />
                <el-table-column type="index" :index="customerRowIndex" :label="t('customers.index')" width="76" align="center" header-align="center" />
                <el-table-column :label="t('customers.displayName')" min-width="168">
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
                <el-table-column prop="clientCode" :label="t('customers.clientCode')" width="138" class-name="customer-code-column" />
                <el-table-column prop="overseaAgentDisplayName" :label="t('customers.targetAgent')" min-width="142" show-overflow-tooltip>
                  <template #default="{ row }">{{ row.overseaAgentDisplayName || t("customers.unassigned") }}</template>
                </el-table-column>
                <el-table-column :label="t('customers.partyRole')" width="156">
                  <template #default="{ row }">{{ partyRoleLabel(row.partyRole) }}</template>
                </el-table-column>
                <el-table-column :label="t('customers.shipmentCount')" width="100" align="center">
                  <template #default="{ row }">{{ row.shipmentCount || 0 }}</template>
                </el-table-column>
                <el-table-column :label="t('customers.remark')" min-width="150" show-overflow-tooltip>
                  <template #default="{ row }">{{ row.remark || '—' }}</template>
                </el-table-column>
                <el-table-column :label="t('customers.status')" width="100">
                  <template #default="{ row }">
                    <el-tag :type="row.status==='ACTIVE'?'success':'danger'" size="small">{{ statusLabel(row.status) }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column :label="t('customers.createdAt')" width="152">
                  <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
                </el-table-column>
                <el-table-column :label="t('customers.actions')" :width="isManager ? 318 : 110" fixed="right">
                  <template #default="{ row }">
                    <div class="table-action-buttons table-action-buttons--single-line">
                      <el-button size="small" type="primary" plain @click.stop="selectCustomerFromList(row)">{{ t("customers.detail") }}</el-button>
                      <template v-if="isManager">
                        <el-button size="small" type="primary" plain @click.stop="openEditCustomer(row)">{{ t("customers.edit") }}</el-button>
                        <el-button
                          size="small"
                          type="success"
                          plain
                          :disabled="!isTransferableCustomer(row)"
                          @click.stop="openCustomerTransfer(row)"
                        >{{ t("customers.assignAgentShort") }}</el-button>
                        <el-button size="small" type="warning" plain @click.stop="openResetPassword(row)">{{ t("customers.resetPassword") }}</el-button>
                      </template>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
              <el-pagination
                v-if="filteredCustomers.length"
                class="shipment-pagination unified-pagination"
                background
                layout="prev, pager, next, total"
                :current-page="customerPage"
                :page-size="customerPageSize"
                :total="filteredCustomers.length"
                @current-change="changeCustomerPage"
              />
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
                  <div v-if="isManager" class="main-card-header-actions">
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
                <el-form class="profile-form" :disabled="!isManager" @submit.prevent="saveCustomer" label-position="top">
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
                        </el-select>
                      </el-form-item>
                    </el-col>
                    <el-col v-if="isManager" :span="4" :offset="12" style="display:flex;align-items:flex-end;padding-bottom:18px;">
                      <el-button type="primary" native-type="submit" :disabled="mutatingCustomer">
                        {{ t("customers.saveProfile") }}
                      </el-button>
                    </el-col>
                  </el-row>
                </el-form>

              </section>
            </el-card>

            <el-card v-if="isManager && selectedCustomer.partyRole === 'OVERSEA_AGENT'" class="main-card" shadow="never">
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

              <el-card v-if="isManager" class="bind-form-card" shadow="never">
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
                      <el-button v-if="isManager" text size="small" @click="openShipmentDetail(shipment)">{{ t("customers.edit") }}</el-button>
                      <el-button v-if="isManager" type="primary" size="small" @click="quickBindShipment(shipment)" :disabled="bindingShipment">{{ t("customers.quickBind") }}</el-button>
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
          </template>
          </div>
          </transition>
        </div>

        <div v-else-if="menuItem === 'agents'" key="agents" class="workspace-view">
          <div class="list-page list-page-full">
            <div class="list-page-header">
              <div>
                <h2>{{ t("customers.overseaAgentManagement") }}</h2>
                <p>{{ t("customers.overseaAgentManagementHint") }}</p>
              </div>
              <div class="list-page-actions">
                <el-button @click="loadTransferAgents"><el-icon><Refresh /></el-icon>{{ t("customers.refresh") }}</el-button>
                <el-button type="primary" plain @click="openAgentBatchImport"><el-icon><Upload /></el-icon>{{ t("customers.batchCreateAgents") }}</el-button>
                <el-button type="primary" @click="openAgentCreateDialog"><el-icon><Plus /></el-icon>{{ t("customers.createOverseaAgent") }}</el-button>
              </div>
            </div>
            <el-table
              :data="paginatedTransferAgents"
              border
              stripe
              v-loading="loadingTransferAgents"
              class="standard-information-table"
              :class="{ 'is-page-switching': tablePageTransitioning }"
            >
              <el-table-column type="index" :index="agentRowIndex" :label="t('customers.index')" width="70" />
              <el-table-column prop="username" :label="t('customers.username')" min-width="160" />
              <el-table-column prop="displayName" :label="t('customers.displayName')" min-width="180" />
              <el-table-column prop="linkedCustomerCount" :label="t('customers.linkedCustomerCount')" width="130" align="center" />
              <el-table-column :label="t('customers.status')" width="120">
                <template #default="{ row }">
                  <el-tag type="success">{{ statusLabel(row.status) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="t('customers.actions')" width="330" fixed="right">
                <template #default="{ row }">
                  <div class="table-action-buttons table-action-buttons--single-line">
                    <el-button size="small" type="primary" plain @click="editAgentDisplayName(row)">{{ t("customers.edit") }}</el-button>
                    <el-button size="small" type="warning" plain @click="resetAgentPassword(row)">{{ t("customers.resetPassword") }}</el-button>
                    <el-button size="small" type="danger" plain @click="toggleAgentStatus(row)">{{ t("customers.disable") }}</el-button>
                  </div>
                </template>
              </el-table-column>
            </el-table>
            <el-pagination
              v-if="transferAgents.length"
              class="shipment-pagination unified-pagination"
              background
              layout="prev, pager, next, total"
              :current-page="agentPage"
              :page-size="agentPageSize"
              :total="transferAgents.length"
              @current-change="changeAgentPage"
            />
          </div>
        </div>

        <div v-else-if="menuItem === 'handover'" key="handover" class="workspace-view">
          <div class="list-page list-page-full business-handover-page">
            <div class="list-page-header">
              <div>
                <span class="business-overview-kicker">{{ t("customers.businessHandoverKicker") }}</span>
                <h2>{{ isOverseaAgent ? t("customers.businessTransfer") : t("customers.businessHandover") }}</h2>
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
                  <div><b>{{ t("customers.handoverWorkflowSubmit") }}</b><small>{{ t("customers.handoverWorkflowSubmitHint") }}</small></div>
                </li>
                <li>
                  <span>2</span>
                  <div><b>{{ t("customers.handoverWorkflowComplete") }}</b><small>{{ t("customers.handoverWorkflowCompleteHint") }}</small></div>
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
                    <template #default="{ row }"><b class="handover-request-id">#{{ row.requestId }}</b></template>
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
                        <span>{{ row.sourceBusinessUserName || row.sourceBusinessUser?.displayName || "—" }}</span>
                        <el-icon><ArrowRight /></el-icon>
                        <b>{{ row.targetBusinessUserName || row.targetBusinessUser?.displayName || "—" }}</b>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('customers.handoverCustomerCount')" width="120" align="center">
                    <template #default="{ row }">{{ row.customerCount || row.customerIds?.length || 0 }}</template>
                  </el-table-column>
                  <el-table-column prop="reason" :label="t('customers.handoverReason')" min-width="230" show-overflow-tooltip />
                  <el-table-column :label="t('customers.handoverRequestedAt')" width="170">
                    <template #default="{ row }">{{ formatDateTime(row.requestedAt) }}</template>
                  </el-table-column>
                  <el-table-column :label="t('customers.handoverReviewComment')" min-width="190" show-overflow-tooltip>
                    <template #default="{ row }">{{ formatDateTime(row.reviewedAt || row.updatedAt) }}</template>
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

            <section class="handover-section">
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
                        <span class="handover-agent-avatar">{{ (row.displayName || row.username || "?").slice(0, 1).toUpperCase() }}</span>
                        <span>
                          <b>{{ row.displayName || row.username }}</b>
                          <small>@{{ row.username }}</small>
                        </span>
                        <el-tag v-if="row.current" type="info" effect="plain">{{ t("customers.currentBusinessOperator") }}</el-tag>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column prop="customerCount" :label="t('customers.ownedCustomerCount')" width="160" align="center" />
                  <el-table-column :label="t('customers.status')" width="120">
                    <template #default="{ row }">
                      <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'danger'" effect="light">
                        {{ statusLabel(row.status) }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column v-if="canRequestBusinessHandover" :label="t('customers.actions')" width="180" fixed="right">
                    <template #default="{ row }">
                      <el-button
                        type="primary"
                        :disabled="row.current || row.status !== 'ACTIVE' || !handoverEligibleCustomers.length"
                        @click="openBusinessHandover(row)"
                      >{{ t("customers.startBusinessHandover") }}</el-button>
                    </template>
                  </el-table-column>
                  <template #empty>
                    <el-empty :description="t('customers.noBusinessOperators')" />
                  </template>
                </el-table>
            </section>
          </div>
        </div>

        <!-- SHIPMENT MANAGEMENT -->
        <div v-else-if="menuItem === 'shipments'" key="shipments" class="workspace-view">
          <transition name="fade-slide" mode="out-in">
          <div :key="subView" class="subview-wrap">
          <!-- List view -->
          <template v-if="subView === 'list'">
            <div class="list-page list-page-full shipment-workspace">
              <div class="shipment-workspace-main">
                <header class="shipment-page-heading">
                  <div>
                    <span class="business-overview-kicker">{{ t("customers.trackingWorkspace") }}</span>
                    <h2>{{ isOverseaAgent ? t("customers.shipmentOverview") : t("customers.availableShipments") }}</h2>
                    <p>{{ t("customers.availableShipmentsHint") }}</p>
                  </div>
                  <div v-if="isManager" class="shipment-heading-actions">
                    <el-button
                      type="primary"
                      class="batch-track-primary-action"
                      :disabled="refreshingShipment"
                      @click="toggleBatchTrackPanel"
                    >
                      <el-icon><Operation /></el-icon>{{ batchTrackToolbarLabel }}
                    </el-button>
                    <el-button plain @click="shipmentCreateDialogOpen = true">
                      <el-icon><Plus /></el-icon>{{ t("customers.createShipment") }}
                    </el-button>
                    <el-button plain @click="openShipmentExcelImport">
                      <el-icon><Upload /></el-icon>{{ t("customers.shipmentExcelImport") }}
                    </el-button>
                  </div>
                </header>
                <section class="shipment-command-surface">
                  <div class="shipment-filter-bar">
                    <label v-if="isManager" class="shipment-toolbar-control">
                      <span>{{ t("customers.customerFilterLabel") }}</span>
                      <el-select
                        v-model="shipmentCustomerFilter"
                        class="business-select shipment-customer-filter"
                        popper-class="business-select-popper shipment-filter-popper"
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
                      </el-select>
                    </label>
                    <label class="shipment-toolbar-control">
                      <span>{{ t("customers.businessFilterLabel") }}</span>
                      <el-select
                        v-model="shipmentBusinessFilter"
                        class="business-select shipment-business-filter"
                        popper-class="business-select-popper shipment-filter-popper"
                      >
                        <el-option value="" :label="t('customers.businessFilterAll')" />
                        <el-option value="COMPLETED" :label="t('customers.businessCompleted')" />
                        <el-option value="UPDATE_FAILED" :label="t('customers.businessUpdateFailed')" />
                        <el-option value="MANUAL_REQUIRED" :label="t('customers.manualEntryRequired')" />
                        <el-option value="TODAY_UPDATED" :label="t('customers.todayUpdatedBusiness')" />
                        <el-option value="TODAY_PENDING" :label="t('customers.todayPendingUpdate')" />
                      </el-select>
                    </label>
                    <label class="shipment-toolbar-control">
                      <span>{{ t("customers.trackingChannel") }}</span>
                      <el-select
                        v-model="shipmentTrackingChannel"
                        class="business-select shipment-channel-select"
                        popper-class="business-select-popper shipment-filter-popper"
                        :disabled="batchTrackRunning || refreshingShipment"
                      >
                        <el-option :label="t('customers.trackingChannelAuto')" value="AUTO" />
                        <el-option :label="t('customers.trackingChannelProxy')" value="PROXY" />
                      </el-select>
                    </label>
                    <el-button @click="loadAvailableShipments" :disabled="loadingAvailableShipments">
                      <el-icon><Refresh /></el-icon>{{ t("customers.refresh") }}
                    </el-button>
                  </div>
                  <div v-if="isManager" class="shipment-bulk-bar">
                    <el-button
                      :disabled="!selectedShipmentRows.length || batchSavingBusinessFields"
                      @click="openBatchBusinessFieldsEditor"
                    >{{ t("customers.batchEditBusinessFields", { count: selectedShipmentRows.length }) }}</el-button>
                    <el-button
                      class="shipment-bulk-danger"
                      :disabled="!selectedShipmentRows.length || batchDeletingShipments"
                      @click="batchDeleteSelectedShipments"
                    >{{ t("customers.batchDeleteSelected", { count: selectedShipmentRows.length }) }}</el-button>
                    <el-button
                      :disabled="!selectedShipmentRows.length || batchTrackRunning || refreshingShipment || batchDeletingShipments"
                      @click="startRefreshSelectedShipments"
                    ><el-icon><Refresh /></el-icon>{{ t("customers.batchRefreshSelected", { count: selectedShipmentRows.length }) }}</el-button>
                    <el-button type="primary" :disabled="batchTrackRunning || refreshingShipment" @click="startRefreshAllShipments">
                      <el-icon><Refresh /></el-icon>{{ t("customers.refreshAllActive") }}
                    </el-button>
                  </div>
                </section>
                <el-table
                  ref="shipmentTableRef"
                  :data="displayedAvailableShipments"
                  row-key="shipmentId"
                  stripe
                  v-loading="loadingAvailableShipments"
                  style="width:100%"
                  class="shipment-list-table"
                  :class="{ 'is-page-switching': tablePageTransitioning }"
                  @selection-change="handleShipmentSelectionChange"
                >
                  <el-table-column v-if="isManager" type="selection" width="48" align="center" />
                  <el-table-column type="index" :index="shipmentRowIndex" :label="t('customers.index')" width="70" align="center" header-align="center" />
                  <el-table-column :label="t('customers.referenceNo')" min-width="172">
                    <template #default="{ row }">
                      <div class="shipment-reference-cell">
                        <b>{{ row.referenceNo || row.shipmentId }}</b>
                        <small class="shipment-reference-type">{{ referenceTypeLabel(row.referenceType) }}</small>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('customers.carrier')" width="98" align="center" header-align="center">
                    <template #default="{ row }">{{ row.carrier || '—' }}</template>
                  </el-table-column>
                  <el-table-column :label="t('customers.clientNoName')" min-width="150" show-overflow-tooltip>
                    <template #default="{ row }">{{ shipmentClientLabel(row) }}</template>
                  </el-table-column>
                  <el-table-column :label="t('customers.boundUsers')" min-width="260">
                    <template #default="{ row }">
                      <div v-if="shipmentBoundUsers(row).length" class="shipment-bound-user-tags">
                        <el-tag
                          v-for="user in shipmentBoundUsers(row).slice(0, 1)"
                          :key="user.id || `${user.name}-${user.role}`"
                          size="small"
                          effect="plain"
                        >{{ boundUserLabel(user) }}</el-tag>
                        <el-tooltip
                          v-if="shipmentBoundUsers(row).length > 1"
                          :content="shipmentBoundUsers(row).map(boundUserLabel).join(', ')"
                          placement="top"
                        >
                          <el-tag size="small" type="info" effect="plain">+{{ shipmentBoundUsers(row).length - 1 }}</el-tag>
                        </el-tooltip>
                      </div>
                      <span v-else>—</span>
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('customers.shipmentStatus')" min-width="205">
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
                  <el-table-column :label="t('customers.remark')" width="200">
                    <template #default="{ row }">
                      <div class="shipment-remark-cell">
                        <div class="shipment-today-tags">
                          <el-tag
                            class="shipment-today-tag"
                            :type="shipmentBusinessStateTagType(row)"
                            effect="plain"
                          >
                            {{ shipmentBusinessStateLabel(row) }}
                          </el-tag>
                          <el-tag v-if="isCreatedToday(row)" class="shipment-today-tag is-created" type="danger" effect="plain">
                            {{ t("customers.todayNewBusiness") }}
                          </el-tag>
                        </div>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('customers.lastTrackedAt')" width="164">
                    <template #default="{ row }">{{ row.lastTrackedAt ? formatDateTime(row.lastTrackedAt) : t("customers.notTrackedYet") }}</template>
                  </el-table-column>
                  <el-table-column :label="t('customers.actions')" :width="isManager ? 234 : 94" fixed="right">
                    <template #default="{ row }">
                      <div class="table-action-buttons table-action-buttons--single-line">
                        <el-button size="small" text @click.stop="trackShipmentInWorkspace(row)">{{ t("customers.view") }}</el-button>
                        <template v-if="isManager">
                          <el-button size="small" type="primary" plain @click.stop="editShipment(row)">{{ t("customers.edit") }}</el-button>
                          <el-button size="small" plain :disabled="refreshingShipment" @click.stop="updateShipmentTracking(row)">{{ t("customers.update") }}</el-button>
                          <el-button size="small" type="danger" text @click.stop="deleteShipmentRow(row)">{{ t("customers.delete") }}</el-button>
                        </template>
                      </div>
                    </template>
                  </el-table-column>
                </el-table>
                <el-pagination
                  v-if="shipmentTotal > 0"
                  class="shipment-pagination unified-pagination"
                  background
                  layout="total, sizes, prev, pager, next, jumper"
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
                width="min(1280px, 96vw)"
                append-to-body
                :destroy-on-close="false"
                class="batch-track-task-dialog"
              >
                <div class="batch-track-task-dialog-body">
                  <div class="batch-track-panel">
                    <div v-show="!batchTrackRunning" class="batch-track-form">
                      <div class="assignment-customer-row">
                        <label>
                          <span>{{ t("customers.selectCustomerFirst") }} <i class="required-star">*</i></span>
                          <el-select v-model="batchTrackCustomerId" filterable class="business-select">
                          <el-option
                            v-for="customer in assignableCustomers"
                            :key="customer.id"
                              :value="customer.id"
                            :label="customerFilterOptionLabel(customer)"
                          />
                          <template #label="{ value }">
                            <span class="business-select-value">{{ selectedCustomerOptionLabel(value) }}</span>
                          </template>
                        </el-select>
                        </label>
                        <label>
                          <span>{{ t("customers.carrier") }} <i class="required-star">*</i></span>
                          <el-select v-model="batchTrackCarrier" class="business-select" popper-class="business-select-popper">
                            <el-option value="COSCO" :label="t('customers.carrierCOSCO')" />
                            <el-option value="CMA" :label="t('customers.carrierCMA')" />
                          </el-select>
                        </label>
                        <el-checkbox v-model="batchTrackPublishToCustomer">{{ t("customers.publishAfterCreate") }}</el-checkbox>
                      </div>
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
                          <el-table
                            :data="batchTrackPreviewRows"
                            border
                            size="small"
                            class="standard-information-table batch-track-preview-table"
                          >
                            <el-table-column
                              v-for="column in batchTrackSelectedSheet.columns"
                              :key="column.index"
                              min-width="150"
                              :label="column.label"
                              :class-name="column.index === batchTrackSelectedColumnIndex ? 'selected' : ''"
                              :label-class-name="column.index === batchTrackSelectedColumnIndex ? 'selected' : ''"
                            >
                              <template #default="{ row }">{{ row[column.index] || "—" }}</template>
                            </el-table-column>
                          </el-table>
                        </div>
                      </section>
                    </div>

                    <div v-if="batchTrackRunning || batchTrackResults.length" class="batch-track-results">
                      <div class="batch-track-progress">
                        <div class="batch-track-progress-summary">
                          <span>{{ t("customers.batchTrackProgress", batchTrackProgress) }}</span>
                          <el-tag v-if="batchTrackProgress.startedAt" size="small" effect="plain" type="info" class="batch-track-timer">
                            {{ t("customers.taskElapsed", { time: batchTrackElapsedText(batchTrackProgress) }) }}
                          </el-tag>
                        </div>
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
                        :disabled="batchTrackRunning || batchTrackChecking || !batchTrackCustomerId || !batchTrackSelectedSheet || !batchTrackNumbers.length"
                        @click="startBatchTrack"
                      >
                        {{ batchTrackRunning
                          ? t("customers.batchTrackRunning")
                          : batchTrackChecking
                            ? t("customers.batchTrackChecking")
                            : t("customers.batchTrackStart") }}
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
          <label>
            <span>{{ t("customers.createAccount") }} <i class="required-star">*</i></span>
            <input v-model.trim="createForm.username" minlength="2" maxlength="64" :placeholder="t('customers.createAccountPlaceholder')" required />
            <small class="customer-field-rule">{{ t("customers.usernameRule") }}</small>
          </label>
          <label v-if="!isEditMode">
            <span>{{ t("customers.createPassword") }} <i class="required-star">*</i></span>
            <input v-model="createForm.password" type="password" minlength="8" maxlength="128" pattern="(?=.*[A-Za-z])(?=.*\d).{8,128}" autocomplete="new-password" :title="t('customers.passwordRule')" :placeholder="t('customers.customerPasswordPlaceholder')" required />
            <small class="customer-field-rule">{{ t("customers.passwordRule") }}</small>
          </label>
          <label>
            <span>{{ t("customers.clientCode") }} <i class="required-star">*</i></span>
            <input
              v-model.trim="createForm.userCode"
              minlength="6"
              :maxlength="isEditMode ? 64 : 10"
              :pattern="isEditMode ? undefined : '[A-Za-z0-9._-]{6,10}'"
              :title="t('customers.clientCodeRule')"
              :placeholder="t('customers.clientCodePlaceholder')"
              required
            />
            <small class="customer-field-rule">{{ t("customers.clientCodeRule") }}</small>
          </label>
          <label>
            <span>{{ t("customers.createPartyRole") }} <i class="required-star">*</i></span>
            <el-select v-model="createForm.partyRole" class="business-select" popper-class="business-select-popper">
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
      <section
        class="customer-code-dialog customer-batch-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="t('customers.batchImport')"
        @keydown.esc.stop.prevent
      >
        <header class="customer-batch-heading">
          <div>
            <span class="customer-code-kicker">{{ t("customers.dialogKickerProvisioning") }}</span>
            <h2>{{ t("customers.batchImport") }}</h2>
            <p>{{ t("customers.batchImportDescription") }}</p>
          </div>
          <button class="customer-template-button" type="button" @click="downloadCustomerImportTemplate">
            {{ t("customers.downloadCustomerTemplate") }}
          </button>
        </header>

        <div class="customer-batch-body">
          <section class="customer-import-rules" :aria-label="t('customers.importRulesTitle')">
            <header>
              <b>{{ t("customers.importRulesTitle") }}</b>
              <small>{{ t("customers.importRulesHint") }}</small>
            </header>
            <div>
              <article><strong>01</strong><span><b>{{ t("customers.usernameRuleTitle") }}</b><small>{{ t("customers.usernameRule") }}</small></span></article>
              <article><strong>02</strong><span><b>{{ t("customers.passwordRuleTitle") }}</b><small>{{ t("customers.passwordRule") }}</small></span></article>
              <article><strong>03</strong><span><b>{{ t("customers.clientCodeRuleTitle") }}</b><small>{{ t("customers.clientCodeRule") }}</small></span></article>
              <article><strong>04</strong><span><b>{{ t("customers.displayNameRuleTitle") }}</b><small>{{ t("customers.displayNameRule") }}</small></span></article>
              <article><strong>05</strong><span><b>{{ t("customers.roleRuleTitle") }}</b><small>{{ t("customers.roleRule") }}</small></span></article>
            </div>
          </section>

          <div class="customer-batch-tabs">
            <button type="button" :class="{ 'is-active': batchImportMode === 'quick' }" @click="selectCustomerBatchMode('quick')">{{ t("customers.quickImport") }}</button>
            <button type="button" :class="{ 'is-active': batchImportMode === 'excel' }" @click="selectCustomerBatchMode('excel')">{{ t("customers.excelImport") }}</button>
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
            class="customer-excel-dropzone customer-import-dropzone"
            :class="{ 'has-file': batchFileName, 'is-dragover': batchDropzoneActive }"
            @dragover.prevent="batchDropzoneActive = true"
            @dragleave.prevent="batchDropzoneActive = false"
            @drop.prevent="handleBatchDrop"
            @click="batchFileInput?.click()"
          >
            <input ref="batchFileInput" type="file" accept=".xlsx,.xls,.csv" @change="handleCustomerWorkbook" style="display:none" />
            <b>{{ batchFileName || t("customers.chooseExcel") }}</b>
            <small>{{ batchFileName ? t("customers.rowsReady", { count: activeCustomerBatchPreview.total }) : t("customers.excelColumnsHint") }}</small>
            <button type="button" @click.stop="batchFileInput?.click()">{{ batchFileName ? t("customers.replaceFile") : t("customers.chooseFile") }}</button>
          </div>

          <div v-if="batchPreviewError" class="customer-import-file-error" role="alert">
            <b>{{ t("customers.fileLevelError") }}</b>
            <span>{{ batchPreviewError }}</span>
          </div>
          <div
            v-for="problem in activeCustomerBatchPreview.globalErrors"
            :key="`${problem.code}-${problem.value || ''}`"
            class="customer-import-file-error"
            role="alert"
          >
            <b>{{ t("customers.fileLevelError") }}</b>
            <span>{{ customerImportIssueText(problem) }}</span>
          </div>

          <template v-if="activeCustomerBatchPreview.total">
            <div class="customer-import-summary">
              <span><b>{{ activeCustomerBatchPreview.total }}</b><small>{{ t("customers.importTotalRows") }}</small></span>
              <span class="is-valid"><b>{{ activeCustomerBatchPreview.valid }}</b><small>{{ t("customers.importValidRows") }}</small></span>
              <span class="is-invalid"><b>{{ activeCustomerBatchPreview.invalid }}</b><small>{{ t("customers.importInvalidRows") }}</small></span>
              <span class="is-warning"><b>{{ activeCustomerBatchPreview.warningCount }}</b><small>{{ t("customers.importWarningRows") }}</small></span>
            </div>

            <div class="customer-import-preview">
              <el-table
                :data="activeCustomerBatchPreview.rows"
                border
                max-height="440"
                class="standard-information-table customer-import-preview-table"
              >
                <el-table-column :label="t('customers.excelRow')" width="82">
                  <template #default="{ row }"><b>#{{ row.rowNumber }}</b></template>
                </el-table-column>
                <el-table-column :label="t('customers.createAccount')" min-width="145">
                  <template #default="{ row }"><b>{{ row.username || "—" }}</b></template>
                </el-table-column>
                <el-table-column prop="displayName" :label="t('customers.createDisplayName')" min-width="150" />
                <el-table-column :label="t('customers.initialPassword')" min-width="160">
                  <template #default="{ row }">
                    <span class="customer-import-value-pill" :class="{ 'is-generated': !row.passwordProvided }">
                      {{ row.passwordProvided ? t("customers.passwordProvided", { count: row.password.length }) : t("customers.systemGenerated") }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column :label="t('customers.clientCode')" min-width="135">
                  <template #default="{ row }">{{ row.clientCode || t("customers.systemGenerated") }}</template>
                </el-table-column>
                <el-table-column :label="t('customers.createPartyRole')" min-width="140">
                  <template #default="{ row }">{{ customerPartyRoleLabel(row.partyRole) }}</template>
                </el-table-column>
                <el-table-column :label="t('customers.validationMessage')" min-width="300">
                  <template #default="{ row }">
                    <span v-if="row.errors.length" class="customer-import-validation-pill is-error">
                      {{ t("customers.validationErrorCount", { count: row.errors.length }) }}
                    </span>
                    <span v-else-if="row.warnings.length" class="customer-import-validation-pill is-warning">
                      {{ t("customers.validationWarningCount", { count: row.warnings.length }) }}
                    </span>
                    <span v-else class="customer-import-ready">{{ t("customers.importReady") }}</span>
                    <div v-if="row.errors.length || row.warnings.length" class="customer-import-issues">
                      <span v-for="problem in row.errors" :key="`error-${problem.field}-${problem.code}`" class="is-error">
                        <b>{{ customerImportFieldLabel(problem.field) }}</b>{{ customerImportIssueText(problem) }}
                      </span>
                      <span v-for="problem in row.warnings" :key="`warning-${problem.field}-${problem.code}`" class="is-warning">
                        <b>{{ customerImportFieldLabel(problem.field) }}</b>{{ customerImportIssueText(problem) }}
                      </span>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </template>
        </div>

        <footer class="customer-dialog-actions customer-batch-actions">
          <small v-if="activeCustomerBatchPreview.invalid">{{ t("customers.fixInvalidRowsBeforeImport") }}</small>
          <button type="button" @click="closeBatchImport">{{ t("customers.cancel") }}</button>
          <button
            class="customer-access-primary"
            type="button"
            :disabled="!canSubmitCustomerBatchImport"
            @click="submitBatchImport"
          >
            {{ importingCustomers
              ? t("customers.importing")
              : t("customers.confirmImportCount", { count: activeCustomerBatchPreview.valid }) }}
          </button>
        </footer>
      </section>
    </div>

    <div v-if="transferDialogOpen" class="customer-code-overlay" role="presentation" @click.self="closeCustomerTransfer">
      <section class="customer-code-dialog customer-transfer-dialog" role="dialog" aria-modal="true" :aria-label="t('customers.transferTitle')">
        <span class="customer-code-kicker">OVERSEA AGENT ASSIGNMENT</span>
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
                :value="String(agent.id)"
                :label="`${agent.displayName} (@${agent.username})`"
              />
              <template #label="{ value }">
                <span class="business-select-value">{{ selectedAgentOptionLabel(value) }}</span>
              </template>
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

    <el-dialog
      v-model="businessHandoverDialogOpen"
      :title="t('customers.businessHandoverDialogTitle')"
      width="min(620px, 92vw)"
      append-to-body
      class="business-handover-dialog"
      @closed="resetBusinessHandoverForm"
    >
      <div class="handover-target-summary">
        <span class="handover-agent-avatar">{{ (businessHandoverTarget?.displayName || "?").slice(0, 1).toUpperCase() }}</span>
        <span>
          <small>{{ t("customers.handoverTargetBusinessOperator") }}</small>
          <b>{{ businessHandoverTarget?.displayName }} (@{{ businessHandoverTarget?.username }})</b>
        </span>
      </div>
      <el-form label-position="top">
        <el-form-item :label="t('customers.handoverCustomers')">
          <el-select
            v-model="businessHandoverForm.customerIds"
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
        <el-button :disabled="submittingBusinessHandover" @click="businessHandoverDialogOpen = false">
          {{ t("customers.cancel") }}
        </el-button>
        <el-button
          type="primary"
          :loading="submittingBusinessHandover"
          :disabled="!businessHandoverForm.customerIds.length || !businessHandoverForm.reason.trim()"
          @click="submitBusinessHandover"
        >{{ t("customers.confirmBusinessHandover") }}</el-button>
      </template>
    </el-dialog>

    <div v-if="batchCredentialRows.length" class="customer-code-overlay" role="presentation">
      <section
        class="customer-code-dialog customer-credential-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="t('customers.batchCredentialTitle')"
        @keydown.esc.stop.prevent
      >
        <header class="customer-batch-heading">
          <div>
            <span class="customer-code-kicker">{{ t("customers.dialogKickerCredentialExport") }}</span>
            <h2>{{ t("customers.batchCredentialTitle") }}</h2>
            <p>{{ t("customers.batchCredentialDescription") }}</p>
          </div>
          <button type="button" :disabled="exportingCredentials" class="customer-template-button" @click="downloadCredentialWorkbook">
            {{ exportingCredentials ? t("customers.preparingExport") : t("customers.exportCredentials") }}
          </button>
        </header>

        <div class="customer-credential-body">
          <div class="customer-import-summary">
            <span><b>{{ batchCredentialSummary.total }}</b><small>{{ t("customers.importTotalRows") }}</small></span>
            <span class="is-valid"><b>{{ batchCredentialSummary.created }}</b><small>{{ t("customers.importCreatedCount") }}</small></span>
            <span class="is-invalid"><b>{{ batchCredentialSummary.failed }}</b><small>{{ t("customers.importFailedCount") }}</small></span>
          </div>
          <div v-if="batchCredentialSummary.failed" class="customer-import-file-error">
            <b>{{ t("customers.importFailureExplanation") }}</b>
            <span>{{ t("customers.importFailureHint") }}</span>
          </div>
          <div class="customer-credential-table">
            <div class="customer-credential-table-head">
              <span>{{ t("customers.excelRow") }}</span>
              <span>{{ t("customers.createAccount") }}</span>
              <span>{{ t("customers.createDisplayName") }}</span>
              <span>{{ t("customers.clientCode") }}</span>
              <span>{{ t("customers.initialPassword") }}</span>
              <span>{{ t("customers.importStatus") }}</span>
            </div>
            <div
              v-for="row in batchCredentialRows"
              :key="`${row.rowNumber}-${row.username}`"
              class="customer-credential-entry"
              :class="{ 'is-failed': row.status !== 'CREATED' }"
            >
              <div class="customer-credential-row">
                <span><b>#{{ row.rowNumber }}</b></span>
                <span><b>{{ row.username || '—' }}</b></span>
                <span>{{ row.displayName || row.username || '—' }}</span>
                <span>{{ row.customerCode || row.clientCode || '—' }}</span>
                <span class="customer-credential-password">{{ row.password || '—' }}</span>
                <span><i :class="row.status === 'CREATED' ? 'is-created' : 'is-failed'">{{ row.status === 'CREATED' ? t("customers.importCreated") : t("customers.importFailedStatus") }}</i></span>
              </div>
              <div v-if="row.status !== 'CREATED'" class="customer-credential-message">
                <b>{{ t("customers.failureReason") }}</b>
                <span>{{ localizeCustomerImportResult(row.message) }}</span>
              </div>
            </div>
          </div>
        </div>
        <footer class="customer-dialog-actions customer-batch-actions">
          <small>{{ t("customers.credentialsSaveReminder") }}</small>
          <button class="customer-access-primary" type="button" @click="closeBatchCredentials">{{ t("customers.confirmStored") }}</button>
        </footer>
      </section>
    </div>

    <div v-if="clientCodeDialogOpen" class="customer-code-overlay" role="presentation" @click.self="clientCodeDialogOpen = false">
      <section class="customer-code-dialog customer-supplement-dialog" role="dialog" aria-modal="true" :aria-label="t('customers.manualSupplement')">
        <span class="customer-code-kicker">BUSINESS MATCHING KEY</span>
        <h2>{{ t("customers.supplementClientCode") }}</h2>
        <p>{{ t("customers.supplementClientCodeHint") }}</p>
        <form class="customer-dialog-form" @submit.prevent="saveClientCodeSupplement">
          <label>
            <span>{{ t("customers.clientCode") }}</span>
            <input
              v-model.trim="clientCodeSupplement"
              minlength="6"
              maxlength="10"
              pattern="[A-Za-z0-9._-]{6,10}"
              :title="t('customers.clientCodeRule')"
              :placeholder="t('customers.clientCodePlaceholder')"
              required
            />
            <small class="customer-field-rule">{{ t("customers.clientCodeRule") }}</small>
          </label>
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
          <div class="password-rule-preview">
            <span>{{ t("customers.defaultPasswordRule") }}</span>
            <code>{{ selectedCustomer?.username }}!@#2026</code>
          </div>
          <div class="customer-dialog-actions">
            <button type="button" @click="closeResetPasswordDialog">{{ t("customers.cancel") }}</button>
            <button class="customer-access-primary" type="submit" :disabled="mutatingCustomer">{{ t("customers.confirmResetPassword") }}</button>
          </div>
        </form>
      </section>
    </div>

    <div v-if="passwordResetResult.open" class="customer-code-overlay" role="presentation" @click.self="closePasswordResetResult">
      <section class="customer-code-dialog password-result-dialog" role="dialog" aria-modal="true" :aria-label="t('customers.passwordResetResultTitle')">
        <span class="customer-code-kicker">{{ t("customers.dialogKickerSecureReset") }}</span>
        <h2>{{ t("customers.passwordResetResultTitle") }}</h2>
        <p>{{ t("customers.passwordResetResultHint") }}</p>
        <dl class="password-result-grid">
          <div><dt>{{ t("customers.username") }}</dt><dd>{{ passwordResetResult.username }}</dd></div>
          <div><dt>{{ t("customers.newPassword") }}</dt><dd><code>{{ passwordResetResult.password }}</code></dd></div>
        </dl>
        <div class="customer-dialog-actions">
          <button type="button" @click="copyPasswordResetResult">
            {{ passwordResetResult.copied ? t("customers.copied") : t("customers.copyCredentials") }}
          </button>
          <button class="customer-access-primary" type="button" @click="closePasswordResetResult">{{ t("customers.close") }}</button>
        </div>
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
              <span><b>00</b><strong>{{ t("customers.selectCustomerFirst") }}</strong></span>
              <small>{{ t("customers.manualRequiredSection") }}</small>
            </header>
            <div class="assignment-customer-row">
              <label>
                <span>{{ t("customers.customer") }} <i class="required-star">*</i></span>
                <el-select v-model="shipmentCreateCustomerId" filterable class="business-select">
                  <el-option
                    v-for="customer in assignableCustomers"
                    :key="customer.id"
                    :value="customer.id"
                    :label="customerFilterOptionLabel(customer)"
                  />
                  <template #label="{ value }">
                    <span class="business-select-value">{{ selectedCustomerOptionLabel(value) }}</span>
                  </template>
                </el-select>
              </label>
              <el-checkbox v-model="shipmentCreatePublishToCustomer">{{ t("customers.publishAfterCreate") }}</el-checkbox>
            </div>
          </section>

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

    <div
      v-if="shipmentExcelImportDialogOpen"
      class="customer-code-overlay"
      role="presentation"
      @click.self="closeShipmentExcelImport"
      @keydown.esc.stop.prevent="closeShipmentExcelImport"
    >
      <section
        class="customer-code-dialog shipment-excel-import-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="t('customers.shipmentExcelImport')"
      >
        <div class="shipment-excel-import-heading">
          <div>
            <span class="customer-code-kicker">{{ t("customers.dialogKickerShipmentExcelImport") }}</span>
            <h2>{{ t("customers.shipmentExcelImport") }}</h2>
            <p>{{ t("customers.shipmentExcelImportDescription") }}</p>
          </div>
          <div class="shipment-excel-import-heading-actions">
            <button type="button" class="manual-add-button" @click="downloadShipmentExcelTemplate">
              {{ t("customers.downloadShipmentExcelTemplate") }}
            </button>
            <button
              type="button"
              class="shipment-excel-close-button"
              :aria-label="t('customers.close')"
              :disabled="shipmentExcelImporting"
              @click="closeShipmentExcelImport"
            >
              <el-icon><Close /></el-icon>
            </button>
          </div>
        </div>

        <div class="shipment-excel-import-body">
          <div class="assignment-customer-row shipment-excel-customer-row">
            <label>
              <span>{{ t("customers.selectCustomerFirst") }} <i class="required-star">*</i></span>
              <el-select v-model="shipmentExcelCustomerId" filterable class="business-select">
                <el-option
                  v-for="customer in assignableCustomers"
                  :key="customer.id"
                  :value="customer.id"
                  :label="customerFilterOptionLabel(customer)"
                />
                <template #label="{ value }">
                  <span class="business-select-value">{{ selectedCustomerOptionLabel(value) }}</span>
                </template>
              </el-select>
            </label>
            <el-checkbox v-model="shipmentExcelPublishToCustomer">{{ t("customers.publishAfterCreate") }}</el-checkbox>
          </div>
          <div
            v-loading="shipmentExcelImportParsing"
            :element-loading-text="t('app.loadingPage')"
            class="customer-excel-dropzone shipment-excel-import-dropzone"
            :class="{
              'has-file': shipmentExcelImportFileName,
              'is-dragover': shipmentExcelImportDropzoneActive
            }"
            @dragover.prevent="shipmentExcelImportDropzoneActive = true"
            @dragleave.prevent="shipmentExcelImportDropzoneActive = false"
            @drop.prevent="handleShipmentExcelImportDrop"
            @click="shipmentExcelImportFileInput?.click()"
          >
            <input
              ref="shipmentExcelImportFileInput"
              type="file"
              accept=".xlsx,.xls"
              style="display:none"
              @change="handleShipmentExcelImportWorkbook"
            />
            <el-icon class="shipment-excel-upload-icon"><Upload /></el-icon>
            <b>{{ shipmentExcelImportFileName || t("customers.chooseShipmentExcel") }}</b>
            <small>{{ shipmentExcelImportFileName
              ? t("customers.shipmentExcelRowsReady", { count: shipmentExcelImportPreview.total })
              : t("customers.shipmentExcelSheetsHint") }}</small>
            <button type="button" @click.stop="shipmentExcelImportFileInput?.click()">
              {{ shipmentExcelImportFileName ? t("customers.replaceFile") : t("customers.chooseFile") }}
            </button>
          </div>

          <div v-if="shipmentExcelImportFileName" class="shipment-excel-import-summary">
            <span><b>{{ shipmentExcelImportPreview.total }}</b><small>{{ t("customers.shipmentExcelTotal") }}</small></span>
            <span class="is-valid"><b>{{ shipmentExcelImportPreview.valid }}</b><small>{{ t("customers.shipmentExcelValid") }}</small></span>
            <span :class="{ 'is-invalid': shipmentExcelImportPreview.invalid }"><b>{{ shipmentExcelImportPreview.invalid }}</b><small>{{ t("customers.shipmentExcelInvalid") }}</small></span>
            <span :class="{ 'has-warning': shipmentExcelImportPreview.warningCount }"><b>{{ shipmentExcelImportPreview.warningCount }}</b><small>{{ t("customers.shipmentExcelWarnings") }}</small></span>
          </div>

          <div v-if="shipmentExcelImportPreview.globalErrors.length" class="shipment-excel-import-errors">
            <b>{{ t("customers.shipmentExcelWorkbookErrors") }}</b>
            <ul>
              <li v-for="error in shipmentExcelImportPreview.globalErrors" :key="error">{{ error }}</li>
            </ul>
          </div>

          <div v-if="shipmentExcelImportPreview.rows.length" class="shipment-excel-import-table-wrap">
            <el-table
              :data="shipmentExcelImportPreview.rows"
              max-height="440"
              class="standard-information-table shipment-excel-import-table"
              :row-class-name="shipmentExcelRowClassName"
            >
              <el-table-column prop="rowNumber" :label="t('customers.excelRow')" width="82" />
              <el-table-column :label="t('customers.importKey')" min-width="150">
                <template #default="{ row }"><b>{{ row.importKey || "—" }}</b></template>
              </el-table-column>
              <el-table-column prop="carrier" :label="t('customers.carrier')" width="110" />
              <el-table-column prop="referenceType" :label="t('customers.referenceType')" min-width="135" />
              <el-table-column prop="referenceNo" :label="t('customers.referenceNo')" min-width="155" />
              <el-table-column :label="t('customers.importStatus')" width="120">
                <template #default="{ row }">
                  <span :class="row.errors.length ? 'import-state-error' : 'import-state-ready'">
                    {{ row.errors.length ? t("customers.importNeedsFix") : t("customers.importReady") }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column :label="t('customers.validationMessage')" min-width="300">
                <template #default="{ row }">
                  <div v-if="row.errors.length" class="shipment-excel-validation-list is-error">
                    <span v-for="(message, index) in row.errors" :key="`${row.rowNumber}-error-${index}`">{{ message }}</span>
                  </div>
                  <div v-else-if="row.warnings.length" class="shipment-excel-validation-list is-warning">
                    <span v-for="(message, index) in row.warnings" :key="`${row.rowNumber}-warning-${index}`">{{ message }}</span>
                  </div>
                  <span v-else class="shipment-excel-validation-empty">—</span>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <section v-if="shipmentExcelImporting || shipmentExcelImportResults.length" class="shipment-excel-import-progress">
            <div>
              <b>{{ t("customers.shipmentExcelImportProgress", shipmentExcelImportProgress) }}</b>
              <el-progress
                :percentage="shipmentExcelImportProgress.total
                  ? Math.round(shipmentExcelImportProgress.done / shipmentExcelImportProgress.total * 100)
                  : 0"
                :stroke-width="7"
              />
            </div>
            <div v-if="shipmentExcelImportResults.length" class="shipment-excel-import-result-list">
              <span
                v-for="result in shipmentExcelImportResults"
                :key="result.importKey"
                :class="result.status === 'CREATED'
                  ? 'is-created'
                  : result.status === 'UPDATED'
                    ? 'is-updated'
                    : result.status === 'FAILED'
                      ? 'is-failed'
                      : 'is-pending'"
              >
                <b>{{ result.referenceNo || result.importKey }}</b>
                <small>{{ result.message }}</small>
              </span>
            </div>
          </section>
        </div>

        <div class="customer-dialog-actions shipment-excel-import-actions">
          <button
            v-if="shipmentExcelImportResults.length"
            type="button"
            :disabled="shipmentExcelImporting"
            @click="downloadShipmentExcelImportResults"
          >{{ t("customers.downloadImportResults") }}</button>
          <button type="button" :disabled="shipmentExcelImporting" @click="closeShipmentExcelImport">
            {{ t("customers.cancel") }}
          </button>
          <button
            class="customer-access-primary"
            type="button"
            :disabled="!canStartShipmentExcelImport"
            @click="startShipmentExcelImport"
          >
            {{ shipmentExcelImporting
              ? t("customers.importing")
              : t("customers.importValidShipments", { count: shipmentExcelImportPreview.valid }) }}
          </button>
        </div>
      </section>
    </div>

    <el-dialog
      v-model="agentCreateDialogOpen"
      :title="t('customers.createOverseaAgentTitle')"
      width="640px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      class="square-dialog agent-create-dialog"
    >
      <div class="agent-create-intro">
        <span><el-icon><UserFilled /></el-icon></span>
        <div>
          <b>{{ t("customers.createOverseaAgentTitle") }}</b>
          <small>{{ t("customers.createOverseaAgentHint") }}</small>
        </div>
      </div>
      <el-form class="agent-create-form" label-position="top" @submit.prevent="submitAgentCreate">
        <el-form-item :label="t('customers.username')" required>
          <el-input
            v-model.trim="agentCreateForm.username"
            autocomplete="off"
            maxlength="64"
            show-word-limit
            :placeholder="t('customers.agentUsernamePlaceholder')"
          />
          <small class="agent-field-hint">{{ t("customers.agentUsernameRule") }}</small>
        </el-form-item>
        <el-form-item :label="t('customers.displayName')" required>
          <el-input
            v-model.trim="agentCreateForm.displayName"
            maxlength="80"
            show-word-limit
            :placeholder="t('customers.agentDisplayNamePlaceholder')"
          />
          <small class="agent-field-hint">{{ t("customers.agentDisplayNameRule") }}</small>
        </el-form-item>
        <el-form-item :label="t('customers.initialPassword')" required class="agent-password-field">
          <el-input
            v-model="agentCreateForm.password"
            type="password"
            show-password
            maxlength="128"
            autocomplete="new-password"
            :placeholder="t('customers.agentPasswordPlaceholder')"
          />
          <div class="agent-password-rules">
            <span v-for="rule in agentPasswordChecks" :key="rule.key" :class="{ 'is-valid': rule.valid }">
              <i>{{ rule.valid ? "✓" : "•" }}</i>{{ rule.label }}
            </span>
          </div>
        </el-form-item>
        <el-alert v-if="agentCreateError" :title="agentCreateError" type="error" :closable="false" show-icon />
      </el-form>
      <template #footer>
        <el-button :disabled="creatingAgent" @click="agentCreateDialogOpen = false">{{ t("customers.cancel") }}</el-button>
        <el-button type="primary" :loading="creatingAgent" :disabled="!canCreateAgent" @click="submitAgentCreate">
          {{ t("customers.createOverseaAgent") }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="agentBatchDialogOpen"
      :title="t('customers.batchCreateAgents')"
      width="min(940px, 94vw)"
      :close-on-click-modal="false"
      :close-on-press-escape="!importingAgents"
      class="square-dialog agent-batch-dialog"
    >
      <div class="agent-batch-intro">
        <div>
          <span class="customer-code-kicker">{{ t("customers.agentBatchKicker") }}</span>
          <h3>{{ t("customers.agentBatchTitle") }}</h3>
          <p>{{ t("customers.agentBatchHint") }}</p>
        </div>
        <el-button type="primary" plain @click="downloadAgentImportTemplate">
          <el-icon><Document /></el-icon>{{ t("customers.downloadAgentTemplate") }}
        </el-button>
      </div>
      <div
        v-loading="parsingAgentFile"
        class="agent-import-dropzone"
        :class="{ 'has-file': agentBatchFileName, 'is-dragover': agentBatchDropzoneActive }"
        @dragover.prevent="agentBatchDropzoneActive = true"
        @dragleave.prevent="agentBatchDropzoneActive = false"
        @drop.prevent="handleAgentBatchDrop"
        @click="agentBatchFileInput?.click()"
      >
        <input ref="agentBatchFileInput" type="file" accept=".xlsx,.xls,.csv" @change="handleAgentWorkbook" />
        <span><el-icon><Upload /></el-icon></span>
        <b>{{ agentBatchFileName || t("customers.chooseAgentExcel") }}</b>
        <small>{{ t("customers.agentExcelColumns") }}</small>
        <el-button size="small" @click.stop="agentBatchFileInput?.click()">
          {{ agentBatchFileName ? t("customers.replaceFile") : t("customers.chooseFile") }}
        </el-button>
      </div>
      <div v-if="agentBatchRows.length" class="agent-batch-summary">
        <span><b>{{ agentBatchRows.length }}</b><small>{{ t("customers.importTotalRows") }}</small></span>
        <span class="is-valid"><b>{{ agentBatchReadyCount }}</b><small>{{ t("customers.importValidRows") }}</small></span>
        <span class="is-invalid"><b>{{ agentBatchInvalidCount }}</b><small>{{ t("customers.importInvalidRows") }}</small></span>
        <span class="is-created"><b>{{ agentBatchCreatedCount }}</b><small>{{ t("customers.importCreatedCount") }}</small></span>
      </div>
      <el-table
        v-if="agentBatchRows.length"
        :data="agentBatchRows"
        max-height="360"
        stripe
        border
        class="standard-information-table agent-batch-preview"
        :row-class-name="agentBatchRowClass"
      >
        <el-table-column prop="rowNumber" :label="t('customers.excelRow')" width="78" />
        <el-table-column prop="username" :label="t('customers.username')" min-width="150" show-overflow-tooltip />
        <el-table-column prop="displayName" :label="t('customers.displayName')" min-width="160" show-overflow-tooltip />
        <el-table-column :label="t('customers.initialPassword')" min-width="155">
          <template #default="{ row }"><span class="agent-password-mask">{{ "•".repeat(Math.min(row.password.length, 12)) }}</span></template>
        </el-table-column>
        <el-table-column :label="t('customers.validationMessage')" min-width="280">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'CREATED'" size="small" type="success">{{ t("customers.importCreatedCount") }}</el-tag>
            <el-tag v-else-if="row.status === 'FAILED'" size="small" type="danger">{{ row.resultMessage }}</el-tag>
            <div v-else-if="row.errors.length" class="agent-row-errors">
              <span v-for="error in row.errors" :key="error">{{ error }}</span>
            </div>
            <el-tag v-else size="small" type="success" effect="plain">{{ t("customers.importReady") }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-alert
        v-if="agentBatchError"
        :title="agentBatchError"
        type="error"
        :closable="false"
        show-icon
      />
      <template #footer>
        <el-button :disabled="importingAgents" @click="closeAgentBatchImport">{{ t("customers.cancel") }}</el-button>
        <el-button
          type="primary"
          :loading="importingAgents"
          :disabled="!agentBatchReadyCount || agentBatchInvalidCount > 0"
          @click="submitAgentBatchImport"
        >
          {{ importingAgents ? t("customers.importing") : t("customers.importAgentsCount", { count: agentBatchReadyCount }) }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="personalProfileOpen"
      class="operations-profile-dialog"
      :title="t('portal.personalInfoTitle')"
      width="min(860px, 94vw)"
      :close-on-click-modal="false"
    >
      <div class="operations-profile-hero">
        <span class="operations-profile-avatar">{{ displayName.slice(0, 1).toUpperCase() }}</span>
        <div>
          <b>{{ displayName }}</b>
          <small>@{{ currentUser?.username }} · {{ personalRoleLabel }}</small>
        </div>
        <el-tag type="success" effect="light">{{ t("portal.accountActive") }}</el-tag>
      </div>
      <div class="operations-profile-layout">
        <section class="operations-profile-section">
          <header>
            <b>{{ t("portal.basicProfile") }}</b>
            <small>{{ t("portal.basicProfileHint") }}</small>
          </header>
          <el-form class="operations-profile-form" label-position="top" @submit.prevent="savePersonalProfile">
            <el-form-item :label="t('portal.accountUsername')">
              <el-input :model-value="currentUser?.username" disabled />
            </el-form-item>
            <el-form-item :label="t('portal.accountRole')">
              <el-input :model-value="personalRoleLabel" disabled />
            </el-form-item>
            <el-form-item :label="t('portal.displayName')" required>
              <el-input v-model.trim="personalProfileForm.displayName" maxlength="80" show-word-limit />
            </el-form-item>
            <el-alert v-if="personalProfileError" :title="personalProfileError" type="error" :closable="false" show-icon />
            <el-button type="primary" :loading="personalProfileSaving" @click="savePersonalProfile">
              {{ t("portal.saveProfile") }}
            </el-button>
          </el-form>
        </section>
        <section class="operations-profile-section is-security">
          <header>
            <b>{{ t("portal.accountSecurity") }}</b>
            <small>{{ t("portal.accountSecurityHint") }}</small>
          </header>
          <el-form class="operations-password-form" label-position="top" @submit.prevent="savePersonalPassword">
            <el-form-item :label="t('portal.currentPassword')" required>
              <el-input v-model="personalPasswordForm.currentPassword" type="password" show-password autocomplete="current-password" />
            </el-form-item>
            <el-form-item :label="t('portal.newPassword')" required>
              <el-input v-model="personalPasswordForm.newPassword" type="password" show-password autocomplete="new-password" />
            </el-form-item>
            <el-form-item :label="t('portal.confirmNewPassword')" required>
              <el-input v-model="personalPasswordForm.confirmPassword" type="password" show-password autocomplete="new-password" />
            </el-form-item>
            <small class="operations-password-rule">{{ t("portal.passwordRule") }}</small>
            <el-alert v-if="personalPasswordError" :title="personalPasswordError" type="error" :closable="false" show-icon />
            <el-alert v-if="personalPasswordSuccess" :title="personalPasswordSuccess" type="success" :closable="false" show-icon />
            <el-button type="primary" plain :loading="personalPasswordSaving" @click="savePersonalPassword">
              {{ t("portal.changePassword") }}
            </el-button>
          </el-form>
        </section>
      </div>
      <template #footer>
        <el-button :disabled="personalProfileSaving || personalPasswordSaving" @click="personalProfileOpen = false">
          {{ t("customers.close") }}
        </el-button>
      </template>
    </el-dialog>

    <div v-if="toastMessage" class="customer-toast" role="status">{{ toastMessage }}</div>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { init as initEChart, use as useECharts } from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import LanguageSwitcher from "./LanguageSwitcher.vue";
import { currentLocale } from "../i18n";
import {
  batchUpdateBusinessShipmentFields,
  batchBindBusinessCustomerShipments,
  batchCreateOverseaAgentEmployees,
  batchDeleteBusinessShipments,
  bindBusinessCustomerShipment,
  batchCreateBusinessCustomers,
  cancelShipmentBatchTask,
  createBusinessCustomer,
  createOverseaAgentEmployee,
  createBusinessShipment,
  createShipmentBatchRefreshTask,
  createShipmentBatchTask,
  createShipmentRefreshAllTask,
  deleteBusinessCustomer,
  deleteOverseaAgent,
  deleteBusinessShipment,
  fetchAvailableBusinessShipments,
  fetchBusinessDashboardTodayStats,
  fetchBusinessHandoverAgents,
  fetchBusinessHandoverRequests,
  fetchBusinessCustomers,
  fetchBusinessCustomerShipments,
  fetchBusinessShipmentSnapshot,
  fetchCustomerTransferAgents,
  fetchOverseaAgentLinkedCustomers,
  fetchShipmentBatchTask,
  handoverBusinessCustomers,
  invalidateBusinessShipmentSnapshot,
  inspectBusinessShipmentImportConflicts,
  resetBusinessCustomerPassword,
  resetOverseaAgentPassword,
  setBusinessShipmentPublication,
  transferBusinessCustomers,
  unbindBusinessCustomerShipment,
  updateBusinessCustomer,
  updateOverseaAgent,
  updateOverseaAgentLinkedCustomers,
  updateBusinessShipment,
  updateBusinessShipmentManualSnapshot
} from "../services/businessCustomerApi";
import { buildShipmentBatchItems, parseShipmentBatchWorkbook } from "../services/shipmentBatchImport";
import {
  buildManualShipmentImportResultWorkbook,
  buildManualShipmentImportTemplate,
  parseManualShipmentImportWorkbook
} from "../services/manualShipmentExcelImport";
import {
  buildCustomerImportTemplate,
  parseCustomerImportWorkbook,
  validateCustomerImportRows
} from "../services/customerExcelImport";
import { changeOwnPassword, updateOwnProfile } from "../services/adminApi";
import { saveStoredUser, storedToken } from "../services/authSession";
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
  Operation,
  DataBoard,
  ArrowRight,
  Bell,
  ChatDotRound,
  CirclePlusFilled,
  Close,
  FolderOpened,
  RefreshRight
} from "@element-plus/icons-vue";

useECharts([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer
]);

const props = defineProps({
  currentUser: { type: Object, default: null },
  announcementCount: { type: Number, default: 0 }
});
const emit = defineEmits(["logout", "user-updated", "open-announcements"]);
const { t } = useI18n();
const isManager = computed(() => ["BUSINESS", "ADMIN"].includes(props.currentUser?.role));
const isOverseaAgent = computed(() => props.currentUser?.role === "OVERSEA_AGENT");
const canRequestBusinessHandover = computed(() => props.currentUser?.role === "BUSINESS");
const roleHomePath = computed(() => isOverseaAgent.value ? "/customers" : "/workbenches");
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
const customerPage = ref(1);
const customerPageSize = ref(10);
const agentPage = ref(1);
const agentPageSize = ref(10);
const selectedCustomerId = ref("");
const shipments = ref([]);
const availableShipments = ref([]);
const loadingCustomers = ref(false);
const loadingAvailableShipments = ref(false);
const customersLoaded = ref(false);
const shipmentsLoaded = ref(false);
const transferAgentsLoaded = ref(false);
const handoverAgentsLoaded = ref(false);
const tablePageTransitioning = ref(false);
const accountMenuOpen = ref(false);
const personalProfileOpen = ref(false);
const personalProfileSaving = ref(false);
const personalProfileError = ref("");
const personalProfileForm = reactive({ displayName: "" });
const personalPasswordSaving = ref(false);
const personalPasswordError = ref("");
const personalPasswordSuccess = ref("");
const personalPasswordForm = reactive({ currentPassword: "", newPassword: "", confirmPassword: "" });
const createDialogOpen = ref(false);
const agentCreateDialogOpen = ref(false);
const creatingAgent = ref(false);
const agentCreateError = ref("");
const agentBatchDialogOpen = ref(false);
const agentBatchFileInput = ref(null);
const agentBatchFileName = ref("");
const agentBatchDropzoneActive = ref(false);
const parsingAgentFile = ref(false);
const importingAgents = ref(false);
const agentBatchRows = ref([]);
const agentBatchError = ref("");
const businessHandoverAgents = ref([]);
const loadingBusinessHandoverAgents = ref(false);
const businessHandoverRequests = ref([]);
const loadingBusinessHandoverRequests = ref(false);
const businessHandoverRequestStatus = ref("");
const businessHandoverRequestPage = ref(0);
const businessHandoverRequestPageSize = ref(10);
const businessHandoverRequestTotal = ref(0);
const businessHandoverDialogOpen = ref(false);
const businessHandoverTarget = ref(null);
const submittingBusinessHandover = ref(false);
const businessHandoverForm = reactive({ customerIds: [], reason: "" });
const overviewShipments = ref([]);
const overviewShipmentTotal = ref(0);
const overviewTodayStats = ref(null);
const loadingOverviewMetrics = ref(false);
const overviewMetricsError = ref("");
const overviewTrendChartRef = ref(null);
const overviewTodayChartRef = ref(null);
const overviewResourcesChartRef = ref(null);
const overviewStatusChartRef = ref(null);
const prefersReducedMotion = ref(false);
const overviewChartInstances = {
  trend: null,
  today: null,
  resources: null,
  status: null
};
let overviewChartResizeObserver = null;
let overviewMotionQuery = null;
let overviewMotionPreferenceHandler = null;
const batchImportDialogOpen = ref(false);
const batchImportMode = ref("quick");
const quickImportText = ref("");
const batchFileName = ref("");
const customerBatchPreview = ref(emptyCustomerBatchPreview());
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
const passwordResetResult = reactive({
  open: false,
  username: "",
  password: "",
  copied: false
});
const shipmentCreateDialogOpen = ref(false);
const shipmentExcelImportDialogOpen = ref(false);
const shipmentExcelImportFileInput = ref(null);
const shipmentExcelImportFileName = ref("");
const shipmentExcelImportDropzoneActive = ref(false);
const shipmentExcelImportParsing = ref(false);
const shipmentExcelImporting = ref(false);
const shipmentExcelImportPreview = ref(emptyShipmentExcelImportPreview());
const shipmentExcelImportResults = ref([]);
const shipmentExcelImportProgress = ref({ total: 0, done: 0, succeeded: 0, failed: 0 });
const detailShipmentSnapshot = ref(null);
const loadingShipmentDetail = ref(false);
const savingShipment = ref(false);
const creatingShipment = ref(false);
const deletingShipment = ref(false);

const quickCustomerBatchPreview = computed(() =>
  validateCustomerImportRows(quickImportSourceRows())
);
const activeCustomerBatchPreview = computed(() =>
  batchImportMode.value === "quick"
    ? quickCustomerBatchPreview.value
    : customerBatchPreview.value
);
const canSubmitCustomerBatchImport = computed(() => {
  const preview = activeCustomerBatchPreview.value;
  return !importingCustomers.value
    && preview.valid > 0
    && preview.invalid === 0
    && preview.globalErrors.length === 0;
});
const batchCredentialSummary = computed(() => {
  const rows = batchCredentialRows.value;
  return {
    total: rows.length,
    created: rows.filter((row) => row.status === "CREATED").length,
    failed: rows.filter((row) => row.status !== "CREATED").length
  };
});
const refreshingShipment = ref(false);
const batchTrackDialogOpen = ref(false);
const batchTrackDropzoneActive = ref(false);
const batchTrackFileParsing = ref(false);
const batchTrackText = ref("");
const batchTrackCarrier = ref("COSCO");
const batchTrackRunning = ref(false);
const batchTrackChecking = ref(false);
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
const batchTrackCustomerId = ref("");
const batchTrackPublishToCustomer = ref(true);
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
const shipmentBusinessFilter = ref("");
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
const agentCreateForm = reactive({ username: "", displayName: "", password: "" });
const isEditMode = ref(false);
const editingCustomerId = ref("");
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
const shipmentCreateCustomerId = ref("");
const shipmentCreatePublishToCustomer = ref(true);
const shipmentExcelCustomerId = ref("");
const shipmentExcelPublishToCustomer = ref(true);
const detailForm = reactive({ referenceType: "BOOKING", referenceNo: "", trackingStatus: "", note: "", ...emptyManualShipmentFields() });
let shipmentRequestSequence = 0;
let shipmentListRequestSequence = 0;
let toastTimer = 0;

const menuItem = ref(isManager.value ? "overview" : "customers");
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
  buildShipmentBatchItems(
    batchTrackSelectedSheet.value,
    batchTrackSelectedColumnIndex.value,
    batchTrackCarrier.value
  )
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
const personalRoleLabel = computed(() => t({
  ADMIN: "portal.roleAdmin",
  BUSINESS: "portal.roleBusiness",
  OVERSEA_AGENT: "portal.roleOverseaAgent"
}[props.currentUser?.role] || "portal.roleEmployee"));
const agentPasswordChecks = computed(() => {
  const password = agentCreateForm.password;
  return [
    { key: "length", valid: password.length >= 8 && password.length <= 128, label: t("customers.agentPasswordLength") },
    { key: "letter", valid: /[A-Za-z]/.test(password), label: t("customers.agentPasswordCase") },
    { key: "number", valid: /\d/.test(password), label: t("customers.agentPasswordNumber") }
  ];
});
const canCreateAgent = computed(() =>
  isValidAgentUsername(agentCreateForm.username)
  && isValidAgentDisplayName(agentCreateForm.displayName)
  && isStrongAgentPassword(agentCreateForm.password, agentCreateForm.username)
);
const agentBatchReadyCount = computed(() =>
  agentBatchRows.value.filter((row) => row.status === "READY" && row.errors.length === 0).length
);
const agentBatchInvalidCount = computed(() =>
  agentBatchRows.value.filter((row) => row.errors.length > 0).length
);
const agentBatchCreatedCount = computed(() =>
  agentBatchRows.value.filter((row) => row.status === "CREATED").length
);
const activeAgentCount = computed(() =>
  transferAgents.value.filter((agent) => agent.status === "ACTIVE").length
);
const activeCustomerCount = computed(() =>
  customers.value.filter((customer) => customer.status === "ACTIVE").length
);
const overviewKpis = computed(() => {
  const items = overviewShipments.value;
  const stats = overviewTodayStats.value;
  const stat = (key, fallback) => {
    const value = Number(stats?.[key]);
    return Number.isFinite(value) ? value : fallback;
  };
  return [
    {
      key: "created",
      tone: "blue",
      icon: CirclePlusFilled,
      label: t("customers.todayNewBusiness"),
      value: stat("newShipments", items.filter(isCreatedToday).length),
      hint: t("customers.todayNewBusinessHint")
    },
    {
      key: "updated",
      tone: "amber",
      icon: RefreshRight,
      label: t("customers.todayUpdatedBusiness"),
      value: stat("updatedShipments", items.filter(isUpdatedToday).length),
      hint: t("customers.todayUpdatedBusinessHint")
    },
    {
      key: "files",
      tone: "green",
      icon: FolderOpened,
      label: t("customers.todayFiles"),
      value: stat("followUpFiles", items.reduce((total, item) => total + countTodayFiles(item), 0)),
      hint: t("customers.todayFilesHint")
    },
    {
      key: "messages",
      tone: "purple",
      icon: ChatDotRound,
      label: t("customers.todayMessages"),
      value: stat("messages", items.reduce((total, item) => total + countTodayMessages(item), 0)),
      hint: t("customers.todayMessagesHint")
    },
    {
      key: "logins",
      tone: "cyan",
      icon: UserFilled,
      label: t("customers.todayCustomerLogins"),
      value: stat(
        "customerLogins",
        customers.value.filter((customer) => isToday(customer.lastLoginAt || customer.lastLogin)).length
      ),
      hint: t("customers.todayCustomerLoginsHint")
    }
  ];
});
const overviewDailyTrend = computed(() => {
  if (Array.isArray(overviewTodayStats.value?.dailyTrend)) {
    return overviewTodayStats.value.dailyTrend.map((day) => ({
      key: String(day.date || ""),
      label: new Intl.DateTimeFormat(currentLocale.value || "zh-CN", {
        month: "numeric",
        day: "numeric"
      }).format(new Date(`${day.date}T00:00:00`)),
      created: Number(day.created || 0),
      updated: Number(day.updated || 0)
    }));
  }
  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const key = localDateKey(date);
    days.push({
      key,
      label: new Intl.DateTimeFormat(currentLocale.value || "zh-CN", {
        month: "numeric",
        day: "numeric"
      }).format(date),
      created: overviewShipments.value.filter((item) => localDateKey(item.createdAt) === key).length,
      updated: overviewShipments.value.filter((item) => isMeaningfulUpdate(item) && localDateKey(item.updatedAt) === key).length
    });
  }
  return days;
});
const overviewTrendHasData = computed(() =>
  overviewDailyTrend.value.some((day) => day.created > 0 || day.updated > 0)
);
const overviewTodayComposition = computed(() =>
  overviewKpis.value.map((metric) => ({
    name: metric.label,
    value: Number(metric.value) || 0,
    itemStyle: { color: overviewMetricColor(metric.tone) }
  }))
);
const overviewTodayHasData = computed(() =>
  overviewTodayComposition.value.some((item) => item.value > 0)
);
const overviewResourceSeries = computed(() => [
  {
    name: t("customers.directoryTitle"),
    value: Number(overviewTodayStats.value?.customerTotal ?? customers.value.length)
  },
  {
    name: t("customers.tabShipmentManagement"),
    value: Number(overviewTodayStats.value?.shipmentTotal ?? overviewShipmentTotal.value)
  },
  {
    name: t("customers.overseaAgentManagement"),
    value: Number(overviewTodayStats.value?.activeAgentCount ?? activeAgentCount.value)
  },
  {
    name: t("customers.activeCustomers"),
    value: Number(overviewTodayStats.value?.activeCustomerCount ?? activeCustomerCount.value)
  }
]);
const overviewResourcesHaveData = computed(() =>
  overviewResourceSeries.value.some((item) => item.value > 0)
);
const overviewShipmentStatusDistribution = computed(() => {
  if (Array.isArray(overviewTodayStats.value?.shipmentStatusDistribution)) {
    return overviewTodayStats.value.shipmentStatusDistribution.map((item) => ({
      name: String(item.name || item.status || "").trim() === "UNKNOWN"
        ? t("customers.overviewUnknownStatus")
        : String(item.name || item.status || ""),
      value: Number(item.value ?? item.count ?? 0)
    }));
  }
  const counts = new Map();
  overviewShipments.value.forEach((shipment) => {
    const status = String(shipment?.trackingStatus || "").trim()
      || t("customers.overviewUnknownStatus");
    counts.set(status, (counts.get(status) || 0) + 1);
  });
  return Array.from(counts, ([name, value]) => ({ name, value }))
    .sort((left, right) => right.value - left.value);
});
const overviewStatusHasData = computed(() =>
  overviewShipmentStatusDistribution.value.some((item) => item.value > 0)
);
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
const paginatedCustomers = computed(() => pageSlice(filteredCustomers.value, customerPage.value, customerPageSize.value));
const paginatedTransferAgents = computed(() => pageSlice(transferAgents.value, agentPage.value, agentPageSize.value));

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
const assignableCustomers = computed(() =>
  customers.value.filter((customer) =>
    customer.status === "ACTIVE" && ["SHIPPER", "CONSIGNEE"].includes(customer.partyRole)
  )
);
const handoverEligibleCustomers = computed(() =>
  customers.value.filter(isTransferableCustomer)
);

const refreshIssueCount = computed(() => shipmentRefreshIssueTotal.value);

const displayedAvailableShipments = computed(() => availableShipments.value);
const canStartShipmentExcelImport = computed(() =>
  !shipmentExcelImporting.value
  && shipmentExcelImportResults.value.length === 0
  && shipmentExcelImportPreview.value.valid > 0
  && shipmentExcelImportPreview.value.invalid === 0
  && shipmentExcelImportPreview.value.globalErrors.length === 0
  && !!shipmentExcelCustomerId.value
);

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

function isPendingBusinessUpdate(shipment) {
  if (hasRefreshIssue(shipment)) return false;
  const status = String(shipment?.trackingStatus || "").trim().toUpperCase();
  return !shipment?.lastTrackedAt
    || status.includes("PENDING");
}

function shipmentBusinessState(shipment) {
  const provided = String(shipment?.businessState || "").toUpperCase();
  if (["COMPLETED", "UPDATE_FAILED", "MANUAL_REQUIRED", "TODAY_UPDATED", "TODAY_PENDING"].includes(provided)) {
    return provided;
  }
  const trackingStatus = String(shipment?.trackingStatus || "").replaceAll("_", " ").toUpperCase();
  if (trackingStatus.includes("EMPTY RETURNED")) return "COMPLETED";
  if (hasRefreshIssue(shipment)) return "UPDATE_FAILED";
  if (shipment?.hasValidTracking === false
      || String(shipment?.sourceChannel || "").toUpperCase() === "IMPORTED_MANUAL"
      || !shipment?.lastTrackedAt) {
    return "MANUAL_REQUIRED";
  }
  return isToday(shipment.lastTrackedAt) ? "TODAY_UPDATED" : "TODAY_PENDING";
}

function shipmentBusinessStateLabel(shipment) {
  return t({
    COMPLETED: "customers.businessCompleted",
    UPDATE_FAILED: "customers.businessUpdateFailed",
    MANUAL_REQUIRED: "customers.manualEntryRequired",
    TODAY_UPDATED: "customers.todayUpdatedBusiness",
    TODAY_PENDING: "customers.todayPendingUpdate"
  }[shipmentBusinessState(shipment)]);
}

function shipmentBusinessStateTagType(shipment) {
  return {
    COMPLETED: "success",
    UPDATE_FAILED: "danger",
    MANUAL_REQUIRED: "warning",
    TODAY_UPDATED: "success",
    TODAY_PENDING: "info"
  }[shipmentBusinessState(shipment)] || "info";
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
  if (Number.isFinite(startedAt) && elapsedMs < 1000) {
    return t("customers.elapsedUnderSecond");
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

watch(shipmentCreateDialogOpen, (open) => {
  if (open && !shipmentCreateCustomerId.value) {
    shipmentCreateCustomerId.value = selectedCustomerId.value || assignableCustomers.value[0]?.id || "";
  }
});

watch(shipmentExcelImportDialogOpen, (open) => {
  if (open && !shipmentExcelCustomerId.value) {
    shipmentExcelCustomerId.value = selectedCustomerId.value || assignableCustomers.value[0]?.id || "";
  }
});

watch(batchTrackDialogOpen, (open) => {
  if (open && batchTrackMode.value === "IMPORT" && !batchTrackCustomerId.value) {
    batchTrackCustomerId.value = selectedCustomerId.value || assignableCustomers.value[0]?.id || "";
  }
});

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

watch([shipmentCustomerFilter, shipmentBusinessFilter, refreshIssuesOnly], () => {
  shipmentPage.value = 1;
  void loadAvailableShipments();
});

watch(customerSearch, () => {
  customerPage.value = 1;
});

watch(filteredCustomers, (items) => {
  customerPage.value = boundedPage(customerPage.value, items.length, customerPageSize.value);
});

watch(transferAgents, (items) => {
  agentPage.value = boundedPage(agentPage.value, items.length, agentPageSize.value);
});

watch(menuItem, (item) => {
  if (item === "overview") {
    void initializeOverviewCharts();
  } else {
    disposeOverviewCharts();
  }
});

watch(
  [
    overviewDailyTrend,
    overviewTodayComposition,
    overviewResourceSeries,
    overviewShipmentStatusDistribution,
    prefersReducedMotion
  ],
  () => {
    if (menuItem.value === "overview") {
      void nextTick().then(renderOverviewCharts);
    }
  },
  { deep: true }
);

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
  overviewMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  prefersReducedMotion.value = overviewMotionQuery.matches;
  const handleMotionPreference = (event) => {
    prefersReducedMotion.value = event.matches;
  };
  overviewMotionQuery.addEventListener?.("change", handleMotionPreference);
  overviewMotionPreferenceHandler = handleMotionPreference;
  batchTrackClockTimer = window.setInterval(() => {
    batchTrackClock.value = Date.now();
  }, 1000);
  const query = new URLSearchParams(window.location.search);
  const requestedSection = query.get("section") || "";
  const allowedSections = isManager.value
    ? ["overview", "customers", "shipments", "agents", "handover"]
    : ["customers", "handover", "shipments"];
  if (allowedSections.includes(requestedSection)) {
    menuItem.value = requestedSection;
    subView.value = "list";
  }
  const requestedShipment = query.get("shipment") || "";
  if (requestedShipment) {
    menuItem.value = "shipments";
    subView.value = "detail";
    selectedShipmentId.value = requestedShipment;
  }
  const requestedCustomer = query.get("customer") || "";
  void loadMenuData(menuItem.value, requestedCustomer);
  void restoreBatchTrackTask();
});
onUnmounted(() => {
  disposeOverviewCharts();
  if (overviewMotionQuery && overviewMotionPreferenceHandler) {
    overviewMotionQuery.removeEventListener?.("change", overviewMotionPreferenceHandler);
  }
  overviewMotionQuery = null;
  overviewMotionPreferenceHandler = null;
  window.clearTimeout(toastTimer);
  window.clearTimeout(batchTrackPollTimer);
  window.clearInterval(batchTrackClockTimer);
});

function navigateTo(item) {
  if (item === "batch-tracking") {
    menuItem.value = "shipments";
    subView.value = "list";
    toggleBatchTrackPanel();
    return;
  }
  menuItem.value = item;
  subView.value = "list";
  void loadMenuData(item);
}

async function loadMenuData(item, preferredCustomerId = "") {
  if (item === "overview") {
    await loadOverviewMetrics();
    return;
  }
  if (item === "customers") {
    if (!customersLoaded.value || preferredCustomerId) {
      await loadCustomers(preferredCustomerId, { selectFirst: Boolean(preferredCustomerId) });
    }
    return;
  }
  if (item === "shipments") {
    const jobs = [];
    if (!customersLoaded.value && isManager.value) {
      jobs.push(loadCustomers("", { selectFirst: false }));
    }
    if (!shipmentsLoaded.value) jobs.push(loadAvailableShipments());
    await Promise.all(jobs);
    return;
  }
  if (item === "agents" && !transferAgentsLoaded.value) {
    await loadTransferAgents();
    return;
  }
  if (item === "handover") {
    const jobs = [];
    if (!handoverAgentsLoaded.value) jobs.push(loadBusinessHandoverAgents());
    if (canRequestBusinessHandover.value) jobs.push(loadBusinessHandoverRequests());
    if (isManager.value && !customersLoaded.value) {
      jobs.push(loadCustomers("", { selectFirst: false }));
    }
    await Promise.all(jobs);
  }
}

function handleWorkspaceViewEntered() {
  if (menuItem.value === "overview") void initializeOverviewCharts();
}

function pageSlice(items, page, pageSize) {
  const size = Math.max(1, Number(pageSize));
  const start = (Math.max(1, Number(page)) - 1) * size;
  return items.slice(start, start + size);
}

function boundedPage(page, total, pageSize) {
  return Math.min(Math.max(1, Number(page)), Math.max(1, Math.ceil(Number(total || 0) / Number(pageSize || 1))));
}

function customerRowIndex(index) {
  return (customerPage.value - 1) * customerPageSize.value + index + 1;
}

function agentRowIndex(index) {
  return (agentPage.value - 1) * agentPageSize.value + index + 1;
}

function runTablePageTransition(callback) {
  tablePageTransitioning.value = true;
  callback();
  window.setTimeout(() => {
    tablePageTransitioning.value = false;
  }, prefersReducedMotion.value ? 0 : 160);
}

function changeCustomerPage(page) {
  runTablePageTransition(() => {
    customerPage.value = Number(page);
  });
}

function changeAgentPage(page) {
  runTablePageTransition(() => {
    agentPage.value = Number(page);
  });
}

function selectedCustomerOptionLabel(value) {
  const customer = assignableCustomers.value.find((item) => String(item.id) === String(value));
  return customer ? customerFilterOptionLabel(customer) : "";
}

function selectedAgentOptionLabel(value) {
  const agent = transferAgents.value.find((item) => String(item.id) === String(value));
  return agent ? `${agent.displayName} (@${agent.username})` : "";
}

function openPersonalProfile() {
  personalProfileForm.displayName = props.currentUser?.displayName || "";
  personalProfileError.value = "";
  personalPasswordForm.currentPassword = "";
  personalPasswordForm.newPassword = "";
  personalPasswordForm.confirmPassword = "";
  personalPasswordError.value = "";
  personalPasswordSuccess.value = "";
  personalProfileOpen.value = true;
}

async function savePersonalProfile() {
  const nextName = personalProfileForm.displayName.trim();
  personalProfileError.value = "";
  if (nextName.length < 2) {
    personalProfileError.value = t("portal.displayNameRule");
    return;
  }
  personalProfileSaving.value = true;
  try {
    const user = await updateOwnProfile(nextName);
    saveStoredUser(user);
    emit("user-updated", user);
    personalProfileOpen.value = false;
    showSuccess("portal.profileSaved");
  } catch (error) {
    personalProfileError.value = error?.message || t("portal.profileSaveFailed");
  } finally {
    personalProfileSaving.value = false;
  }
}

async function savePersonalPassword() {
  const currentPassword = personalPasswordForm.currentPassword;
  const newPassword = personalPasswordForm.newPassword;
  personalPasswordError.value = "";
  personalPasswordSuccess.value = "";
  if (!currentPassword || !newPassword || !personalPasswordForm.confirmPassword) {
    personalPasswordError.value = t("portal.passwordFieldsRequired");
    return;
  }
  if (newPassword !== personalPasswordForm.confirmPassword) {
    personalPasswordError.value = t("portal.passwordMismatch");
    return;
  }
  const strong = newPassword.length >= 8
    && newPassword.length <= 128
    && /[A-Za-z]/.test(newPassword)
    && /\d/.test(newPassword);
  if (!strong) {
    personalPasswordError.value = t("portal.passwordRule");
    return;
  }
  personalPasswordSaving.value = true;
  try {
    await changeOwnPassword(currentPassword, newPassword);
    personalPasswordForm.currentPassword = "";
    personalPasswordForm.newPassword = "";
    personalPasswordForm.confirmPassword = "";
    personalPasswordSuccess.value = t("portal.passwordChanged");
  } catch (error) {
    personalPasswordError.value = error?.message || t("portal.passwordChangeFailed");
  } finally {
    personalPasswordSaving.value = false;
  }
}

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function isToday(value) {
  return Boolean(value) && localDateKey(value) === localDateKey(new Date());
}

function isMeaningfulUpdate(item) {
  if (!item?.updatedAt) return false;
  if (!item.createdAt) return true;
  const created = new Date(item.createdAt).getTime();
  const updated = new Date(item.updatedAt).getTime();
  if (Number.isNaN(created) || Number.isNaN(updated)) return true;
  return updated - created > 1000;
}

function isCreatedToday(item) {
  return isToday(item?.createdAt);
}

function isUpdatedToday(item) {
  return isMeaningfulUpdate(item) && isToday(item?.updatedAt);
}

function countTodayFiles(item) {
  const direct = Number(item?.todayFileCount);
  if (Number.isFinite(direct) && direct >= 0) return direct;
  const files = Array.isArray(item?.files) ? item.files : [];
  return files.filter((file) => isToday(file?.uploadedAt || file?.createdAt)).length;
}

function countTodayMessages(item) {
  const direct = Number(item?.todayMessageCount ?? item?.todayCommentCount);
  if (Number.isFinite(direct) && direct >= 0) return direct;
  const messages = Array.isArray(item?.messages)
    ? item.messages
    : Array.isArray(item?.comments) ? item.comments : [];
  return messages.filter((message) => isToday(message?.createdAt)).length;
}

function overviewMetricColor(tone) {
  return {
    blue: "#4389d5",
    amber: "#e0a23a",
    green: "#35a77a",
    purple: "#7c6fd1",
    cyan: "#2da5ba"
  }[tone] || "#4389d5";
}

function overviewChartAnimation() {
  return {
    animation: !prefersReducedMotion.value,
    animationDuration: prefersReducedMotion.value ? 0 : 560,
    animationDurationUpdate: prefersReducedMotion.value ? 0 : 260,
    animationEasing: "cubicOut",
    animationEasingUpdate: "cubicOut"
  };
}

function overviewChartTextStyle() {
  return {
    color: "#667d91",
    fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif'
  };
}

function overviewTrendOption() {
  const createdName = t("customers.todayNewBusiness");
  const updatedName = t("customers.todayUpdatedBusiness");
  return {
    ...overviewChartAnimation(),
    color: ["#4389d5", "#e0a23a"],
    textStyle: overviewChartTextStyle(),
    tooltip: {
      trigger: "axis",
      confine: true,
      backgroundColor: "rgba(21, 42, 61, .94)",
      borderWidth: 0,
      textStyle: { color: "#fff", fontSize: 11 },
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(67, 137, 213, .07)" } }
    },
    legend: {
      top: 2,
      right: 4,
      itemWidth: 14,
      itemHeight: 8,
      itemGap: 16,
      textStyle: { color: "#6f8497", fontSize: 10 }
    },
    grid: { top: 42, right: 20, bottom: 12, left: 12, containLabel: true },
    xAxis: {
      type: "category",
      boundaryGap: true,
      data: overviewDailyTrend.value.map((day) => day.label),
      axisLine: { lineStyle: { color: "#dfe8f0" } },
      axisTick: { show: false },
      axisLabel: { color: "#7b8fa2", fontSize: 10, margin: 12 }
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "#8da0b1", fontSize: 9 },
      splitLine: { lineStyle: { color: "#edf2f6", type: "dashed" } }
    },
    series: [
      {
        name: createdName,
        type: "bar",
        barMaxWidth: 28,
        data: overviewDailyTrend.value.map((day) => day.created),
        itemStyle: {
          borderRadius: [7, 7, 2, 2],
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#72b7ec" },
              { offset: 1, color: "#397ec1" }
            ]
          }
        },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(57, 126, 193, .28)" } }
      },
      {
        name: updatedName,
        type: "line",
        smooth: 0.35,
        symbol: "circle",
        symbolSize: 7,
        data: overviewDailyTrend.value.map((day) => day.updated),
        lineStyle: { width: 3, color: "#e0a23a" },
        itemStyle: { color: "#fff", borderColor: "#e0a23a", borderWidth: 3 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(224, 162, 58, .20)" },
              { offset: 1, color: "rgba(224, 162, 58, 0)" }
            ]
          }
        }
      }
    ]
  };
}

function overviewDonutOption(data, total, seriesName) {
  return {
    ...overviewChartAnimation(),
    color: ["#4389d5", "#35a77a", "#e0a23a", "#7c6fd1", "#2da5ba", "#e66d75", "#8aa2b6"],
    textStyle: overviewChartTextStyle(),
    title: {
      text: String(total),
      subtext: t("customers.overviewTotal"),
      left: "34%",
      top: "35%",
      textAlign: "center",
      textStyle: { color: "#1f425d", fontSize: 24, fontWeight: 760 },
      subtextStyle: { color: "#8ba0b2", fontSize: 9, lineHeight: 18 }
    },
    tooltip: {
      trigger: "item",
      confine: true,
      backgroundColor: "rgba(21, 42, 61, .94)",
      borderWidth: 0,
      textStyle: { color: "#fff", fontSize: 11 },
      formatter: "{b}<br/>{c} · {d}%"
    },
    legend: {
      type: "scroll",
      orient: "vertical",
      right: 0,
      top: "center",
      width: "40%",
      itemWidth: 9,
      itemHeight: 9,
      itemGap: 11,
      pageIconSize: 9,
      pageTextStyle: { color: "#8396a8", fontSize: 9 },
      textStyle: { color: "#647b8f", fontSize: 9, width: 112, overflow: "truncate" }
    },
    series: [
      {
        name: seriesName,
        type: "pie",
        center: ["34%", "49%"],
        radius: ["52%", "72%"],
        minAngle: 4,
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: "#fff",
          borderWidth: 3,
          borderRadius: 5
        },
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scaleSize: 7,
          label: { show: false },
          itemStyle: { shadowBlur: 16, shadowColor: "rgba(32, 65, 92, .18)" }
        },
        data
      }
    ],
    media: [
      {
        query: { maxWidth: 390 },
        option: {
          title: { left: "50%", top: "29%" },
          legend: {
            orient: "horizontal",
            left: "center",
            right: "auto",
            top: "auto",
            bottom: 0,
            width: "92%"
          },
          series: [{ center: ["50%", "42%"], radius: ["43%", "61%"] }]
        }
      }
    ]
  };
}

function overviewResourcesOption() {
  const data = [...overviewResourceSeries.value].reverse();
  return {
    ...overviewChartAnimation(),
    textStyle: overviewChartTextStyle(),
    tooltip: {
      trigger: "axis",
      confine: true,
      axisPointer: { type: "shadow" },
      backgroundColor: "rgba(21, 42, 61, .94)",
      borderWidth: 0,
      textStyle: { color: "#fff", fontSize: 11 }
    },
    grid: { top: 12, right: 42, bottom: 10, left: 8, containLabel: true },
    xAxis: {
      type: "value",
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { lineStyle: { color: "#edf2f6", type: "dashed" } }
    },
    yAxis: {
      type: "category",
      data: data.map((item) => item.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: "#627b90",
        fontSize: 10,
        width: 108,
        overflow: "truncate",
        margin: 13
      }
    },
    series: [
      {
        name: t("customers.overviewResourceTitle"),
        type: "bar",
        barWidth: 18,
        showBackground: true,
        backgroundStyle: { color: "#f0f4f8", borderRadius: 9 },
        label: {
          show: true,
          position: "right",
          distance: 8,
          color: "#2a536f",
          fontSize: 10,
          fontWeight: 760
        },
        itemStyle: {
          borderRadius: 9,
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: "#337fbe" },
              { offset: 1, color: "#60b8ca" }
            ]
          }
        },
        data: data.map((item) => item.value)
      }
    ]
  };
}

function renderOverviewCharts() {
  if (menuItem.value !== "overview") return;
  if (overviewTrendHasData.value) {
    overviewChartInstances.trend?.setOption(overviewTrendOption(), true);
  } else {
    overviewChartInstances.trend?.clear();
  }
  if (overviewTodayHasData.value) {
    const total = overviewTodayComposition.value.reduce((sum, item) => sum + item.value, 0);
    overviewChartInstances.today?.setOption(
      overviewDonutOption(
        overviewTodayComposition.value,
        total,
        t("customers.overviewTodayCompositionTitle")
      ),
      true
    );
  } else {
    overviewChartInstances.today?.clear();
  }
  if (overviewResourcesHaveData.value) {
    overviewChartInstances.resources?.setOption(overviewResourcesOption(), true);
  } else {
    overviewChartInstances.resources?.clear();
  }
  if (overviewStatusHasData.value) {
    const total = overviewShipmentStatusDistribution.value
      .reduce((sum, item) => sum + item.value, 0);
    overviewChartInstances.status?.setOption(
      overviewDonutOption(
        overviewShipmentStatusDistribution.value,
        total,
        t("customers.overviewShipmentStatusTitle")
      ),
      true
    );
  } else {
    overviewChartInstances.status?.clear();
  }
}

function resizeOverviewCharts() {
  Object.values(overviewChartInstances).forEach((chart) => chart?.resize());
}

function disposeOverviewCharts() {
  window.removeEventListener("resize", resizeOverviewCharts);
  overviewChartResizeObserver?.disconnect();
  overviewChartResizeObserver = null;
  Object.keys(overviewChartInstances).forEach((key) => {
    overviewChartInstances[key]?.dispose();
    overviewChartInstances[key] = null;
  });
}

async function initializeOverviewCharts() {
  await nextTick();
  if (menuItem.value !== "overview") return;
  const targets = [
    ["trend", overviewTrendChartRef.value],
    ["today", overviewTodayChartRef.value],
    ["resources", overviewResourcesChartRef.value],
    ["status", overviewStatusChartRef.value]
  ];
  targets.forEach(([key, element]) => {
    if (!element) return;
    if (overviewChartInstances[key]?.getDom() !== element) {
      overviewChartInstances[key]?.dispose();
      overviewChartInstances[key] = initEChart(element, null, { renderer: "canvas" });
    }
  });
  overviewChartResizeObserver?.disconnect();
  window.removeEventListener("resize", resizeOverviewCharts);
  window.addEventListener("resize", resizeOverviewCharts, { passive: true });
  if (typeof ResizeObserver !== "undefined") {
    overviewChartResizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(resizeOverviewCharts);
    });
    targets.forEach(([, element]) => {
      if (element) overviewChartResizeObserver.observe(element);
    });
  }
  renderOverviewCharts();
  window.requestAnimationFrame(resizeOverviewCharts);
}

async function loadOverviewMetrics() {
  if (loadingOverviewMetrics.value) return;
  loadingOverviewMetrics.value = true;
  overviewMetricsError.value = "";
  try {
    const todayStats = await fetchBusinessDashboardTodayStats();
    overviewTodayStats.value = todayStats;
    overviewShipmentTotal.value = Number(todayStats?.shipmentTotal || 0);
    overviewShipments.value = [];
  } catch (error) {
    overviewShipments.value = [...availableShipments.value];
    overviewShipmentTotal.value = shipmentTotal.value || availableShipments.value.length;
    overviewTodayStats.value = null;
    overviewMetricsError.value = error?.message || t("customers.overviewLoadFailed");
  } finally {
    loadingOverviewMetrics.value = false;
  }
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

async function loadCustomers(preferredId = "", { selectFirst = true } = {}) {
  loadingCustomers.value = true;
  clearMessage();
  try {
    const response = await fetchBusinessCustomers();
    customers.value = Array.isArray(response?.items) ? response.items : [];
    customersLoaded.value = true;
    loadingCustomers.value = false;
    const nextId = preferredId || selectedCustomerId.value;
    if (nextId && customers.value.some((item) => item.id === nextId)) {
      await selectCustomer(nextId);
    } else if (selectFirst && customers.value[0]) {
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

async function loadBusinessHandoverAgents() {
  if (loadingBusinessHandoverAgents.value) return;
  loadingBusinessHandoverAgents.value = true;
  try {
    const response = await fetchBusinessHandoverAgents();
    businessHandoverAgents.value = Array.isArray(response?.items) ? response.items : [];
    handoverAgentsLoaded.value = true;
  } catch (error) {
    businessHandoverAgents.value = [];
    showError(error, "customers.loadBusinessHandoverAgentsFailed");
  } finally {
    loadingBusinessHandoverAgents.value = false;
  }
}

async function loadBusinessHandoverRequests() {
  if (!canRequestBusinessHandover.value || loadingBusinessHandoverRequests.value) return;
  loadingBusinessHandoverRequests.value = true;
  try {
    const response = await fetchBusinessHandoverRequests({
      status: businessHandoverRequestStatus.value,
      page: businessHandoverRequestPage.value,
      size: businessHandoverRequestPageSize.value
    });
    businessHandoverRequests.value = Array.isArray(response?.items) ? response.items : [];
    businessHandoverRequestTotal.value = Number(response?.total || 0);
    businessHandoverRequestPage.value = Number(response?.page || 0);
    businessHandoverRequestPageSize.value = Number(response?.size || businessHandoverRequestPageSize.value);
  } catch (error) {
    businessHandoverRequests.value = [];
    businessHandoverRequestTotal.value = 0;
    showError(error, "customers.loadBusinessHandoverRequestsFailed");
  } finally {
    loadingBusinessHandoverRequests.value = false;
  }
}

async function refreshBusinessHandoverData() {
  const jobs = [loadBusinessHandoverAgents()];
  if (canRequestBusinessHandover.value) jobs.push(loadBusinessHandoverRequests());
  await Promise.all(jobs);
}

function changeBusinessHandoverRequestStatus() {
  businessHandoverRequestPage.value = 0;
  void loadBusinessHandoverRequests();
}

function changeBusinessHandoverRequestPage(page) {
  businessHandoverRequestPage.value = Math.max(0, Number(page) - 1);
  void loadBusinessHandoverRequests();
}

function changeBusinessHandoverRequestPageSize(size) {
  businessHandoverRequestPageSize.value = Number(size);
  businessHandoverRequestPage.value = 0;
  void loadBusinessHandoverRequests();
}

function businessHandoverStatusLabel(status) {
  const key = {
    PENDING: "customers.handoverStatusPending",
    APPROVED: "customers.handoverStatusApproved",
    REJECTED: "customers.handoverStatusRejected"
  }[String(status || "").toUpperCase()];
  return key ? t(key) : status || "—";
}

function businessHandoverStatusType(status) {
  return {
    PENDING: "warning",
    APPROVED: "success",
    REJECTED: "danger"
  }[String(status || "").toUpperCase()] || "info";
}

function openBusinessHandover(agent) {
  if (!agent || agent.current || agent.status !== "ACTIVE") return;
  businessHandoverTarget.value = agent;
  businessHandoverForm.customerIds = [];
  businessHandoverForm.reason = "";
  businessHandoverDialogOpen.value = true;
}

function resetBusinessHandoverForm() {
  businessHandoverTarget.value = null;
  businessHandoverForm.customerIds = [];
  businessHandoverForm.reason = "";
}

async function submitBusinessHandover() {
  if (
    submittingBusinessHandover.value
    || !businessHandoverTarget.value
    || !businessHandoverForm.customerIds.length
    || !businessHandoverForm.reason.trim()
  ) return;
  submittingBusinessHandover.value = true;
  try {
    const response = await handoverBusinessCustomers({
      customerIds: [...businessHandoverForm.customerIds],
      targetBusinessUserId: Number(businessHandoverTarget.value.id),
      reason: businessHandoverForm.reason.trim()
    });
    const targetName = response?.targetBusinessUserName
      || businessHandoverTarget.value.displayName
      || businessHandoverTarget.value.username;
    businessHandoverDialogOpen.value = false;
    showSuccess("customers.businessHandoverSuccess", {
      requestId: response?.requestId,
      count: Number(response?.customerCount || businessHandoverForm.customerIds.length),
      agent: targetName
    });
    await Promise.all([
      loadBusinessHandoverAgents(),
      loadBusinessHandoverRequests()
    ]);
  } catch (error) {
    showError(error, "customers.businessHandoverFailed");
  } finally {
    submittingBusinessHandover.value = false;
  }
}

function handleCustomerSelectionChange(rows) {
  selectedCustomerRows.value = Array.isArray(rows) ? rows : [];
}

function isTransferableCustomer(customer) {
  return customer?.status === "ACTIVE" && ["SHIPPER", "CONSIGNEE"].includes(customer?.partyRole);
}

function openAgentCreateDialog() {
  agentCreateForm.username = "";
  agentCreateForm.displayName = "";
  agentCreateForm.password = "";
  agentCreateError.value = "";
  agentCreateDialogOpen.value = true;
}

async function submitAgentCreate() {
  agentCreateError.value = "";
  if (!canCreateAgent.value) {
    agentCreateError.value = t("customers.createOverseaAgentValidation");
    return;
  }
  creatingAgent.value = true;
  try {
    await createOverseaAgentEmployee({
      username: agentCreateForm.username,
      displayName: agentCreateForm.displayName,
      password: agentCreateForm.password
    });
    agentCreateDialogOpen.value = false;
    showSuccess("customers.createOverseaAgentSuccess");
  } catch (error) {
    agentCreateError.value = error?.message || t("customers.createOverseaAgentFailed");
  } finally {
    creatingAgent.value = false;
  }
}

function isValidAgentUsername(value) {
  return /^[\p{L}\p{N}._-]{2,64}$/u.test(String(value || "").trim());
}

function isValidAgentDisplayName(value) {
  const length = String(value || "").trim().length;
  return length >= 2 && length <= 80;
}

function isStrongAgentPassword(value) {
  const password = String(value || "");
  return password.length >= 8
    && password.length <= 128
    && /[A-Za-z]/.test(password)
    && /\d/.test(password);
}

function openAgentBatchImport() {
  agentBatchFileName.value = "";
  agentBatchRows.value = [];
  agentBatchError.value = "";
  agentBatchDropzoneActive.value = false;
  agentBatchDialogOpen.value = true;
}

function closeAgentBatchImport() {
  if (importingAgents.value) return;
  agentBatchDialogOpen.value = false;
  agentBatchFileName.value = "";
  agentBatchRows.value = [];
  agentBatchError.value = "";
  if (agentBatchFileInput.value) agentBatchFileInput.value.value = "";
}

async function downloadAgentImportTemplate() {
  try {
    const XLSX = await loadXlsxModule();
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      [
        "\u7528\u6237\u540d*",
        "\u663e\u793a\u540d\u79f0*",
        "\u521d\u59cb\u5bc6\u7801*"
      ],
      ["oversea-agent-01", "Oversea Agent 01", "StrongPass#2026"]
    ]);
    worksheet["!cols"] = [{ wch: 26 }, { wch: 30 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(workbook, worksheet, "OVERSEA AGENTS");
    XLSX.writeFile(workbook, `oversea-agent-import-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (error) {
    agentBatchError.value = error?.message || t("customers.agentTemplateFailed");
  }
}

function normalizeAgentHeader(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\*/g, "")
    .replace(/[\s/\\._()（）:：-]+/g, "");
}

function findAgentColumn(headers, aliases) {
  const normalizedAliases = new Set(aliases.map(normalizeAgentHeader));
  return headers.findIndex((header) => normalizedAliases.has(normalizeAgentHeader(header)));
}

function validateAgentImportRows(sourceRows) {
  const usernames = new Set();
  return sourceRows.map((source, index) => {
    const username = String(source.username || "").trim();
    const displayName = String(source.displayName || "").trim();
    const password = String(source.password || "");
    const errors = [];
    if (!isValidAgentUsername(username)) errors.push(t("customers.agentUsernameRule"));
    if (!isValidAgentDisplayName(displayName)) errors.push(t("customers.agentDisplayNameRule"));
    if (!isStrongAgentPassword(password, username)) errors.push(t("customers.agentPasswordRule"));
    const key = username.toLocaleLowerCase();
    if (key && usernames.has(key)) errors.push(t("customers.agentDuplicateUsername", { username }));
    if (key) usernames.add(key);
    return {
      rowNumber: Number(source.rowNumber) || index + 2,
      username,
      displayName,
      password,
      errors,
      status: errors.length ? "INVALID" : "READY",
      resultMessage: ""
    };
  });
}

async function parseAgentWorkbook(file) {
  const XLSX = await loadXlsxModule();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) throw new Error(t("customers.agentWorkbookEmpty"));
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false
  });
  const aliases = {
    username: ["USERNAME", "\u7528\u6237\u540d", "\u767b\u5f55\u540d"],
    displayName: ["DISPLAY NAME", "DISPLAYNAME", "\u663e\u793a\u540d\u79f0", "\u59d3\u540d"],
    password: ["INITIAL PASSWORD", "PASSWORD", "\u521d\u59cb\u5bc6\u7801", "\u5bc6\u7801"]
  };
  const headerRowIndex = rows.slice(0, 10).findIndex((row) => {
    const headers = Array.isArray(row) ? row : [];
    return findAgentColumn(headers, aliases.username) >= 0
      && findAgentColumn(headers, aliases.displayName) >= 0
      && findAgentColumn(headers, aliases.password) >= 0;
  });
  if (headerRowIndex < 0) throw new Error(t("customers.agentWorkbookHeaderMissing"));
  const headers = rows[headerRowIndex];
  const indexes = {
    username: findAgentColumn(headers, aliases.username),
    displayName: findAgentColumn(headers, aliases.displayName),
    password: findAgentColumn(headers, aliases.password)
  };
  const sourceRows = rows.slice(headerRowIndex + 1)
    .map((row, index) => ({
      rowNumber: headerRowIndex + index + 2,
      username: row?.[indexes.username],
      displayName: row?.[indexes.displayName],
      password: row?.[indexes.password]
    }))
    .filter((row) => row.username || row.displayName || row.password);
  if (!sourceRows.length) throw new Error(t("customers.agentWorkbookNoRows"));
  if (sourceRows.length > 200) throw new Error(t("customers.agentWorkbookTooManyRows"));
  return validateAgentImportRows(sourceRows);
}

async function processAgentWorkbook(file) {
  agentBatchError.value = "";
  agentBatchRows.value = [];
  if (!file) return;
  if (!/\.(xlsx|xls|csv)$/i.test(file.name || "")) {
    agentBatchError.value = t("customers.agentWorkbookUnsupported");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    agentBatchError.value = t("customers.agentWorkbookTooLarge");
    return;
  }
  parsingAgentFile.value = true;
  try {
    agentBatchRows.value = await parseAgentWorkbook(file);
    agentBatchFileName.value = file.name;
  } catch (error) {
    agentBatchError.value = error?.message || t("customers.agentWorkbookParseFailed");
  } finally {
    parsingAgentFile.value = false;
  }
}

function handleAgentWorkbook(event) {
  const file = event?.target?.files?.[0];
  void processAgentWorkbook(file);
}

function handleAgentBatchDrop(event) {
  agentBatchDropzoneActive.value = false;
  const file = event?.dataTransfer?.files?.[0];
  void processAgentWorkbook(file);
}

function agentBatchRowClass({ row }) {
  if (row.status === "CREATED") return "is-created";
  if (row.status === "FAILED" || row.errors.length) return "is-invalid";
  return "";
}

async function submitAgentBatchImport() {
  const rows = agentBatchRows.value.filter((row) => row.status === "READY" && !row.errors.length);
  if (!rows.length || agentBatchInvalidCount.value || importingAgents.value) return;
  importingAgents.value = true;
  agentBatchError.value = "";
  try {
    const payload = rows.map((row) => ({
      username: row.username,
      displayName: row.displayName,
      password: row.password
    }));
    try {
      await batchCreateOverseaAgentEmployees(payload);
      rows.forEach((row) => {
        row.status = "CREATED";
      });
    } catch (error) {
      if (![404, 405].includes(Number(error?.status))) throw error;
      markApiErrorHandled(error);
      let cursor = 0;
      const worker = async () => {
        while (cursor < rows.length) {
          const row = rows[cursor++];
          row.status = "IMPORTING";
          try {
            await createOverseaAgentEmployee({
              username: row.username,
              displayName: row.displayName,
              password: row.password
            });
            row.status = "CREATED";
          } catch (itemError) {
            row.status = "FAILED";
            row.resultMessage = itemError?.message || t("customers.createOverseaAgentFailed");
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, rows.length) }, () => worker()));
    }
    await loadTransferAgents();
    showSuccess("customers.agentBatchFinished", {
      created: agentBatchRows.value.filter((row) => row.status === "CREATED").length,
      failed: agentBatchRows.value.filter((row) => row.status === "FAILED").length
    });
  } catch (error) {
    markApiErrorHandled(error);
    rows.forEach((row) => {
      if (row.status === "IMPORTING") row.status = "READY";
    });
    agentBatchError.value = error?.message || t("customers.agentBatchCreateFailed");
  } finally {
    importingAgents.value = false;
  }
}

async function loadTransferAgents() {
  loadingTransferAgents.value = true;
  try {
    const response = await fetchCustomerTransferAgents();
    transferAgents.value = Array.isArray(response?.items) ? response.items : [];
    transferAgentsLoaded.value = true;
  } catch (error) {
    showError(error, "customers.loadTransferAgentsFailed");
  } finally {
    loadingTransferAgents.value = false;
  }
}

async function openCustomerTransfer(customer, preserveSelection = false) {
  if (!customer || loadingTransferAgents.value) return;
  if (!preserveSelection) selectedCustomerRows.value = [customer];
  transferDialogOpen.value = true;
  transferForm.targetAgentId = customer.overseaAgentUserId == null
    ? null
    : String(customer.overseaAgentUserId);
  loadingTransferAgents.value = true;
  try {
    const response = await fetchCustomerTransferAgents();
    transferAgents.value = (Array.isArray(response?.items) ? response.items : [])
      .filter((agent) => agent.status === "ACTIVE");
  } catch (error) {
    transferDialogOpen.value = false;
    showError(error, "customers.loadTransferAgentsFailed");
  } finally {
    loadingTransferAgents.value = false;
  }
}

async function deleteSelectedCustomers() {
  const rows = [...selectedCustomerRows.value];
  if (!rows.length || mutatingCustomer.value) return;
  if (!window.confirm(t("customers.confirmDeleteSelectedCustomers", { count: rows.length }))) return;
  mutatingCustomer.value = true;
  try {
    await Promise.all(rows.map((row) => deleteBusinessCustomer(row.id)));
    selectedCustomerRows.value = [];
    customerTableRef.value?.clearSelection?.();
    await Promise.all([loadCustomers(), loadAvailableShipments()]);
    showSuccess("customers.selectedCustomersArchived", { count: rows.length });
  } catch (error) {
    showError(error, "customers.deleteCustomerFailed");
  } finally {
    mutatingCustomer.value = false;
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

async function editAgentDisplayName(agent) {
  const displayName = window.prompt(t("customers.displayName"), agent.displayName || "");
  if (displayName == null || !displayName.trim()) return;
  try {
    await updateOverseaAgent(agent.id, { displayName: displayName.trim() });
    await loadTransferAgents();
    showSuccess("customers.saved");
  } catch (error) {
    showError(error, "customers.saveFailed");
  }
}

async function resetAgentPassword(agent) {
  if (!window.confirm(t("customers.confirmDefaultPasswordReset", {
    name: agent.displayName || agent.username
  }))) return;
  try {
    const response = await resetOverseaAgentPassword(agent.id);
    openPasswordResetResult(
      response?.username || agent.username,
      response?.temporaryPassword || `${agent.username}!@#2026`
    );
  } catch (error) {
    showError(error, "customers.resetPasswordFailed");
  }
}

async function toggleAgentStatus(agent) {
  const status = agent.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
  if (!window.confirm(t("customers.confirmAgentStatusChange", { name: agent.displayName || agent.username }))) return;
  try {
    if (status === "DISABLED") await deleteOverseaAgent(agent.id);
    else await updateOverseaAgent(agent.id, { status });
    await loadTransferAgents();
    showSuccess("customers.saved");
  } catch (error) {
    showError(error, "customers.saveFailed");
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
      refreshIssuesOnly: refreshIssuesOnly.value,
      businessFilter: shipmentBusinessFilter.value
    });
    if (requestSequence !== shipmentListRequestSequence) return;
    availableShipments.value = Array.isArray(response?.items)
      ? response.items.map(normalizeBusinessShipment)
      : [];
    shipmentTotal.value = Number(response?.total || 0);
    shipmentRefreshIssueTotal.value = Number(response?.refreshIssueTotal || 0);
    shipmentPage.value = Number(response?.page || shipmentPage.value);
    shipmentPageSize.value = Number(response?.pageSize || shipmentPageSize.value);
    shipmentsLoaded.value = true;
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
  runTablePageTransition(() => {
    shipmentPage.value = page;
    selectedShipmentRows.value = [];
  });
  void loadAvailableShipments();
}

function changeShipmentPageSize(size) {
  runTablePageTransition(() => {
    shipmentPageSize.value = Number(size);
    shipmentPage.value = 1;
    selectedShipmentRows.value = [];
  });
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
  if (!batchTrackCustomerId.value || !batchTrackItems.value.length
      || batchTrackRunning.value || batchTrackChecking.value) return;
  batchTrackMode.value = "IMPORT";
  batchTrackChecking.value = true;
  batchTrackCancelRequested.value = false;
  batchTrackProblemsOnly.value = false;
  try {
    const approved = await confirmExistingBatchBookings(batchTrackItems.value);
    if (!approved) return;
    batchTrackRunning.value = true;
    batchTrackResults.value = batchTrackItems.value.map((item, index) => ({
      index: index + 1,
      number: item.displayNumber,
      carrier: item.carrier,
      status: "pending",
      message: t("customers.trackPending"),
      failedSubtasks: []
    }));
    const task = await createShipmentBatchTask({
      sourceFileName: batchTrackFileName.value,
      channel: shipmentTrackingChannel.value,
      items: batchTrackItems.value,
      customerId: batchTrackCustomerId.value,
      publishToCustomer: batchTrackPublishToCustomer.value
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
  } finally {
    batchTrackChecking.value = false;
  }
}

async function confirmExistingBatchBookings(items) {
  const shipments = items.map((item) => ({
    carrier: item.carrier,
    referenceType: "BOOKING",
    referenceNo: item.number
  }));
  const response = await inspectBusinessShipmentImportConflicts(shipments);
  const conflicts = Array.isArray(response?.conflicts) ? response.conflicts : [];
  if (!conflicts.length) return true;
  const references = conflicts
    .slice(0, 6)
    .map((item) => item.referenceNo)
    .filter(Boolean)
    .join(", ");
  return window.confirm(t("customers.batchTrackExistingConfirm", {
    count: conflicts.length,
    references,
    more: conflicts.length > 6
      ? t("customers.moreOverwriteSnapshots", { count: conflicts.length - 6 })
      : ""
  }));
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
    startedAt: task.startedAt || null,
    finishedAt: task.finishedAt || null,
    elapsedMs: Number(task.elapsedMs || 0),
    elapsedObservedAt: taskObservedAt,
    ignoredDuplicateCount: Number(task.ignoredDuplicateCount || 0),
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

async function deleteCustomerRow(row) {
  if (mutatingCustomer.value) return;
  if (!window.confirm(t("customers.confirmDeleteCustomer", {
    name: row.displayName || row.username
  }))) return;
  mutatingCustomer.value = true;
  try {
    await deleteBusinessCustomer(row.id);
    await Promise.all([loadCustomers(), loadAvailableShipments()]);
    showSuccess("customers.customerArchived");
  } catch (error) {
    showError(error, "customers.deleteCustomerFailed");
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
}

function openResetPassword(row) {
  selectedCustomerId.value = row.id;
  resetPasswordDialogOpen.value = true;
}

async function resetPassword() {
  if (!selectedCustomer.value || mutatingCustomer.value) return;
  const username = selectedCustomer.value.username;
  const temporaryPassword = `${username}!@#2026`;
  mutatingCustomer.value = true;
  clearMessage();
  try {
    await resetBusinessCustomerPassword(selectedCustomer.value.id, temporaryPassword);
    closeResetPasswordDialog();
    openPasswordResetResult(username, temporaryPassword);
  } catch (error) {
    showError(error, "customers.passwordResetFailed");
  } finally {
    mutatingCustomer.value = false;
  }
}

function openPasswordResetResult(username, password) {
  passwordResetResult.username = String(username || "");
  passwordResetResult.password = String(password || "");
  passwordResetResult.copied = false;
  passwordResetResult.open = true;
}

function closePasswordResetResult() {
  passwordResetResult.open = false;
  passwordResetResult.copied = false;
}

async function copyPasswordResetResult() {
  const text = `${t("customers.username")}: ${passwordResetResult.username}\n${t("customers.newPassword")}: ${passwordResetResult.password}`;
  try {
    await navigator.clipboard.writeText(text);
    passwordResetResult.copied = true;
  } catch {
    passwordResetResult.copied = false;
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

function emptyShipmentExcelImportPreview(globalErrors = []) {
  return {
    rows: [],
    items: [],
    globalErrors,
    total: 0,
    valid: 0,
    invalid: 0,
    warningCount: 0
  };
}

function shipmentExcelRowClassName({ row }) {
  if (row?.errors?.length) return "is-invalid";
  if (row?.warnings?.length) return "has-warning";
  return "";
}

function openShipmentExcelImport() {
  shipmentExcelImportDialogOpen.value = true;
}

function closeShipmentExcelImport() {
  if (shipmentExcelImporting.value) return;
  shipmentExcelImportDialogOpen.value = false;
  shipmentExcelImportFileName.value = "";
  shipmentExcelImportDropzoneActive.value = false;
  shipmentExcelImportPreview.value = emptyShipmentExcelImportPreview();
  shipmentExcelImportResults.value = [];
  shipmentExcelImportProgress.value = { total: 0, done: 0, succeeded: 0, failed: 0 };
  if (shipmentExcelImportFileInput.value) shipmentExcelImportFileInput.value.value = "";
}

async function downloadShipmentExcelTemplate() {
  try {
    const XLSX = await loadXlsxModule();
    const workbook = buildManualShipmentImportTemplate(XLSX);
    XLSX.writeFile(
      workbook,
      `shipment-import-template-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  } catch (error) {
    showError(error, "customers.shipmentExcelTemplateFailed");
  }
}

async function handleShipmentExcelImportWorkbook(event) {
  const file = event.target.files?.[0];
  if (event.target) event.target.value = "";
  await parseShipmentExcelImportFile(file);
}

async function handleShipmentExcelImportDrop(event) {
  shipmentExcelImportDropzoneActive.value = false;
  const file = event.dataTransfer?.files?.[0];
  await parseShipmentExcelImportFile(file);
}

async function parseShipmentExcelImportFile(file) {
  shipmentExcelImportFileName.value = "";
  shipmentExcelImportPreview.value = emptyShipmentExcelImportPreview();
  shipmentExcelImportResults.value = [];
  shipmentExcelImportProgress.value = { total: 0, done: 0, succeeded: 0, failed: 0 };
  if (!file) return;
  if (!/\.(xlsx|xls)$/i.test(file.name || "")) {
    shipmentExcelImportPreview.value = emptyShipmentExcelImportPreview([
      t("customers.shipmentExcelUnsupportedFile")
    ]);
    return;
  }
  if (Number(file.size || 0) > 10 * 1024 * 1024) {
    shipmentExcelImportPreview.value = emptyShipmentExcelImportPreview([
      t("customers.shipmentExcelFileTooLarge")
    ]);
    return;
  }
  shipmentExcelImportParsing.value = true;
  shipmentExcelImportFileName.value = file.name;
  try {
    await waitForNextPaint();
    const XLSX = await loadXlsxModule();
    const workbook = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellDates: true
    });
    shipmentExcelImportPreview.value = parseManualShipmentImportWorkbook(workbook, XLSX);
  } catch (error) {
    shipmentExcelImportPreview.value = emptyShipmentExcelImportPreview([
      error?.message || t("customers.excelReadFailed")
    ]);
  } finally {
    shipmentExcelImportParsing.value = false;
  }
}

async function startShipmentExcelImport() {
  if (!canStartShipmentExcelImport.value) return;
  const items = shipmentExcelImportPreview.value.items;
  shipmentExcelImporting.value = true;
  let overwriteReview;
  try {
    overwriteReview = await prepareShipmentOverwriteReview(
      items.map((item) => item.payload)
    );
  } catch (error) {
    showError(error, "customers.shipmentExcelImportConflictCheckFailed");
    shipmentExcelImporting.value = false;
    return;
  }
  if (!overwriteReview.approved) {
    shipmentExcelImporting.value = false;
    return;
  }
  shipmentExcelImportProgress.value = {
    total: items.length,
    done: 0,
    succeeded: 0,
    failed: 0
  };
  shipmentExcelImportResults.value = items.map((item) => ({
    importKey: item.importKey,
    carrier: item.carrier,
    referenceType: item.referenceType,
    referenceNo: item.referenceNo,
    status: "PENDING",
    message: t("customers.importPending")
  }));
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      try {
        const response = await createBusinessShipment(
          item.payload,
          shipmentExcelCustomerId.value,
          shipmentExcelPublishToCustomer.value,
          overwriteReview.existingIdentities.has(
            shipmentImportIdentity(item.payload)
          )
        );
        const overwritten = response?.overwritten === true;
        shipmentExcelImportResults.value[index] = {
          ...shipmentExcelImportResults.value[index],
          status: overwritten ? "UPDATED" : "CREATED",
          message: t(overwritten ? "customers.importUpdated" : "customers.importCreated")
        };
        shipmentExcelImportProgress.value.succeeded += 1;
      } catch (error) {
        markApiErrorHandled(error);
        shipmentExcelImportResults.value[index] = {
          ...shipmentExcelImportResults.value[index],
          status: "FAILED",
          message: error?.message || t("customers.shipmentExcelImportItemFailed")
        };
        shipmentExcelImportProgress.value.failed += 1;
      } finally {
        shipmentExcelImportProgress.value.done += 1;
      }
    }
  };
  try {
    const concurrency = Math.min(4, items.length);
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    shipmentPage.value = 1;
    await loadAvailableShipments();
    showSuccess("customers.shipmentExcelImportFinished", {
      succeeded: shipmentExcelImportProgress.value.succeeded,
      failed: shipmentExcelImportProgress.value.failed
    });
  } finally {
    shipmentExcelImporting.value = false;
  }
}

async function downloadShipmentExcelImportResults() {
  if (!shipmentExcelImportResults.value.length) return;
  try {
    const XLSX = await loadXlsxModule();
    const workbook = buildManualShipmentImportResultWorkbook(
      shipmentExcelImportResults.value,
      XLSX
    );
    XLSX.writeFile(
      workbook,
      `shipment-import-results-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  } catch (error) {
    showError(error, "customers.shipmentExcelResultsFailed");
  }
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
    billOfLading: form.billOfLading,
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

function shipmentImportIdentity(shipment) {
  const carrier = String(shipment?.carrier || "COSCO").trim().toUpperCase();
  const referenceType = "BOOKING";
  let referenceNo = String(
    shipment?.referenceNo || shipment?.bookingNumber || ""
  ).replace(/\s+/g, "").trim().toUpperCase();
  if (carrier === "COSCO" && /^COSU[0-9]{6,20}$/.test(referenceNo)) {
    referenceNo = referenceNo.slice(4);
  }
  return `${carrier}|${referenceType}|${referenceNo}`;
}

async function prepareShipmentOverwriteReview(shipments) {
  const response = await inspectBusinessShipmentImportConflicts(shipments);
  const conflicts = Array.isArray(response?.conflicts) ? response.conflicts : [];
  const snapshotConflicts = conflicts.filter((item) => item?.hasCurrentSnapshot);
  if (snapshotConflicts.length) {
    const references = snapshotConflicts
      .slice(0, 5)
      .map((item) => item.referenceNo)
      .filter(Boolean)
      .join("、");
    const confirmed = window.confirm(t("customers.confirmOverwriteSnapshots", {
      count: snapshotConflicts.length,
      references,
      more: snapshotConflicts.length > 5
        ? t("customers.moreOverwriteSnapshots", { count: snapshotConflicts.length - 5 })
        : ""
    }));
    if (!confirmed) return { approved: false, existingIdentities: new Set() };
  }
  return {
    approved: true,
    existingIdentities: new Set(conflicts.map(shipmentImportIdentity))
  };
}

async function createShipment() {
  if (creatingShipment.value || !shipmentCreateCustomerId.value) return;
  creatingShipment.value = true;
  try {
    const payload = buildManualShipmentPayload(shipmentCreateForm);
    const overwriteReview = await prepareShipmentOverwriteReview([payload]);
    if (!overwriteReview.approved) return;
    await createBusinessShipment(
      payload,
      shipmentCreateCustomerId.value,
      shipmentCreatePublishToCustomer.value,
      overwriteReview.existingIdentities.has(shipmentImportIdentity(payload))
    );
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
  return { type: "BOOKING", number: originalType === "BOOKING" ? originalNumber : "" };
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
  batchDropzoneActive.value = false;
}

function emptyCustomerBatchPreview() {
  return {
    rows: [],
    items: [],
    globalErrors: [],
    total: 0,
    valid: 0,
    invalid: 0,
    warningCount: 0
  };
}

function selectCustomerBatchMode(mode) {
  batchImportMode.value = mode;
  batchPreviewError.value = "";
}

function quickImportSourceRows() {
  return quickImportText.value.split(/\r?\n/).map((line, index) => {
    const [username = "", clientCode = ""] = line.split(/[,，\t]/, 2).map((value) => value.trim());
    return { rowNumber: index + 1, username, clientCode };
  }).filter((row) => row.username);
}

async function downloadCustomerImportTemplate() {
  try {
    const XLSX = await loadXlsxModule();
    const workbook = buildCustomerImportTemplate(XLSX);
    XLSX.writeFile(workbook, `customer-import-template-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (error) {
    batchPreviewError.value = error?.message || t("customers.customerTemplateFailed");
  }
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
  customerBatchPreview.value = emptyCustomerBatchPreview();
  batchFileName.value = "";
  batchPreviewError.value = "";
  if (!file) return;
  customerFileParsing.value = true;
  try {
    await waitForNextPaint();
    const XLSX = await loadXlsxModule();
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    customerBatchPreview.value = parseCustomerImportWorkbook(workbook, XLSX);
    batchFileName.value = file.name;
  } catch (error) {
    customerBatchPreview.value = emptyCustomerBatchPreview();
    batchPreviewError.value = error?.message || t("customers.excelReadFailed");
  } finally {
    customerFileParsing.value = false;
    event.target.value = "";
  }
}

async function submitBatchImport() {
  if (importingCustomers.value) return;
  const preview = activeCustomerBatchPreview.value;
  if (!preview.items.length) {
    batchPreviewError.value = t("customers.noImportRows");
    return;
  }
  if (preview.invalid || preview.globalErrors.length) {
    batchPreviewError.value = t("customers.fixInvalidRowsBeforeImport");
    return;
  }
  importingCustomers.value = true;
  batchPreviewError.value = "";
  try {
    const response = await batchCreateBusinessCustomers({
      sourceFileName: batchImportMode.value === "excel" ? batchFileName.value : "quick-entry",
      items: preview.items
    });
    batchCredentialRows.value = Array.isArray(response?.items) ? response.items : [];
    batchImportDialogOpen.value = false;
    quickImportText.value = "";
    customerBatchPreview.value = emptyCustomerBatchPreview();
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
      [t("customers.excelRow")]: row.rowNumber,
      [t("customers.createAccount")]: row.username,
      [t("customers.createDisplayName")]: row.displayName || row.username,
      [t("customers.clientCode")]: row.customerCode || row.clientCode || "",
      [t("customers.initialPassword")]: row.password || "",
      [t("customers.importStatus")]: row.status === "CREATED"
        ? t("customers.importCreated")
        : t("customers.importFailedStatus"),
      [t("customers.failureReason")]: row.status === "CREATED"
        ? ""
        : localizeCustomerImportResult(row.message)
    }));
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = [
      { wch: 10 },
      { wch: 24 },
      { wch: 28 },
      { wch: 22 },
      { wch: 24 },
      { wch: 16 },
      { wch: 58 }
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customer credentials");
    XLSX.writeFile(workbook, `customer-credentials-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } finally {
    exportingCredentials.value = false;
  }
}

function closeBatchCredentials() {
  batchCredentialRows.value = [];
}

function customerImportIssueText(problem) {
  const keys = {
    EMPTY_WORKBOOK: "customers.customerImportEmptyWorkbook",
    WRONG_TEMPLATE: "customers.customerImportWrongTemplate",
    MISSING_CUSTOMER_SHEET: "customers.customerImportMissingSheet",
    MISSING_USERNAME_COLUMN: "customers.customerImportMissingUsernameColumn",
    NO_ROWS: "customers.noImportRows",
    TOO_MANY_ROWS: "customers.customerImportTooManyRows",
    USERNAME_REQUIRED: "customers.customerImportUsernameRequired",
    USERNAME_FORMAT: "customers.usernameRule",
    PASSWORD_LENGTH: "customers.customerImportPasswordLength",
    PASSWORD_COMPLEXITY: "customers.customerImportPasswordComplexity",
    DISPLAY_NAME_LENGTH: "customers.displayNameRule",
    CLIENT_CODE_FORMAT: "customers.customerImportClientCodeFormat",
    PARTY_ROLE_FORMAT: "customers.roleRule",
    REMARK_LENGTH: "customers.customerImportRemarkLength",
    DUPLICATE_USERNAME: "customers.customerImportDuplicateUsername",
    DUPLICATE_CLIENT_CODE: "customers.customerImportDuplicateClientCode",
    PASSWORD_WILL_GENERATE: "customers.customerImportPasswordGenerated",
    CLIENT_CODE_WILL_GENERATE: "customers.customerImportClientCodeGenerated"
  };
  return t(keys[problem?.code] || "customers.importFailed", problem || {});
}

function customerImportFieldLabel(field) {
  const keys = {
    username: "customers.createAccount",
    password: "customers.initialPassword",
    displayName: "customers.createDisplayName",
    clientCode: "customers.clientCode",
    partyRole: "customers.createPartyRole",
    remark: "customers.remark"
  };
  return field && keys[field] ? `${t(keys[field])}：` : "";
}

function customerPartyRoleLabel(role) {
  const keys = {
    SHIPPER: "customers.roleShipper",
    CONSIGNEE: "customers.roleConsignee",
    OVERSEA_AGENT: "customers.roleOverseaAgent"
  };
  return keys[role] ? t(keys[role]) : role || "—";
}

function localizeCustomerImportResult(message) {
  const value = String(message || "");
  if (/username or client code already exists/i.test(value)) {
    return t("customers.customerImportDuplicateServer");
  }
  if (/password must contain (uppercase|at least one letter)/i.test(value)) {
    return t("customers.customerImportPasswordComplexity");
  }
  if (/password must contain 8-128/i.test(value)) {
    return t("customers.customerImportPasswordLength");
  }
  if (/customer name must contain/i.test(value)) {
    return t("customers.usernameRule");
  }
  if (/display name must contain/i.test(value)) {
    return t("customers.displayNameRule");
  }
  if (/client code must contain/i.test(value)) {
    return t("customers.customerImportClientCodeFormat");
  }
  if (/party role/i.test(value)) {
    return t("customers.roleRule");
  }
  return value || t("customers.importFailed");
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
  const roleKey = {
    ADMIN: "portal.roleAdmin",
    BUSINESS: "portal.roleBusiness",
    OVERSEA_AGENT: "portal.roleOverseaAgent",
    EMPLOYEE: "portal.roleEmployee",
    AGENT: "customers.roleAgent",
    SHIPPER: "customers.roleShipper",
    CONSIGNEE: "customers.roleConsignee"
  }[role];
  const roleName = roleKey ? t(roleKey) : role ? role.replaceAll("_", " ") : "";
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
.system-message-button {
  position: relative;
  display: inline-flex;
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid rgba(255, 255, 255, .15);
  border-radius: 8px;
  color: #d7e7f5;
  background: rgba(255, 255, 255, .06);
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 750;
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease, transform 160ms ease;
}
.system-message-button:hover {
  border-color: rgba(114, 207, 255, .45);
  background: rgba(91, 174, 226, .14);
  transform: translateY(-1px);
}
.system-message-button > i {
  display: inline-grid;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 999px;
  color: #fff;
  background: #ef596f;
  box-shadow: 0 0 0 3px rgba(239, 89, 111, .14);
  place-items: center;
  font-size: 9px;
  font-style: normal;
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
  overflow: hidden;
  padding: 12px 0;
}
.sidebar-nav {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  padding: 0 8px;
  overflow-y: auto;
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
.sidebar-profile-card {
  display: grid;
  width: calc(100% - 16px);
  min-width: 0;
  margin: auto 8px 0;
  padding: 10px;
  border: 1px solid #d4deea;
  border-radius: 11px;
  color: #25415d;
  background: rgba(255, 255, 255, .88);
  box-shadow: 0 10px 24px rgba(38, 70, 102, .08);
  grid-template-columns: 34px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 8px;
  text-align: left;
  cursor: pointer;
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}
.sidebar-profile-card:hover {
  border-color: #9cc4e7;
  box-shadow: 0 14px 30px rgba(38, 100, 154, .13);
  transform: translateY(-2px);
}
.sidebar-profile-avatar {
  display: grid;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  color: #fff;
  background: linear-gradient(135deg, #226fb5, #55b9d0);
  box-shadow: 0 7px 16px rgba(34, 111, 181, .22);
  place-items: center;
  font-size: 13px;
  font-weight: 850;
}
.sidebar-profile-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.sidebar-profile-copy b,
.sidebar-profile-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sidebar-profile-copy b { font-size: 11px; }
.sidebar-profile-copy small { color: #7d91a5; font-size: 9px; }
.sidebar-profile-card > .el-icon { color: #8aa1b8; font-size: 12px; }

/* ---- Main Content Area ---- */
.workspace-main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px 28px 30px;
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
.shipment-workspace {
  display: flex;
  gap: 20px;
  min-height: 0;
}
.shipment-workspace-main {
  flex: 1;
  min-width: 0;
}
.shipment-page-heading {
  display: flex;
  min-width: 0;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 0 0 18px;
}
.shipment-page-heading > div:first-child {
  min-width: 0;
}
.shipment-page-heading h2 {
  margin: 0;
  color: #10263a;
  font-size: 24px;
  letter-spacing: -.025em;
}
.shipment-page-heading p {
  max-width: 760px;
  margin: 7px 0 0;
  color: #687d91;
  font-size: 13px;
  line-height: 1.55;
}
.shipment-heading-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
}
.shipment-heading-actions .el-button {
  margin: 0;
}
.batch-track-primary-action {
  min-height: 44px;
  padding-inline: 20px;
  font-weight: 750;
  box-shadow: 0 8px 18px rgba(3, 105, 161, .18);
}
.batch-track-primary-action:hover,
.batch-track-primary-action:focus-visible {
  box-shadow: 0 10px 22px rgba(3, 105, 161, .24);
}
.shipment-command-surface {
  display: grid;
  margin-bottom: 14px;
  padding: 14px 16px;
  border: 1px solid #dbe4ed;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 4px 16px rgba(24, 50, 75, .045);
  gap: 12px;
}
.shipment-filter-bar,
.shipment-bulk-bar {
  display: flex;
  min-width: 0;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}
.shipment-bulk-bar {
  padding-top: 12px;
  border-top: 1px solid #e6edf3;
}
.shipment-bulk-danger:not(:disabled) {
  border-color: #e6b8b4;
  color: #a92d25;
}
.shipment-bulk-danger:not(:disabled):hover,
.shipment-bulk-danger:not(:disabled):focus-visible {
  border-color: #c9463b;
  color: #8f211a;
  background: #fff7f6;
}
.shipment-filter-bar > .el-button,
.shipment-bulk-bar > .el-button {
  min-height: 40px;
  margin: 0;
}
.shipment-toolbar-control > .shipment-customer-filter.el-select {
  width: 238px;
}
.shipment-customer-filter-label {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: #18324b;
  font-size: 14px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shipment-toolbar-control {
  display: grid;
  flex: 0 0 auto;
  min-width: 0;
  align-items: end;
  gap: 6px;
  color: #526b82;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.shipment-toolbar-control > span {
  line-height: 1.2;
}
.shipment-toolbar-control > .shipment-channel-select.el-select {
  width: 220px;
}
.shipment-toolbar-control > .shipment-business-filter.el-select {
  width: 184px;
}
.shipment-toolbar-control :deep(.el-select__selected-item),
.shipment-toolbar-control :deep(.el-select__placeholder) {
  font-size: 14px;
  font-weight: 700;
}
.shipment-toolbar-control :deep(.el-select__wrapper) {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 0 0 1px #c8d6e5 inset;
}
.shipment-toolbar-control :deep(.el-select__input) {
  min-height: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}
.shipment-toolbar-control :deep(.el-select__wrapper:hover) {
  box-shadow: 0 0 0 1px #6fa7d5 inset;
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
  min-width: 0;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px;
}
.shipment-bound-user-tags :deep(.el-tag) {
  min-width: 0;
  max-width: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shipment-list-table :deep(th.el-table__cell .cell) {
  white-space: nowrap;
  word-break: keep-all;
}

.shipment-list-table :deep(td.el-table__cell .cell) {
  padding-inline: 12px;
}

.shipment-status-stack {
  display: grid;
  justify-items: start;
  gap: 5px;
}
.shipment-reference-cell {
  display: inline-flex;
  max-width: 100%;
  align-items: baseline;
  gap: 8px;
  white-space: nowrap;
}
.batch-track-task-dialog-body {
  width: 100%;
  max-width: none;
  min-height: 0;
  position: static;
  top: auto;
  overflow: visible;
}
:deep(.batch-track-task-dialog .el-dialog__body) {
  max-height: calc(100vh - 150px);
  padding: 12px 24px 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
:deep(.batch-track-task-dialog .el-dialog__header) {
  margin-right: 0;
  padding: 20px 24px 14px;
  border-bottom: 1px solid #e2e8f0;
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
  overflow-x: auto;
  overflow-y: visible;
  border: 1px solid #dce6f1;
  border-radius: 0;
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
  transition: opacity 180ms ease, transform 180ms cubic-bezier(.2, .8, .2, 1);
  will-change: opacity, transform;
}
.fade-leave-active {
  transition-duration: 120ms;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 180ms ease, transform 180ms cubic-bezier(.2, .8, .2, 1);
  will-change: opacity, transform;
}
.fade-slide-leave-active {
  transition-duration: 120ms;
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(5px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-4px);
}
.workspace-view,
.subview-wrap {
  width: 100%;
  min-width: 0;
}
.workspace-view {
  padding-inline: 2px;
}
.assignment-customer-row {
  display: grid;
  grid-template-columns: minmax(300px, 1fr) auto;
  align-items: end;
  gap: 20px;
  padding: 14px 16px;
  border: 1px solid #d9e2ef;
  border-radius: 0;
  background: #f8fafc;
}
.assignment-customer-row > label {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.assignment-customer-row .business-select {
  width: 100%;
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
  max-width: 100%;
  min-width: 0;
}
.business-overview {
  display: grid;
  gap: 18px;
}
.business-overview-header {
  margin-bottom: 0;
  padding: 4px 0 2px;
}
.business-overview-header p {
  margin: 6px 0 0;
  color: #71869a;
  font-size: 12px;
}
.business-overview-kicker {
  display: block;
  margin-bottom: 5px;
  color: #3982be;
  font-size: 9px;
  font-weight: 850;
  letter-spacing: .14em;
  text-transform: uppercase;
}
.business-kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}
.business-kpi-card {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 132px;
  padding: 15px;
  border: 1px solid #d9e5ef;
  border-radius: 15px;
  background:
    radial-gradient(circle at 100% 0%, rgba(75, 139, 199, .14), transparent 44%),
    #fff;
  box-shadow: 0 10px 30px rgba(33, 64, 92, .075);
  align-content: space-between;
  overflow: hidden;
  transition: transform 180ms ease, box-shadow 180ms ease;
  animation: business-kpi-in 400ms ease both;
}
.business-kpi-card:nth-child(2) { animation-delay: 45ms; }
.business-kpi-card:nth-child(3) { animation-delay: 90ms; }
.business-kpi-card:nth-child(4) { animation-delay: 135ms; }
.business-kpi-card:nth-child(5) { animation-delay: 180ms; }
.business-kpi-card:hover {
  box-shadow: 0 16px 34px rgba(33, 78, 119, .13);
  transform: translateY(-2px);
}
.business-kpi-card::before {
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: #3a83c1;
  content: "";
}
.business-kpi-card__top {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}
.business-kpi-card__top > span:last-child {
  overflow: hidden;
  color: #536f88;
  font-size: 11px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.business-kpi-card__icon {
  display: grid;
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: #347fc0;
  background: #eaf4fc;
  place-items: center;
  font-size: 17px;
  box-shadow: inset 0 0 0 1px rgba(52, 127, 192, .08);
}
.business-kpi-card__value {
  display: grid;
  min-width: 0;
  gap: 7px;
}
.business-kpi-card__value > b {
  color: #193750;
  font-size: clamp(26px, 2.2vw, 36px);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.business-kpi-card__value > small {
  overflow: hidden;
  color: #8a9daf;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.business-kpi-card.is-amber::before { background: #e4a83d; }
.business-kpi-card.is-green::before { background: #3dad80; }
.business-kpi-card.is-purple::before { background: #7c6fd1; }
.business-kpi-card.is-cyan::before { background: #35a8bd; }
.business-kpi-card.is-amber .business-kpi-card__icon { color: #c9871b; background: #fff5df; }
.business-kpi-card.is-green .business-kpi-card__icon { color: #278a67; background: #e8f8f1; }
.business-kpi-card.is-purple .business-kpi-card__icon { color: #6b5cc3; background: #f0edff; }
.business-kpi-card.is-cyan .business-kpi-card__icon { color: #238ca0; background: #e7f7fa; }
.business-chart-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(320px, .9fr);
  gap: 14px;
}
.business-chart-card {
  min-width: 0;
  padding: 17px 18px 14px;
  border: 1px solid #dbe6ef;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(33, 64, 92, .065);
  overflow: hidden;
}
.business-chart-card > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.business-chart-card > header > div {
  display: grid;
  gap: 3px;
}
.business-chart-card header b { color: #203d57; font-size: 13px; }
.business-chart-card header small {
  color: #8a9daf;
  font-size: 9px;
  line-height: 1.5;
}
.business-chart-body {
  position: relative;
  min-height: 280px;
  margin-top: 6px;
}
.business-echart {
  width: 100%;
  height: 280px;
}
.business-chart-empty {
  position: absolute;
  z-index: 2;
  display: grid;
  inset: 0;
  background: rgba(255, 255, 255, .94);
  place-items: center;
}
.business-chart-empty :deep(.el-empty) { padding: 16px 0; }
.business-chart-empty :deep(.el-empty__description) { margin-top: 4px; }
.business-chart-empty :deep(.el-empty__description p) {
  color: #91a3b3;
  font-size: 10px;
}
.business-chart-body :deep(.el-loading-mask) {
  background: rgba(255, 255, 255, .82);
}
.business-overview-warning {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #f0dfb7;
  border-radius: 10px;
  color: #916d28;
  background: #fff8e7;
  font-size: 10px;
  line-height: 1.5;
}
.shipment-remark-cell {
  display: flex;
  align-items: center;
  min-width: 0;
}
.shipment-today-tags {
  display: flex;
  min-height: 27px;
  align-items: center;
  flex-wrap: nowrap;
  gap: 7px;
}
.shipment-list-table .shipment-today-tags {
  flex-wrap: nowrap;
}
.shipment-list-table .table-action-buttons--single-line .el-button {
  padding-inline: 8px;
}
.shipment-today-tags :deep(.el-tag) {
  height: 25px;
  padding-inline: 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .01em;
  box-shadow: none;
}
.shipment-today-tags :deep(.shipment-today-tag.is-created) {
  border-color: #fecdd3;
  color: #be123c;
  background: #fff1f2;
}
.shipment-today-tags :deep(.shipment-today-tag.is-updated) {
  background: #16b86a;
  box-shadow: 0 4px 10px rgba(18, 132, 78, .18);
}
.shipment-today-tags :deep(.shipment-today-tag.is-pending) {
  color: #9a5a05;
  border: 1px solid #efc46c;
  background: #fff8e8;
  box-shadow: none;
}
.shipment-today-tags :deep(.shipment-today-tag.is-failed) {
  color: #b43d3d;
  border: 1px solid #efb0b0;
  background: #fff2f2;
  box-shadow: none;
}
.shipment-list-table :deep(.el-table__body-wrapper),
.customer-directory-table :deep(.el-table__body-wrapper),
.standard-information-table :deep(.el-table__body-wrapper) {
  transition: opacity 140ms ease, transform 140ms ease;
}
.is-page-switching :deep(.el-table__body-wrapper) {
  opacity: .52;
  transform: translateY(3px);
}
.shipment-list-table :deep(.el-table__cell:first-child .cell) {
  white-space: nowrap;
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
  from { opacity: 0; transform: translateY(9px); }
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
.table-action-buttons--single-line {
  flex-wrap: nowrap;
  gap: 6px;
}
.table-action-buttons--single-line .el-button {
  min-width: 0;
  margin: 0;
  padding-inline: 11px;
}
.customer-directory-table :deep(.customer-code-column .cell) {
  color: #1d5f91;
  font: 700 12px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace;
}
.shipment-reference-type {
  flex: 0 0 auto;
  color: #74879b;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.business-select-value {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: #18324b;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:deep(.el-select__selection) {
  min-width: 0;
}
:deep(.el-select__selected-item) {
  min-width: 0;
  max-width: 100%;
  color: #18324b;
  opacity: 1;
}
:deep(.el-select__selected-item > span) {
  overflow: hidden;
  color: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  box-shadow: 0 5px 12px rgba(40, 124, 203, .22);
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
  box-shadow: 0 4px 14px rgba(21, 48, 72, .04);
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
  font: 750 12px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace;
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
  box-shadow: 0 7px 16px rgba(40, 120, 188, .18);
  font-size: 14px;
  font-weight: 850;
  place-items: center;
}
.handover-target-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  padding: 14px 16px;
  border: 1px solid #cfe0ef;
  border-radius: 12px;
  background: linear-gradient(135deg, #f1f8ff, #fbfdff);
}
.handover-target-summary > span:last-child {
  display: grid;
  gap: 4px;
}
.handover-target-summary small {
  color: #72889c;
  font-size: 11px;
}
.handover-target-summary b {
  color: #1e405b;
  font-size: 14px;
}
.handover-permission-hint {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #d8e6f1;
  border-radius: 9px;
  color: #5d758a;
  background: #f7fafc;
  font-size: 12px;
  line-height: 1.6;
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
  animation: operations-overlay-in 220ms ease both;
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
  animation: operations-dialog-in 190ms cubic-bezier(.2, .8, .2, 1) both;
}
.password-rule-preview {
  display: grid !important;
  gap: 8px !important;
  padding: 14px;
  border: 1px solid #d6e3ee;
  border-radius: 10px;
  color: #5c7186;
  background: #f6f9fc;
}
.password-rule-preview code,
.password-result-grid code {
  color: #0e5f97;
  font: 800 14px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace;
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
  border-radius: 8px;
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

.shipment-excel-import-dialog {
  width: min(1320px, calc(100vw - 64px));
  max-height: min(94vh, 1020px);
  padding: 28px 32px 0;
  overflow: hidden;
}

.shipment-excel-import-heading {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.shipment-excel-import-heading > div {
  display: grid;
  min-width: 0;
  gap: 9px;
}

.shipment-excel-import-heading p {
  max-width: 900px;
  color: #64788c;
  font-size: 13px;
  line-height: 1.65;
}

.shipment-excel-import-heading-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
}

.shipment-excel-import-heading-actions > .manual-add-button {
  flex: 0 0 auto;
  min-width: 176px;
  white-space: nowrap;
}

.shipment-excel-close-button {
  display: inline-grid;
  width: 40px;
  min-width: 40px;
  height: 40px;
  min-height: 40px;
  padding: 0;
  border: 1px solid #d7e1eb;
  border-radius: 8px;
  color: #526b82;
  background: #fff;
  cursor: pointer;
  place-items: center;
  transition: border-color 160ms ease, color 160ms ease, background-color 160ms ease;
}

.shipment-excel-close-button:hover {
  border-color: #9eb5c9;
  color: #153b5c;
  background: #f6f9fc;
}

.shipment-excel-close-button:focus-visible {
  outline: 3px solid rgba(3, 105, 161, .18);
  outline-offset: 2px;
}

.customer-code-dialog > .shipment-excel-import-body {
  display: grid;
  min-height: 0;
  max-height: calc(min(94vh, 1020px) - 210px);
  margin-top: 4px;
  padding: 2px 8px 4px 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  gap: 16px;
}

.shipment-excel-customer-row {
  padding: 0 0 2px;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.shipment-excel-customer-row > label > span {
  color: #435d76;
  font-size: 12px;
  font-weight: 750;
}

.shipment-excel-customer-row :deep(.el-checkbox) {
  min-height: 40px;
  padding: 0 4px;
}

.shipment-excel-import-dropzone {
  min-height: 150px;
  border-width: 1px;
  border-color: #a9bfd1;
  border-radius: 12px;
  background: #f8fbfd;
}

.shipment-excel-import-dropzone:hover,
.shipment-excel-import-dropzone.is-dragover {
  border-color: #4288ba;
  background: #f2f8fc;
  transform: none;
}

.shipment-excel-upload-icon {
  display: grid;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  color: #126b9f;
  background: #e7f3f9;
  font-size: 20px;
  place-items: center;
}

.shipment-excel-import-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.shipment-excel-import-summary > span {
  display: grid;
  min-height: 74px;
  padding: 12px 16px;
  border: 0;
  border-left: 3px solid #9bb0c2;
  border-radius: 8px;
  background: #f7f9fb;
  align-content: center;
  gap: 3px;
}

.shipment-excel-import-summary b {
  color: #24445f;
  font-size: 22px;
}

.shipment-excel-import-summary small {
  color: #7b90a5;
  font-size: 10px;
  font-weight: 700;
}

.shipment-excel-import-summary .is-valid {
  border-color: #45a781;
  background: #f2fbf7;
}

.shipment-excel-import-summary .is-valid b {
  color: #238560;
}

.shipment-excel-import-summary .is-invalid {
  border-color: #d46a73;
  background: #fff7f7;
}

.shipment-excel-import-summary .is-invalid b {
  color: #be4f5b;
}

.shipment-excel-import-summary .has-warning {
  border-color: #c99235;
  background: #fffbf1;
}

.shipment-excel-import-summary .has-warning b {
  color: #a46a17;
}

.shipment-excel-import-errors {
  padding: 13px 16px;
  border: 0;
  border-left: 3px solid #d46a73;
  border-radius: 8px;
  color: #9c3f49;
  background: #fff7f7;
  font-size: 12px;
  line-height: 1.55;
}

.shipment-excel-import-errors ul {
  margin: 7px 0 0;
  padding-left: 18px;
}

.shipment-excel-import-table-wrap {
  max-height: 420px;
  border: 1px solid #dce5ee;
  border-radius: 10px;
  overflow: hidden;
}

.shipment-excel-import-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  font-size: 11px;
}

.shipment-excel-import-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 10px 12px;
  color: #4d657b;
  background: #f2f6fa;
  text-align: left;
  white-space: nowrap;
}

.shipment-excel-import-table td {
  max-width: 330px;
  padding: 11px 12px;
  color: #526a80;
  vertical-align: top;
}

.shipment-excel-import-table tr.is-invalid td {
  background: #fff8f8;
}

.shipment-excel-import-table tr.has-warning:not(.is-invalid) td {
  background: #fffdf7;
}

.import-state-error,
.import-state-ready {
  display: inline-flex;
  padding: 3px 7px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 800;
  white-space: nowrap;
}

.import-state-error {
  color: #b84955;
  background: #fdecef;
}

.import-state-ready {
  color: #237b59;
  background: #e8f7f0;
}

.shipment-excel-validation-list {
  display: grid;
  gap: 5px;
}

.shipment-excel-validation-list > span {
  position: relative;
  padding-left: 12px;
  color: #8e3f49;
  line-height: 1.5;
}

.shipment-excel-validation-list > span::before {
  position: absolute;
  top: .62em;
  left: 1px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  content: "";
}

.shipment-excel-validation-list.is-warning > span {
  color: #8b641e;
}

.shipment-excel-validation-empty {
  color: #91a0ae;
}

.shipment-excel-import-progress {
  display: grid;
  padding: 14px 16px;
  border: 0;
  border-radius: 10px;
  background: #f8fbfe;
  gap: 13px;
}

.shipment-excel-import-progress > div:first-child {
  display: grid;
  gap: 9px;
}

.shipment-excel-import-result-list {
  display: grid;
  max-height: 210px;
  overflow-y: auto;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}

.shipment-excel-import-result-list > span {
  display: grid;
  min-width: 0;
  padding: 9px 11px;
  border: 1px solid #dce5ee;
  border-radius: 8px;
  background: #fff;
  gap: 2px;
}

.shipment-excel-import-result-list .is-created {
  border-color: #bfe5d4;
}

.shipment-excel-import-result-list .is-updated {
  border-color: #b9d7f5;
  background: #f5faff;
}

.shipment-excel-import-result-list .is-failed {
  border-color: #f0c9cd;
  background: #fff8f8;
}

.shipment-excel-import-result-list b,
.shipment-excel-import-result-list small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shipment-excel-import-result-list small {
  color: #7b90a5;
  font-size: 9px;
}

.shipment-excel-import-actions {
  position: sticky;
  bottom: 0;
  z-index: 4;
  margin: 0 -32px;
  padding: 14px 32px 18px;
  border-top: 1px solid #dce6ef;
  background: rgba(255, 255, 255, .97);
  box-shadow: 0 -10px 22px rgba(15, 35, 55, .045);
  backdrop-filter: blur(8px);
}

.shipment-excel-import-actions button {
  flex: 0 0 auto;
  min-width: 132px;
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
.customer-batch-dialog,
.customer-credential-dialog {
  position: relative;
  width: min(1180px, calc(100vw - 48px));
  max-height: min(92vh, 980px);
  padding: 26px 28px 0;
  overflow: hidden;
  background:
    radial-gradient(circle at 94% 0%, rgba(71, 151, 226, .12), transparent 28%),
    linear-gradient(180deg, #fff 0%, #fbfdff 100%);
}
.customer-batch-dialog::before {
  position: absolute;
  top: 0;
  left: 28px;
  right: 28px;
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(90deg, #2e7cca, #55c7d9, #2e7cca);
  background-size: 200% 100%;
  content: "";
  animation: customer-batch-shimmer 3.5s linear infinite;
}
.customer-batch-heading {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}
.customer-batch-heading > div {
  display: grid;
  min-width: 0;
  margin: 0;
  gap: 8px;
}
.customer-batch-heading p {
  max-width: 820px;
}
.customer-template-button {
  flex: 0 0 auto !important;
  min-width: 178px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid #b9d1e8;
  border-radius: 8px;
  color: #2369a7;
  background: #f4f9ff;
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  cursor: pointer;
}
.customer-code-dialog > .customer-batch-body,
.customer-code-dialog > .customer-credential-body {
  display: grid;
  min-height: 0;
  max-height: calc(min(92vh, 980px) - 188px);
  margin: 0;
  padding: 2px 7px 2px 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  gap: 14px;
}
.customer-import-rules {
  display: grid;
  padding: 14px;
  border: 1px solid #dbe6f0;
  border-radius: 12px;
  background: #f8fbfe;
  gap: 12px;
}
.customer-import-rules > header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}
.customer-import-rules > header b {
  color: #1c3d5a;
  font-size: 13px;
}
.customer-import-rules > header small {
  color: #73899e;
  font-size: 10px;
}
.customer-import-rules > div {
  display: grid;
  margin: 0;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.customer-import-rules article {
  display: flex;
  min-width: 0;
  padding: 10px;
  border: 1px solid #e2eaf2;
  border-radius: 9px;
  background: #fff;
  gap: 9px;
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
  animation: customer-rule-in 360ms ease both;
}
.customer-import-rules article:nth-child(2) { animation-delay: 45ms; }
.customer-import-rules article:nth-child(3) { animation-delay: 90ms; }
.customer-import-rules article:nth-child(4) { animation-delay: 135ms; }
.customer-import-rules article:nth-child(5) { animation-delay: 180ms; }
.customer-import-rules article:hover {
  border-color: #9bc5e8;
  box-shadow: 0 10px 24px rgba(35, 105, 167, .1);
  transform: translateY(-2px);
}
.customer-import-rules article > strong {
  display: inline-grid;
  flex: 0 0 26px;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  color: #3479ba;
  background: #eaf4ff;
  place-items: center;
  font-size: 9px;
}
.customer-import-rules article > span {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.customer-import-rules article b {
  color: #294b68;
  font-size: 10px;
}
.customer-import-rules article small {
  color: #72879b;
  font-size: 9px;
  line-height: 1.55;
}
.customer-batch-tabs {
  display: flex;
  margin: 0 !important;
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
  transition: color 160ms ease, background-color 160ms ease, border-color 160ms ease, transform 160ms ease;
}
.customer-batch-tabs button:hover {
  border-color: #8dbbe3;
  transform: translateY(-1px);
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
  background: linear-gradient(180deg, #fff, #fbfdff);
  box-shadow: 0 8px 22px rgba(39, 91, 138, .05);
  transition: border-color 180ms ease, box-shadow 180ms ease;
}
.customer-batch-textarea textarea:focus {
  border-color: #438fd2;
  box-shadow: 0 0 0 3px rgba(67, 143, 210, .12), 0 12px 28px rgba(39, 91, 138, .08);
  outline: none;
}
.customer-batch-textarea small {
  color: #889aaf;
  font-size: 10px;
}
.customer-import-dropzone {
  min-height: 116px;
  padding: 20px 16px;
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
.customer-import-file-error {
  display: grid !important;
  margin: 0 !important;
  padding: 11px 13px;
  border: 1px solid #f0c6cc;
  border-radius: 9px;
  color: #983746;
  background: #fff7f8;
  gap: 4px !important;
}
.customer-import-file-error b {
  font-size: 10px;
  letter-spacing: .06em;
}
.customer-import-file-error span {
  font-size: 11px;
  line-height: 1.6;
}
.customer-import-summary {
  display: grid !important;
  margin: 0 !important;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px !important;
}
.customer-import-summary > span {
  display: grid;
  min-height: 62px;
  padding: 10px 13px;
  border: 1px solid #dce6ef;
  border-radius: 9px;
  background: #f8fafc;
  align-content: center;
  gap: 2px;
}
.customer-import-summary > span b {
  color: #24445f;
  font-size: 20px;
}
.customer-import-summary > span small {
  color: #7b90a5;
  font-size: 9px;
  font-weight: 750;
}
.customer-import-summary > .is-valid {
  border-color: #bfe5d4;
  background: #f2fbf7;
}
.customer-import-summary > .is-valid b {
  color: #1d805d;
}
.customer-import-summary > .is-invalid {
  border-color: #f0c8ce;
  background: #fff7f8;
}
.customer-import-summary > .is-invalid b {
  color: #b13f50;
}
.customer-import-summary > .is-warning {
  border-color: #ecd9ad;
  background: #fffbf2;
}
.customer-import-summary > .is-warning b {
  color: #93691c;
}
.customer-import-preview {
  max-height: 340px;
  margin: 0 !important;
  border: 1px solid #dce6ef;
  border-radius: 0;
  overflow: auto;
}
.customer-import-preview table {
  width: 100%;
  min-width: 880px;
  border-collapse: collapse;
  table-layout: fixed;
}
.customer-import-preview th,
.customer-import-preview td {
  padding: 10px 11px;
  border-bottom: 1px solid #e8eef4;
  color: #405c74;
  font-size: 10px;
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}
.customer-import-preview th {
  position: sticky;
  top: 0;
  z-index: 2;
  color: #49647c;
  background: #f4f7fa;
  font-size: 9px;
  letter-spacing: .04em;
}
.customer-import-preview th:nth-child(1) { width: 70px; }
.customer-import-preview th:nth-child(2) { width: 145px; }
.customer-import-preview th:nth-child(3) { width: 150px; }
.customer-import-preview th:nth-child(4) { width: 132px; }
.customer-import-preview th:nth-child(5) { width: 145px; }
.customer-import-preview th:nth-child(6) { width: 135px; }
.customer-import-preview th:nth-child(7) { width: 108px; }
.customer-import-preview tr.is-invalid td {
  background: #fff9fa;
}
.customer-import-value-pill,
.customer-import-ready {
  display: inline-flex;
  padding: 4px 7px;
  border-radius: 999px;
  color: #237356;
  background: #eaf8f2;
  font-size: 9px;
  font-weight: 750;
}
.customer-import-value-pill.is-generated {
  color: #7f5d18;
  background: #fff7df;
}
.customer-import-validation-pill {
  display: inline-flex;
  padding: 4px 7px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 750;
  white-space: nowrap;
}
.customer-import-validation-pill.is-error {
  color: #a73d4c;
  background: #fff0f2;
}
.customer-import-validation-pill.is-warning {
  color: #84611a;
  background: #fff8e8;
}
.customer-import-issue-row td {
  padding: 0 11px 10px;
  background: #fff !important;
}
.customer-import-issues {
  display: flex !important;
  flex-wrap: wrap;
  margin: 0 !important;
  gap: 5px !important;
}
.customer-import-issues > span {
  display: block;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 9px;
  line-height: 1.5;
}
.customer-import-issues > .is-error {
  color: #a73d4c;
  background: #fff0f2;
}
.customer-import-issues > .is-warning {
  color: #84611a;
  background: #fff8e8;
}
.customer-import-issues b {
  margin-right: 3px;
}
.customer-batch-actions {
  position: sticky;
  bottom: 0;
  display: flex !important;
  min-height: 64px;
  margin: 0 -28px !important;
  padding: 12px 28px 14px;
  border-top: 1px solid #dce6ef;
  background: rgba(255, 255, 255, .97);
  align-items: center;
  justify-content: flex-end;
  backdrop-filter: blur(8px);
}
.customer-batch-actions > small {
  margin-right: auto;
  color: #a23e4d;
  font-size: 10px;
}
.customer-batch-actions button {
  flex: 0 0 auto !important;
  min-width: 160px;
}
.agent-create-intro,
.agent-batch-intro {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 18px;
  padding: 15px;
  border: 1px solid #d6e5f2;
  border-radius: 12px;
  background:
    radial-gradient(circle at 100% 0%, rgba(72, 167, 215, .13), transparent 40%),
    linear-gradient(135deg, #f2f8ff, #fbfdff);
}
.agent-create-intro > span {
  display: grid;
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  color: #fff;
  background: linear-gradient(135deg, #2878bc, #56b9d2);
  box-shadow: 0 9px 20px rgba(40, 120, 188, .2);
  place-items: center;
}
.agent-create-intro > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}
.agent-create-intro b { color: #1e405b; font-size: 13px; }
.agent-create-intro small { color: #71879b; font-size: 10px; line-height: 1.6; }
.agent-create-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}
.agent-create-form .agent-password-field,
.agent-create-form .el-alert {
  grid-column: 1 / -1;
}
.agent-field-hint {
  display: block;
  margin-top: 5px;
  color: #8295a8;
  font-size: 9px;
  line-height: 1.5;
}
.agent-password-rules {
  display: grid;
  width: 100%;
  margin-top: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.agent-password-rules span {
  display: inline-flex;
  padding: 6px 8px;
  border-radius: 7px;
  color: #8a6270;
  background: #fff3f5;
  align-items: center;
  gap: 6px;
  font-size: 9px;
}
.agent-password-rules span.is-valid {
  color: #267458;
  background: #eefaf5;
}
.agent-password-rules i { font-style: normal; font-weight: 850; }
.agent-batch-intro {
  justify-content: space-between;
  align-items: center;
}
.agent-batch-intro > div {
  display: grid;
  gap: 4px;
}
.agent-batch-intro h3 {
  margin: 0;
  color: #1d3b55;
  font-size: 16px;
}
.agent-batch-intro p {
  margin: 0;
  color: #73899d;
  font-size: 10px;
}
.agent-import-dropzone {
  display: grid;
  min-height: 148px;
  padding: 22px;
  border: 1px dashed #abc8df;
  border-radius: 13px;
  color: #58758e;
  background:
    radial-gradient(circle at 50% -25%, rgba(61, 139, 201, .13), transparent 54%),
    #f8fbfe;
  place-items: center;
  gap: 7px;
  cursor: pointer;
  transition: transform 180ms ease, border-color 180ms ease, background-color 180ms ease;
}
.agent-import-dropzone:hover,
.agent-import-dropzone.is-dragover {
  border-color: #438fca;
  background-color: #f1f8ff;
  transform: translateY(-2px);
}
.agent-import-dropzone.has-file {
  border-color: #63b694;
  background-color: #f3fcf7;
}
.agent-import-dropzone input { display: none; }
.agent-import-dropzone > span {
  display: grid;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  color: #2f78b4;
  background: #e5f2fd;
  place-items: center;
  font-size: 17px;
}
.agent-import-dropzone b { color: #264964; font-size: 12px; }
.agent-import-dropzone small { color: #8498aa; font-size: 9px; }
.agent-batch-summary {
  display: grid;
  margin: 14px 0 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.agent-batch-summary > span {
  display: grid;
  min-height: 62px;
  padding: 10px 12px;
  border: 1px solid #dce6ef;
  border-radius: 9px;
  background: #f7fafc;
  align-content: center;
  gap: 2px;
}
.agent-batch-summary b { color: #274a65; font-size: 20px; }
.agent-batch-summary small { color: #8397aa; font-size: 9px; }
.agent-batch-summary .is-valid { border-color: #bde3d2; background: #f1fbf6; }
.agent-batch-summary .is-invalid { border-color: #efc4ca; background: #fff5f6; }
.agent-batch-summary .is-created { border-color: #bed9ee; background: #f1f8fe; }
.agent-batch-preview { margin-bottom: 12px; }
.agent-batch-preview :deep(.is-invalid td) { background: #fff7f8 !important; }
.agent-batch-preview :deep(.is-created td) { background: #f4fbf7 !important; }
.agent-password-mask {
  color: #667f94;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  letter-spacing: .08em;
}
.agent-row-errors {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.agent-row-errors span {
  padding: 4px 6px;
  border-radius: 5px;
  color: #9c3d4b;
  background: #fff0f2;
  font-size: 9px;
}
.operations-profile-hero {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: -4px 0 18px;
  padding: 14px;
  border: 1px solid #d8e6f2;
  border-radius: 12px;
  background: linear-gradient(135deg, #f1f8ff, #f8fbff);
}
.operations-profile-avatar {
  display: grid;
  flex: 0 0 44px;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  color: #fff;
  background: linear-gradient(135deg, #226fb5, #4aa4d7);
  font-size: 18px;
  font-weight: 850;
  place-items: center;
}
.operations-profile-hero > div {
  display: grid;
  flex: 1;
  gap: 3px;
}
.operations-profile-hero b { color: #18324b; }
.operations-profile-hero small { color: #73889c; }
.operations-profile-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
}
.operations-profile-section {
  min-width: 0;
  padding: 16px;
  border: 1px solid #dae5ee;
  border-radius: 12px;
  background: #fbfdff;
}
.operations-profile-section.is-security {
  background: linear-gradient(180deg, #fffcf7, #fff);
}
.operations-profile-section > header {
  display: grid;
  margin-bottom: 13px;
  gap: 3px;
}
.operations-profile-section header b { color: #23435d; font-size: 13px; }
.operations-profile-section header small { color: #8296a8; font-size: 9px; line-height: 1.5; }
.operations-profile-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}
.operations-profile-form .el-form-item:nth-child(3),
.operations-profile-form .el-alert {
  grid-column: 1 / -1;
}
.operations-profile-form > .el-button,
.operations-password-form > .el-button {
  justify-self: end;
}
.operations-password-form {
  display: grid;
}
.operations-password-rule {
  display: block;
  margin: -7px 0 12px;
  color: #8a785d;
  font-size: 9px;
  line-height: 1.5;
}
.operations-password-form .el-alert {
  margin-bottom: 10px;
}
@keyframes operations-overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes operations-dialog-in {
  from { opacity: 0; transform: translateY(14px) scale(.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes customer-batch-shimmer {
  to { background-position: -200% 0; }
}
@keyframes customer-rule-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.customer-field-rule {
  color: #71879b;
  font-size: 10px;
  line-height: 1.5;
}

/* Credential table */
.customer-credential-dialog .customer-credential-body {
  max-height: calc(min(92vh, 980px) - 174px);
}
.customer-credential-dialog .customer-import-summary {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.customer-credential-table {
  border: 1px solid #e0e7f0;
  border-radius: 10px;
  max-height: 460px;
  overflow: auto;
}
.customer-credential-table-head,
.customer-credential-row {
  display: grid;
  min-width: 820px;
  grid-template-columns: 58px 130px 145px 130px minmax(150px, 1fr) 90px;
  align-items: start;
  gap: 10px;
  padding: 10px 12px;
  font-size: 10px;
}
.customer-credential-table-head {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f4f7fb;
  color: #5e7794;
  font-weight: 800;
  font-size: 10px;
  letter-spacing: 0.04em;
}
.customer-credential-entry {
  min-width: 820px;
  border-bottom: 1px solid #eef2f7;
}
.customer-credential-entry.is-failed {
  background: #fff8f8;
}
.customer-credential-entry:last-child {
  border-bottom: 0;
}
.customer-credential-password {
  color: #204d70;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.customer-credential-row i {
  display: inline-flex;
  padding: 4px 7px;
  border-radius: 999px;
  font-style: normal;
  font-size: 9px;
  font-weight: 800;
}
.customer-credential-row i.is-created {
  color: #197454;
  background: #e9f8f1;
}
.customer-credential-row i.is-failed {
  color: #a93e4e;
  background: #ffeaed;
}
.customer-credential-message {
  display: flex;
  margin: 0 12px 10px;
  padding: 8px 10px;
  border-radius: 7px;
  color: #7b5360;
  background: #fff0f2;
  line-height: 1.6;
  overflow-wrap: anywhere;
  gap: 8px;
}
.customer-credential-message b {
  flex: 0 0 auto;
  color: #a93e4e;
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
    padding: 18px 16px 22px;
  }
  .shipment-page-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 14px;
  }
  .shipment-heading-actions {
    width: 100%;
    flex-wrap: wrap;
  }
  .business-kpi-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .business-chart-grid,
  .operations-profile-layout {
    grid-template-columns: 1fr;
  }
  .shipment-pagination :deep(.el-pagination__total) {
    display: none;
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
    padding-bottom: 8px;
  }
  .workspace-main {
    padding: 14px 10px 18px;
  }
  .workspace-view {
    padding-inline: 0;
  }
  .shipment-page-heading {
    padding: 2px 4px 14px;
  }
  .shipment-page-heading h2 {
    font-size: 21px;
  }
  .shipment-heading-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
  .shipment-heading-actions .el-button {
    width: 100%;
  }
  .shipment-command-surface {
    padding: 12px;
  }
  .shipment-filter-bar,
  .shipment-bulk-bar {
    display: grid;
    grid-template-columns: 1fr;
  }
  .shipment-filter-bar > .el-button,
  .shipment-bulk-bar > .el-button {
    width: 100%;
  }
  .shipment-customer-filter {
    width: 100%;
  }
  .shipment-toolbar-control {
    width: 100%;
  }
  .shipment-toolbar-control :deep(.el-select) {
    width: 100%;
  }
  .sidebar-nav {
    flex-direction: row;
    padding: 4px 6px;
    overflow-x: auto;
  }
  .sidebar-nav button {
    flex: 1;
    justify-content: center;
    min-height: 36px;
    padding: 6px 8px;
    font-size: 10px;
  }
  .sidebar-profile-card {
    width: calc(100% - 12px);
    margin: 5px 6px 0;
  }
  .system-message-button > span {
    display: none;
  }
  .business-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
  .business-chart-card {
    padding-inline: 14px;
  }
  .business-chart-body,
  .business-echart {
    height: 252px;
    min-height: 252px;
  }
  .agent-create-form,
  .agent-password-rules {
    grid-template-columns: 1fr;
  }
  .agent-batch-intro {
    align-items: stretch;
    flex-direction: column;
  }
  .agent-batch-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .operations-profile-form {
    grid-template-columns: 1fr;
  }
  .operations-profile-form .el-form-item {
    grid-column: 1 / -1;
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
  .shipment-excel-import-dialog {
    width: calc(100vw - 16px);
    max-height: calc(100vh - 16px);
    padding: 18px 16px 0;
  }
  .shipment-excel-import-heading {
    flex-direction: column;
    gap: 12px;
  }
  .shipment-excel-import-heading-actions {
    width: 100%;
  }
  .shipment-excel-import-heading-actions > .manual-add-button {
    flex: 1 1 auto;
    min-width: 0;
  }
  .shipment-excel-import-body {
    max-height: calc(100vh - 220px);
  }
  .shipment-excel-customer-row {
    grid-template-columns: 1fr;
    align-items: stretch;
    gap: 8px;
  }
  .shipment-excel-import-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .shipment-excel-import-result-list {
    grid-template-columns: 1fr;
  }
  .shipment-excel-import-actions {
    margin: 0 -16px;
    padding: 12px 16px 16px;
  }
  .shipment-excel-import-actions button {
    flex: 1 1 0;
    min-width: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    transition: none !important;
  }
  .business-kpi-card {
    animation: none !important;
  }
  .business-kpi-card:hover {
    transform: none;
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
.batch-track-progress-summary {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
.batch-track-task-dialog-body .batch-track-panel {
  height: auto;
  padding: 0;
  border: 0;
  border-radius: 0;
}
.batch-track-task-dialog-body .assignment-customer-row {
  grid-template-columns: minmax(320px, 1.4fr) minmax(220px, .7fr) minmax(190px, auto);
}
.batch-track-task-dialog-body .batch-track-form {
  margin-top: 0;
}
.batch-track-task-dialog-body .batch-track-results {
  flex: none;
  min-height: 0;
  overflow: visible;
}
.batch-track-task-dialog-body .batch-track-actions {
  margin: 0 -24px;
  padding: 14px 24px 18px;
  box-shadow: 0 -8px 18px rgba(15, 23, 42, .05);
}
.customer-directory-table :deep(th.el-table__cell .cell),
.customer-directory-table :deep(td.el-table__cell .cell) {
  white-space: nowrap;
  word-break: keep-all;
}
@media (max-width: 900px) {
  .assignment-customer-row,
  .batch-track-task-dialog-body .assignment-customer-row {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
}
@media (max-width: 760px) {
  .batch-track-subtask-list {
    grid-template-columns: 1fr;
  }
  .customer-batch-dialog,
  .customer-credential-dialog {
    width: calc(100vw - 24px);
    max-height: 94vh;
    padding: 20px 18px 0;
  }
  .customer-batch-heading {
    display: grid;
  }
  .customer-template-button {
    width: 100%;
  }
  .customer-import-rules > div {
    grid-template-columns: 1fr;
  }
  .customer-import-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .customer-batch-actions {
    margin: 0 -18px !important;
    padding-inline: 18px;
    flex-wrap: wrap;
  }
  .customer-batch-actions > small {
    width: 100%;
  }
  .customer-batch-actions button {
    flex: 1 1 140px !important;
    min-width: 0;
  }
  .batch-track-progress-summary {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
