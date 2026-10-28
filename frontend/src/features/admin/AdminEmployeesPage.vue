<script setup lang="ts">
import WorkspacePageHeader from "../../components/workspace/WorkspacePageHeader.vue";
import WorkspaceEmptyState from "../../components/workspace/WorkspaceEmptyState.vue";
import { ElTableColumn } from "element-plus";
import "element-plus/es/components/table-column/style/css";
import type { AdminEmployee, AdminWorkflowPorts } from "../../types/adminWorkflows";
const EmployeeColumn = ElTableColumn<AdminEmployee>;
const props = defineProps<{
  rows: AdminEmployee[];
  total: number;
  page: number;
  pageSize: number;
  busy: boolean;
  currentUserId: string | number | undefined;
  t: AdminWorkflowPorts["t"];
  roleText: (role: string) => string;
  partyRoleText: (partyRole: string | undefined, role: string) => string;
  statusText: (status: string | undefined) => string;
  formatDate: (value: string) => string;
}>();
const emit = defineEmits<{
  create: [];
  refresh: [];
  edit: [user: AdminEmployee];
  reset: [user: AdminEmployee, event: MouseEvent];
  toggle: [user: AdminEmployee];
  delete: [user: AdminEmployee];
  page: [page: number];
}>();
function isSelf(user: AdminEmployee) {
  return props.currentUserId != null && String(user.id) === String(props.currentUserId);
}
function lastLogin(value: string | null | undefined) {
  return value && Number.isFinite(new Date(value).getTime()) ? props.formatDate(value) : "-";
}
</script>
<template>
  <section class="admin-page-pane">
    <article class="admin-panel admin-employee-panel">
      <WorkspacePageHeader compact class="admin-panel-head"
        ><template #title>{{ t("adminWorkflow.employeeHeading") }}</template
        ><template #eyebrow>Account List</template
        ><template #actions
          ><div class="admin-inline-actions">
            <span>{{ t("admin.console.accountCount", { count: total }) }}</span>
            <button class="primary" type="button" :disabled="busy" @click="emit('create')">
              {{ t("adminWorkflow.newEmployee") }}
            </button>
            <button type="button" :disabled="busy" @click="emit('refresh')">
              {{ t("adminWorkflow.refresh") }}
            </button>
          </div></template
        ></WorkspacePageHeader
      >
      <div class="admin-table-wrap">
        <el-table :data="rows" row-key="id" stripe class="standard-information-table">
          <EmployeeColumn
            prop="username"
            :label="t('admin.list.username')"
            min-width="128"
            show-overflow-tooltip
          />
          <EmployeeColumn
            prop="displayName"
            :label="t('admin.list.displayName')"
            min-width="136"
            show-overflow-tooltip
          />
          <EmployeeColumn :label="t('admin.list.systemRole')" width="126">
            <template #default="{ row: user }">{{ roleText(user.role) }}</template>
          </EmployeeColumn>
          <EmployeeColumn :label="t('admin.employee.partyRole')" width="126">
            <template #default="{ row: user }">{{
              partyRoleText(user.partyRole, user.role)
            }}</template>
          </EmployeeColumn>
          <EmployeeColumn :label="t('admin.list.status')" width="100">
            <template #default="{ row: user }">
              <span class="admin-status" :class="{ off: user.status !== 'ACTIVE' }">
                {{ statusText(user.status) }}
              </span>
            </template>
          </EmployeeColumn>
          <EmployeeColumn :label="t('admin.list.lastLogin')" width="142">
            <template #default="{ row: user }">{{ lastLogin(user.lastLoginAt) }}</template>
          </EmployeeColumn>
          <EmployeeColumn :label="t('admin.list.actions')" width="304" fixed="right">
            <template #default="{ row: user }">
              <div class="table-actions">
                <button type="button" :disabled="busy" @click="emit('edit', user)">
                  {{ t("admin.employee.edit") }}
                </button>
                <button
                  type="button"
                  :disabled="busy || isSelf(user)"
                  :title="isSelf(user) ? t('admin.employee.selfResetDisabled') : ''"
                  @click="emit('reset', user, $event)"
                >
                  {{ t("admin.employee.resetPassword") }}
                </button>
                <button
                  type="button"
                  :disabled="busy || isSelf(user)"
                  @click="emit('toggle', user)"
                >
                  {{
                    t(
                      user.status === "ACTIVE"
                        ? "adminWorkflow.disableEmployee"
                        : "adminWorkflow.enableEmployee"
                    )
                  }}
                </button>
                <button
                  class="danger ghost"
                  type="button"
                  :disabled="busy || isSelf(user)"
                  @click="emit('delete', user)"
                >
                  {{ t("adminWorkflow.deleteAccount") }}
                </button>
              </div>
            </template>
          </EmployeeColumn>
          <template #empty
            ><WorkspaceEmptyState>{{ t("admin.employee.empty") }}</WorkspaceEmptyState></template
          >
        </el-table>
      </div>
      <el-pagination
        v-if="total"
        class="admin-pagination"
        background
        layout="prev, pager, next, total"
        :disabled="busy"
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        @current-change="emit('page', $event)"
      />
    </article>
  </section>
</template>
<style scoped src="./adminTableStyles.css"></style>

<style scoped>
.admin-table-wrap :deep(.el-table td.el-table__cell) {
  padding-inline: 0;
}
.admin-status {
  white-space: nowrap;
}
</style>

<style scoped src="../../components/workspace/workspacePageStyles.css"></style>
