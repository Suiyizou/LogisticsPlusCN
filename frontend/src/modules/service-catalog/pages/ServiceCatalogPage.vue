<template>
  <section class="reference-module" data-module="service-catalog">
    <header>
      <div>
        <h2>{{ t("serviceCatalog.title") }}</h2>
        <p>{{ t("serviceCatalog.description") }}</p>
      </div>
      <el-button type="primary" :disabled="saving" @click="open()">{{
        t("serviceCatalog.create")
      }}</el-button>
    </header>
    <form class="search" @submit.prevent="search">
      <el-input
        v-model="query"
        :maxlength="100"
        :placeholder="t('serviceCatalog.search')"
        clearable
      /><el-button native-type="submit">{{ t("serviceCatalog.search") }}</el-button
      ><el-button :loading="loading" @click="refresh">{{ t("serviceCatalog.refresh") }}</el-button>
    </form>
    <el-alert v-if="error && !visible" :title="error" type="error" :closable="false" role="alert" />
    <el-table :data="rows" v-loading="loading" row-key="id">
      <el-table-column
        v-for="field in fields"
        :key="field.name"
        :label="t('serviceCatalog.fields.' + field.name)"
        min-width="140"
        show-overflow-tooltip
      >
        <template #default="{ row }">{{
          row[field.name] == null
            ? "—"
            : field.type === "boolean"
              ? t(row[field.name] ? "serviceCatalog.enabled" : "serviceCatalog.disabled")
              : row[field.name]
        }}</template>
      </el-table-column>
      <el-table-column :label="t('serviceCatalog.updatedAt')" min-width="185"
        ><template #default="{ row }">{{
          new Date(row.updatedAt).toLocaleString()
        }}</template></el-table-column
      >
      <el-table-column :label="t('serviceCatalog.actions')" width="100"
        ><template #default="{ row }"
          ><el-button :disabled="saving" @click="openById(row.id)">{{
            t("serviceCatalog.edit")
          }}</el-button></template
        ></el-table-column
      >
    </el-table>
    <el-pagination
      :current-page="page + 1"
      :page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next"
      :disabled="saving"
      @update:current-page="changePage($event - 1)"
    />
    <el-dialog
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
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { fields } from "../../../generated/service-catalog-model";
import ReferenceField from "../../../components/platform/ReferenceField.vue";
import { useServiceCatalog } from "../useServiceCatalog";
const { t } = useI18n();
const {
  rows,
  loading,
  saving,
  visible,
  query,
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
onMounted(refresh);
</script>
<style scoped>
.reference-module {
  display: grid;
  gap: 20px;
  padding: 24px;
  min-width: 0;
  background: var(--surface-card, #fff);
  border: 1px solid #dbe4ed;
  border-radius: 12px;
}
header,
.search,
footer {
  display: flex;
  gap: 12px;
  align-items: center;
}
header {
  justify-content: space-between;
}
h2 {
  margin: 0;
}
p {
  color: #687d91;
}
.search .el-input {
  max-width: 420px;
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
  header,
  .search {
    align-items: stretch;
    flex-direction: column;
  }
  .reference-module {
    padding: 16px;
  }
}
</style>
