<template>
  <form class="maritime-query" @submit.prevent="search">
    <div class="maritime-query__title">
      <small>{{ t("maritime.trackEyebrow") }}</small
      ><strong>{{ t("maritime.trackTitle") }}</strong>
    </div>
    <div class="maritime-query__fields">
      <div class="maritime-field">
        <label for="public-tracking-carrier">{{ t("maritime.carrier") }}</label
        ><select id="public-tracking-carrier" v-model="carrier">
          <option v-for="value in carriers" :key="value" :value="value">
            {{ carrierLabel(value) }}
          </option>
        </select>
      </div>
      <div class="maritime-field">
        <label for="public-tracking-type">{{ t("maritime.referenceType") }}</label
        ><select id="public-tracking-type" v-model="referenceType">
          <option value="BOOKING">{{ t("maritime.bookingNumber") }}</option>
          <option value="CONTAINER">{{ t("maritime.containerNumber") }}</option>
          <option v-if="supportsBillOfLading" value="BILLOFLADING">
            {{ t("maritime.billOfLading") }}
          </option>
        </select>
      </div>
      <div class="maritime-field">
        <label for="public-tracking-number">{{ t("maritime.referenceLabel") }}</label
        ><input
          id="public-tracking-number"
          v-model.trim="reference"
          :placeholder="t('maritime.referencePlaceholder')"
          required
          autocomplete="off"
          maxlength="100"
        />
      </div>
    </div>
    <button class="maritime-button maritime-button--navy" type="submit">
      {{ t("maritime.search") }} <span aria-hidden="true">→</span>
    </button>
  </form>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { t } from "../../i18n";
const props = defineProps<{ trackingPath: string }>();
const reference = ref("");
const carriers = ["COSCO", "CMA", "MAERSK", "HAPAG_LLOYD", "MSC", "OOCL"];
const carrier = ref("COSCO");
const referenceType = ref("BOOKING");
const supportsBillOfLading = computed(() => !["COSCO", "CMA"].includes(carrier.value));
const carrierNames: Record<string, string> = {
  CMA: "CMA CGM",
  HAPAG_LLOYD: "Hapag-Lloyd",
  MAERSK: "Maersk"
};
const carrierLabel = (value: string) => carrierNames[value] || value;
watch(carrier, () => {
  if (!supportsBillOfLading.value && referenceType.value === "BILLOFLADING")
    referenceType.value = "BOOKING";
});
function search() {
  if (!reference.value) return;
  const target = new URL(props.trackingPath, window.location.origin);
  target.searchParams.set("number", reference.value);
  target.searchParams.set("carrier", carrier.value);
  target.searchParams.set("type", referenceType.value);
  target.searchParams.set("channel", "AUTO");
  target.hash = "tracking";
  window.location.assign(target.href);
}
</script>
