<template>
  <section class="module-page customer-directory-page" data-module="customers">
    <div class="list-page list-page-full customer-directory-layout">
      <WorkspacePageHeader class="list-page-header" :description="wt('directoryHint')"
        ><template #title>{{ t("customers.directoryTitle") }}</template
        ><template #actions
          ><div v-if="isManager" class="list-page-actions">
            <el-button type="primary" :disabled="mutatingCustomer" @click="openCreateCustomer"
              ><el-icon><Plus /></el-icon>{{ t("customers.openCreate") }}</el-button
            >
            <el-button @click="openBatchImport"
              ><el-icon><Upload /></el-icon>{{ t("customers.batchImport") }}</el-button
            >
          </div></template
        ></WorkspacePageHeader
      >
      <section class="customer-directory-surface">
      <section class="customer-directory-toolbar" :aria-label="t('customers.directoryTitle')">
        <div class="customer-directory-search">
          <el-input
            v-model="customerSearch"
            :aria-label="t('customers.searchCustomerPlaceholder')"
            :placeholder="t('customers.searchCustomerPlaceholder')"
            :prefix-icon="Search"
            clearable
            style="width: 240px"
          />
        </div>
        <el-button class="customer-directory-refresh" :aria-label="t('customers.refresh')" :loading="loadingCustomers" :disabled="mutatingCustomer" text @click="refreshCustomers">
          <el-icon><Refresh /></el-icon><span class="customer-refresh-label">{{ t("customers.refresh") }}</span>
        </el-button>
        <Transition name="workspace-state"
          ><div
            v-if="isManager && selectedCustomerRows.length"
            class="customer-directory-selection"
          >
            <strong>{{ wt("selectedRows", { count: selectedCustomerRows.length }) }}</strong
            ><el-button
              type="success"
              plain
              :disabled="!selectedCustomerRows.length"
              @click="openCustomerTransfer(selectedCustomerRows[0], true)"
              >{{
                t("customers.transferSelected", {
                  count: selectedCustomerRows.length
                })
              }}</el-button
            >
            <el-button
              type="danger"
              plain
              :disabled="!selectedCustomerRows.length || mutatingCustomer"
              @click="deleteSelectedCustomers"
              >{{
                t("customers.deleteSelectedCustomers", {
                  count: selectedCustomerRows.length
                })
              }}</el-button
            >
          </div></Transition
        >
      </section>
      <el-table
        :ref="actions.setTableRef"
        :data="paginatedCustomers"
        row-key="id"
        v-loading="loadingCustomers"
        style="width: 100%"
        class="customer-directory-table"
        :class="{ 'is-page-switching': tablePageTransitioning }"
        scrollbar-always-on
        @selection-change="handleCustomerSelectionChange"
      >
        <template #empty>
          <WorkspaceEmptyState
            v-if="!loadingCustomers && customersLoaded"
            class="commercial-state"
            :title="
              commercialText(customerSearch.trim() ? 'directorySearchEmpty' : 'customerEmpty')
            "
            :description="
              customerSearch.trim()
                ? commercialText('directorySearchEmptyHint')
                : isManager
                  ? commercialText('customerEmptyHint')
                  : undefined
            "
          >
            <template v-if="customerSearch.trim() || isManager" #actions>
              <el-button v-if="customerSearch.trim()" @click="customerSearch = ''">
                {{ commercialText("clearSearch") }}
              </el-button>
              <el-button v-else type="primary" @click="openCreateCustomer">{{
                t("customers.openCreate")
              }}</el-button>
            </template>
          </WorkspaceEmptyState>
        </template>
        <el-table-column v-if="isManager" type="selection" width="40" />
        <el-table-column type="expand" width="40" class-name="customer-expand-column">
          <template #default="{ row }">
            <section class="customer-row-details" :aria-label="t('customers.detail')">
              <dl>
                <div>
                  <dt>{{ t("customers.createdAt") }}</dt>
                  <dd>{{ formatDateTime(row.createdAt) }}</dd>
                </div>
                <div>
                  <dt>{{ t("customers.remark") }}</dt>
                  <dd>{{ row.remark || "—" }}</dd>
                </div>
              </dl>
            </section>
          </template>
        </el-table-column>
        <el-table-column :label="t('customers.displayName')" min-width="260">
          <template #default="{ row }">
            <div class="customer-name-cell">
              <span class="customer-table-avatar">{{ customerRowInitial(row) }}</span>
              <div>
                <b :title="row.displayName || row.username">{{ row.displayName || row.username }}</b>
                <small :title="row.username">@{{ row.username }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          prop="clientCode"
          :label="t('customers.clientCode')"
          min-width="108"
          class-name="customer-code-column"
        ><template #default="{ row }"><span class="customer-code" :title="row.clientCode">{{ row.clientCode || '—' }}</span></template></el-table-column>
        <el-table-column
          prop="overseaAgentDisplayName"
          :label="t('customers.targetAgent')"
          min-width="140"
          class-name="customer-agent-column"
        >
          <template #default="{ row }"><span class="customer-agent-name" :class="{ 'is-unassigned': !row.overseaAgentDisplayName }" :title="row.overseaAgentDisplayName">{{
              row.overseaAgentDisplayName || t("customers.unassigned")
            }}</span></template>
        </el-table-column>
        <el-table-column :label="t('customers.partyRole')" width="100">
          <template #default="{ row }"><span class="customer-role" :title="partyRoleLabel(row.partyRole)">{{ customerRoleCaption(row.partyRole) }}</span></template>
        </el-table-column>
        <el-table-column :label="t('customers.shipmentCount')" width="88" align="center" class-name="customer-count-column">
          <template #default="{ row }"><span class="customer-shipment-count" :class="{ 'is-zero': !row.shipmentCount }">{{ row.shipmentCount || 0 }}</span></template>
        </el-table-column>
        <el-table-column :label="t('customers.status')" width="82">
          <template #default="{ row }">
            <span class="customer-status" :class="row.status === 'ACTIVE' ? 'is-active' : 'is-inactive'"><i aria-hidden="true"></i>{{
              statusLabel(row.status)
            }}</span>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('customers.actions')"
          :width="isManager ? 304 : 88"
          :fixed="compactLayout ? false : 'right'"
          align="right"
          class-name="customer-actions-column"
        >
          <template #default="{ row }">
            <div class="table-action-buttons table-action-buttons--single-line">
              <el-button class="customer-detail-action" size="small" type="primary" text @click.stop="selectCustomerRow(row)">{{
                t("customers.detail")
              }}</el-button>
              <template v-if="isManager">
                <el-button size="small" type="primary" text :disabled="mutatingCustomer" @click.stop="openEditCustomer(row)">
                  {{ t("customers.edit") }}
                </el-button>
                <el-button class="customer-delete-action" size="small" type="danger" text :disabled="mutatingCustomer" @click.stop="deleteCustomerRow(row)">
                  {{ t("customers.deleteCustomer") }}
                </el-button>
                <el-dropdown
                  trigger="click"
                  placement="bottom-end"
                  popper-class="business-comp-select customer-row-menu customer-directory-menu"
                >
                  <el-button
                    size="small"
                    class="customer-more-trigger"
                    text
                    :disabled="mutatingCustomer"
                    @click.stop
                    >{{ t("customers.customerMoreActions") }}<el-icon><ArrowDown /></el-icon></el-button
                  >
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item
                        :disabled="mutatingCustomer || !isTransferableCustomer(row)"
                        @click="openCustomerTransfer(row)"
                        >{{ t("customers.assignAgentShort") }}</el-dropdown-item
                      >
                      <el-dropdown-item :disabled="mutatingCustomer" @click="openResetPassword(row)">
                        {{ t("customers.resetPassword") }}
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </template>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <footer class="customer-directory-footer">
      <span class="customer-directory-results" aria-live="polite">{{ wt("resultsCount", { count: filteredCustomers.length }) }}</span>
      <el-pagination
        v-if="filteredCustomers.length"
        class="shipment-pagination unified-pagination"
        background
        layout="prev, pager, next"
        :current-page="customerPage"
        :page-size="customerPageSize"
        :total="filteredCustomers.length"
        @current-change="changeCustomerPage"
      />
      </footer>
      </section>
    </div>
  </section>
</template>
<script setup lang="ts">
import WorkspacePageHeader from "../../../components/workspace/WorkspacePageHeader.vue";
import { wt } from "../../../components/workspace/workspaceCopy";
import { toRefs } from "vue";
import { commercialText } from "../../../i18n/commercialWorkspaceMessages";
import WorkspaceEmptyState from "../../../components/workspace/WorkspaceEmptyState.vue";
import type { CustomerRecord } from "../../../types/businessRecords";
import { useMediaQuery } from "../../../composables/useMediaQuery.js";
import { useI18n } from "vue-i18n";
import { useModulePages } from "../../moduleContext.js";
import { ArrowDown, Plus, Refresh, Search, Upload } from "@element-plus/icons-vue";
const { t } = useI18n();
const compactLayout = useMediaQuery("(max-width: 680px)");
const pages = useModulePages("customers");
const workspace = pages.directory;
const { isManager } = toRefs(workspace.permissions);
const {
  customersLoaded,
  customerPage,
  customerPageSize,
  customerSearch,
  filteredCustomers,
  loadingCustomers,
  mutatingCustomer,
  paginatedCustomers,
  selectedCustomerRows,
  tablePageTransitioning
} = toRefs(workspace.state);
const actions = workspace.actions;
const {
  changeCustomerPage,
  deleteCustomerRow,
  deleteSelectedCustomers,
  refreshCustomers,
  handleCustomerSelectionChange,
  openBatchImport,
  openCreateCustomer,
  openCustomerTransfer,
  openEditCustomer,
  openResetPassword,
  selectCustomerFromList
} = actions;
const {
  customerInitial,
  formatDateTime,
  isTransferableCustomer,
  partyRoleLabel,
  statusLabel
} = workspace.formatters;

// Resolve the UI library's broad slot payload to the workflow-owned typed row.
function directoryCustomer(row: unknown): CustomerRecord | undefined {
  if (!row || typeof row !== "object" || !("id" in row)) return undefined;
  const id = row.id;
  if (typeof id !== "string" && typeof id !== "number") return undefined;
  return paginatedCustomers.value.find((customer) => String(customer.id) === String(id));
}

function customerRowInitial(row: unknown) {
  const customer = directoryCustomer(row);
  return customer ? customerInitial(customer) : "C";
}

function customerRoleCaption(role: unknown) {
  if (role === "SHIPPER") return t("customers.directoryShipper");
  if (role === "CONSIGNEE") return t("customers.directoryConsignee");
  if (role === "OVERSEA_AGENT") return t("customers.directoryAgent");
  return partyRoleLabel(typeof role === "string" ? role : "");
}

function selectCustomerRow(row: unknown) {
  const customer = directoryCustomer(row);
  if (customer) selectCustomerFromList(customer);
}
</script>
<style scoped src="../../../components/workspace/workspacePageStyles.css"></style>
<style scoped src="./customerDirectoryStyles.css"></style>
