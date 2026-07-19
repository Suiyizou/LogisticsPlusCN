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

    <section class="workspace-layout">
      <aside class="workspace-sidebar">
        <div class="sidebar-tabs">
          <button
            type="button"
            :class="{ active: sidebarTab === 'customers' }"
            @click="sidebarTab = 'customers'"
          >
            <el-icon><User /></el-icon>
            <span>{{ t("customers.tabCustomerManagement") }}</span>
          </button>
          <button
            type="button"
            :class="{ active: sidebarTab === 'shipments' }"
            @click="sidebarTab = 'shipments'"
          >
            <el-icon><Document /></el-icon>
            <span>{{ t("customers.tabShipmentManagement") }}</span>
          </button>
        </div>

        <template v-if="sidebarTab === 'customers'">
          <div class="sidebar-search">
            <el-input
              v-model="customerSearch"
              :placeholder="t('customers.searchCustomerPlaceholder')"
              prefix-icon="Search"
              clearable
            />
          </div>

          <div class="sidebar-customer-list">
            <div v-if="loadingCustomers" class="sidebar-empty-hint">{{ t("customers.loading") }}</div>
            <div v-else-if="!filteredCustomers.length" class="sidebar-empty-hint">{{ t("customers.emptyCustomers") }}</div>
            <button
              v-for="customer in filteredCustomers"
              v-else
              :key="customer.id"
              type="button"
              class="sidebar-customer-row"
              :class="{ 'is-active': selectedCustomerId === customer.id, 'is-disabled': customer.status !== 'ACTIVE' }"
              @click="selectCustomer(customer.id)"
            >
              <span class="sidebar-customer-avatar">{{ customerInitial(customer) }}</span>
              <span class="sidebar-customer-copy">
                <b>{{ customer.displayName || customer.username }}</b>
                <small>@{{ customer.username }} · {{ partyRoleLabel(customer.partyRole) }}</small>
              </span>
              <span class="sidebar-customer-state">{{ statusLabel(customer.status) }}</span>
            </button>
          </div>

          <div class="sidebar-actions">
            <el-button type="primary" @click="createDialogOpen = true">
              <el-icon><Plus /></el-icon>
              {{ t("customers.openCreate") }}
            </el-button>
            <el-button @click="openBatchImport">
              <el-icon><Upload /></el-icon>
              {{ t("customers.batchImport") }}
            </el-button>
          </div>
        </template>

        <template v-if="sidebarTab === 'shipments'">
          <div class="sidebar-section-header">
            <span>{{ t("customers.availableShipments") }}</span>
            <b>{{ availableShipments.length }}</b>
          </div>
          <div class="sidebar-shipment-list">
            <div v-if="loadingAvailableShipments" class="sidebar-empty-hint">{{ t("customers.loadingAvailableShipments") }}</div>
            <div v-else-if="!availableShipments.length" class="sidebar-empty-hint">{{ t("customers.emptyAvailableShipments") }}</div>
            <button
              v-for="shipment in availableShipments"
              v-else
              :key="shipment.shipmentId"
              type="button"
              class="sidebar-shipment-row"
              :class="{ 'is-active': selectedShipmentId === shipment.shipmentId }"
              @click="selectShipmentForBinding(shipment)"
            >
              <span class="sidebar-shipment-copy">
                <b>{{ shipment.referenceNo || shipment.shipmentId }}</b>
                <small>{{ shipment.carrier }} · {{ referenceTypeLabel(shipment.referenceType) }}</small>
              </span>
              <span class="sidebar-shipment-status">
                <i class="sidebar-shipment-dot"></i>
                {{ shipment.trackingStatus || t("customers.bound") }}
              </span>
            </button>
          </div>
        </template>
      </aside>

      <div class="workspace-main">
        <Transition name="fade" mode="out-in">
        <div v-if="sidebarTab === 'customers'" key="customers">
          <div v-if="!selectedCustomer" class="main-empty-state">
            <el-empty :description="t('customers.selectCustomerPrompt')">
              <template #image>
                <div class="empty-state-icon">
                  <el-icon :size="48"><UserFilled /></el-icon>
                </div>
              </template>
            </el-empty>
            <p class="main-empty-sub">{{ t("customers.selectCustomerHint") }}</p>
          </div>

          <template v-else>
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
                    <el-button text @click="resetCode" :disabled="mutatingCustomer">
                      {{ t("customers.resetCode") }}
                    </el-button>
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
                          <el-option value="AGENT" :label="t('customers.roleAgent')" />
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

                <div class="code-meta-bar">
                  <span class="code-meta-label">{{ t("customers.codePrefix") }}</span>
                  <el-tag type="info" effect="plain">
                    {{ selectedCustomer.customerCodePrefix || t("customers.notAvailable") }}
                  </el-tag>
                  <small>{{ t("customers.codePrefixHint") }}</small>
                </div>

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

        <div v-else-if="sidebarTab === 'shipments'" key="shipments">
          <div v-if="!selectedShipment" class="main-empty-state">
            <el-empty :description="t('customers.selectShipmentPrompt')">
              <template #image>
                <div class="empty-state-icon">
                  <el-icon :size="48"><Ship /></el-icon>
                </div>
              </template>
            </el-empty>
            <p class="main-empty-sub">{{ t('customers.selectShipmentHint') }}</p>
          </div>

          <template v-else>
            <el-card class="main-card" shadow="never">
              <template #header>
                <div class="section-label">{{ t('customers.shipmentDetail') }}</div>
              </template>
              <el-table :data="shipmentDetailRows" size="small" stripe border class="shipment-detail-table">
                <el-table-column :label="t('customers.field')" width="160">
                  <template #default="{ row }">{{ row.label }}</template>
                </el-table-column>
                <el-table-column :label="t('customers.value')">
                  <template #default="{ row }">{{ row.value }}</template>
                </el-table-column>
              </el-table>
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
      </Transition>
      </div>
    </section>

    <div v-if="revealedCode" class="customer-code-overlay" role="presentation" @click.self="closeCodeReveal">
      <section class="customer-code-dialog" role="dialog" aria-modal="true" :aria-label="t('customers.codeDialogTitle')">
        <span class="customer-code-kicker">{{ t("customers.dialogKickerCredential") }}</span>
        <h2>{{ t("customers.codeDialogTitle") }}</h2>
        <p>{{ t("customers.codeDialogDescription", { name: revealedCode.displayName }) }}</p>
        <dl class="customer-credential-list">
          <div><dt>{{ t("customers.username") }}</dt><dd>{{ revealedCode.username }}</dd></div>
          <div v-if="revealedCode.password"><dt>{{ t("customers.initialPassword") }}</dt><dd>{{ revealedCode.password }}</dd></div>
          <div><dt>{{ t("customers.customerCode") }}</dt><dd>{{ revealedCode.customerCode }}</dd></div>
        </dl>
        <small>{{ t("customers.codeDialogWarning") }}</small>
        <div>
          <button type="button" class="customer-access-primary" @click="copyRevealedCode">
            {{ codeCopied ? t("customers.copied") : t("customers.copyCode") }}
          </button>
          <button type="button" @click="closeCodeReveal">{{ t("customers.confirmStored") }}</button>
        </div>
      </section>
    </div>

    <div v-if="createDialogOpen" class="customer-code-overlay" role="presentation" @click.self="createDialogOpen = false">
      <section class="customer-code-dialog customer-create-dialog" role="dialog" aria-modal="true" :aria-label="t('customers.createTitle')">
        <span class="customer-code-kicker">NEW CUSTOMER</span>
        <h2>{{ t("customers.createTitle") }}</h2>
        <p>{{ t("customers.createDescription") }}</p>
        <form class="customer-dialog-form" @submit.prevent="createCustomer">
          <label><span>{{ t("customers.customerName") }}</span><input v-model.trim="createForm.username" :placeholder="t('customers.customerNamePlaceholder')" required /></label>
          <label>
            <span>{{ t("customers.initialPassword") }}</span>
            <input v-model="createForm.password" type="password" minlength="8" maxlength="128" autocomplete="new-password" :placeholder="t('customers.customerPasswordPlaceholder')" required />
          </label>
          <label class="customer-code-mode-field">
            <span>{{ t("customers.customerCode") }}</span>
            <div class="customer-segmented-control">
              <button type="button" :class="{ 'is-active': createForm.customerCodeMode === 'MANUAL' }" @click="createForm.customerCodeMode = 'MANUAL'">{{ t("customers.manualCode") }}</button>
              <button type="button" :class="{ 'is-active': createForm.customerCodeMode === 'RANDOM' }" @click="createForm.customerCodeMode = 'RANDOM'">{{ t("customers.randomCode") }}</button>
            </div>
            <input v-if="createForm.customerCodeMode === 'MANUAL'" v-model.trim="createForm.customerCode" minlength="12" maxlength="128" :placeholder="t('customers.customerCodeManualPlaceholder')" required />
            <small>{{ t("customers.customerCodeSecurityHint") }}</small>
          </label>
          <div class="customer-dialog-actions">
            <button type="button" @click="createDialogOpen = false">{{ t("customers.cancel") }}</button>
            <button class="customer-access-primary" type="submit" :disabled="creating">{{ creating ? t("customers.creating") : t("customers.create") }}</button>
          </div>
        </form>
      </section>
    </div>

    <div v-if="batchImportDialogOpen" class="customer-code-overlay" role="presentation" @click.self="closeBatchImport">
      <section class="customer-code-dialog customer-batch-dialog" role="dialog" aria-modal="true" :aria-label="t('customers.batchImport')">
        <span class="customer-code-kicker">{{ t("customers.dialogKickerProvisioning") }}</span>
        <h2>{{ t("customers.batchImport") }}</h2>
        <p>{{ t("customers.batchImportDescription") }}</p>
        <div class="customer-batch-tabs">
          <button type="button" :class="{ 'is-active': batchImportMode === 'quick' }" @click="batchImportMode = 'quick'">{{ t("customers.quickImport") }}</button>
          <button type="button" :class="{ 'is-active': batchImportMode === 'excel' }" @click="batchImportMode = 'excel'">{{ t("customers.excelImport") }}</button>
        </div>
        <div class="customer-batch-policy">
          <span>{{ t("customers.customerCodePolicy") }}</span>
          <div class="customer-segmented-control">
            <button type="button" :class="{ 'is-active': batchCodeMode === 'RANDOM' }" @click="batchCodeMode = 'RANDOM'">{{ t("customers.randomCode") }}</button>
            <button type="button" :class="{ 'is-active': batchCodeMode === 'MANUAL' }" @click="batchCodeMode = 'MANUAL'">{{ t("customers.manualCode") }}</button>
          </div>
        </div>
        <label v-if="batchImportMode === 'quick'" class="customer-batch-textarea">
          <span>{{ batchCodeMode === 'RANDOM' ? t("customers.quickImportNames") : t("customers.quickImportNamesAndCodes") }}</span>
          <textarea v-model="quickImportText" :placeholder="batchCodeMode === 'RANDOM' ? t('customers.quickImportPlaceholder') : t('customers.quickImportManualPlaceholder')"></textarea>
          <small>{{ t("customers.quickImportHint") }}</small>
        </label>
        <div v-else class="customer-excel-dropzone" :class="{ 'has-file': batchFileName }">
          <input ref="batchFileInput" type="file" accept=".xlsx,.xls,.csv" @change="handleCustomerWorkbook" />
          <b>{{ batchFileName || t("customers.chooseExcel") }}</b>
          <small>{{ batchFileName ? t("customers.rowsReady", { count: batchRows.length }) : t("customers.excelColumnsHint") }}</small>
          <button type="button" @click="batchFileInput?.click()">{{ batchFileName ? t("customers.replaceFile") : t("customers.chooseFile") }}</button>
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
          <div class="customer-credential-table-head"><span>{{ t("customers.customerName") }}</span><span>{{ t("customers.initialPassword") }}</span><span>{{ t("customers.customerCode") }}</span><span>{{ t("customers.importStatus") }}</span></div>
          <div v-for="row in batchCredentialRows" :key="`${row.rowNumber}-${row.username}`" class="customer-credential-row" :class="{ 'is-failed': row.status !== 'CREATED' }">
            <span><b>{{ row.username }}</b><small>#{{ row.rowNumber }}</small></span>
            <span>{{ row.password || '—' }}</span>
            <span>{{ row.customerCode || '—' }}</span>
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

    <div v-if="detailShipment" class="customer-code-overlay" role="presentation" @click.self="closeShipmentDetail">
      <section class="customer-code-dialog customer-shipment-dialog" role="dialog" aria-modal="true" :aria-label="t('customers.details')">
        <span class="customer-code-kicker">{{ t("customers.dialogKickerShipmentDetail") }}</span>
        <h2>{{ detailShipment.referenceNo || detailShipment.shipmentId }}</h2>
        <div class="customer-shipment-detail-grid">
          <span><small>{{ t("customers.carrier") }}</small><b>{{ detailShipment.carrier || '—' }}</b></span>
          <span><small>{{ t("customers.referenceType") }}</small><b>{{ referenceTypeLabel(detailShipment.referenceType) }}</b></span>
          <span><small>{{ t("customers.shipmentStatus") }}</small><b>{{ detailShipment.trackingStatus || '—' }}</b></span>
          <span><small>{{ t("customers.lastTrackedAt") }}</small><b>{{ formatDate(detailShipment.lastTrackedAt || detailShipment.assignedAt || detailShipment.updatedAt) }}</b></span>
        </div>
        <div class="customer-dialog-form customer-shipment-edit-form">
          <label>
            <span>{{ t("customers.referenceType") }}</span>
            <el-select v-model="detailForm.referenceType" class="business-select" popper-class="business-select-popper">
              <el-option value="BOOKING" :label="t('customers.referenceBooking')" />
              <el-option value="BILLOFLADING" :label="t('customers.referenceBill')" />
            </el-select>
          </label>
          <label><span>{{ t("customers.referenceNo") }}</span><input v-model.trim="detailForm.referenceNo" required /></label>
          <label><span>{{ t("customers.shipmentStatus") }}</span><input v-model.trim="detailForm.trackingStatus" /></label>
        </div>
        <details class="customer-manual-update">
          <summary>{{ t("customers.manualSnapshotTitle") }}</summary>
          <p>{{ t("customers.manualSnapshotDescription") }}</p>
          <div class="customer-manual-fields customer-dialog-form">
            <label><span>{{ t("customers.jobNumber") }}</span><input v-model.trim="detailForm.forwarderJobNumber" /></label>
            <label><span>{{ t("customers.vesselVoyage") }}</span><input v-model.trim="detailForm.vesselVoyage" /></label>
            <label><span>{{ t("customers.portOfLoading") }}</span><input v-model.trim="detailForm.portOfLoading" /></label>
            <label><span>{{ t("customers.portOfDischarge") }}</span><input v-model.trim="detailForm.portOfDischarge" /></label>
            <label><span>{{ t("customers.clientPoNumber") }}</span><input v-model.trim="detailForm.clientPoNumber" /></label>
            <label><span>{{ t("customers.volume") }}</span><input v-model.trim="detailForm.volume" /></label>
            <label><span>{{ t("customers.estimatedDeparture") }}</span><input v-model.trim="detailForm.estimatedDeparture" /></label>
            <label><span>{{ t("customers.estimatedArrival") }}</span><input v-model.trim="detailForm.estimatedArrival" /></label>
            <label><span>{{ t("customers.actualDeparture") }}</span><input v-model.trim="detailForm.actualDeparture" /></label>
            <label><span>{{ t("customers.actualArrival") }}</span><input v-model.trim="detailForm.actualArrival" /></label>
            <label><span>{{ t("customers.actualDelivery") }}</span><input v-model.trim="detailForm.actualDelivery" /></label>
            <label><span>{{ t("customers.currentLocation") }}</span><input v-model.trim="detailForm.currentLocation" /></label>
            <label><span>{{ t("customers.clientNameCode") }}</span><input v-model.trim="detailForm.clientNameCode" /></label>
          </div>
        </details>
        <label class="customer-note-editor">
          <span>{{ t("customers.shipmentNote") }}</span>
          <textarea v-model="detailForm.note" maxlength="2000" :placeholder="t('customers.shipmentNotePlaceholder')"></textarea>
          <small>{{ detailForm.note.length }}/2000</small>
        </label>
        <div class="customer-dialog-actions">
          <button type="button" @click="closeShipmentDetail">{{ t("customers.close") }}</button>
          <button type="button" @click="trackShipmentInWorkspace(detailShipment)">{{ t("customers.openLiveTracking") }}</button>
          <button type="button" class="is-danger" @click="removeShipment" :disabled="deletingShipment">{{ t("customers.deleteShipment") }}</button>
          <button type="button" class="is-danger" @click="invalidateSnapshot" :disabled="savingShipment">{{ t("customers.invalidateSnapshot") }}</button>
          <button type="button" @click="saveManualSnapshot" :disabled="savingShipment">{{ t("customers.saveManualSnapshot") }}</button>
          <button type="button" @click="saveShipmentDetail" :disabled="savingShipment">{{ savingShipment ? t("customers.savingShipment") : t("customers.saveShipment") }}</button>
          <button v-if="!isShipmentBound(detailShipment)" type="button" class="customer-access-primary" @click="quickBindShipment(detailShipment)" :disabled="bindingShipment">{{ t("customers.quickBind") }}</button>
        </div>
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
  createBusinessCustomer,
  createBusinessShipment,
  deleteBusinessCustomer,
  deleteBusinessShipment,
  fetchAvailableBusinessShipments,
  fetchBusinessCustomers,
  fetchBusinessCustomerShipments,
  fetchPendingClientMatches,
  invalidateBusinessShipmentSnapshot,
  resetBusinessCustomerCode,
  resetBusinessCustomerPassword,
  resolvePendingClientMatch,
  setBusinessShipmentPublication,
  unbindBusinessCustomerShipment,
  updateBusinessCustomer,
  updateBusinessShipment,
  updateBusinessShipmentManualSnapshot
} from "../services/businessCustomerApi";
import {
  User,
  Document,
  Plus,
  Upload,
  UserFilled,
  Ship,
  Refresh,
  Search
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
const batchCodeMode = ref("RANDOM");
const quickImportText = ref("");
const batchFileName = ref("");
const batchRows = ref([]);
const batchPreviewError = ref("");
const batchFileInput = ref(null);
const importingCustomers = ref(false);
const batchCredentialRows = ref([]);
const clientCodeDialogOpen = ref(false);
const clientCodeSupplement = ref("");
const resetPasswordDialogOpen = ref(false);
const shipmentCreateDialogOpen = ref(false);
const detailShipment = ref(null);
const savingShipment = ref(false);
const creatingShipment = ref(false);
const deletingShipment = ref(false);
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
const revealedCode = ref(null);
const codeCopied = ref(false);
const bindMode = ref("reference");
const createForm = reactive({ username: "", password: "", customerCode: "", customerCodeMode: "MANUAL" });
const passwordResetForm = reactive({ password: "", confirmPassword: "" });
const editForm = reactive({ username: "", displayName: "", clientCode: "", partyRole: "SHIPPER" });
const bindForm = reactive({ shipmentId: "", carrier: "COSCO", referenceType: "BOOKING", referenceNo: "" });
const shipmentCreateForm = reactive({ carrier: "COSCO", referenceType: "BOOKING", referenceNo: "", trackingStatus: "", note: "", ...emptyManualShipmentFields() });
const detailForm = reactive({ referenceType: "BOOKING", referenceNo: "", trackingStatus: "", note: "", ...emptyManualShipmentFields() });
let shipmentRequestSequence = 0;
let toastTimer = 0;

const sidebarTab = ref("customers");
const customerSearch = ref("");
const selectedShipmentId = ref("");
const selectedCustomerIds = ref([]);
const batchBinding = ref(false);
const batchBindingProgress = ref("");
const shipmentCustomerMap = ref({});

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

const selectedShipment = computed(() =>
  availableShipments.value.find((s) => s.shipmentId === selectedShipmentId.value) || null
);

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

onMounted(() => {
  const requestedCustomer = new URLSearchParams(window.location.search).get("customer") || "";
  void loadCustomers(requestedCustomer);
  void loadAvailableShipments();
  void loadPendingClientMatches();
});
onUnmounted(() => {
  revealedCode.value = null;
  window.clearTimeout(toastTimer);
});

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
    const password = createForm.password;
    const response = await createBusinessCustomer({
      username: createForm.username,
      displayName: createForm.username,
      password,
      partyRole: "CONSIGNEE",
      customerCode: createForm.customerCodeMode === "MANUAL" ? createForm.customerCode : null,
      customerCodeMode: createForm.customerCodeMode
    });
    const customer = normalizeCustomer(response);
    revealCode(response, customer, password);
    createForm.username = "";
    createForm.password = "";
    createForm.customerCode = "";
    createForm.customerCodeMode = "MANUAL";
    createDialogOpen.value = false;
    await loadCustomers(customer.id);
  } catch (error) {
    showError(error, "customers.createFailed");
  } finally {
    creating.value = false;
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

async function resetCode() {
  if (!selectedCustomer.value || mutatingCustomer.value) return;
  if (!window.confirm(t("customers.resetConfirm"))) return;
  mutatingCustomer.value = true;
  clearMessage();
  try {
    const response = await resetBusinessCustomerCode(selectedCustomer.value.id);
    const customer = normalizeCustomer(response);
    replaceCustomer(customer);
    revealCode(response, customer);
  } catch (error) {
    showError(error, "customers.resetFailed");
  } finally {
    mutatingCustomer.value = false;
  }
}

function closeResetPasswordDialog() {
  resetPasswordDialogOpen.value = false;
  passwordResetForm.password = "";
  passwordResetForm.confirmPassword = "";
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
    if (detailShipment.value?.shipmentId === shipment.shipmentId) closeShipmentDetail();
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
  detailShipment.value = { ...shipment };
  detailForm.referenceType = shipment?.referenceType || "BOOKING";
  detailForm.referenceNo = shipment?.referenceNo || "";
  detailForm.trackingStatus = shipment?.trackingStatus || "";
  detailForm.note = shipment?.note || "";
  Object.assign(detailForm, emptyManualShipmentFields());
}

function closeShipmentDetail() {
  detailShipment.value = null;
  detailForm.referenceType = "BOOKING";
  detailForm.referenceNo = "";
  detailForm.trackingStatus = "";
  detailForm.note = "";
  Object.assign(detailForm, emptyManualShipmentFields());
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
  if (!detailShipment.value?.shipmentId || savingShipment.value) return;
  savingShipment.value = true;
  try {
    const updated = await updateBusinessShipmentManualSnapshot(
      detailShipment.value.shipmentId,
      { ...detailForm }
    );
    replaceShipmentInLocalCollections(updated);
    detailShipment.value = { ...detailShipment.value, ...updated };
    showSuccess("customers.manualSnapshotSaved");
  } catch (error) {
    showError(error, "customers.manualSnapshotFailed");
  } finally {
    savingShipment.value = false;
  }
}

async function invalidateSnapshot() {
  if (!detailShipment.value?.shipmentId || savingShipment.value) return;
  const reason = window.prompt(t("customers.invalidateReasonPrompt"), "Upstream snapshot is empty or incorrect");
  if (!reason?.trim()) return;
  savingShipment.value = true;
  try {
    await invalidateBusinessShipmentSnapshot(detailShipment.value.shipmentId, reason.trim());
    await Promise.all([
      selectedCustomer.value ? selectCustomer(selectedCustomer.value.id) : Promise.resolve(),
      loadAvailableShipments()
    ]);
    closeShipmentDetail();
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

async function saveShipmentDetail() {
  if (!detailShipment.value?.shipmentId || savingShipment.value) return;
  savingShipment.value = true;
  try {
    const updated = await updateBusinessShipment(detailShipment.value.shipmentId, { ...detailForm });
    replaceShipmentInLocalCollections(updated);
    detailShipment.value = { ...detailShipment.value, ...updated };
    showSuccess("customers.shipmentSaved");
  } catch (error) {
    showError(error, "customers.shipmentSaveFailed");
  } finally {
    savingShipment.value = false;
  }
}

async function removeShipment() {
  if (!detailShipment.value?.shipmentId || deletingShipment.value) return;
  if (!window.confirm(t("customers.deleteShipmentConfirm"))) return;
  deletingShipment.value = true;
  const shipmentId = detailShipment.value.shipmentId;
  try {
    await deleteBusinessShipment(shipmentId);
    shipments.value = shipments.value.filter((item) => item.shipmentId !== shipmentId);
    availableShipments.value = availableShipments.value.filter((item) => item.shipmentId !== shipmentId);
    closeShipmentDetail();
    showSuccess("customers.shipmentDeleted");
  } catch (error) {
    showError(error, "customers.shipmentDeleteFailed");
  } finally {
    deletingShipment.value = false;
  }
}

function trackShipmentInWorkspace(shipment) {
  closeShipmentDetail();
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
  openShipmentDetail(shipment);
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
    const codeIndex = findColumn(["客户码", "customer code", "customercode"]);
    const startIndex = usernameIndex >= 0 ? 1 : 0;
    const nameColumn = usernameIndex >= 0 ? usernameIndex : 0;
    batchRows.value = rows.slice(startIndex).map((row, index) => ({
      rowNumber: index + startIndex + 1,
      username: String(row[nameColumn] || "").trim(),
      password: passwordIndex >= 0 ? String(row[passwordIndex] || "") : "",
      customerCode: codeIndex >= 0 ? String(row[codeIndex] || "").trim() : ""
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
  if (batchCodeMode.value === "MANUAL" && rows.some((row) => !row.customerCode)) {
    batchPreviewError.value = t("customers.manualCodeRequiredForEveryRow");
    return;
  }
  importingCustomers.value = true;
  batchPreviewError.value = "";
  try {
    const response = await batchCreateBusinessCustomers({
      customerCodeMode: batchCodeMode.value,
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
    [t("customers.customerCode")]: row.customerCode || "",
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

function revealCode(response, customer, password = "") {
  if (!response?.customerCode) return;
  revealedCode.value = {
    customerCode: response.customerCode,
    username: customer.username || "",
    password,
    displayName: customer.displayName || customer.username || ""
  };
  codeCopied.value = false;
}

async function copyRevealedCode() {
  if (!revealedCode.value?.customerCode) return;
  try {
    await navigator.clipboard.writeText(revealedCode.value.customerCode);
    codeCopied.value = true;
  } catch {
    codeCopied.value = false;
  }
}

function closeCodeReveal() {
  revealedCode.value = null;
  codeCopied.value = false;
}

function customerInitial(customer) {
  return String(customer.displayName || customer.username || "C").slice(0, 1).toUpperCase();
}

function partyRoleLabel(role) {
  return t({ AGENT: "customers.roleAgent", SHIPPER: "customers.roleShipper", CONSIGNEE: "customers.roleConsignee" }[role] || "customers.roleShipper");
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
  width: 260px;
  flex: 0 0 260px;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #f5f7fa 0%, #eceff4 100%);
  border-right: 1px solid #dce1e8;
  overflow: hidden;
}
.sidebar-tabs {
  display: flex;
  gap: 0;
  padding: 10px 8px;
  border-bottom: 1px solid #dce1e8;
}
.sidebar-tabs button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: #5a6d80;
  background: transparent;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
}
.sidebar-tabs button:hover {
  color: #3a5068;
  background: rgba(0, 0, 0, 0.04);
}
.sidebar-tabs button.active {
  color: #1e40af;
  background: #e0e7ff;
  border-color: rgba(59, 130, 246, 0.3);
}

/* Sidebar search */
.sidebar-search {
  padding: 10px 10px 6px;
}
.sidebar-search :deep(.el-input__wrapper) {
  background: #fff;
  border-color: #dce1e8;
  box-shadow: none;
}
.sidebar-search :deep(.el-input__wrapper:hover) {
  border-color: #c5d0dc;
}
.sidebar-search :deep(.el-input__inner) {
  color: #1a2d42;
}
.sidebar-search :deep(.el-input__inner::placeholder) {
  color: #94a3b8;
}
.sidebar-search :deep(.el-input__prefix) {
  color: #94a3b8;
}

/* Sidebar customer list */
.sidebar-customer-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 6px;
}
.sidebar-customer-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 6px;
  color: #334155;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}
.sidebar-customer-row:hover {
  background: #e8ecf1;
}
.sidebar-customer-row.is-active {
  background: #e0e7ff;
  border-left: 2px solid #3b82f6;
  padding-left: 8px;
}
.sidebar-customer-row.is-disabled {
  opacity: 0.5;
}
.sidebar-customer-avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: #1e40af;
  background: #bfdbfe;
  font-weight: 800;
  font-size: 12px;
}
.sidebar-customer-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.sidebar-customer-copy b {
  font-size: 12px;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sidebar-customer-copy small {
  color: #64748b;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sidebar-customer-state {
  color: #16a34a;
  font-size: 9px;
  font-weight: 800;
}
.sidebar-customer-row.is-disabled .sidebar-customer-state {
  color: #c97a86;
}
.sidebar-empty-hint {
  padding: 18px 10px;
  color: #94a3b8;
  font-size: 12px;
  text-align: center;
}

/* Sidebar shipment list */
.sidebar-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 6px;
  color: #5a6d80;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.sidebar-section-header b {
  display: grid;
  place-items: center;
  min-width: 24px;
  height: 24px;
  border-radius: 6px;
  color: #3a5068;
  background: #e2e8f0;
  font-size: 11px;
}
.sidebar-shipment-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 6px;
}
.sidebar-shipment-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 6px;
  color: #334155;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}
.sidebar-shipment-row:hover {
  background: #e8ecf1;
}
.sidebar-shipment-row.is-active {
  background: #e0e7ff;
  border-left: 2px solid #3b82f6;
  padding-left: 8px;
}
.sidebar-shipment-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.sidebar-shipment-copy b {
  font-size: 11px;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sidebar-shipment-copy small {
  color: #64748b;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sidebar-shipment-status {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #64748b;
  font-size: 10px;
  white-space: nowrap;
}
.sidebar-shipment-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #16a34a;
  flex-shrink: 0;
}

/* Sidebar actions */
.sidebar-actions {
  display: flex;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid #dce1e8;
}
.sidebar-actions .el-button {
  flex: 1;
  font-size: 11px;
}

/* ---- Main Content Area ---- */
.workspace-main {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  background: #f0f3f7;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
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
}
.customer-excel-dropzone.has-file {
  border-color: #56b88d;
  background: #f6fdf9;
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
  grid-template-columns: 1.2fr 1fr 1.2fr 0.8fr;
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
    width: 220px;
    flex: 0 0 220px;
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
    max-height: 40vh;
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
</style>