<template>
  <div data-i18n-ignore>
    <Teleport to="body"
      ><WorkspaceDialogTransition
        ><div
          v-if="createDialogOpen"
          class="customer-code-overlay"
          role="presentation"
          @keydown="onDialogKeydown"
        >
          <section
            class="customer-code-dialog customer-create-dialog workspace-modal--form"
            ref="dialogElement"
            tabindex="-1"
            role="dialog"
            :aria-busy="creating"
            aria-modal="true"
            :aria-label="isEditMode ? t('customers.editTitle') : t('customers.createTitle')"
          >
            <span class="customer-code-kicker">{{
              isEditMode ? "EDIT CUSTOMER" : "NEW CUSTOMER"
            }}</span>
            <h2>{{ isEditMode ? t("customers.editTitle") : t("customers.createTitle") }}</h2>
            <p>
              {{ isEditMode ? t("customers.editDescription") : t("customers.createDescription") }}
            </p>
            <WorkspaceDialogFeedback />
            <form class="customer-dialog-form" @submit.prevent="submitCustomerForm">
              <fieldset :disabled="creating" class="customer-dialog-fields">
                <label
                  ><span>{{ t("customers.createDisplayName") }} <i class="required-star">*</i></span
                  ><input
                    v-model.trim="createForm.displayName"
                    :placeholder="t('customers.createDisplayNamePlaceholder')"
                    required
                /></label>
                <label>
                  <span>{{ t("customers.createAccount") }} <i class="required-star">*</i></span>
                  <input
                    v-model.trim="createForm.username"
                    minlength="2"
                    maxlength="64"
                    :placeholder="t('customers.createAccountPlaceholder')"
                    required
                  />
                  <small class="customer-field-rule">{{ t("customers.usernameRule") }}</small>
                </label>
                <label v-if="!isEditMode">
                  <span>{{ t("customers.createPassword") }} <i class="required-star">*</i></span>
                  <input
                    v-model="createForm.password"
                    type="password"
                    minlength="8"
                    maxlength="128"
                    pattern="(?=.*[A-Za-z])(?=.*\d).{8,128}"
                    autocomplete="new-password"
                    :title="t('customers.passwordRule')"
                    :placeholder="t('customers.customerPasswordPlaceholder')"
                    required
                  />
                  <small class="customer-field-rule">{{ t("customers.passwordRule") }}</small>
                </label>
                <label>
                  <span>{{ t("customers.clientCode") }} <i class="required-star">*</i></span>
                  <input
                    v-model.trim="createForm.userCode"
                    minlength="6"
                    :maxlength="isEditMode ? 64 : 10"
                    :pattern="isEditMode ? undefined : '[A-Za-z0-9._\\-]{6,10}'"
                    :title="t('customers.clientCodeRule')"
                    :placeholder="t('customers.clientCodePlaceholder')"
                    required
                  />
                  <small class="customer-field-rule">{{ t("customers.clientCodeRule") }}</small>
                </label>
                <label>
                  <span>{{ t("customers.createPartyRole") }} <i class="required-star">*</i></span>
                  <el-select
                    v-model="createForm.partyRole"
                    :disabled="creating"
                    class="business-select"
                    popper-class="business-select-popper"
                  >
                    <el-option value="SHIPPER" :label="t('customers.roleShipper')" />
                    <el-option value="CONSIGNEE" :label="t('customers.roleConsignee')" />
                  </el-select>
                </label>
                <label>
                  <span>{{ t("customers.contactEmail") }}</span>
                  <input
                    v-model.trim="createForm.contactEmail"
                    type="email"
                    maxlength="254"
                    autocomplete="email"
                    :placeholder="t('customers.contactEmailPlaceholder')"
                  />
                </label>
                <label>
                  <span>{{ t("customers.remark") }}</span>
                  <textarea
                    v-model="createForm.remark"
                    :placeholder="t('customers.remarkPlaceholder')"
                    maxlength="500"
                    rows="3"
                  ></textarea>
                </label>

                <div class="customer-dialog-actions">
                  <button type="button" @click="closeCreateDialog">
                    {{ t("customers.cancel") }}
                  </button>
                  <button class="customer-access-primary" type="submit" :disabled="creating">
                    {{
                      creating
                        ? t("customers.saving")
                        : isEditMode
                          ? t("customers.save")
                          : t("customers.create")
                    }}
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
        </div></WorkspaceDialogTransition
      ></Teleport
    >
  </div>
</template>
<script setup lang="ts">
import WorkspaceDialogFeedback from "../../../components/workspace/WorkspaceDialogFeedback.vue";
import WorkspaceDialogTransition from "../../../components/workspace/WorkspaceDialogTransition.vue";
import { toRefs, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useModulePages } from "../../moduleContext.js";
import { useDialogFocus } from "../../../composables/useDialogFocus.js";
const { t } = useI18n();
const workspace = useModulePages("customers").formDialog;
const { createDialogOpen, createForm, creating, isEditMode } = toRefs(workspace.state);
const actions = workspace.actions;
const { closeCreateDialog, submitCustomerForm } = actions;
const dialogElement = ref(null);
const { onDialogKeydown } = useDialogFocus({
  dialogElement,
  isOpen: () => Boolean(createDialogOpen.value),
  isBusy: () => Boolean(creating.value),
  close: closeCreateDialog
});
</script>
<style scoped src="../../shared/styles/businessDialogs.css"></style>
<style scoped></style>

<style scoped src="../../../components/workspace/workspaceDialogStyles.css"></style>
