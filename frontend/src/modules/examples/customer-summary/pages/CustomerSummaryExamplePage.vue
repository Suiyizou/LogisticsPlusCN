<template>
  <section class="module-example" data-module="customer-summary-example">
    <WorkspacePageHeader class=""
      ><template #title>{{ t("moduleExample.title") }}</template
      ><template #description>{{ t("moduleExample.description") }}</template
      ><template #actions
        ><el-button :loading="loading" @click="refresh">{{
          t("customers.refresh")
        }}</el-button></template
      ></WorkspacePageHeader
    >
    <el-input v-model="query" clearable :placeholder="t('customers.searchCustomerPlaceholder')" />
    <el-alert v-if="error" :title="error" type="error" :closable="false" role="alert" />
    <el-table :data="rows" v-loading="loading">
      <el-table-column :label="t('customers.displayName')" min-width="180"
        ><template #default="{ row }">{{
          row.displayName || row.username
        }}</template></el-table-column
      >
      <el-table-column prop="clientCode" :label="t('customers.clientCode')" min-width="120" />
      <el-table-column prop="shipmentCount" :label="t('customers.shipmentCount')" width="110" />
      <el-table-column :label="t('customers.actions')" width="120"
        ><template #default="{ row }"
          ><el-button @click="commands.openCustomer(row.id)">{{
            t("customers.detail")
          }}</el-button></template
        ></el-table-column
      >
    </el-table>
  </section>
</template>
<script setup lang="ts">
import WorkspacePageHeader from "../../../../components/workspace/WorkspacePageHeader.vue";
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useWorkspaceContext } from "../../../workspaceContext.js";
import { useBusinessCommandContext } from "../../../businessCommandContext.js";
import { useCustomerSummary } from "../useCustomerSummary.js";
import { readCustomerSummary } from "../services.js";
const { t } = useI18n();
const { user } = useWorkspaceContext();
const commands = useBusinessCommandContext();
const { rows, query, loading, error, refresh } = useCustomerSummary({
  read: readCustomerSummary,
  user
});
onMounted(refresh);
</script>
<style scoped>
.module-example {
  display: grid;
  gap: 18px;
  min-width: 0;
  padding: 24px;
  border: 1px solid #dbe4ed;
  border-radius: var(--radius-control);
  background: white;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
h2 {
  margin: 0;
  color: #10263a;
  font-size: 24px;
}
p {
  margin: 8px 0 0;
  color: #687d91;
  line-height: 1.6;
}
@media (max-width: 600px) {
  header {
    align-items: flex-start;
    flex-direction: column;
  }
  .module-example {
    padding: 16px;
  }
}
</style>

<style scoped src="../../../../components/workspace/workspacePageStyles.css"></style>
