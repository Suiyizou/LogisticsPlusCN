<script setup lang="ts">
import WorkspacePageHeader from "../../components/workspace/WorkspacePageHeader.vue";
import WorkspaceEmptyState from "../../components/workspace/WorkspaceEmptyState.vue";
import { ElTableColumn } from "element-plus";
import "element-plus/es/components/table-column/style/css";
import { createAnnouncementLabels } from "./announcementLabels.js";
import type {
  AdminAnnouncement,
  AnnouncementCopy,
  AnnouncementPresentation
} from "../../types/adminWorkflows";
const AnnouncementColumn = ElTableColumn<AdminAnnouncement>;
const props = defineProps<{
  rows: AdminAnnouncement[];
  total: number;
  page: number;
  pageSize: number;
  busy: boolean;
  copy: AnnouncementCopy;
  presentation: AnnouncementPresentation;
  formatDate: (value?: string | null) => string;
}>();
const emit = defineEmits<{
  create: [];
  refresh: [];
  preview: [record: AdminAnnouncement];
  edit: [record: AdminAnnouncement];
  publish: [record: AdminAnnouncement];
  disable: [record: AdminAnnouncement];
  delete: [record: AdminAnnouncement];
  page: [page: number];
}>();
const {
  announcementAudience,
  announcementStatus,
  announcementStatusLabel,
  announcementVisibilityLabel
} = createAnnouncementLabels(() => props.copy);
const { announcementImageUrl, announcementExcerpt } = props.presentation;
</script>
<template>
  <section class="admin-page-pane">
    <article class="admin-panel admin-announcement-panel">
      <WorkspacePageHeader compact class="admin-panel-head"
        ><template #title>{{ copy.listTitle }}</template
        ><template #eyebrow>Announcement Center</template
        ><template #actions
          ><div class="admin-inline-actions">
            <span>{{ copy.total.replace("{count}", String(total)) }}</span>
            <button class="primary" type="button" :disabled="busy" @click="emit('create')">
              {{ copy.create }}
            </button>
            <button type="button" :disabled="busy" @click="emit('refresh')">
              {{ copy.refresh }}
            </button>
          </div></template
        ></WorkspacePageHeader
      >
      <div class="admin-table-wrap">
        <el-table
          :data="rows"
          row-key="id"
          stripe
          class="standard-information-table admin-announcement-table"
        >
          <AnnouncementColumn :label="copy.title" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="announcement-title-cell">
                <span
                  v-if="announcementImageUrl(row)"
                  class="announcement-image-indicator"
                  aria-hidden="true"
                ></span>
                <div>
                  <b>{{ row.title || "-" }}</b>
                  <small>{{ announcementExcerpt(row.contentMarkdown) }}</small>
                </div>
              </div>
            </template>
          </AnnouncementColumn>
          <AnnouncementColumn :label="copy.visibility" width="122">
            <template #default="{ row }">
              <span
                class="announcement-visibility"
                :class="announcementAudience(row).toLowerCase()"
              >
                {{ announcementVisibilityLabel(announcementAudience(row)) }}
              </span>
            </template>
          </AnnouncementColumn>
          <AnnouncementColumn :label="copy.displayDate" width="126">
            <template #default="{ row }">{{ row.displayDate || "-" }}</template>
          </AnnouncementColumn>
          <AnnouncementColumn :label="copy.status" width="108">
            <template #default="{ row }">
              <span
                class="admin-status"
                :class="{ off: announcementStatus(row.status) !== 'PUBLISHED' }"
              >
                {{ announcementStatusLabel(row.status) }}
              </span>
            </template>
          </AnnouncementColumn>
          <AnnouncementColumn :label="copy.updatedAt" width="148">
            <template #default="{ row }">{{
              formatDate(row.updatedAt || row.publishedAt || row.createdAt)
            }}</template>
          </AnnouncementColumn>
          <AnnouncementColumn :label="copy.actions" width="250" fixed="right">
            <template #default="{ row }">
              <div class="table-actions announcement-row-actions">
                <button type="button" @click="emit('preview', row)">
                  {{ copy.preview }}
                </button>
                <button type="button" :disabled="busy" @click="emit('edit', row)">
                  {{ copy.edit }}
                </button>
                <button
                  v-if="announcementStatus(row.status) !== 'PUBLISHED'"
                  class="primary"
                  type="button"
                  :disabled="busy"
                  @click="emit('publish', row)"
                >
                  {{ copy.publish }}
                </button>
                <button v-else type="button" :disabled="busy" @click="emit('disable', row)">
                  {{ copy.deactivate }}
                </button>
                <button
                  class="danger ghost"
                  type="button"
                  :disabled="busy"
                  @click="emit('delete', row)"
                >
                  {{ copy.delete }}
                </button>
              </div>
            </template>
          </AnnouncementColumn>
          <template #empty
            ><WorkspaceEmptyState>{{ copy.empty }}</WorkspaceEmptyState></template
          >
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
<style scoped src="./announcementListStyles.css"></style>

<style scoped src="../../components/workspace/workspacePageStyles.css"></style>
