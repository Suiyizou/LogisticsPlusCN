<template>
  <section :aria-busy="busy" class="admin-page-pane">
    <article class="admin-panel admin-audit-panel">
      <div class="admin-panel-head">
        <div>
          <p>System Operation Trail</p>
          <h2>{{ ui("admin.audit.apiTitle") }}</h2>
        </div>
        <div class="admin-inline-actions">
          <span>{{ t("admin.console.recordCount", { count: total }) }}</span>
          <button type="button" :disabled="busy" @click="emit('refresh')">
            {{ t("admin.console.refreshAudit") }}
          </button>
        </div>
      </div>
      <div class="admin-table-wrap">
        <el-table
          :data="rows"
          row-key="id"
          stripe
          class="standard-information-table admin-audit-table"
        >
          <AuditColumn :label="ui('admin.audit.time')" width="148">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </AuditColumn>
          <AuditColumn :label="ui('admin.audit.userRole')" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">
              <b>{{ row.username || "-" }}</b>
              <small>{{ auditRoleText(row.role) }} · ID {{ recordId(row.userId) }}</small>
            </template>
          </AuditColumn>
          <AuditColumn :label="ui('admin.audit.endpoint')" min-width="250" show-overflow-tooltip>
            <template #default="{ row }">
              <b>{{ operationActionLabel(row.action) }}</b>
              <small>{{ row.detail || row.action || "-" }}</small>
            </template>
          </AuditColumn>
          <AuditColumn :label="ui('admin.audit.result')" width="96">
            <template #default="{ row }">
              <el-tag :type="row.category === 'BUSINESS' ? 'success' : 'warning'">
                {{ operationCategoryLabel(row.category) }}
              </el-tag>
            </template>
          </AuditColumn>
          <AuditColumn :label="ui('admin.audit.duration')" min-width="138" show-overflow-tooltip>
            <template #default="{ row }">
              <b>{{ operationTargetLabel(row.targetType) }}</b>
              <small>{{ targetId(row.targetId) }}</small>
            </template>
          </AuditColumn>
          <AuditColumn :label="ui('admin.audit.ipDevice')" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">
              <b>{{ row.ipAddress || "-" }}</b>
            </template>
          </AuditColumn>
          <template #empty>{{ ui("admin.audit.empty") }}</template>
        </el-table>
      </div>
      <el-pagination
        v-if="total"
        class="admin-pagination"
        background
        layout="prev, pager, next, total"
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        :disabled="busy"
        @current-change="changePage"
      />
    </article>
  </section>
</template>
<script setup lang="ts">
import { ElTableColumn } from "element-plus";
import "element-plus/es/components/table-column/style/css";
import type { AdminAuditRecord } from "../../types/adminOverviewTypes";
import type { AdminWorkflowPorts } from "../../types/adminWorkflows";
import {
  canChangeAdminAuditPage,
  createAdminOverviewPresentation,
  formatAdminAuditDate,
  adminRecordId as recordId,
  adminTargetId as targetId
} from "./adminOverviewPresentation.js";
const AuditColumn = ElTableColumn<AdminAuditRecord>;
const props = defineProps<{
  rows: AdminAuditRecord[];
  total: number;
  page: number;
  pageSize: number;
  busy: boolean;
  locale: string;
  t: AdminWorkflowPorts["t"];
  ui: AdminWorkflowPorts["t"];
  roleText: (role: string) => string;
}>();
const emit = defineEmits<{ refresh: []; page: [page: number] }>();
const presentation = createAdminOverviewPresentation(() => props.locale);
const operationActionLabel = presentation.action;
const operationCategoryLabel = presentation.category;
const operationTargetLabel = presentation.target;
function auditRoleText(role: string | null | undefined) {
  return role ? props.roleText(role) : "-";
}
function formatDate(value: string | null | undefined) {
  return formatAdminAuditDate(value, props.locale);
}
function changePage(page: number) {
  if (canChangeAdminAuditPage(props, page)) emit("page", page);
}
</script>
<style scoped src="./adminTableStyles.css"></style>
<style scoped src="./adminAuditStyles.css"></style>
