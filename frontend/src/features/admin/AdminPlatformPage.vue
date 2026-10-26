<script setup lang="ts">
import { computed } from "vue";
import { ElTableColumn } from "element-plus";
import "element-plus/es/components/table-column/style/css";
import type {
  AdminBusinessCopy,
  AdminBusinessPresentation,
  AdminPlatformCustomer
} from "../../types/adminBusinessLists";
const BusinessColumn = ElTableColumn<AdminPlatformCustomer>;
const props = defineProps<{
  rows: AdminPlatformCustomer[];
  total: number;
  page: number;
  pageSize: number;
  busy: boolean;
  copy: AdminBusinessCopy;
  presentation: AdminBusinessPresentation;
  info: import("../../types/adminBusinessLists").AdminPlatformInfo | null;
  partyRoleText: (role: string | null | undefined) => string;
  statusText: (status: string | undefined) => string;
}>();
const platformCopy = computed(() => props.copy.platform());
const emit = defineEmits<{
  refresh: [];
  delete: [row: AdminPlatformCustomer];
  page: [page: number];
}>();
</script>
<template>
  <section class="admin-page-pane" :aria-busy="busy">
    <article class="admin-panel">
      <div class="admin-panel-head">
        <div>
          <p>Customer Management</p>
          <h2>{{ platformCopy.customerTitle }}</h2>
        </div>
        <div class="admin-inline-actions">
          <span>{{
            platformCopy.summary(info?.customerCount ?? 0, info?.assignedCustomerCount ?? 0)
          }}</span>
          <button type="button" :disabled="busy" @click="emit('refresh')">
            {{ platformCopy.refresh }}
          </button>
        </div>
      </div>
      <div class="admin-table-wrap">
        <el-table
          :data="rows"
          :row-key="presentation.platformRowKey"
          stripe
          class="standard-information-table"
        >
          <BusinessColumn :label="platformCopy.customer" min-width="158" show-overflow-tooltip>
            <template #default="{ row }"
              ><b>{{ row.customerDisplayName || row.customerUsername }}</b
              ><small>@{{ row.customerUsername }}</small></template
            >
          </BusinessColumn>
          <BusinessColumn
            prop="clientCode"
            :label="platformCopy.clientCode"
            width="128"
            show-overflow-tooltip
          />
          <BusinessColumn :label="platformCopy.partyRole" width="130">
            <template #default="{ row }">{{ partyRoleText(row.partyRole) }}</template>
          </BusinessColumn>
          <BusinessColumn :label="platformCopy.business" min-width="148" show-overflow-tooltip>
            <template #default="{ row }"
              ><b>{{ row.businessDisplayName || "-" }}</b
              ><small>@{{ row.businessUsername || "-" }}</small></template
            >
          </BusinessColumn>
          <BusinessColumn :label="platformCopy.agent" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">
              <b>{{ row.agentDisplayName || platformCopy.unassigned }}</b>
              <small>{{ row.agentUsername ? `@${row.agentUsername}` : "-" }}</small>
            </template>
          </BusinessColumn>
          <BusinessColumn
            prop="shipmentCount"
            :label="platformCopy.shipments"
            width="120"
            align="center"
          />
          <BusinessColumn :label="platformCopy.status" width="110">
            <template #default="{ row }"
              ><span class="admin-status" :class="{ off: row.customerStatus !== 'ACTIVE' }">{{
                statusText(row.customerStatus)
              }}</span></template
            >
          </BusinessColumn>
          <BusinessColumn :label="platformCopy.actions" width="168" fixed="right">
            <template #default="{ row }">
              <div class="admin-platform-row-actions">
                <RouterLink
                  class="admin-row-action"
                  :to="{
                    path: '/customers',
                    query: { section: 'customers', customer: row.customerId }
                  }"
                >
                  {{ platformCopy.manage }}
                </RouterLink>
                <button
                  class="admin-row-action danger"
                  type="button"
                  :disabled="busy"
                  @click="emit('delete', row)"
                >
                  {{ platformCopy.delete }}
                </button>
              </div>
            </template>
          </BusinessColumn>
          <template #empty>{{ platformCopy.empty }}</template>
        </el-table>
      </div>
      <el-pagination
        v-if="total"
        class="admin-pagination"
        :disabled="busy"
        background
        layout="prev, pager, next, total"
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        @current-change="emit('page', $event)"
      />
    </article>
  </section>
</template>
<style scoped src="./adminTableStyles.css"></style>
<style scoped src="./adminBusinessStyles.css"></style>
