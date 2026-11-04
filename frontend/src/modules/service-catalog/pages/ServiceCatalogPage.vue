<template>
  <section class="reference-module" data-module="service-catalog">
    <WorkspacePageHeader class="" :description="wt('serviceHint')"
      ><template #title>{{ t("serviceCatalog.title") }}</template
      ><template #actions
        ><el-button type="primary" :disabled="saving" @click="open()">{{
          t("serviceCatalog.create")
        }}</el-button></template
      ></WorkspacePageHeader
    >
    <CommercialSummary v-if="hasLoaded" :metrics="metrics" />
    <form class="search" @submit.prevent="search">
      <el-input
        v-model="query"
        :maxlength="100"
        :aria-label="commercialText('catalogSearchHint')"
        :placeholder="commercialText('catalogSearchHint')"
        clearable
      /><el-button native-type="submit">{{ t("serviceCatalog.search") }}</el-button
      ><el-button :loading="loading" @click="refresh(page, appliedQuery)">{{
        t("serviceCatalog.refresh")
      }}</el-button>
    </form>
    <el-alert
      v-if="error && !visible"
      class="commercial-state"
      :title="error"
      type="error"
      :closable="false"
      role="alert"
    />
    <el-table :data="rows" v-loading="loading" row-key="id" class="commercial-reveal">
      <template #empty>
        <WorkspaceEmptyState
          class="commercial-state"
          v-if="hasLoaded && !loading && !error"
          :title="commercialText(appliedQuery ? 'catalogSearchEmpty' : 'catalogEmpty')"
          :description="commercialText(appliedQuery ? 'catalogSearchHint' : 'catalogEmptyHint')"
        >
          <template #actions>
            <el-button v-if="appliedQuery" @click="clearSearch">{{
              commercialText("clearSearch")
            }}</el-button>
            <el-button v-else type="primary" @click="open()">{{
              t("serviceCatalog.create")
            }}</el-button>
          </template>
        </WorkspaceEmptyState>
      </template>
      <el-table-column
        v-for="field in fields"
        :key="field.name"
        :label="t('serviceCatalog.fields.' + field.name)"
        :min-width="field.name === 'description' ? 220 : 126"
        show-overflow-tooltip
      >
        <template #default="{ row }">
          <WorkspaceStatus
            v-if="field.name === 'enabled'"
            :tone="row.enabled ? 'success' : 'neutral'"
            :label="t(row.enabled ? 'serviceCatalog.enabled' : 'serviceCatalog.disabled')"
          />
          <strong v-else-if="field.name === 'name'">{{ row.name }}</strong>
          <code v-else-if="field.name === 'code'" class="catalog-code">{{ row.code }}</code>
          <span v-else>{{ row.description || "—" }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('serviceCatalog.updatedAt')" min-width="185"
        ><template #default="{ row }">{{
          formatUpdatedAt(row.updatedAt)
        }}</template></el-table-column
      >
      <el-table-column :label="t('serviceCatalog.actions')" width="100"
        ><template #default="{ row }"
          ><el-button size="small" :disabled="saving" @click="openById(row.id)">{{
            t("serviceCatalog.edit")
          }}</el-button></template
        ></el-table-column
      >
    </el-table>
    <el-pagination
      v-if="total > pageSize"
      :current-page="page + 1"
      :page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next"
      :disabled="saving"
      @update:current-page="changePage($event - 1)"
    />
    <el-dialog
      class="workspace-el-dialog"
      modal-class="catalog-editor-overlay"
      :model-value="visible"
      @update:model-value="setDialogOpen"
      :title="t(editing ? 'serviceCatalog.edit' : 'serviceCatalog.create')"
      width="min(620px,94vw)"
      :close-on-click-modal="false"
      :close-on-press-escape="!saving"
      :show-close="!saving"
    >
      <form @submit.prevent="save">
        <el-alert v-if="error" :title="error" type="error" :closable="false" role="alert" />
        <label v-for="field in fields" :key="field.name" class="editor-field"
          ><span
            >{{ t("serviceCatalog.fields." + field.name) }} {{ field.required ? "*" : "" }}</span
          >
          <ReferenceField
            :model-value="draft[field.name]"
            @update:model-value="setDraft(field.name, $event)"
            :field="field"
            :true-label="t('serviceCatalog.enabled')"
            :false-label="t('serviceCatalog.disabled')"
            :disabled="saving"
          />
        </label>
        <footer>
          <el-button :disabled="saving" @click="close">{{ t("serviceCatalog.cancel") }}</el-button
          ><el-button type="primary" native-type="submit" :loading="saving">{{
            t("serviceCatalog.save")
          }}</el-button>
        </footer>
      </form>
    </el-dialog>
  </section>
</template>
<script setup lang="ts">
import WorkspacePageHeader from "../../../components/workspace/WorkspacePageHeader.vue";
import { wt } from "../../../components/workspace/workspaceCopy";
import { computed, onMounted } from "vue";
import CommercialSummary from "../../shared/CommercialSummary.vue";
import { commercialText } from "../../../i18n/commercialWorkspaceMessages";
import WorkspaceEmptyState from "../../../components/workspace/WorkspaceEmptyState.vue";
import WorkspaceStatus from "../../../components/workspace/WorkspaceStatus.vue";
import { useI18n } from "vue-i18n";
import { fields } from "../../../generated/service-catalog-model";
import ReferenceField from "../../../components/platform/ReferenceField.vue";
import { useServiceCatalog } from "../useServiceCatalog";
const { t, locale } = useI18n();
const {
  rows,
  loading,
  saving,
  visible,
  query,
  appliedQuery,
  hasLoaded,
  page,
  pageSize,
  total,
  error,
  editing,
  draft,
  refresh,
  open,
  openById,
  setDraft,
  save,
  search,
  changePage,
  close,
  setDialogOpen
} = useServiceCatalog(t);
const enabledCount = computed(() => rows.value.filter((row) => row.enabled).length);
const metrics = computed(() => [
  { label: commercialText("catalogMatches"), value: total.value },
  { label: commercialText("catalogEnabled"), value: enabledCount.value },
  { label: commercialText("catalogDisabled"), value: rows.value.length - enabledCount.value }
]);
function clearSearch() {
  query.value = "";
  void search();
}
function formatUpdatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(locale.value, { dateStyle: "medium", timeStyle: "short" }).format(
        date
      );
}
onMounted(() => void refresh());
</script>
<style scoped>
:global(.catalog-editor-overlay) {
  --el-transition-duration: var(--motion-normal);
}
@media (prefers-reduced-motion: reduce) {
  :global(.catalog-editor-overlay.dialog-fade-enter-active),
  :global(.catalog-editor-overlay.dialog-fade-leave-active),
  :global(.catalog-editor-overlay.dialog-fade-enter-active .el-overlay-dialog),
  :global(.catalog-editor-overlay.dialog-fade-leave-active .el-overlay-dialog) {
    animation: none;
  }
}
.reference-module {
  display: grid;
  gap: 14px;
  padding: 24px;
  min-width: 0;
  background: var(--surface-card, #fff);
  border: 1px solid #dbe4ed;
  border-radius: var(--radius-control);
}
.reference-module :deep(.commercial-summary),
.reference-module :deep(.workspace-page-header) {
  margin-bottom: 0;
}
.search {
  flex-wrap: wrap;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface-subtle);
}
.catalog-code {
  color: var(--color-primary);
  font-variant-numeric: tabular-nums;
}
.search,
footer {
  display: flex;
  gap: 12px;
  align-items: center;
}
.search .el-input {
  flex: 1 1 180px;
  max-width: 420px;
}
.search .el-button {
  margin: 0;
}
.editor-field {
  display: grid;
  gap: 8px;
  margin: 18px 0;
}
footer {
  justify-content: flex-end;
  margin-top: 24px;
}
@media (max-width: 640px) {
  .search .el-input {
    flex-basis: 100%;
    max-width: none;
  }
  .reference-module {
    padding: 16px;
  }
}
</style>

<style scoped src="../../../components/workspace/workspacePageStyles.css"></style>
<style scoped src="../../shared/commercialWorkspaceMotion.css"></style>

<style scoped src="../../../components/workspace/workspaceElementDialog.css"></style>
