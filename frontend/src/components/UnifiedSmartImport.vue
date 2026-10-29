<template>
  <section class="unified-smart-import" data-i18n-ignore :aria-label="copy.title">
    <header class="import-page-heading">
      <div>
        <span class="import-eyebrow">{{ copy.eyebrow }}</span>
        <h1>{{ modeCopy.title }}</h1>
        <p>{{ modeCopy.description }}</p>
      </div>
      <span class="import-review-badge"
        ><span aria-hidden="true">✓</span> {{ copy.reviewBadge }}</span
      >
    </header>
    <ol class="import-progress" :aria-label="copy.stepsLabel">
      <li :class="{ active: !hasReview }"><span>01</span>{{ modeCopy.sourceStep }}</li>
      <li :class="{ active: hasReview }"><span>02</span>{{ copy.reviewStep }}</li>
      <li><span>03</span>{{ copy.importStep }}</li>
    </ol>
    <label
      v-if="importMode !== 'text'"
      class="unified-source-picker"
      :class="{ 'has-file': primaryFile }"
      @dragover.prevent
      @drop.prevent="selectPrimaryDrop"
    >
      <svg
        class="import-source-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M12 17v-6m-3 3 3-3 3 3" />
      </svg>
      <span class="import-source-copy"
        ><strong>{{ primaryFile?.name || modeCopy.choose }}</strong
        ><span>{{ primaryFile ? copy.replaceSource : modeCopy.support }}</span></span
      >
      <span class="import-source-action">{{ primaryFile ? copy.changeSource : copy.browse }}</span>
      <input
        type="file"
        :accept="importMode === 'image' ? 'image/png,image/jpeg' : '.xlsx,.xls,.csv,.tsv'"
        :aria-label="modeCopy.choose"
        @change="selectPrimary"
      />
    </label>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="importMode === 'excel'">
      <ExcelTemplatePage
        v-if="primaryFile || reviewSource"
        :key="primaryRevision"
        coordinated
        recognition-input="excel"
        :source-file="primaryFile"
        :current-cargo-count="currentCargoCount"
        :review-source="reviewSource"
        :external-import-blocked="crossBlocked"
        @review-change="updateWorkbookReview"
        @import-cargos="forwardWorkbookImport"
      />
      <details v-if="primaryFile" class="unified-cross-check" :open="!!auxiliaryFile">
        <summary>
          <span>{{ copy.auxiliary }}</span
          ><small>{{ copy.optional }}</small>
        </summary>
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
      </details>
    </template>
    <ScreenshotImportReview
      v-else-if="importMode === 'image'"
      :key="primaryRevision"
      coordinated
      :source-file="primaryFile"
      @review-change="updateImageReview"
      @import-cargos="forwardImageImport"
    />
    <ExcelTemplatePage
      v-else
      :key="`text-${primaryRevision}`"
      coordinated
      recognition-input="text"
      :current-cargo-count="currentCargoCount"
      @review-change="updateWorkbookReview"
      @import-cargos="forwardTextImport"
    />
    <p v-if="importMode === 'excel' && !primaryFile" class="import-source-guidance">
      {{ copy.excelGuidance }}
    </p>
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
  reviewSource: { type: Object, default: null },
  importMode: {
    type: String,
    default: "excel",
    validator: (value) => ["excel", "image", "text"].includes(value)
  }
});
const emit = defineEmits(["import-cargos"]);
const copy = computed(
  () => unifiedImportMessages[currentLocale.value] || unifiedImportMessages["zh-CN"]
);
const modeCopy = computed(() => copy.value.modes[props.importMode] || copy.value.modes.excel);
const hasReview = computed(() => !!(workbookReview.value?.task || imageReview.value?.task));
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
function selectPrimaryDrop(event) {
  selectPrimary({ target: { files: event.dataTransfer?.files, value: "" } });
}
function selectPrimary(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const nextKind = classifySmartImportFile(file);
  const expectedKind = props.importMode === "image" ? "image" : "workbook";
  if (
    props.importMode === "text" ||
    nextKind !== expectedKind ||
    !file.size ||
    (nextKind === "image" && file.size > 5 * 1024 * 1024)
  ) {
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
  if (props.importMode !== "excel") return;
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
  if (props.importMode !== "excel" || crossBlocked.value) return;
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
  if (props.importMode === "image") emit("import-cargos", payload);
}
function forwardTextImport(payload) {
  if (props.importMode === "text") emit("import-cargos", payload);
}
watch(
  () => props.importMode,
  () => {
    removeAuxiliary();
    primaryFile.value = null;
    workbookReview.value = null;
    error.value = "";
    kind.value = props.importMode === "image" ? "image" : "workbook";
    primaryRevision.value++;
  },
  { flush: "sync" }
);
watch(
  () => props.reviewSource,
  (source) => {
    if (!source || props.importMode !== "excel") return;
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
  --import-ink: #203349;
  --import-muted: #61758b;
  display: grid;
  gap: 24px;
  min-width: 0;
  color: var(--import-ink);
  animation: import-arrive 240ms ease-out;
}
h1,
h2,
h3,
p {
  margin: 0;
}
p {
  line-height: 1.7;
  color: var(--import-muted);
  font-size: 14px;
}
.import-page-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}
.import-page-heading > div {
  display: grid;
  gap: 10px;
}
.import-eyebrow {
  color: #3974b0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
}
h1 {
  font-size: clamp(25px, 3vw, 32px);
  font-weight: 650;
  letter-spacing: -0.035em;
  line-height: 1.25;
}
.import-review-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #426e64;
  background: #edf7f2;
  border: 1px solid #d7e9df;
  border-radius: 30px;
  padding: 8px 12px;
  font-size: 12px;
  white-space: nowrap;
}
.import-progress {
  display: flex;
  gap: 30px;
  list-style: none;
  margin: 0;
  padding: 0 0 20px;
  border-bottom: 1px solid #e0e7ef;
  color: var(--import-muted);
  font-size: 13px;
}
.import-progress li {
  display: flex;
  align-items: center;
  gap: 9px;
}
.import-progress li > span {
  border: 1px solid #dce5ee;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 700;
}
.import-progress li.active {
  color: #2867ab;
  font-weight: 600;
}
.import-progress li.active > span {
  background: #edf4fd;
  border-color: #bed5f0;
}
.unified-source-picker {
  position: relative;
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 34px;
  border: 1px dashed #a9c2dd;
  border-radius: 18px;
  background: linear-gradient(115deg, #f4f8fe, #fff 80%);
  cursor: pointer;
  transition:
    border-color 180ms,
    transform 180ms,
    box-shadow 180ms;
}
.unified-source-picker:hover {
  border-color: #457cb8;
  transform: translateY(-2px);
  box-shadow: 0 10px 26px #24476c08;
}
.unified-source-picker:focus-within {
  outline: 2px solid #3976b5;
  outline-offset: 4px;
}
.import-source-icon {
  width: 36px;
  height: 36px;
  flex: none;
  color: #437fb9;
}
.import-source-copy {
  display: grid;
  gap: 9px;
  min-width: 0;
}
.import-source-copy strong {
  font-size: 16px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.import-source-copy > span {
  color: var(--import-muted);
  font-size: 13px;
}
.import-source-action {
  margin-left: auto;
  flex: none;
  background: #fff;
  padding: 11px 17px;
  border: 1px solid #d6e2ee;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 600;
}
.unified-source-picker input,
.unified-file-button input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.unified-cross-check {
  padding: 20px 22px;
  border: 1px solid #dce6ef;
  border-radius: 14px;
  background: #fbfcfe;
}
.unified-cross-check summary {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  font-size: 14px;
  font-weight: 600;
}
.unified-cross-check summary::after {
  content: "+";
  font-size: 20px;
  color: #647b91;
}
.unified-cross-check[open] summary::after {
  content: "−";
}
.unified-cross-check summary small {
  margin-left: auto;
  color: var(--import-muted);
  font-size: 12px;
  font-weight: 400;
}
.unified-cross-check > :not(summary) {
  margin-top: 16px;
}
.unified-file-button,
button {
  position: relative;
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  border: 1px solid #cbdbea;
  border-radius: 8px;
  padding: 8px 15px;
  background: #fff;
  color: #285d92;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}
.unified-file-button:focus-within,
button:focus-visible,
summary:focus-visible {
  outline: 2px solid #3976b5;
  outline-offset: 3px;
}
.unified-differences {
  overflow-x: auto;
}
table {
  border-collapse: collapse;
  width: 100%;
  min-width: 660px;
  background: white;
  font-size: 13px;
}
th,
td {
  text-align: left;
  border-bottom: 1px solid #e0e7ef;
  padding: 12px;
}
th {
  background: #f1f5fa;
  color: #51667b;
  font-weight: 600;
}
.unified-confirm {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13px;
  line-height: 1.7;
}
.unified-confirm input {
  margin-top: 4px;
}
.import-source-guidance {
  padding: 0 3px;
}
[role="alert"] {
  color: #a33d36;
}
@keyframes import-arrive {
  from {
    opacity: 0;
    transform: translateY(7px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (max-width: 680px) {
  .import-page-heading {
    align-items: flex-start;
  }
  .import-review-badge {
    display: none;
  }
  .import-progress {
    gap: 16px;
    font-size: 12px;
  }
  .unified-source-picker {
    padding: 23px 18px;
    gap: 15px;
  }
  .import-source-action {
    display: none;
  }
  .import-source-icon {
    width: 28px;
  }
  .unified-cross-check {
    padding: 17px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .unified-smart-import {
    animation: none;
  }
  .unified-source-picker {
    transition: none;
  }
  .unified-source-picker:hover {
    transform: none;
  }
}
</style>
