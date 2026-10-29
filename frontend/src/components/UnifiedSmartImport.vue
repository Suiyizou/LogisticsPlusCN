<template>
  <section
    class="unified-smart-import"
    :class="{ 'has-review': hasReview }"
    data-i18n-ignore
    :aria-label="copy.title"
  >
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
      <li :class="{ active: !hasReview }" :aria-current="!hasReview ? 'step' : undefined">
        <span>1</span>
        <div>
          <strong>{{ modeCopy.sourceStep }}</strong
          ><small>{{ copy.sourceStepHint }}</small>
        </div>
      </li>
      <li :class="{ active: hasReview }" :aria-current="hasReview ? 'step' : undefined">
        <span>2</span>
        <div>
          <strong>{{ copy.reviewStep }}</strong
          ><small>{{ copy.reviewStepHint }}</small>
        </div>
      </li>
      <li>
        <span>3</span>
        <div>
          <strong>{{ copy.importStep }}</strong
          ><small>{{ copy.importStepHint }}</small>
        </div>
      </li>
    </ol>
    <div v-if="importMode !== 'text'" class="import-source-card">
      <label
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
        <span class="import-source-action">{{
          primaryFile ? copy.changeSource : copy.browse
        }}</span>
        <input
          type="file"
          :accept="importMode === 'image' ? 'image/png,image/jpeg' : '.xlsx,.xls,.csv,.tsv'"
          :aria-label="modeCopy.choose"
          @change="selectPrimary"
        />
      </label>
    </div>
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
  --import-ink: #0c1c3a;
  --import-muted: #6b7d99;
  display: grid;
  gap: 24px;
  min-width: 0;
  color: var(--import-ink);
  font: 400 14px/1.6 var(--font-ui);
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
  color: #6b7d99;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.12em;
}
h1 {
  font-size: clamp(25px, 3vw, 32px);
  font-weight: 700;
  letter-spacing: -0.025em;
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
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 28px;
  list-style: none;
  margin: 0;
  padding: 8px 28px 4px;
  color: var(--import-muted);
  font-size: 16px;
}
.import-progress li {
  position: relative;
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
}
.import-progress li:not(:last-child)::after {
  content: "";
  flex: 1;
  min-width: 18px;
  height: 1px;
  margin-left: 8px;
  background: #dbe5f1;
}
.import-progress li > div {
  display: grid;
  gap: 3px;
}
.import-progress strong {
  color: var(--import-ink);
  font-weight: 600;
}
.import-progress small {
  font-size: 13px;
  font-weight: 400;
  color: var(--import-muted);
}
.import-progress li > span {
  flex: none;
  border: 1px solid #aab9ce;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  background: #aab9ce;
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 21px;
  font-weight: 600;
}
.import-progress li.active strong {
  color: #0866e8;
}
.import-progress li.active > span {
  background: #0866e8;
  border-color: #0866e8;
}
.import-source-card {
  padding: 16px;
  border: 1px solid #e2e9f3;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 4px 18px #0c1c3a03;
}
.unified-source-picker {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 18px;
  min-height: 230px;
  padding: 28px;
  border: 1px dashed #a9c9fb;
  border-radius: 7px;
  background: #f9fbff;
  text-align: center;
  cursor: pointer;
  transition:
    border-color 180ms,
    background 180ms;
}
.unified-source-picker:hover {
  border-color: #0866e8;
  background: #f4f8ff;
}
.unified-source-picker:focus-within {
  outline: 2px solid #0866e8;
  outline-offset: 4px;
}
.import-source-icon {
  width: 46px;
  height: 46px;
  flex: none;
  color: #0866e8;
}
.import-source-copy {
  display: grid;
  gap: 6px;
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
  flex: none;
  background: #fff;
  padding: 11px 17px;
  border: 1px solid #0866e8;
  border-radius: 6px;
  color: #0866e8;
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
.has-review .import-source-card {
  padding: 8px;
}
.has-review .unified-source-picker {
  flex-direction: row;
  justify-content: flex-start;
  min-height: 64px;
  padding: 12px 18px;
  gap: 16px;
  box-sizing: border-box;
  text-align: left;
}
.has-review .import-source-icon {
  width: 32px;
  height: 32px;
}
.has-review .import-source-copy {
  gap: 2px;
}
.has-review .import-source-copy strong {
  font-size: 14px;
}
.has-review .import-source-action {
  margin-left: auto;
  padding: 8px 14px;
  white-space: nowrap;
}
.unified-cross-check {
  padding: 22px 24px;
  border: 1px solid #e2e9f3;
  border-radius: 10px;
  background: #fff;
}
.unified-cross-check summary {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  font-size: 18px;
  font-weight: 600;
}
.unified-cross-check summary::after {
  content: "+";
  font-size: 20px;
  color: #6b7d99;
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
  border: 1px solid #d5e2f5;
  border-radius: 6px;
  padding: 8px 15px;
  background: #fff;
  color: #0866e8;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}
.unified-file-button:focus-within,
button:focus-visible,
summary:focus-visible {
  outline: 2px solid #0866e8;
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
  border-bottom: 1px solid #e2e9f3;
  padding: 12px;
}
th {
  background: #f4f7fc;
  color: #0c1c3a;
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
  accent-color: #0866e8;
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
    gap: 12px;
    padding-inline: 0;
    font-size: 12px;
  }
  .import-progress li {
    gap: 8px;
    align-items: flex-start;
  }
  .import-progress li > span {
    width: 32px;
    height: 32px;
    font-size: 17px;
  }
  .import-progress small,
  .import-progress li::after {
    display: none;
  }
  .unified-source-picker {
    min-height: 230px;
    padding: 28px 18px;
    gap: 15px;
  }
  .has-review .unified-source-picker {
    flex-wrap: wrap;
    padding: 12px;
  }
  .has-review .import-source-copy {
    flex: 1;
    min-width: 130px;
  }
  .import-source-icon {
    width: 40px;
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
