<script setup lang="ts">
import { ElTableColumn } from "element-plus";
import "element-plus/es/components/table-column/style/css";
import type { AdminDevice, AdminWorkflowPorts } from "../../types/adminWorkflows";
const DeviceColumn = ElTableColumn<AdminDevice>;
defineProps<{
  rows: AdminDevice[];
  total: number;
  page: number;
  pageSize: number;
  busy: boolean;
  deviceLimit: number;
  t: AdminWorkflowPorts["t"];
  formatDate: (date?: string | null) => string;
}>();
const emit = defineEmits<{
  kick: [device: AdminDevice];
  delete: [device: AdminDevice];
  page: [page: number];
}>();
</script>
<template>
  <section class="admin-page-pane">
    <div class="admin-metrics compact">
      <div>
        <span>{{ t("adminWorkflow.onlineOnPage") }}</span>
        <strong>{{ rows.filter((row) => row.online).length }}</strong>
        <small>{{ t("adminWorkflow.onlineHint") }}</small>
      </div>
      <div>
        <span>{{ t("adminWorkflow.deviceRecords") }}</span>
        <strong>{{ total }}</strong>
        <small>{{ t("adminWorkflow.recordsHint") }}</small>
      </div>
      <div>
        <span>{{ t("adminWorkflow.deviceLimit") }}</span>
        <strong>{{ deviceLimit }}</strong>
        <small>{{ t("adminWorkflow.limitHint") }}</small>
      </div>
    </div>

    <article class="admin-panel">
      <div class="admin-panel-head">
        <div>
          <p>Login Devices</p>
          <h2>{{ t("adminWorkflow.deviceHeading") }}</h2>
        </div>
      </div>
      <div class="admin-table-wrap">
        <el-table :data="rows" row-key="id" stripe class="standard-information-table devices">
          <DeviceColumn :label="t('admin.list.user')" min-width="150" show-overflow-tooltip>
            <template #default="{ row: device }"
              >{{ device.displayName }} / {{ device.username }}</template
            >
          </DeviceColumn>
          <DeviceColumn :label="t('admin.list.device')" min-width="180" show-overflow-tooltip>
            <template #default="{ row: device }">
              <b>{{ device.deviceName || t("adminWorkflow.webDevice") }}</b>
              <small>{{ device.deviceId }}</small>
            </template>
          </DeviceColumn>
          <DeviceColumn prop="ipAddress" label="IP" width="126">
            <template #default="{ row: device }">{{ device.ipAddress || "-" }}</template>
          </DeviceColumn>
          <DeviceColumn label="MAC" width="146" show-overflow-tooltip>
            <template #default="{ row: device }">{{
              device.macAddress || t("admin.list.webMacUnavailable")
            }}</template>
          </DeviceColumn>
          <DeviceColumn :label="t('admin.list.loginAt')" width="142">
            <template #default="{ row: device }">{{ formatDate(device.loggedInAt) }}</template>
          </DeviceColumn>
          <DeviceColumn :label="t('admin.list.lastSeen')" width="142">
            <template #default="{ row: device }">{{ formatDate(device.lastSeenAt) }}</template>
          </DeviceColumn>
          <DeviceColumn :label="t('admin.list.status')" width="90">
            <template #default="{ row: device }">
              <span class="admin-status" :class="{ off: !device.online }">
                {{ device.online ? t("adminWorkflow.online") : t("adminWorkflow.offline") }}
              </span>
            </template>
          </DeviceColumn>
          <DeviceColumn :label="t('admin.list.actions')" width="190" fixed="right">
            <template #default="{ row: device }">
              <div class="table-actions">
                <button
                  type="button"
                  :disabled="busy || !device.online"
                  @click="emit('kick', device)"
                >
                  {{ t("adminWorkflow.kickDevice") }}
                </button>
                <button
                  class="danger ghost"
                  type="button"
                  :disabled="busy"
                  @click="emit('delete', device)"
                >
                  {{ t("adminWorkflow.deleteDevice") }}
                </button>
              </div>
            </template>
          </DeviceColumn>
          <template #empty>{{ t("admin.list.noDevices") }}</template>
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
        @current-change="emit('page', $event)"
      />
    </article>
  </section>
</template>
<style scoped src="./adminTableStyles.css"></style>
