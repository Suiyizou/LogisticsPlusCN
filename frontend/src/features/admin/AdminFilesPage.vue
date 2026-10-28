<script setup lang="ts">
import { nextTick, useId } from "vue";
import WorkspacePageHeader from "../../components/workspace/WorkspacePageHeader.vue";
import WorkspaceEmptyState from "../../components/workspace/WorkspaceEmptyState.vue";
import { ElTableColumn } from "element-plus";
import "element-plus/es/components/table-column/style/css";
import type {
  AdminWorkspaceFile,
  AdminShipmentFile,
  AdminFilePresentation
} from "../../types/adminFiles";
import type { AdminWorkflowPorts } from "../../types/adminWorkflows";
const WorkspaceColumn = ElTableColumn<AdminWorkspaceFile>;
const ShipmentColumn = ElTableColumn<AdminShipmentFile>;
const props = defineProps<{
  workspaceRows: AdminWorkspaceFile[];
  shipmentRows: AdminShipmentFile[];
  workspaceTotal: number;
  shipmentTotal: number;
  workspacePage: number;
  shipmentPage: number;
  workspacePageSize: number;
  shipmentPageSize: number;
  section: "workspace" | "shipment";
  includeExpired: boolean;
  busy: boolean;
  t: AdminWorkflowPorts["t"];
  presentation: AdminFilePresentation;
}>();
const emit = defineEmits<{
  section: [section: "workspace" | "shipment"];
  expired: [include: boolean];
  refreshWorkspace: [];
  refreshShipment: [];
  workspacePage: [page: number];
  shipmentPage: [page: number];
  downloadWorkspace: [file: AdminWorkspaceFile];
  downloadShipment: [file: AdminShipmentFile];
  preview: [file: AdminShipmentFile];
  delete: [file: AdminShipmentFile];
}>();
const scopeTabsId = useId();
function changeScopeFromKeyboard(event: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || props.busy) return;
  event.preventDefault();
  const scope =
    event.key === "Home"
      ? "workspace"
      : event.key === "End"
        ? "shipment"
        : props.section === "workspace"
          ? "shipment"
          : "workspace";
  emit("section", scope);
  void nextTick(() => document.getElementById(`${scopeTabsId}-${scope}-tab`)?.focus());
}
function onExpiredChange(event: Event) {
  if (!props.busy && event.target instanceof HTMLInputElement)
    emit("expired", event.target.checked);
}
const {
  identifier,
  formatFileSize,
  fileDate,
  shipmentFileKey,
  shipmentPublicId,
  shipmentFileReference,
  shipmentFileUploader,
  shipmentFileUploaderDetail,
  shipmentFileVisibilityText,
  shipmentFileVisibilityClass,
  shipmentFileStatusText,
  isShipmentFilePending,
  isShipmentFileDeleted
} = props.presentation;
</script>
<template>
  <section class="admin-page-pane">
    <div
      class="admin-file-scope-tabs"
      role="tablist"
      @keydown="changeScopeFromKeyboard"
      :aria-label="t('admin.files.scopeAria')"
    >
      <button
        type="button"
        role="tab"
        :aria-selected="section === 'workspace'"
        :id="`${scopeTabsId}-workspace-tab`"
        :aria-controls="`${scopeTabsId}-workspace-panel`"
        :tabindex="section === 'workspace' ? 0 : -1"
        :class="{ active: section === 'workspace' }"
        @click="emit('section', 'workspace')"
      >
        <span>{{ t("admin.files.workspaceTab") }}</span>
        <b>{{ workspaceTotal }}</b>
        <small>{{ t("admin.files.workspaceTabDescription") }}</small>
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="section === 'shipment'"
        :id="`${scopeTabsId}-shipment-tab`"
        :aria-controls="`${scopeTabsId}-shipment-panel`"
        :tabindex="section === 'shipment' ? 0 : -1"
        :class="{ active: section === 'shipment' }"
        @click="emit('section', 'shipment')"
      >
        <span>{{ t("admin.files.shipmentTab") }}</span>
        <b>{{ shipmentTotal }}</b>
        <small>{{ t("admin.files.shipmentTabDescription") }}</small>
      </button>
    </div>

    <Transition name="workspace-state" mode="out-in"
      ><article
        v-if="section === 'workspace'"
        key="workspace"
        class="admin-panel"
        role="tabpanel"
        :id="`${scopeTabsId}-workspace-panel`"
        :aria-labelledby="`${scopeTabsId}-workspace-tab`"
      >
        <WorkspacePageHeader compact class="admin-panel-head"
          ><template #title>{{ t("admin.files.workspaceTitle") }}</template
          ><template #eyebrow>Temporary Workspace Files</template
          ><template #actions
            ><div class="admin-inline-actions">
              <label class="admin-files-expired-filter">
                <input
                  :checked="includeExpired"
                  :disabled="busy"
                  type="checkbox"
                  @change="onExpiredChange"
                />
                <span>{{ t("admin.files.includeExpired") }}</span>
              </label>
              <span>{{ t("admin.files.total", { count: workspaceTotal }) }}</span>
              <button type="button" :disabled="busy" @click="emit('refreshWorkspace')">
                {{ t("admin.files.refresh") }}
              </button>
            </div></template
          ></WorkspacePageHeader
        >
        <div class="admin-table-wrap">
          <el-table
            :data="workspaceRows"
            row-key="id"
            stripe
            class="standard-information-table admin-files-table"
          >
            <WorkspaceColumn :label="t('admin.files.user')" min-width="160">
              <template #default="{ row: file }">
                <b>{{ file.ownerDisplayName || "-" }}</b>
                <small>ID {{ identifier(file.userId) }}</small>
              </template>
            </WorkspaceColumn>
            <WorkspaceColumn :label="t('admin.files.fileName')" min-width="220">
              <template #default="{ row: file }">
                <b>{{ file.originalFileName }}</b>
                <small>{{ file.source || "-" }}</small>
              </template>
            </WorkspaceColumn>
            <WorkspaceColumn :label="t('admin.files.size')" width="110">
              <template #default="{ row: file }">{{ formatFileSize(file.sizeBytes) }}</template>
            </WorkspaceColumn>
            <WorkspaceColumn :label="t('admin.files.uploadedAt')" min-width="165">
              <template #default="{ row: file }">{{ fileDate(file.uploadedAt) }}</template>
            </WorkspaceColumn>
            <WorkspaceColumn :label="t('admin.files.expiresAt')" min-width="165">
              <template #default="{ row: file }">{{ fileDate(file.expiresAt) }}</template>
            </WorkspaceColumn>
            <WorkspaceColumn :label="t('admin.files.status')" width="100">
              <template #default="{ row: file }">
                <span class="admin-status" :class="{ off: file.expired }">
                  {{ t(file.expired ? "admin.files.expired" : "admin.files.active") }}
                </span>
              </template>
            </WorkspaceColumn>
            <WorkspaceColumn :label="t('admin.files.action')" width="110" fixed="right">
              <template #default="{ row: file }">
                <div class="table-actions">
                  <button
                    type="button"
                    :disabled="file.expired || busy"
                    @click="emit('downloadWorkspace', file)"
                  >
                    {{ t("admin.files.download") }}
                  </button>
                </div>
              </template>
            </WorkspaceColumn>
            <template #empty
              ><WorkspaceEmptyState>{{
                t("admin.files.workspaceEmpty")
              }}</WorkspaceEmptyState></template
            >
          </el-table>
        </div>
        <el-pagination
          v-if="workspaceTotal"
          class="admin-pagination"
          background
          layout="prev, pager, next, total"
          :current-page="workspacePage"
          :page-size="workspacePageSize"
          :total="workspaceTotal"
          :disabled="busy"
          @current-change="emit('workspacePage', $event)"
        />
      </article>

      <article
        v-else
        key="shipment"
        class="admin-panel"
        role="tabpanel"
        :id="`${scopeTabsId}-shipment-panel`"
        :aria-labelledby="`${scopeTabsId}-shipment-tab`"
      >
        <WorkspacePageHeader compact class="admin-panel-head"
          ><template #title>{{ t("admin.files.shipmentTitle") }}</template
          ><template #eyebrow>Shipment Documents</template
          ><template #actions
            ><div class="admin-inline-actions">
              <span>{{ t("admin.files.total", { count: shipmentTotal }) }}</span>
              <button type="button" :disabled="busy" @click="emit('refreshShipment')">
                {{ t("admin.files.refresh") }}
              </button>
            </div></template
          ></WorkspacePageHeader
        >
        <div class="admin-table-wrap">
          <el-table
            :data="shipmentRows"
            :row-key="shipmentFileKey"
            stripe
            class="standard-information-table admin-files-table shipment-files"
          >
            <ShipmentColumn :label="t('admin.files.shipmentReference')" min-width="180">
              <template #default="{ row: file }">
                <b>{{ shipmentFileReference(file) }}</b>
                <small>{{ t("admin.files.publicId") }} {{ shipmentPublicId(file) }}</small>
              </template>
            </ShipmentColumn>
            <ShipmentColumn :label="t('admin.files.uploader')" min-width="170">
              <template #default="{ row: file }">
                <b>{{ shipmentFileUploader(file) }}</b>
                <small>{{ shipmentFileUploaderDetail(file) }}</small>
              </template>
            </ShipmentColumn>
            <ShipmentColumn :label="t('admin.files.fileName')" min-width="220">
              <template #default="{ row: file }">
                <b>{{ file.originalFileName || file.fileName || "-" }}</b>
                <small>{{
                  file.documentCategory || file.category || file.contentType || "-"
                }}</small>
              </template>
            </ShipmentColumn>
            <ShipmentColumn :label="t('admin.files.visibility')" width="130">
              <template #default="{ row: file }">
                <span
                  class="admin-visibility-pill"
                  :class="shipmentFileVisibilityClass(file.visibility)"
                >
                  {{ shipmentFileVisibilityText(file.visibility) }}
                </span>
              </template>
            </ShipmentColumn>
            <ShipmentColumn :label="t('admin.files.size')" width="100">
              <template #default="{ row: file }">{{ formatFileSize(file.sizeBytes) }}</template>
            </ShipmentColumn>
            <ShipmentColumn :label="t('admin.files.uploadedAt')" min-width="165">
              <template #default="{ row: file }">{{
                fileDate(file.uploadedAt || file.createdAt)
              }}</template>
            </ShipmentColumn>
            <ShipmentColumn :label="t('admin.files.status')" width="100">
              <template #default="{ row: file }">
                <span
                  class="admin-status"
                  :class="{
                    off: isShipmentFileDeleted(file),
                    warn: isShipmentFilePending(file)
                  }"
                >
                  {{ shipmentFileStatusText(file) }}
                </span>
              </template>
            </ShipmentColumn>
            <ShipmentColumn :label="t('admin.files.action')" width="250" fixed="right">
              <template #default="{ row: file }">
                <div class="table-actions">
                  <button
                    type="button"
                    :disabled="isShipmentFileDeleted(file) || busy"
                    @click="emit('preview', file)"
                  >
                    {{ t("admin.files.preview") }}
                  </button>
                  <button
                    type="button"
                    :disabled="isShipmentFileDeleted(file) || busy"
                    @click="emit('downloadShipment', file)"
                  >
                    {{ t("admin.files.download") }}
                  </button>
                  <button
                    class="danger ghost"
                    type="button"
                    :disabled="isShipmentFileDeleted(file) || busy"
                    @click="emit('delete', file)"
                  >
                    {{ t("admin.files.delete") }}
                  </button>
                </div>
              </template>
            </ShipmentColumn>
            <template #empty
              ><WorkspaceEmptyState>{{
                t("admin.files.shipmentEmpty")
              }}</WorkspaceEmptyState></template
            >
          </el-table>
        </div>
        <el-pagination
          v-if="shipmentTotal"
          class="admin-pagination"
          background
          layout="prev, pager, next, total"
          :current-page="shipmentPage"
          :page-size="shipmentPageSize"
          :total="shipmentTotal"
          :disabled="busy"
          @current-change="emit('shipmentPage', $event)"
        /></article
    ></Transition>
  </section>
</template>
<style scoped src="./adminTableStyles.css"></style>
<style scoped src="./adminFileListStyles.css"></style>

<style scoped src="../../components/workspace/workspacePageStyles.css"></style>
