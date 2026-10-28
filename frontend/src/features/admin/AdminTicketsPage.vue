<script setup lang="ts">
import WorkspacePageHeader from "../../components/workspace/WorkspacePageHeader.vue";
import WorkspaceEmptyState from "../../components/workspace/WorkspaceEmptyState.vue";
import { computed } from "vue";
import { ElTableColumn } from "element-plus";
import "element-plus/es/components/table-column/style/css";
import type {
  AdminBusinessCopy,
  AdminBusinessPresentation,
  AdminTicket
} from "../../types/adminBusinessLists";
const BusinessColumn = ElTableColumn<AdminTicket>;
const props = defineProps<{
  rows: AdminTicket[];
  total: number;
  page: number;
  pageSize: number;
  busy: boolean;
  copy: AdminBusinessCopy;
  presentation: AdminBusinessPresentation;
}>();
const ticketCopy = computed(() => props.copy.ticket());
const emit = defineEmits<{ refresh: []; page: [page: number] }>();
</script>
<template>
  <section class="admin-page-pane" :aria-busy="busy">
    <article class="admin-panel">
      <WorkspacePageHeader compact class="admin-panel-head"
        ><template #title>{{ ticketCopy.title }}</template
        ><template #eyebrow>Shipment Management</template
        ><template #actions
          ><div class="admin-inline-actions">
            <span>{{ ticketCopy.total.replace("{count}", String(total)) }}</span>
            <RouterLink
              class="admin-inline-link primary"
              :to="{ path: '/customers', query: { section: 'shipments' } }"
            >
              {{ ticketCopy.openFullManagement }}
            </RouterLink>
            <button type="button" :disabled="busy" @click="emit('refresh')">
              {{ ticketCopy.refresh }}
            </button>
          </div></template
        ></WorkspacePageHeader
      >
      <div class="admin-table-wrap">
        <el-table :data="rows" row-key="shipmentId" stripe class="standard-information-table">
          <BusinessColumn :label="ticketCopy.referenceNo" min-width="170" show-overflow-tooltip>
            <template #default="{ row }">
              <b>{{ row.referenceNo || (row.shipmentId ?? "-") }}</b>
              <small>{{ presentation.referenceType(row.referenceType) }}</small>
            </template>
          </BusinessColumn>
          <BusinessColumn :label="ticketCopy.carrier" width="100">
            <template #default="{ row }">{{ row.carrier || "-" }}</template>
          </BusinessColumn>
          <BusinessColumn :label="ticketCopy.customer" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">{{ presentation.clientLabel(row) }}</template>
          </BusinessColumn>
          <BusinessColumn :label="ticketCopy.owner" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">{{ presentation.ownerLabel(row) }}</template>
          </BusinessColumn>
          <BusinessColumn :label="ticketCopy.boundUsers" min-width="170" show-overflow-tooltip>
            <template #default="{ row }">{{ presentation.boundUsersLabel(row) }}</template>
          </BusinessColumn>
          <BusinessColumn :label="ticketCopy.status" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="admin-status" :class="{ off: !row.trackingStatus }">
                {{ row.trackingStatus || ticketCopy.pending }}
              </span>
            </template>
          </BusinessColumn>
          <BusinessColumn :label="ticketCopy.updatedAt" width="150">
            <template #default="{ row }">{{
              presentation.date(row.lastTrackedAt || row.updatedAt)
            }}</template>
          </BusinessColumn>
          <BusinessColumn :label="ticketCopy.actions" width="104" fixed="right">
            <template #default="{ row }">
              <RouterLink
                class="admin-row-action"
                :to="{
                  path: '/customers',
                  query: { section: 'shipments', shipment: row.shipmentId }
                }"
              >
                {{ ticketCopy.manage }}
              </RouterLink>
            </template>
          </BusinessColumn>
          <template #empty
            ><WorkspaceEmptyState>{{ ticketCopy.empty }}</WorkspaceEmptyState></template
          >
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

<style scoped src="../../components/workspace/workspacePageStyles.css"></style>
