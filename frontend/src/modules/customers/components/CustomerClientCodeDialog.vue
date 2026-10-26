<template>
  <div data-i18n-ignore>
    <Teleport to="body"
      ><div
        v-if="clientCodeDialogOpen"
        class="customer-code-overlay"
        role="presentation"
        @keydown="onDialogKeydown"
        @click.self="closeClientCodeSupplement"
      >
        <section
          class="customer-code-dialog customer-supplement-dialog"
          ref="dialogElement"
          tabindex="-1"
          role="dialog"
          :aria-busy="mutatingCustomer"
          aria-modal="true"
          :aria-label="t('customers.manualSupplement')"
        >
          <span class="customer-code-kicker">BUSINESS MATCHING KEY</span>
          <h2>{{ t("customers.supplementClientCode") }}</h2>
          <p>{{ t("customers.supplementClientCodeHint") }}</p>
          <form class="customer-dialog-form" @submit.prevent="saveClientCodeSupplement">
            <fieldset :disabled="mutatingCustomer" class="customer-dialog-fields">
              <label>
                <span>{{ t("customers.clientCode") }}</span>
                <input
                  v-model.trim="clientCodeSupplement"
                  minlength="6"
                  maxlength="10"
                  pattern="[A-Za-z0-9._\-]{6,10}"
                  :title="t('customers.clientCodeRule')"
                  :placeholder="t('customers.clientCodePlaceholder')"
                  required
                />
                <small class="customer-field-rule">{{ t("customers.clientCodeRule") }}</small>
              </label>
              <div class="customer-dialog-actions">
                <button type="button" @click="closeClientCodeSupplement">
                  {{ t("customers.cancel") }}
                </button>
                <button class="customer-access-primary" type="submit" :disabled="mutatingCustomer">
                  {{ t("customers.saveSupplement") }}
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      </div></Teleport
    >
  </div>
</template>
<script setup lang="ts">
import { toRefs, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useModulePages } from "../../moduleContext.js";
import { useDialogFocus } from "../../../composables/useDialogFocus.js";
const { t } = useI18n();
const workspace = useModulePages("customers").clientCodeDialog;
const { clientCodeDialogOpen, clientCodeSupplement, mutatingCustomer } = toRefs(workspace.state);
const actions = workspace.actions;
const { closeClientCodeSupplement, saveClientCodeSupplement } = actions;
const dialogElement = ref(null);
const { onDialogKeydown } = useDialogFocus({
  dialogElement,
  isOpen: () => Boolean(clientCodeDialogOpen.value),
  isBusy: () => Boolean(mutatingCustomer.value),
  close: closeClientCodeSupplement
});
</script>
<style scoped src="../../shared/styles/businessDialogs.css"></style>
<style scoped></style>
