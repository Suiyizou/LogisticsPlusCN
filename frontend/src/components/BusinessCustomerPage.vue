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
            <i aria-hidden="true">⌄</i>
          </button>
          <div v-if="accountMenuOpen" class="customer-account-menu">
            <RouterLink to="/workbenches" @click="accountMenuOpen = false">{{ t("customers.backWorkbench") }}</RouterLink>
            <button type="button" @click="emit('logout')">{{ t("customers.logout") }}</button>
          </div>
        </div>
      </div>
    </header>

    <section class="customer-access-content">
      <header class="customer-access-hero">
        <div>
          <span>{{ t("customers.eyebrow") }}</span>
          <h1>{{ t("customers.title") }}</h1>
          <p>{{ t("customers.description") }}</p>
        </div>
        <div class="customer-hero-actions">
          <div class="customer-access-boundary">
            <i aria-hidden="true"></i>
            <span>
              <b>{{ t("customers.boundaryTitle") }}</b>
              <small>{{ t("customers.boundaryDescription") }}</small>
            </span>
          </div>
          <button class="customer-tracking-link" type="button" @click="openTrackingWorkspace()">
            <span>{{ t("customers.workspaceTracking") }}</span>
            <small>{{ t("customers.trackingJumpHint") }}</small>
            <b aria-hidden="true">↗</b>
          </button>
        </div>
      </header>

      <p v-if="pageMessage" class="customer-access-message" :class="{ 'is-error': messageIsError }" role="status">
        {{ pageMessage }}
      </p>

      <div class="customer-access-layout">
        <aside class="customer-access-sidebar">
          <section class="customer-create-card customer-create-launcher">
            <header>
              <span>01</span>
              <div><h2>{{ t("customers.createTitle") }}</h2><p>{{ t("customers.createDescription") }}</p></div>
            </header>
            <div class="customer-create-actions">
              <button class="customer-access-primary" type="button" @click="createDialogOpen = true">{{ t("customers.openCreate") }}</button>
              <button type="button" @click="openBatchImport">{{ t("customers.batchImport") }}</button>
            </div>
          </section>

          <section class="customer-list-card">
            <header>
              <div>
                <span>{{ t("customers.directoryEyebrow") }}</span>
                <h2>{{ t("customers.directoryTitle") }}</h2>
              </div>
              <b>{{ customers.length }}</b>
            </header>
            <div v-if="loadingCustomers" class="customer-access-empty">{{ t("customers.loading") }}</div>
            <div v-else-if="!customers.length" class="customer-access-empty">{{ t("customers.emptyCustomers") }}</div>
            <button
              v-for="customer in customers"
              v-else
              :key="customer.id"
              type="button"
              class="customer-list-row"
              :class="{ 'is-active': selectedCustomerId === customer.id, 'is-disabled': customer.status !== 'ACTIVE' }"
              @click="selectCustomer(customer.id)"
            >
              <span class="customer-list-avatar">{{ customerInitial(customer) }}</span>
              <span class="customer-list-copy">
                <b>{{ customer.displayName || customer.username }}</b>
                <small>@{{ customer.username }} · {{ partyRoleLabel(customer.partyRole) }}</small>
              </span>
              <span class="customer-list-state">{{ statusLabel(customer.status) }}</span>
            </button>
          </section>
        </aside>

        <section class="customer-detail-card">
          <div v-if="!selectedCustomer" class="customer-detail-empty">
            <span>↗</span>
            <h2>{{ t("customers.selectTitle") }}</h2>
            <p>{{ t("customers.selectDescription") }}</p>
          </div>

          <template v-else>
            <header class="customer-detail-head">
              <div>
                <span>{{ t("customers.detailEyebrow") }}</span>
                <h2>{{ selectedCustomer.displayName || selectedCustomer.username }}</h2>
                <p>
                  @{{ selectedCustomer.username }}
                  <i>·</i>
                  {{ partyRoleLabel(selectedCustomer.partyRole) }}
                  <i>·</i>
                  {{ statusLabel(selectedCustomer.status) }}
                </p>
              </div>
              <div class="customer-detail-actions">
                <button type="button" @click="resetCode" :disabled="mutatingCustomer">
                  {{ t("customers.resetCode") }}
                </button>
                <button type="button" @click="resetPasswordDialogOpen = true" :disabled="mutatingCustomer">
                  {{ t("customers.resetPassword") }}
                </button>
                <button
                  v-if="selectedCustomer.status === 'ACTIVE'"
                  type="button"
                  class="is-danger"
                  @click="deactivateCustomer"
                  :disabled="mutatingCustomer"
                >
                  {{ t("customers.deactivate") }}
                </button>
                <button v-else type="button" @click="reactivateCustomer" :disabled="mutatingCustomer">
                  {{ t("customers.reactivate") }}
                </button>
              </div>
            </header>

            <section class="customer-edit-section">
              <div class="customer-section-title">
                <span>02</span>
                <div>
                  <h3>{{ t("customers.profileTitle") }}</h3>
                  <p>{{ t("customers.profileDescription") }}</p>
                </div>
              </div>
              <form class="customer-edit-form" @submit.prevent="saveCustomer">
                <label>
                  <span>{{ t("customers.username") }}</span>
                  <input v-model.trim="editForm.username" required />
                </label>
                <label>
                  <span>{{ t("customers.displayName") }}</span>
                  <input v-model.trim="editForm.displayName" required />
                </label>
                <label class="customer-client-code-field">
                  <span>{{ t("customers.clientCode") }}</span>
                  <div class="customer-inline-value" :class="{ 'is-missing': !selectedCustomer.clientCode }">
                    <b>{{ selectedCustomer.clientCode || t("customers.missingValue") }}</b>
                    <button type="button" @click="openClientCodeSupplement">
                      {{ selectedCustomer.clientCode ? t("customers.editSupplement") : t("customers.manualSupplement") }}
                    </button>
                  </div>
                </label>
                <label>
                  <span>{{ t("customers.partyRole") }}</span>
                  <el-select
                    v-model="editForm.partyRole"
                    class="business-select"
                    popper-class="business-select-popper"
                  >
                    <el-option value="SHIPPER" :label="t('customers.roleShipper')" />
                    <el-option value="CONSIGNEE" :label="t('customers.roleConsignee')" />
                    <el-option value="AGENT" :label="t('customers.roleAgent')" />
                  </el-select>
                </label>
                <button class="customer-access-primary" type="submit" :disabled="mutatingCustomer">
                  {{ t("customers.saveProfile") }}
                </button>
              </form>

              <section class="customer-pending-matches">
                <header>
                  <div>
                    <h4>{{ t("customers.pendingMatches") }}</h4>
                    <p>{{ t("customers.pendingMatchesHint") }}</p>
                  </div>
                  <button type="button" @click="loadPendingClientMatches" :disabled="loadingPendingMatches">{{ t("customers.refresh") }}</button>
                </header>
                <div v-if="!pendingClientMatches.length" class="customer-access-empty compact">{{ t("customers.noPendingMatches") }}</div>
                <article v-for="match in pendingClientMatches" v-else :key="match.id" class="customer-pending-match-row">
                  <span><b>{{ match.clientCode }}</b><small>{{ match.reason }}</small></span>
                  <span><b>{{ match.referenceNo || match.shipmentId }}</b><small>{{ match.carrier }} · {{ referenceTypeLabel(match.referenceType) }}</small></span>
                  <button type="button" class="is-primary" @click="resolveClientMatch(match)" :disabled="resolvingMatchId === match.id">
                    {{ t("customers.bindToCurrentCustomer") }}
                  </button>
                </article>
              </section>
              <div class="customer-code-meta">
                <span>{{ t("customers.codePrefix") }}</span>
                <b>{{ selectedCustomer.customerCodePrefix || t("customers.notAvailable") }}</b>
                <small>{{ t("customers.codePrefixHint") }}</small>
              </div>
            </section>

            <section class="customer-shipments-section">
              <div class="customer-section-title">
                <span>03</span>
                <div>
                  <h3>{{ t("customers.shipmentsTitle") }}</h3>
                  <p>{{ t("customers.shipmentsDescription") }}</p>
                </div>
              </div>

              <form class="customer-bind-form" @submit.prevent="bindShipment">
                <div class="customer-bind-mode" role="group" :aria-label="t('customers.bindMode')">
                  <button type="button" :class="{ 'is-active': bindMode === 'reference' }" @click="bindMode = 'reference'">
                    {{ t("customers.bindByReference") }}
                  </button>
                  <button type="button" :class="{ 'is-active': bindMode === 'shipmentId' }" @click="bindMode = 'shipmentId'">
                    {{ t("customers.bindByShipmentId") }}
                  </button>
                </div>
                <label v-if="bindMode === 'shipmentId'" class="customer-bind-wide">
                  <span>{{ t("customers.shipmentId") }}</span>
                  <input v-model.trim="bindForm.shipmentId" :placeholder="t('customers.shipmentIdPlaceholder')" required />
                  <small class="customer-field-hint">{{ t("customers.shipmentIdHint") }}</small>
                </label>
                <template v-else>
                  <label>
                    <span>{{ t("customers.carrier") }}</span>
                    <el-select v-model="bindForm.carrier" class="business-select" popper-class="business-select-popper">
                      <el-option value="COSCO" label="COSCO SHIPPING" />
                      <el-option value="CMA" label="CMA CGM" />
                    </el-select>
                  </label>
                  <label>
                    <span>{{ t("customers.referenceType") }}</span>
                    <el-select
                      v-model="bindForm.referenceType"
                      class="business-select"
                      popper-class="business-select-popper"
                    >
                      <el-option value="BOOKING" :label="t('customers.referenceBooking')" />
                      <el-option value="BILLOFLADING" :label="t('customers.referenceBill')" />
                    </el-select>
                  </label>
                  <label>
                    <span>{{ t("customers.referenceNo") }}</span>
                    <input v-model.trim="bindForm.referenceNo" :placeholder="t('customers.referenceNoPlaceholder')" required />
                  </label>
                  <p class="customer-reference-hint">{{ t("customers.referenceHint") }}</p>
                </template>
                <button class="customer-access-primary" type="submit" :disabled="bindingShipment">
                  {{ bindingShipment ? t("customers.binding") : t("customers.bind") }}
                </button>
              </form>

              <section class="customer-candidate-section">
                <header>
                  <div>
                    <h4>{{ t("customers.availableShipments") }}</h4>
                    <p>{{ t("customers.availableShipmentsHint") }}</p>
                  </div>
                  <div class="customer-candidate-actions">
                    <button type="button" class="is-primary" @click="shipmentCreateDialogOpen = true">{{ t("customers.createShipment") }}</button>
                    <button type="button" @click="loadAvailableShipments" :disabled="loadingAvailableShipments">{{ t("customers.refresh") }}</button>
                  </div>
                </header>
                <div v-if="loadingAvailableShipments" class="customer-access-empty">{{ t("customers.loadingAvailableShipments") }}</div>
                <div v-else-if="!unboundAvailableShipments.length" class="customer-access-empty compact">{{ t("customers.emptyAvailableShipments") }}</div>
                <div v-else class="customer-candidate-list">
                  <article v-for="shipment in unboundAvailableShipments" :key="shipment.shipmentId" class="customer-candidate-row">
                    <span><b>{{ shipment.referenceNo || shipment.shipmentId }}</b><small>{{ shipment.carrier }} · {{ referenceTypeLabel(shipment.referenceType) }}</small></span>
                    <span>
                      <i class="customer-shipment-dot"></i>{{ shipment.trackingStatus || t("customers.bound") }}
                      <small>{{ boundRoleSummary(shipment) }}</small>
                    </span>
                    <span>{{ formatDate(shipment.lastTrackedAt || shipment.updatedAt) }}</span>
                    <span>
                      <button type="button" @click="openShipmentDetail(shipment)">{{ t("customers.details") }}</button>
                      <button type="button" class="is-primary" @click="quickBindShipment(shipment)" :disabled="bindingShipment">{{ t("customers.quickBind") }}</button>
                    </span>
                  </article>
                </div>
              </section>

              <div class="customer-shipment-table">
                <div class="customer-shipment-table-head">
                  <span>{{ t("customers.shipmentReference") }}</span>
                  <span>{{ t("customers.shipmentStatus") }}</span>
                  <span>{{ t("customers.assignedAt") }}</span>
                  <span>{{ t("customers.actions") }}</span>
                </div>
                <div v-if="loadingShipments" class="customer-access-empty">{{ t("customers.loadingShipments") }}</div>
                <div v-else-if="!shipments.length" class="customer-access-empty">{{ t("customers.emptyShipments") }}</div>
                <div v-for="shipment in shipments" v-else :key="shipment.shipmentId" class="customer-shipment-row">
                  <span>
                    <b>{{ shipment.referenceNo || shipment.shipmentId }}</b>
                    <small>{{ shipment.carrier || "—" }} · {{ referenceTypeLabel(shipment.referenceType) }}</small>
                  </span>
                  <span>
                    <i class="customer-shipment-dot"></i>{{ shipment.trackingStatus || t("customers.bound") }}
                    <small v-if="shipment.note" class="customer-shipment-note">{{ shipment.note }}</small>
                    <small class="customer-publication-state" :class="{ 'is-published': shipment.publicationStatus === 'PUBLISHED' }">
                      {{ shipment.publicationStatus === 'PUBLISHED' ? t("customers.published") : t("customers.draft") }}
                    </small>
                  </span>
                  <span>{{ formatDate(shipment.assignedAt) }}</span>
                  <span class="customer-shipment-actions">
                    <button type="button" @click="openShipmentDetail(shipment)">{{ t("customers.details") }}</button>
                    <button
                      v-if="needsManualSupplement(shipment)"
                      type="button"
                      class="is-warning"
                      @click="openShipmentSupplement(shipment)"
                    >{{ t("customers.manualSupplement") }}</button>
                    <button type="button" @click="togglePublication(shipment)" :disabled="publishingShipmentId === shipment.shipmentId">
                      {{ shipment.publicationStatus === 'PUBLISHED' ? t("customers.withdraw") : t("customers.publish") }}
                    </button>
                    <button type="button" @click="unbindShipment(shipment)" :disabled="unbindingShipmentId === shipment.shipmentId">{{ t("customers.unbind") }}</button>
                  </span>
                </div>
              </div>
            </section>
          </template>
        </section>
      </div>

    </section>

    <div v-if="revealedCode" class="customer-code-overlay" role="presentation" @click.self="closeCodeReveal">
      <section class="customer-code-dialog" role="dialog" aria-modal="true" :aria-label="t('customers.codeDialogTitle')">
        <span class="customer-code-kicker">ONE-TIME CREDENTIAL</span>
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
        <span class="customer-code-kicker">CUSTOMER PROVISIONING</span>
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
        <span class="customer-code-kicker">ONE-TIME CREDENTIAL EXPORT</span>
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
        <span class="customer-code-kicker">SECURE CREDENTIAL RESET</span>
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
        <span class="customer-code-kicker">NEW SHIPMENT</span>
        <h2>{{ t("customers.createShipment") }}</h2>
        <p>{{ t("customers.createShipmentDescription") }}</p>
        <form class="customer-dialog-form" @submit.prevent="createShipment">
          <label>
            <span>{{ t("customers.carrier") }}</span>
            <el-select v-model="shipmentCreateForm.carrier" class="business-select" popper-class="business-select-popper">
              <el-option value="COSCO" label="COSCO SHIPPING" />
              <el-option value="CMA" label="CMA CGM" />
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
        <span class="customer-code-kicker">SHIPMENT DETAIL</span>
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

watch(selectedCustomer, (customer) => {
  editForm.username = customer?.username || "";
  editForm.displayName = customer?.displayName || "";
  editForm.clientCode = customer?.clientCode || "";
  editForm.partyRole = customer?.partyRole || "SHIPPER";
}, { immediate: true });

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
  color: #102a46;
  background:
    radial-gradient(circle at 88% 8%, rgba(28, 131, 224, 0.12), transparent 25%),
    linear-gradient(180deg, #f8fbff 0%, #edf4fb 100%);
}

.customer-access-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 78px;
  padding: 0 clamp(24px, 4.5vw, 76px);
  border-bottom: 1px solid rgba(115, 148, 180, 0.2);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 10px 34px rgba(31, 70, 108, 0.06);
  backdrop-filter: blur(16px);
}

.customer-access-brand,
.customer-access-header-actions,
.customer-access-user {
  display: flex;
  align-items: center;
}

.customer-access-brand {
  gap: 12px;
  color: inherit;
  text-decoration: none;
}

.customer-access-brand img {
  width: 38px;
  height: 38px;
}

.customer-access-brand span,
.customer-access-user {
  display: grid;
  gap: 2px;
}

.customer-access-brand strong { font-size: 17px; }
.customer-access-brand small,
.customer-access-user small { color: #7a8fa6; font-size: 10px; }

.customer-access-header-actions { gap: 13px; }
.customer-access-user { padding-left: 3px; }
.customer-access-user b { font-size: 12px; }

.customer-access-party-pill {
  padding: 7px 11px;
  border: 1px solid #cfe2f5;
  border-radius: 999px;
  color: #1767ae;
  background: #f2f8ff;
  font-size: 10px;
  font-weight: 800;
}

.customer-access-logout,
.customer-detail-actions button,
.customer-shipment-row button,
.customer-code-dialog button {
  min-height: 36px;
  padding: 8px 13px;
  border: 1px solid #ccdae8;
  border-radius: 9px;
  color: #31516f;
  background: #fff;
  font-weight: 750;
}

.customer-access-content {
  width: min(1480px, calc(100% - 48px));
  margin: 0 auto;
  padding: 54px 0 72px;
}

.customer-access-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(330px, 0.65fr);
  align-items: end;
  gap: 44px;
  margin-bottom: 28px;
}

.customer-access-hero > div:first-child > span,
.customer-list-card header span,
.customer-detail-head > div > span,
.customer-code-kicker {
  color: #1377ce;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0.16em;
}

.customer-access-hero h1 {
  max-width: 780px;
  margin: 10px 0 12px;
  font-size: clamp(34px, 4vw, 58px);
  letter-spacing: -0.045em;
  line-height: 1.02;
}

.customer-access-hero p {
  max-width: 760px;
  margin: 0;
  color: #627b94;
  line-height: 1.7;
}

.customer-access-boundary {
  display: flex;
  align-items: flex-start;
  gap: 13px;
  padding: 18px;
  border: 1px solid #cfe2f2;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
}

.customer-access-boundary i {
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  margin-top: 4px;
  border: 3px solid #fff;
  border-radius: 50%;
  background: #24b889;
  box-shadow: 0 0 0 3px rgba(36, 184, 137, 0.13);
}

.customer-access-boundary span { display: grid; gap: 5px; }
.customer-access-boundary b { font-size: 13px; }
.customer-access-boundary small { color: #6d8298; line-height: 1.55; }

.customer-access-message {
  margin: 0 0 18px;
  padding: 12px 15px;
  border: 1px solid #bce7d6;
  border-radius: 10px;
  color: #14704f;
  background: #effbf6;
}

.customer-access-message.is-error {
  border-color: #efc1c8;
  color: #a22f42;
  background: #fff3f5;
}

.customer-access-layout {
  display: grid;
  grid-template-columns: minmax(310px, 0.62fr) minmax(660px, 1.38fr);
  gap: 22px;
  align-items: start;
}

.customer-access-sidebar { display: grid; gap: 18px; }
.customer-create-card,
.customer-list-card,
.customer-detail-card {
  border: 1px solid rgba(158, 184, 210, 0.48);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 20px 55px rgba(30, 70, 109, 0.08);
}

.customer-create-card { display: grid; gap: 13px; padding: 20px; }
.customer-create-card header,
.customer-section-title { display: flex; align-items: flex-start; gap: 12px; }
.customer-create-card header > span,
.customer-section-title > span {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: #1477ce;
  background: #eaf5ff;
  font-size: 11px;
  font-weight: 900;
}

.customer-create-card h2,
.customer-list-card h2,
.customer-section-title h3 { margin: 0; font-size: 16px; }
.customer-create-card p,
.customer-section-title p { margin: 4px 0 0; color: #72879c; font-size: 11px; line-height: 1.5; }

.customer-create-card label,
.customer-edit-form label,
.customer-bind-form label { display: grid; gap: 6px; }
.customer-create-card label > span,
.customer-edit-form label > span,
.customer-bind-form label > span { color: #435d76; font-size: 11px; font-weight: 800; }

.customer-create-card input,
.customer-create-card select,
.customer-edit-form input,
.customer-edit-form select,
.customer-bind-form input,
.customer-bind-form select {
  min-height: 42px;
  width: 100%;
  padding: 8px 11px;
  border: 1px solid #cfdeec;
  border-radius: 9px;
  outline: 0;
  color: #183652;
  background: #fbfdff;
}

.customer-create-card input:focus,
.customer-create-card select:focus,
.customer-edit-form input:focus,
.customer-edit-form select:focus,
.customer-bind-form input:focus,
.customer-bind-form select:focus {
  border-color: #2a89df;
  box-shadow: 0 0 0 3px rgba(42, 137, 223, 0.1);
}

.customer-access-primary {
  min-height: 43px;
  border: 1px solid #126fc3;
  border-radius: 9px;
  color: #fff;
  background: linear-gradient(110deg, #1264b0, #168fe2);
  box-shadow: 0 10px 24px rgba(18, 105, 188, 0.18);
  font-weight: 800;
}

.customer-list-card { overflow: hidden; }
.customer-list-card > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid #e0e9f2;
}
.customer-list-card header > div { display: grid; gap: 5px; }
.customer-list-card header > b {
  display: grid;
  place-items: center;
  min-width: 32px;
  height: 32px;
  border-radius: 9px;
  color: #176cb7;
  background: #edf6ff;
}

.customer-list-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 13px 18px;
  border: 0;
  border-bottom: 1px solid #edf2f7;
  color: inherit;
  background: transparent;
  text-align: left;
}
.customer-list-row:hover,
.customer-list-row.is-active { background: #f0f7ff; }
.customer-list-row.is-active { box-shadow: inset 3px 0 #1885df; }
.customer-list-row.is-disabled { opacity: 0.62; }
.customer-list-avatar {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  color: #176db8;
  background: #e6f3ff;
  font-weight: 900;
}
.customer-list-copy { display: grid; gap: 3px; min-width: 0; }
.customer-list-copy b,
.customer-list-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.customer-list-copy b { font-size: 12px; }
.customer-list-copy small { color: #71869c; font-size: 10px; }
.customer-list-state { color: #248565; font-size: 9px; font-weight: 850; }
.customer-list-row.is-disabled .customer-list-state { color: #a0626a; }

.customer-detail-card { min-height: 670px; overflow: hidden; }
.customer-detail-empty {
  display: grid;
  place-items: center;
  align-content: center;
  min-height: 670px;
  padding: 40px;
  text-align: center;
}
.customer-detail-empty > span {
  display: grid;
  place-items: center;
  width: 50px;
  height: 50px;
  border-radius: 15px;
  color: #177bce;
  background: #e9f5ff;
  font-size: 24px;
}
.customer-detail-empty h2 { margin: 16px 0 6px; }
.customer-detail-empty p { margin: 0; color: #72879b; }

.customer-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 26px;
  border-bottom: 1px solid #dfe9f2;
  background: linear-gradient(100deg, #fff, #f1f8ff);
}
.customer-detail-head h2 { margin: 6px 0; font-size: 26px; }
.customer-detail-head p { margin: 0; color: #6a8096; font-size: 11px; }
.customer-detail-head p i { padding: 0 5px; font-style: normal; }
.customer-detail-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.customer-detail-actions .is-danger { color: #ac3d4d; border-color: #edc5cc; background: #fff7f8; }

.customer-edit-section,
.customer-shipments-section { padding: 24px 26px; }
.customer-shipments-section { border-top: 1px solid #e1eaf3; }
.customer-edit-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
  align-items: end;
  gap: 11px;
  margin-top: 18px;
}
.customer-edit-form .customer-access-primary { padding: 0 18px; }
.customer-code-meta {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding: 11px 13px;
  border-radius: 9px;
  color: #607890;
  background: #f4f8fc;
  font-size: 10px;
}
.customer-code-meta b { color: #18466f; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .08em; }
.customer-code-meta small { text-align: right; }

.customer-bind-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
  align-items: end;
  gap: 10px;
  margin-top: 18px;
  padding: 14px;
  border: 1px solid #dbe7f1;
  border-radius: 6px;
  background: #f8fbfe;
}
.customer-bind-mode {
  display: flex;
  grid-column: 1 / -1;
  gap: 4px;
  width: fit-content;
  padding: 3px;
  border: 1px solid #d7e3ee;
  border-radius: 5px;
  background: #fff;
}
.customer-bind-mode button {
  min-height: 32px;
  padding: 6px 10px;
  border: 0;
  border-radius: 3px;
  color: #6c8196;
  background: transparent;
  font-size: 10px;
  font-weight: 800;
}
.customer-bind-mode button.is-active { color: #126dbd; background: #eaf5ff; }
.customer-bind-wide { grid-column: span 3; }
.customer-bind-form .customer-access-primary { padding: 0 18px; }

.customer-field-hint,
.customer-reference-hint {
  margin: 0;
  color: #6f8296;
  font-size: 10px;
  font-weight: 500;
  line-height: 1.55;
}

.customer-reference-hint {
  grid-column: 1 / -2;
  padding: 2px 2px 0;
}

.customer-shipment-table {
  display: grid;
  gap: 8px;
  margin-top: 16px;
  border: 0;
  border-radius: 0;
}
.customer-shipment-table-head,
.customer-shipment-row {
  display: grid;
  grid-template-columns: minmax(180px, 1.35fr) minmax(130px, .8fr) minmax(110px, .65fr) 150px;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
}
.customer-shipment-table-head {
  border: 1px solid #dce7f1;
  color: #75889b;
  background: #f3f7fb;
  font-size: 9px;
  font-weight: 850;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.customer-shipment-row {
  border: 1px solid #dce7f1;
  border-radius: 4px;
  background: #fff;
  box-shadow: 0 4px 14px rgba(28, 66, 103, 0.035);
  font-size: 10px;
  transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}
.customer-shipment-row:hover {
  border-color: #a9cbe8;
  box-shadow: 0 8px 20px rgba(28, 86, 138, 0.08);
  transform: translateY(-1px);
}
.customer-shipment-table > .customer-access-empty {
  border: 1px solid #dce7f1;
  border-radius: 4px;
  background: #fff;
}
.customer-shipment-row > span:first-child { display: grid; gap: 3px; }
.customer-shipment-row b { font-size: 11px; }
.customer-shipment-row small { color: #72869a; }
.customer-shipment-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
  background: #31bd8d;
}

.customer-access-empty { padding: 24px; color: #8193a6; text-align: center; }
button:disabled { cursor: wait; opacity: .58; }

.customer-code-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(6, 28, 49, 0.58);
  backdrop-filter: blur(8px);
}
.customer-code-dialog {
  display: grid;
  gap: 13px;
  width: min(520px, 100%);
  padding: 30px;
  border: 1px solid rgba(173, 205, 232, 0.55);
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 30px 90px rgba(4, 29, 55, .3);
}
.customer-code-dialog h2 { margin: 0; font-size: 26px; }
.customer-code-dialog p,
.customer-code-dialog > small { margin: 0; color: #6b8095; line-height: 1.6; }
.customer-code-dialog code {
  display: block;
  padding: 18px;
  border: 1px dashed #8ec2ec;
  border-radius: 12px;
  color: #0e5fa7;
  background: #eff8ff;
  font-size: clamp(18px, 3vw, 26px);
  font-weight: 850;
  letter-spacing: .08em;
  text-align: center;
  overflow-wrap: anywhere;
}
.customer-code-dialog > div { display: flex; gap: 10px; margin-top: 4px; }
.customer-code-dialog > div button { flex: 1; }

.customer-account {
  position: relative;
}
.customer-account-trigger {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 146px;
  min-height: 48px;
  padding: 7px 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  color: #173752;
  background: transparent;
  text-align: left;
}
.customer-account-trigger:hover,
.customer-account.is-open .customer-account-trigger { border-color: #cfe0ef; background: #f6faff; }
.customer-account-trigger span { display: grid; flex: 1; gap: 2px; }
.customer-account-trigger b { font-size: 12px; }
.customer-account-trigger small { color: #7a8fa6; font-size: 10px; }
.customer-account-trigger i { color: #68829a; font-style: normal; }
.customer-account-menu {
  position: absolute;
  top: calc(100% + 7px);
  right: 0;
  z-index: 30;
  display: grid;
  min-width: 178px;
  padding: 6px;
  border: 1px solid #d5e3ef;
  border-radius: 11px;
  background: #fff;
  box-shadow: 0 18px 45px rgba(18, 55, 88, .18);
}
.customer-account-menu a,
.customer-account-menu button {
  padding: 10px 12px;
  border: 0;
  border-radius: 7px;
  color: #254966;
  background: transparent;
  text-align: left;
  text-decoration: none;
  font-weight: 750;
}
.customer-account-menu a:hover,
.customer-account-menu button:hover { background: #edf6ff; }
.customer-create-launcher { gap: 18px; }
.customer-create-launcher .customer-access-primary { width: 100%; }
.customer-candidate-section {
  margin-top: 16px;
  padding: 14px;
  border: 1px solid #d9e7f2;
  border-radius: 10px;
  background: #f8fbfe;
}
.customer-candidate-section > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 10px;
}
.customer-candidate-section h4 { margin: 0; font-size: 13px; }
.customer-candidate-section p { margin: 3px 0 0; color: #73899e; font-size: 10px; }
.customer-candidate-actions { display: flex; gap: 7px; }
.customer-candidate-section button,
.customer-shipment-actions button {
  min-height: 31px;
  padding: 6px 10px;
  border: 1px solid #cbddeb;
  border-radius: 7px;
  color: #315a7c;
  background: #fff;
  font-size: 10px;
  font-weight: 800;
}
.customer-candidate-list { display: grid; gap: 7px; }
.customer-candidate-row {
  display: grid;
  grid-template-columns: minmax(180px, 1.3fr) minmax(120px, .8fr) minmax(110px, .6fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #deebf4;
  border-radius: 8px;
  background: #fff;
  font-size: 10px;
}
.customer-candidate-row > span:first-child { display: grid; gap: 3px; }
.customer-candidate-row small { color: #758b9f; }
.customer-candidate-row > span:last-child,
.customer-shipment-actions { display: flex; gap: 6px; justify-content: flex-end; }
.customer-candidate-section button.is-primary { color: #fff; border-color: #1476c9; background: #1476c9; }
.customer-access-empty.compact { padding: 12px; }
.customer-shipment-row > span:nth-child(2) { display: grid; grid-template-columns: auto 1fr; align-items: center; }
.customer-shipment-note { grid-column: 1 / -1; margin-top: 4px; color: #6d8195; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.customer-dialog-form { display: grid; gap: 12px; }
.customer-dialog-form label,
.customer-note-editor { display: grid; gap: 6px; }
.customer-dialog-form label > span,
.customer-note-editor > span { color: #435d76; font-size: 11px; font-weight: 800; }
.customer-dialog-form input,
.customer-dialog-form textarea,
.customer-note-editor textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #cfdeec;
  border-radius: 9px;
  color: #183652;
  background: #fbfdff;
}
.customer-dialog-form textarea,
.customer-note-editor textarea { min-height: 116px; resize: vertical; font: inherit; }
.customer-note-editor > small { color: #8193a5; text-align: right; }
.customer-dialog-actions { display: flex; gap: 9px; justify-content: flex-end; }
.customer-dialog-actions button { flex: 1; }
.customer-shipment-dialog { width: min(620px, 100%); }
.customer-create-dialog,
.customer-shipment-dialog { max-height: min(86vh, 860px); overflow-y: auto; }
.customer-manual-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.customer-manual-update { padding: 12px; border: 1px solid #d7e4ef; border-radius: 10px; background: #f8fbfe; }
.customer-manual-update summary { cursor: pointer; color: #1b5e96; font-size: 12px; font-weight: 850; }
.customer-manual-update > p { margin: 8px 0 12px; color: #71879c; font-size: 12px; line-height: 1.6; }
.customer-pending-matches {
  display: grid;
  gap: 10px;
  margin: 18px 0;
  padding: 14px;
  border: 1px solid #d8e5ef;
  border-radius: 12px;
  background: #f8fbfd;
}
.customer-pending-matches > header,
.customer-pending-match-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.customer-pending-matches h4 { margin: 0; color: var(--customer-navy); }
.customer-pending-matches p { margin: 3px 0 0; color: #71879c; font-size: 11px; }
.customer-pending-match-row { padding: 10px; border-radius: 9px; background: #fff; }
.customer-pending-match-row > span { display: grid; gap: 3px; }
.customer-pending-match-row small { color: #788da0; font-size: 10px; }
.customer-publication-state { color: #956218 !important; font-weight: 800; }
.customer-publication-state.is-published { color: #147a55 !important; }
.customer-shipment-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.customer-shipment-detail-grid > span { display: grid; gap: 4px; padding: 11px; border-radius: 8px; background: #f3f8fc; }
.customer-shipment-detail-grid small { color: #75899e; }
.customer-shipment-detail-grid b { color: #183b5a; }

@media (max-width: 720px) {
  .customer-manual-fields { grid-template-columns: 1fr; }
  .customer-pending-match-row { align-items: stretch; flex-direction: column; }
}
.customer-toast {
  position: fixed;
  top: 92px;
  left: 50%;
  z-index: 140;
  transform: translateX(-50%);
  padding: 12px 18px;
  border: 1px solid #a9dfca;
  border-radius: 10px;
  color: #146a4c;
  background: #effbf6;
  box-shadow: 0 14px 38px rgba(18, 94, 68, .16);
  font-weight: 750;
}

/* Unified customer operations workspace · restrained deep-ocean theme */
.customer-access-page {
  --customer-navy: #0b1f35;
  --customer-navy-soft: #163552;
  --customer-blue: #1f69a8;
  --customer-line: #d9e3ec;
  --customer-surface: #ffffff;
  background:
    radial-gradient(circle at 76% -12%, rgba(69, 126, 174, .12), transparent 34rem),
    linear-gradient(180deg, #f8fafc 0%, #edf3f7 100%);
}
.customer-access-header {
  border-bottom-color: rgba(165, 185, 201, .38);
  background: rgba(255, 255, 255, .9);
  box-shadow: 0 10px 30px rgba(11, 31, 53, .05);
  backdrop-filter: blur(18px);
}
.customer-access-hero h1,
.customer-detail-head h2,
.customer-tracking-workspace h2 { color: var(--customer-navy); letter-spacing: -.035em; }
.customer-workspace-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 24px 0;
  padding: 7px;
  border: 1px solid rgba(179, 197, 212, .58);
  border-radius: 16px;
  background: rgba(255, 255, 255, .72);
  box-shadow: 0 16px 36px rgba(11, 31, 53, .06);
  backdrop-filter: blur(14px);
}
.customer-workspace-tabs button {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 12px;
  align-items: center;
  min-height: 72px;
  padding: 13px 18px;
  border: 1px solid transparent;
  border-radius: 12px;
  color: #49657c;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: border-color .18s ease, background .18s ease, box-shadow .18s ease, transform .18s ease;
}
.customer-workspace-tabs button > span {
  grid-row: 1 / span 2;
  color: #7891a5;
  font-size: 11px;
  font-weight: 850;
  letter-spacing: .14em;
}
.customer-workspace-tabs button b { color: var(--customer-navy); font-size: 15px; }
.customer-workspace-tabs button small { color: #71889b; font-size: 11px; }
.customer-workspace-tabs button.is-active {
  border-color: rgba(45, 99, 143, .32);
  background: linear-gradient(145deg, #fafdff, #edf5fa);
  box-shadow: 0 10px 25px rgba(17, 60, 96, .1);
  transform: translateY(-1px);
}
.customer-workspace-tabs button.is-active > span { color: var(--customer-blue); }
.customer-create-card,
.customer-list-card,
.customer-detail-card,
.customer-tracking-workspace {
  border-color: var(--customer-line);
  box-shadow: 0 24px 60px rgba(11, 31, 53, .075);
}
.customer-access-primary,
.customer-candidate-section button.is-primary {
  border-color: var(--customer-navy-soft) !important;
  background: linear-gradient(135deg, var(--customer-navy-soft), #245b87) !important;
  box-shadow: 0 8px 18px rgba(15, 53, 84, .16);
}
.customer-list-row.is-active {
  border-color: rgba(36, 91, 135, .34);
  background: linear-gradient(135deg, #f6fafc, #eaf3f8);
}
.customer-list-avatar { background: linear-gradient(145deg, var(--customer-navy-soft), #3579ad); }
.customer-tracking-workspace {
  overflow: hidden;
  border: 1px solid var(--customer-line);
  border-radius: 18px;
  background: var(--customer-surface);
}
.customer-tracking-workspace > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 22px 26px;
  border-bottom: 1px solid var(--customer-line);
  background: linear-gradient(115deg, #fbfdff, #f2f7fa);
}
.customer-tracking-workspace > header span { color: var(--customer-blue); font-size: 10px; font-weight: 850; letter-spacing: .16em; }
.customer-tracking-workspace > header h2 { margin: 5px 0; font-size: 24px; }
.customer-tracking-workspace > header p { margin: 0; color: #647d91; }
.customer-tracking-workspace > header button {
  padding: 9px 14px;
  border: 1px solid #c8d6e2;
  border-radius: 9px;
  color: #274b69;
  background: #fff;
  cursor: pointer;
}
.customer-tracking-workspace iframe { display: block; width: 100%; min-height: 1040px; border: 0; background: #f5f8fa; }

@media (max-width: 1100px) {
  .customer-access-layout { grid-template-columns: 1fr; }
  .customer-access-sidebar { grid-template-columns: minmax(280px, .8fr) minmax(320px, 1.2fr); }
}

@media (max-width: 760px) {
  .customer-access-header { padding: 0 16px; }
  .customer-access-user,
  .customer-access-party-pill { display: none; }
  .customer-access-content { width: min(100% - 28px, 1480px); padding-top: 34px; }
  .customer-access-hero { grid-template-columns: 1fr; gap: 20px; }
  .customer-access-sidebar { grid-template-columns: 1fr; }
  .customer-detail-head { align-items: flex-start; flex-direction: column; }
  .customer-edit-form,
  .customer-bind-form { grid-template-columns: 1fr; }
  .customer-bind-wide,
  .customer-bind-mode,
  .customer-reference-hint { grid-column: 1; }
  .customer-shipment-table-head { display: none; }
  .customer-shipment-row { grid-template-columns: 1fr auto; }
  .customer-shipment-row > span:nth-child(2),
  .customer-shipment-row > span:nth-child(3) { display: none; }
  .customer-workspace-tabs { grid-template-columns: 1fr; }
  .customer-tracking-workspace > header { align-items: flex-start; flex-direction: column; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; }
}
</style>
