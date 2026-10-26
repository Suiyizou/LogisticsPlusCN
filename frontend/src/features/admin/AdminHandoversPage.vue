<script setup lang="ts">
import { computed } from "vue";
import { ElTableColumn } from "element-plus";
import "element-plus/es/components/table-column/style/css";
import type {
  AdminBusinessCopy,
  AdminBusinessPresentation,
  AdminHandover
} from "../../types/adminBusinessLists";
const BusinessColumn = ElTableColumn<AdminHandover>;
const props = defineProps<{
  rows: AdminHandover[];
  total: number;
  page: number;
  pageSize: number;
  busy: boolean;
  copy: AdminBusinessCopy;
  presentation: AdminBusinessPresentation;
  status: string;
}>();
const handoverCopy = computed(() => props.copy.handover());
const emit = defineEmits<{
  refresh: [];
  page: [page: number];
  "page-size": [size: number];
  status: [status: string];
}>();
function changeStatus(value: unknown) {
  if (!props.busy && typeof value === "string") emit("status", value);
}
</script>
<template>
  <section class="admin-page-pane" :aria-busy="busy">
    <article class="admin-panel admin-handover-panel">
      <div class="admin-panel-head">
        <div>
          <p>Business Handover Records</p>
          <h2>{{ handoverCopy.title }}</h2>
        </div>
        <div class="admin-inline-actions admin-handover-toolbar">
          <span>{{ handoverCopy.summary.replace("{count}", String(total)) }}</span>
          <label class="admin-handover-status-filter">
            <span>{{ handoverCopy.statusFilter }}</span>
            <el-select
              :model-value="status"
              :placeholder="handoverCopy.all"
              :disabled="busy"
              :aria-label="handoverCopy.statusFilter"
              @change="changeStatus"
            >
              <el-option value="" :label="handoverCopy.all" />
              <el-option value="PENDING" :label="handoverCopy.pending" />
              <el-option value="APPROVED" :label="handoverCopy.approved" />
              <el-option value="REJECTED" :label="handoverCopy.rejected" />
            </el-select>
          </label>
          <button type="button" :disabled="busy" @click="emit('refresh')">
            {{ handoverCopy.refresh }}
          </button>
        </div>
      </div>
      <div class="admin-table-wrap">
        <el-table
          :data="rows"
          row-key="requestId"
          stripe
          class="standard-information-table admin-handover-table"
        >
          <BusinessColumn :label="handoverCopy.request" width="154" show-overflow-tooltip>
            <template #default="{ row }">
              <b class="handover-request-id">{{ row.requestId ?? "-" }}</b>
              <span class="handover-status" :class="presentation.handoverStatusClass(row.status)">
                {{ presentation.handoverStatusText(row.status) }}
              </span>
            </template>
          </BusinessColumn>
          <BusinessColumn :label="handoverCopy.route" min-width="250">
            <template #default="{ row }">
              <div class="handover-route">
                <span>
                  <small>{{ handoverCopy.source }}</small>
                  <b>{{ presentation.handoverUserLabel(row, "source") }}</b>
                  <em>@{{ presentation.handoverUserHandle(row, "source") }}</em>
                </span>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M5 12h13M14 7l5 5-5 5" />
                </svg>
                <span>
                  <small>{{ handoverCopy.target }}</small>
                  <b>{{ presentation.handoverUserLabel(row, "target") }}</b>
                  <em>@{{ presentation.handoverUserHandle(row, "target") }}</em>
                </span>
              </div>
            </template>
          </BusinessColumn>
          <BusinessColumn :label="handoverCopy.scope" min-width="210">
            <template #default="{ row }">
              <div class="handover-customer-scope">
                <b>{{ presentation.handoverCustomerNames(row) }}</b>
                <small>
                  {{
                    handoverCopy.pendingEffect
                      .replace(
                        "{customers}",
                        String(row.customerCount ?? row.customers?.length ?? 0)
                      )
                      .replace("{shipments}", String(row.shipmentCount ?? 0))
                  }}
                </small>
              </div>
            </template>
          </BusinessColumn>
          <BusinessColumn :label="handoverCopy.reason" min-width="210" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="handover-reason">{{ row.reason || "-" }}</span>
            </template>
          </BusinessColumn>
          <BusinessColumn :label="handoverCopy.requestedBy" width="164">
            <template #default="{ row }">
              <div class="handover-requested-by">
                <b>{{ row.requestedBy?.displayName || row.requestedByUserName || "-" }}</b>
                <small>{{ presentation.date(row.requestedAt) }}</small>
              </div>
            </template>
          </BusinessColumn>
          <BusinessColumn :label="handoverCopy.review" min-width="180">
            <template #default="{ row }">
              <div class="handover-review-result">
                <b>{{ presentation.handoverReviewer(row) }}</b>
                <small>{{
                  presentation.date(row.reviewedAt || row.updatedAt || row.requestedAt)
                }}</small>
              </div>
            </template>
          </BusinessColumn>
          <template #empty>{{ handoverCopy.empty }}</template>
        </el-table>
      </div>
      <el-pagination
        v-if="total"
        class="admin-pagination"
        :disabled="busy"
        background
        layout="sizes, prev, pager, next, total"
        :page-sizes="[10, 20, 50, 100]"
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        @size-change="emit('page-size', $event)"
        @current-change="emit('page', $event)"
      />
    </article>
  </section>
</template>
<style scoped src="./adminTableStyles.css"></style>
<style scoped src="./adminBusinessStyles.css"></style>
