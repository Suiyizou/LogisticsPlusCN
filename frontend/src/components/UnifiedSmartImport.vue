<template>
  <section class="unified-smart-import" data-i18n-ignore :aria-label="copy.title">
    <header>
      <h2>{{ copy.title }}</h2>
      <p>{{ copy.description }}</p>
    </header>
    <div class="unified-source-picker">
      <label class="unified-file-button"
        >{{ copy.choose
        }}<input type="file" accept=".xlsx,.xls,.csv,.tsv,.png,.jpg,.jpeg" @change="selectPrimary"
      /></label>
      <span>{{ copy.support }}</span>
      <strong v-if="primaryFile">{{ copy.selected }}: {{ primaryFile.name }}</strong>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="kind === 'workbook'">
      <section class="unified-cross-check" :aria-label="copy.auxiliary">
        <h3>{{ copy.auxiliary }}</h3>
        <p>{{ copy.auxiliaryHint }}</p>
        <label class="unified-file-button"
          >{{ copy.chooseAuxiliary
          }}<input type="file" accept="image/png,image/jpeg" @change="selectAuxiliary"
        /></label>
        <template v-if="auxiliaryFile">
          <strong>{{ auxiliaryFile.name }}</strong>
          <button type="button" @click="removeAuxiliary">{{ copy.removeAuxiliary }}</button>
          <ScreenshotImportReview
            :key="auxiliaryRevision"
            :source-file="auxiliaryFile"
            review-only
            @review-change="updateImageReview"
          />
          <p role="status">
            <strong>{{ crossReview.canImport ? copy.matched : copy.blocked }}</strong> ·
            {{ crossReview.matchedCount }} {{ copy.identity }}
          </p>
          <p>{{ copy.matchedHint }}</p>
          <p>{{ copy.sourceTotals }}</p>
          <div v-if="crossReview.differences.length" class="unified-differences">
            <table>
              <thead>
                <tr>
                  <th>{{ copy.identity }}</th>
                  <th>{{ copy.field }}</th>
                  <th>{{ copy.workbook }}</th>
                  <th>{{ copy.image }}</th>
                  <th>{{ copy.issue }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(difference, index) in crossReview.differences" :key="index">
                  <td>{{ difference.identity || copy.none }}</td>
                  <td>{{ copy.fields[difference.field] || difference.field || copy.none }}</td>
                  <td>{{ display(difference.workbookValue) }}</td>
                  <td>{{ display(difference.imageValue) }}</td>
                  <td>{{ copy.codes[difference.code] || difference.code }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <label class="unified-confirm"
            ><input v-model="crossConfirmed" type="checkbox" :disabled="!crossReview.canImport" />{{
              copy.confirm
            }}</label
          >
        </template>
        <p v-else>{{ copy.noVisual }}</p>
      </section>
      <ExcelTemplatePage
        :key="primaryRevision"
        coordinated
        :source-file="primaryFile"
        :current-cargo-count="currentCargoCount"
        :review-source="reviewSource"
        :external-import-blocked="crossBlocked"
        @review-change="updateWorkbookReview"
        @import-cargos="forwardWorkbookImport"
      />
    </template>
    <ScreenshotImportReview
      v-else
      :key="primaryRevision"
      :source-file="primaryFile"
      @import-cargos="forwardImageImport"
    />
  </section>
</template>
<script setup>
import { computed, ref, watch } from "vue";
import { currentLocale } from "../i18n";
import ExcelTemplatePage from "./ExcelTemplatePage.vue";
import ScreenshotImportReview from "./ScreenshotImportReview.vue";
import { unifiedImportMessages } from "../i18n/unifiedImportMessages.js";
import { taskReconciliation } from "../services/packingReconciliation.js";
import {
  classifySmartImportFile,
  crossCheckImportEvidence
} from "../services/unifiedSmartImport.js";
const props = defineProps({
  currentCargoCount: { type: Number, default: 0 },
  reviewSource: { type: Object, default: null }
});
const emit = defineEmits(["import-cargos"]);
const copy = computed(
  () => unifiedImportMessages[currentLocale.value] || unifiedImportMessages["zh-CN"]
);
const primaryFile = ref(null),
  kind = ref("workbook"),
  error = ref(""),
  primaryRevision = ref(0);
const auxiliaryFile = ref(null),
  auxiliaryRevision = ref(0),
  workbookReview = ref(null),
  imageReview = ref(null),
  crossConfirmed = ref(false);
const crossReview = computed(() =>
  crossCheckImportEvidence(workbookReview.value, imageReview.value)
);
const crossBlocked = computed(
  () => !!auxiliaryFile.value && (!crossReview.value.canImport || !crossConfirmed.value)
);
const display = (value) => (value == null || value === "" ? copy.value.none : String(value));
function removeAuxiliary() {
  auxiliaryFile.value = null;
  imageReview.value = null;
  crossConfirmed.value = false;
  auxiliaryRevision.value++;
}
function selectPrimary(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const nextKind = classifySmartImportFile(file);
  if (!nextKind || !file.size || (nextKind === "image" && file.size > 5 * 1024 * 1024)) {
    error.value = copy.value.invalid;
    return;
  }
  error.value = "";
  removeAuxiliary();
  workbookReview.value = null;
  primaryFile.value = file;
  kind.value = nextKind;
  primaryRevision.value++;
}
function selectAuxiliary(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (classifySmartImportFile(file) !== "image" || !file.size || file.size > 5 * 1024 * 1024) {
    error.value = copy.value.invalid;
    return;
  }
  error.value = "";
  crossConfirmed.value = false;
  imageReview.value = null;
  auxiliaryFile.value = file;
  auxiliaryRevision.value++;
}
function updateWorkbookReview(review) {
  workbookReview.value = review;
  crossConfirmed.value = false;
}
function updateImageReview(review) {
  imageReview.value = review;
  crossConfirmed.value = false;
}
function forwardWorkbookImport(payload) {
  if (crossBlocked.value) return;
  if (!auxiliaryFile.value) {
    emit("import-cargos", payload);
    return;
  }
  // Preserve both independent source reports and reviewed values as audit evidence, without merging totals.
  const crossCheck = {
    status: "human-reviewed-agreement",
    workbookTaskId: workbookReview.value.task.id,
    imageTaskId: imageReview.value.task.id,
    matchedCount: crossReview.value.matchedCount,
    workbookRows: JSON.parse(JSON.stringify(workbookReview.value.rows)),
    imageRows: JSON.parse(JSON.stringify(imageReview.value.rows)),
    imageSourceReport: JSON.parse(JSON.stringify(taskReconciliation(imageReview.value.task))),
    humanConfirmed: true
  };
  emit("import-cargos", {
    ...payload,
    cargos: payload.cargos.map((cargo) => ({
      ...cargo,
      packageInfo: { ...(cargo.packageInfo || {}), crossCheck }
    }))
  });
}
function forwardImageImport(payload) {
  emit("import-cargos", payload);
}
watch(
  () => props.reviewSource,
  (source) => {
    if (!source) return;
    removeAuxiliary();
    kind.value = "workbook";
    primaryFile.value = source.file || null;
    workbookReview.value = null;
    primaryRevision.value++;
  },
  { immediate: true }
);
</script>
<style scoped>
.unified-smart-import {
  display: grid;
  gap: 20px;
  min-width: 0;
}
h2,
h3,
p {
  margin: 0;
}
header,
.unified-cross-check {
  display: grid;
  gap: 12px;
}
p {
  line-height: 1.6;
}
.unified-source-picker {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  padding: 20px;
  border: 1px dashed #9bb6c7;
  border-radius: 10px;
  background: #f8fbfd;
}
.unified-file-button,
button {
  position: relative;
  display: inline-flex;
  justify-self: start;
  border: 1px solid #bad0df;
  border-radius: 6px;
  padding: 10px 16px;
  background: #edf6fc;
  cursor: pointer;
}
.unified-file-button:focus-within {
  outline: 2px solid #1684a3;
  outline-offset: 3px;
}
.unified-file-button input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.unified-cross-check {
  padding: 18px;
  border: 1px solid #d6e4ed;
  border-radius: 10px;
}
.unified-differences {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 640px;
}
th,
td {
  padding: 10px;
  border-bottom: 1px solid #d6e4ed;
  text-align: left;
  overflow-wrap: anywhere;
}
.unified-confirm {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  line-height: 1.6;
}
</style>
