<template>
  <div data-i18n-ignore>
    <el-dialog
      :model-value="agentCreateDialogOpen"
      :before-close="closeAgentCreateDialog"
      :title="t('customers.createOverseaAgentTitle')"
      width="min(640px, 94vw)"
      :close-on-click-modal="false"
      :close-on-press-escape="!creatingAgent"
      class="square-dialog agent-create-dialog"
      :show-close="!creatingAgent"
    >
      <div class="agent-create-intro">
        <span
          ><el-icon><UserFilled /></el-icon
        ></span>
        <div>
          <b>{{ t("customers.createOverseaAgentTitle") }}</b>
          <small>{{ t("customers.createOverseaAgentHint") }}</small>
        </div>
      </div>
      <el-form
        class="agent-create-form"
        :disabled="creatingAgent"
        label-position="top"
        @submit.prevent="submitAgentCreate"
      >
        <el-form-item :label="t('customers.username')" required>
          <el-input
            v-model.trim="agentCreateForm.username"
            autocomplete="off"
            maxlength="64"
            show-word-limit
            :placeholder="t('customers.agentUsernamePlaceholder')"
          />
          <small class="agent-field-hint">{{ t("customers.agentUsernameRule") }}</small>
        </el-form-item>
        <el-form-item :label="t('customers.displayName')" required>
          <el-input
            v-model.trim="agentCreateForm.displayName"
            maxlength="80"
            show-word-limit
            :placeholder="t('customers.agentDisplayNamePlaceholder')"
          />
          <small class="agent-field-hint">{{ t("customers.agentDisplayNameRule") }}</small>
        </el-form-item>
        <el-form-item :label="t('customers.initialPassword')" required class="agent-password-field">
          <el-input
            v-model="agentCreateForm.password"
            type="password"
            show-password
            maxlength="128"
            autocomplete="new-password"
            :placeholder="t('customers.agentPasswordPlaceholder')"
          />
          <div class="agent-password-rules">
            <span
              v-for="rule in agentPasswordChecks"
              :key="rule.key"
              :class="{ 'is-valid': rule.valid }"
            >
              <i>{{ rule.valid ? "✓" : "•" }}</i
              >{{ rule.label }}
            </span>
          </div>
        </el-form-item>
        <el-alert
          v-if="agentCreateError"
          :title="agentCreateError"
          type="error"
          :closable="false"
          show-icon
        />
      </el-form>
      <template #footer>
        <el-button :disabled="creatingAgent" @click="closeAgentCreateDialog">{{
          t("customers.cancel")
        }}</el-button>
        <el-button
          type="primary"
          :loading="creatingAgent"
          :disabled="!canCreateAgent"
          @click="submitAgentCreate"
        >
          {{ t("customers.createOverseaAgent") }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import { toRefs } from "vue";
import { useI18n } from "vue-i18n";
import { useModulePages } from "../../moduleContext.js";
import { UserFilled } from "@element-plus/icons-vue";
const { t } = useI18n();
const workspace = useModulePages("agents").createDialog;
const {
  agentCreateDialogOpen,
  agentCreateError,
  agentCreateForm,
  agentPasswordChecks,
  canCreateAgent,
  creatingAgent
} = toRefs(workspace.state);
const actions = workspace.actions;
const { closeAgentCreateDialog, submitAgentCreate } = actions;
</script>
<style scoped src="../../shared/styles/businessDialogs.css"></style>
<style scoped>
.agent-create-intro {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 18px;
  padding: 15px;
  border: 1px solid #d6e5f2;
  border-radius: 4px;
  background: var(--color-surface-subtle);
}
.agent-create-intro > span {
  display: grid;
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  border-radius: 4px;
  color: #fff;
  background: var(--color-primary);
  box-shadow: none;
  place-items: center;
}
.agent-create-intro > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}
.agent-create-intro b {
  color: #1e405b;
  font-size: 13px;
}
.agent-create-intro small {
  color: #71879b;
  font-size: 10px;
  line-height: 1.6;
}
.agent-create-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}
.agent-create-form .agent-password-field,
.agent-create-form .el-alert {
  grid-column: 1 / -1;
}
.agent-field-hint {
  display: block;
  margin-top: 5px;
  color: #8295a8;
  font-size: 9px;
  line-height: 1.5;
}
.agent-password-rules {
  display: grid;
  width: 100%;
  margin-top: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.agent-password-rules span {
  display: inline-flex;
  padding: 6px 8px;
  border-radius: 4px;
  color: #8a6270;
  background: #fff3f5;
  align-items: center;
  gap: 6px;
  font-size: 9px;
}
.agent-password-rules span.is-valid {
  color: #267458;
  background: #eefaf5;
}
.agent-password-rules i {
  font-style: normal;
  font-weight: 850;
}
@media (max-width: 680px) {
  .agent-create-form,
  .agent-password-rules {
    grid-template-columns: 1fr;
  }
}
</style>
