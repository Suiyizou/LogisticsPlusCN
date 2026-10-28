<script setup lang="ts">
import { TRACKING_CARRIERS, supportsShipmentReference } from "../../services/trackingCarriers.js";
import { ref } from "vue";
import type { ManualShipmentCreateWorkflow } from "../../types/featureComponents";
import { useI18n } from "vue-i18n";
import { useShipmentEntryDialogFocus } from "./useShipmentEntryDialogFocus.js";

// The parent passes a reactive workflow that unwraps composable refs. The dialog
// edits only that controlled state; all validation and server writes stay there.
const props = defineProps<{ workflow: ManualShipmentCreateWorkflow }>();
const { t } = useI18n();
const dialogElement = ref<HTMLElement | null>(null);
const { onDialogKeydown: handleDialogKeydown } = useShipmentEntryDialogFocus({
  dialogElement,
  isOpen: () => props.workflow.shipmentCreateDialogOpen,
  isBusy: () => props.workflow.entryBusy || props.workflow.creatingShipment,
  close: () => props.workflow.closeShipmentCreateDialog()
});
const onDialogKeydown = (event: KeyboardEvent) => handleDialogKeydown(event);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="workflow.shipmentCreateDialogOpen"
      class="customer-code-overlay"
      role="presentation"
      @keydown="onDialogKeydown"
    >
      <section
        class="customer-code-dialog customer-create-dialog manual-shipment-dialog"
        ref="dialogElement"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-busy="workflow.entryBusy || workflow.creatingShipment"
        :aria-label="t('customers.createShipment')"
      >
        <span class="customer-code-kicker">{{ t("customers.dialogKickerNewShipment") }}</span>
        <h2>{{ t("customers.createShipment") }}</h2>
        <p>{{ t("customers.createShipmentDescription") }}</p>
        <form
          class="customer-dialog-form manual-shipment-form"
          @submit.prevent="workflow.createShipment"
        >
          <fieldset
            class="shipment-dialog-fields"
            :disabled="workflow.entryBusy || workflow.creatingShipment"
          >
            <p class="manual-required-hint">{{ t("customers.manualRequiredHint") }}</p>
            <section class="manual-entry-section">
              <header class="manual-entry-section-head">
                <span
                  ><b>00</b><strong>{{ t("customers.selectCustomerFirst") }}</strong></span
                >
                <small>{{ t("customers.manualRequiredSection") }}</small>
              </header>
              <div class="assignment-customer-row">
                <label>
                  <span>{{ t("customers.customer") }} <i class="required-star">*</i></span>
                  <el-select
                    v-model="workflow.shipmentCreateCustomerId"
                    filterable
                    :disabled="workflow.entryBusy || workflow.creatingShipment"
                    class="business-select"
                  >
                    <el-option
                      v-for="customer in workflow.assignableCustomers"
                      :key="customer.id"
                      :value="customer.id"
                      :label="workflow.customerFilterOptionLabel(customer)"
                    />
                    <template #label="{ value }">
                      <span class="business-select-value">{{
                        workflow.selectedCustomerOptionLabel(value)
                      }}</span>
                    </template>
                  </el-select>
                </label>
                <el-checkbox
                  :model-value="workflow.shipmentCreatePublishToCustomer"
                  @update:model-value="workflow.shipmentCreatePublishToCustomer = $event === true"
                  :disabled="workflow.entryBusy || workflow.creatingShipment"
                  >{{ t("customers.publishAfterCreate") }}</el-checkbox
                >
              </div>
            </section>

            <section class="manual-entry-section">
              <header class="manual-entry-section-head">
                <span
                  ><b>01</b><strong>{{ t("customers.manualSectionBasic") }}</strong></span
                >
                <small>{{ t("customers.manualRequiredSection") }}</small>
              </header>
              <div class="manual-entry-grid">
                <label>
                  <span>{{ t("customers.carrier") }} <i class="required-star">*</i></span>
                  <el-select
                    v-model="workflow.shipmentCreateForm.carrier"
                    :disabled="workflow.entryBusy || workflow.creatingShipment"
                    class="business-select"
                    popper-class="business-select-popper"
                  >
                    <el-option v-for="carrier in TRACKING_CARRIERS" :key="carrier.code" :value="carrier.code" :label="carrier.name" />
                  </el-select>
                </label>
                <label>
                  <span>{{ t("customers.referenceType") }} <i class="required-star">*</i></span>
                  <el-select
                    v-model="workflow.shipmentCreateForm.referenceType"
                    :disabled="workflow.entryBusy || workflow.creatingShipment"
                    class="business-select"
                    popper-class="business-select-popper"
                  >
                    <el-option value="BOOKING" :label="t('customers.referenceBooking')" />
<el-option v-if="supportsShipmentReference(workflow.shipmentCreateForm.carrier, 'BILLOFLADING')" value="BILLOFLADING" :label="t('customers.referenceBill')" />
                  </el-select>
                </label>
                <label>
                  <span>{{ t("customers.referenceNo") }} <i class="required-star">*</i></span>
                  <input
                    v-model.trim="workflow.shipmentCreateForm.referenceNo"
                    maxlength="160"
                    required
                  />
                </label>
                <label>
                  <span>{{ t("customers.latestEventName") }} <i class="required-star">*</i></span>
                  <input
                    v-model.trim="workflow.shipmentCreateForm.latestEventName"
                    maxlength="160"
                    required
                  />
                </label>
                <label>
                  <span>{{ t("customers.latestEventLocation") }}</span>
                  <input
                    v-model.trim="workflow.shipmentCreateForm.latestEventLocation"
                    maxlength="160"
                  />
                </label>
                <label>
                  <span>{{ t("customers.latestEventTime") }}</span>
                  <input
                    v-model="workflow.shipmentCreateForm.latestEventTime"
                    type="datetime-local"
                  />
                </label>
                <label>
                  <span
                    >{{ t("customers.estimatedDeparture") }} <i class="required-star">*</i></span
                  >
                  <input
                    v-model="workflow.shipmentCreateForm.estimatedDeparture"
                    type="datetime-local"
                    required
                  />
                </label>
                <label>
                  <span>{{ t("customers.estimatedArrival") }} <i class="required-star">*</i></span>
                  <input
                    v-model="workflow.shipmentCreateForm.estimatedArrival"
                    type="datetime-local"
                    required
                  />
                </label>
                <label>
                  <span>{{ t("customers.estimatedDelivery") }}</span>
                  <input
                    v-model="workflow.shipmentCreateForm.estimatedDelivery"
                    type="datetime-local"
                  />
                </label>
                <label>
                  <span>{{ t("customers.actualDeparture") }}</span>
                  <input
                    v-model="workflow.shipmentCreateForm.actualDeparture"
                    type="datetime-local"
                  />
                </label>
                <label>
                  <span>{{ t("customers.actualArrival") }}</span>
                  <input
                    v-model="workflow.shipmentCreateForm.actualArrival"
                    type="datetime-local"
                  />
                </label>
                <label>
                  <span>{{ t("customers.actualDelivery") }}</span>
                  <input
                    v-model="workflow.shipmentCreateForm.actualDelivery"
                    type="datetime-local"
                  />
                </label>
              </div>
            </section>

            <section class="manual-entry-section">
              <header class="manual-entry-section-head">
                <span
                  ><b>02</b><strong>{{ t("customers.manualSectionRoute") }}</strong></span
                >
                <small>{{ t("customers.manualRouteHint") }}</small>
              </header>
              <div class="manual-route-list">
                <article
                  v-for="(node, index) in workflow.shipmentCreateForm.routeNodes"
                  :key="node.key"
                  class="manual-repeat-card manual-route-card"
                >
                  <header>
                    <span>
                      <b>{{ workflow.manualRouteNodeLabel(node.locationType) }}</b>
                      <small>{{ node.locationType }}</small>
                    </span>
                    <button
                      v-if="node.optional"
                      type="button"
                      class="manual-remove-button"
                      @click="workflow.removeManualRouteNode(index)"
                    >
                      {{ t("customers.removeItem") }}
                    </button>
                  </header>
                  <div class="manual-entry-grid is-route">
                    <label>
                      <span
                        >{{ t("customers.routeLocation") }}
                        <i v-if="node.required" class="required-star">*</i></span
                      >
                      <input v-model.trim="node.city" maxlength="160" :required="node.required" />
                    </label>
                    <label>
                      <span>{{ t("customers.countryCode") }}</span>
                      <input v-model.trim="node.countryCode" maxlength="2" placeholder="CN / US" />
                    </label>
                    <label>
                      <span>{{ t("customers.facilityTerminal") }}</span>
                      <input v-model.trim="node.facilityCode" maxlength="160" />
                    </label>
                    <label>
                      <span>{{ t("customers.routeEvent") }}</span>
                      <input v-model.trim="node.event" maxlength="160" />
                    </label>
                    <label>
                      <span>{{ t("customers.routeEstimatedTime") }}</span>
                      <input v-model="node.estimatedTime" type="datetime-local" />
                    </label>
                    <label>
                      <span>{{ t("customers.routeActualTime") }}</span>
                      <input v-model="node.actualTime" type="datetime-local" />
                    </label>
                  </div>
                </article>
              </div>
              <button
                type="button"
                class="manual-add-button"
                @click="workflow.addManualTransshipment"
              >
                + {{ t("customers.addTransshipment") }}
              </button>
            </section>

            <section class="manual-entry-section">
              <header class="manual-entry-section-head">
                <span
                  ><b>03</b><strong>{{ t("customers.manualSectionBooking") }}</strong></span
                >
                <small>{{ t("customers.manualOptionalSection") }}</small>
              </header>
              <div class="manual-entry-grid">
                <label
                  ><span>{{ t("customers.jobNumber") }}</span
                  ><input
                    v-model.trim="workflow.shipmentCreateForm.forwarderJobNumber"
                    maxlength="160"
                /></label>
                <label
                  ><span>{{ t("customers.clientNameCode") }}</span
                  ><input v-model.trim="workflow.shipmentCreateForm.clientNameCode" maxlength="160"
                /></label>
                <label
                  ><span>{{ t("customers.clientPoNumber") }}</span
                  ><input v-model.trim="workflow.shipmentCreateForm.clientPoNumber" maxlength="160"
                /></label>
                <label
                  ><span>{{ t("customers.bookingNumber") }}</span
                  ><input v-model.trim="workflow.shipmentCreateForm.bookingNumber" maxlength="160"
                /></label>
                <label
                  ><span>{{ t("customers.billOfLading") }}</span
                  ><input v-model.trim="workflow.shipmentCreateForm.billOfLading" maxlength="160"
                /></label>
                <label
                  ><span>{{ t("customers.vesselVoyage") }}</span
                  ><input v-model.trim="workflow.shipmentCreateForm.vesselVoyage" maxlength="240"
                /></label>
                <label
                  ><span>{{ t("customers.trafficTerm") }}</span
                  ><input
                    v-model.trim="workflow.shipmentCreateForm.trafficTerm"
                    maxlength="80"
                    placeholder="CY | CY"
                /></label>
              </div>
              <div class="manual-service-field">
                <span>{{ t("customers.selectedServices") }}</span>
                <div>
                  <label
                    v-for="service in workflow.manualServiceOptions"
                    :key="service.value"
                    class="manual-service-choice"
                  >
                    <input
                      v-model="workflow.shipmentCreateForm.serviceScopes"
                      type="checkbox"
                      :value="service.value"
                    />
                    <span>{{ t(service.labelKey) }}</span>
                  </label>
                </div>
              </div>
            </section>

            <section class="manual-entry-section">
              <header class="manual-entry-section-head">
                <span
                  ><b>04</b><strong>{{ t("customers.manualSectionContainerTypes") }}</strong></span
                >
                <small>{{ t("customers.manualContainerTypeHint") }}</small>
              </header>
              <div class="manual-compact-list">
                <article
                  v-for="(item, index) in workflow.shipmentCreateForm.containerTypes"
                  :key="item.key"
                  class="manual-compact-row"
                >
                  <label>
                    <span
                      >{{ t("customers.containerType") }}
                      <i v-if="index === 0" class="required-star">*</i></span
                    >
                    <input
                      v-model.trim="item.type"
                      list="manual-container-type-options"
                      maxlength="40"
                      :required="index === 0"
                      placeholder="40HQ"
                    />
                  </label>
                  <label>
                    <span
                      >{{ t("customers.containerQuantity") }}
                      <i v-if="index === 0" class="required-star">*</i></span
                    >
                    <input
                      v-model.number="item.quantity"
                      type="number"
                      min="1"
                      max="999"
                      :required="index === 0"
                    />
                  </label>
                  <button
                    v-if="workflow.shipmentCreateForm.containerTypes.length > 1"
                    type="button"
                    class="manual-remove-button"
                    @click="workflow.removeManualListItem('containerTypes', index)"
                  >
                    {{ t("customers.removeItem") }}
                  </button>
                </article>
              </div>
              <datalist id="manual-container-type-options">
                <option value="20GP"></option>
                <option value="40GP"></option>
                <option value="40HQ"></option>
                <option value="45HQ"></option>
                <option value="20RF"></option>
                <option value="40RF"></option>
              </datalist>
              <button
                type="button"
                class="manual-add-button"
                @click="workflow.addManualContainerType"
              >
                + {{ t("customers.addContainerType") }}
              </button>
            </section>

            <section class="manual-entry-section">
              <header class="manual-entry-section-head">
                <span
                  ><b>05</b><strong>{{ t("customers.manualSectionRouting") }}</strong></span
                >
                <small>{{ t("customers.manualRoutingHint") }}</small>
              </header>
              <div v-if="workflow.shipmentCreateForm.routingLegs.length" class="manual-repeat-list">
                <article
                  v-for="(leg, index) in workflow.shipmentCreateForm.routingLegs"
                  :key="leg.key"
                  class="manual-repeat-card"
                >
                  <header>
                    <span
                      ><b>{{ t("customers.routingLegNumber", { number: index + 1 }) }}</b></span
                    >
                    <button
                      type="button"
                      class="manual-remove-button"
                      @click="workflow.removeManualListItem('routingLegs', index)"
                    >
                      {{ t("customers.removeItem") }}
                    </button>
                  </header>
                  <div class="manual-entry-grid">
                    <label>
                      <span>{{ t("customers.transportMode") }}</span>
                      <select v-model="leg.mode">
                        <option value="SEA">{{ t("customers.transportModeSea") }}</option>
                        <option value="TRUCK">{{ t("customers.transportModeTruck") }}</option>
                        <option value="RAIL">{{ t("customers.transportModeRail") }}</option>
                        <option value="BARGE">{{ t("customers.transportModeBarge") }}</option>
                      </select>
                    </label>
                    <label
                      ><span>{{ t("customers.vesselName") }}</span
                      ><input v-model.trim="leg.vesselName" maxlength="160"
                    /></label>
                    <label
                      ><span>{{ t("customers.voyage") }}</span
                      ><input v-model.trim="leg.voyage" maxlength="120"
                    /></label>
                    <label
                      ><span>{{ t("customers.serviceRoute") }}</span
                      ><input v-model.trim="leg.service" maxlength="120"
                    /></label>
                    <label
                      ><span>{{ t("customers.routingLoadPort") }}</span
                      ><input v-model.trim="leg.loadPort" maxlength="160"
                    /></label>
                    <label
                      ><span>{{ t("customers.routingDischargePort") }}</span
                      ><input v-model.trim="leg.dischargePort" maxlength="160"
                    /></label>
                    <label
                      ><span>{{ t("customers.estimatedDeparture") }}</span
                      ><input v-model="leg.estimatedDeparture" type="datetime-local"
                    /></label>
                    <label
                      ><span>{{ t("customers.actualDeparture") }}</span
                      ><input v-model="leg.actualDeparture" type="datetime-local"
                    /></label>
                    <label
                      ><span>{{ t("customers.estimatedArrival") }}</span
                      ><input v-model="leg.estimatedArrival" type="datetime-local"
                    /></label>
                    <label
                      ><span>{{ t("customers.actualArrival") }}</span
                      ><input v-model="leg.actualArrival" type="datetime-local"
                    /></label>
                  </div>
                </article>
              </div>
              <p v-else class="manual-empty-copy">{{ t("customers.manualRoutingEmpty") }}</p>
              <button type="button" class="manual-add-button" @click="workflow.addManualRoutingLeg">
                + {{ t("customers.addRoutingLeg") }}
              </button>
            </section>

            <section class="manual-entry-section">
              <header class="manual-entry-section-head">
                <span
                  ><b>06</b><strong>{{ t("customers.manualSectionContainers") }}</strong></span
                >
                <small>{{ t("customers.manualContainerHint") }}</small>
              </header>
              <div v-if="workflow.shipmentCreateForm.containers.length" class="manual-repeat-list">
                <article
                  v-for="(container, index) in workflow.shipmentCreateForm.containers"
                  :key="container.key"
                  class="manual-repeat-card"
                >
                  <header>
                    <span
                      ><b>{{ t("customers.containerNumberIndex", { number: index + 1 }) }}</b></span
                    >
                    <button
                      type="button"
                      class="manual-remove-button"
                      @click="workflow.removeManualListItem('containers', index)"
                    >
                      {{ t("customers.removeItem") }}
                    </button>
                  </header>
                  <div class="manual-entry-grid">
                    <label
                      ><span>{{ t("customers.containerNumber") }}</span
                      ><input v-model.trim="container.number" maxlength="40"
                    /></label>
                    <label
                      ><span>{{ t("customers.containerType") }}</span
                      ><input
                        v-model.trim="container.type"
                        list="manual-container-type-options"
                        maxlength="40"
                    /></label>
                    <label
                      ><span>{{ t("customers.transportMode") }}</span
                      ><input v-model.trim="container.transportMode" maxlength="40"
                    /></label>
                    <label
                      ><span>{{ t("customers.trafficTerm") }}</span
                      ><input v-model.trim="container.trafficTerm" maxlength="80"
                    /></label>
                    <label
                      ><span>{{ t("customers.currentLocation") }}</span
                      ><input v-model.trim="container.currentLocation" maxlength="160"
                    /></label>
                    <label
                      ><span>{{ t("customers.latestEventName") }}</span
                      ><input v-model.trim="container.latestEvent" maxlength="160"
                    /></label>
                    <label
                      ><span>{{ t("customers.latestEventTime") }}</span
                      ><input v-model="container.latestEventTime" type="datetime-local"
                    /></label>
                  </div>
                </article>
              </div>
              <p v-else class="manual-empty-copy">{{ t("customers.manualContainerEmpty") }}</p>
              <button type="button" class="manual-add-button" @click="workflow.addManualContainer">
                + {{ t("customers.addContainer") }}
              </button>
            </section>

            <label class="manual-shipment-note"
              ><span>{{ t("customers.shipmentNote") }}</span
              ><textarea v-model="workflow.shipmentCreateForm.note" maxlength="2000"></textarea>
            </label>
          </fieldset>
          <div class="customer-dialog-actions">
            <button
              type="button"
              :disabled="workflow.entryBusy || workflow.creatingShipment"
              @click="workflow.closeShipmentCreateDialog"
            >
              {{ t("customers.cancel") }}
            </button>
            <button
              class="customer-access-primary"
              type="submit"
              :disabled="workflow.entryBusy || workflow.creatingShipment"
            >
              {{
                workflow.creatingShipment
                  ? t("customers.savingShipment")
                  : t("customers.createShipment")
              }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped src="./shipmentEntryDialogs.css"></style>
