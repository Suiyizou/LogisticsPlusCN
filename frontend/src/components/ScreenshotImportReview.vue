<template>
  <section class="screenshot-import" :aria-label="copy.title" data-i18n-ignore>
    <p v-if="!coordinated">{{ copy.description }}</p>
    <p class="screenshot-note">{{ copy.caution }}</p>
    <figure v-if="previewUrl" class="screenshot-source-frame">
      <figcaption>
        <span>{{ copy.preview }}</span
        ><strong>{{ file?.name }}</strong>
      </figcaption>
      <img class="screenshot-source" :src="previewUrl" :alt="copy.preview" />
    </figure>
    <div class="screenshot-actions">
      <label v-if="!sourceFile && !coordinated" class="screenshot-picker">
        {{ copy.choose }}
        <input
          class="screenshot-file-input"
          type="file"
          accept="image/png,image/jpeg"
          :aria-label="copy.choose"
          @change="selectFile"
        />
      </label>
      <span v-if="file && !coordinated" class="screenshot-filename" :title="file.name">{{
        file.name
      }}</span>
      <button type="button" :disabled="!file || busy" @click="recognize">{{ copy.start }}</button>
      <button v-if="busy" type="button" @click="cancel">{{ copy.cancel }}</button>
    </div>
    <p v-if="status" role="status">{{ status }}</p>

    <template v-if="task">
      <p v-if="!review.complete" role="alert">{{ copy.incomplete }}</p>
      <p v-if="!review.sourceTotalsKnown" class="screenshot-note">{{ copy.totalsUnknown }}</p>
      <p v-if="review.blockingIssues.length" role="alert">{{ copy.sourceBlocked }}</p>
      <div class="screenshot-totals">
        <section>
          <h3>{{ copy.rowTotals }}</h3>
          <div>
            <strong
              >{{ review.actual.packageCount }} <small>{{ copy.quantity }}</small></strong
            ><strong>{{ review.actual.grossWeightKg }} <small>kg</small></strong
            ><strong>{{ review.actual.calculatedVolumeM3.toFixed(6) }} <small>m³</small></strong>
          </div>
        </section>
        <section>
          <h3>{{ copy.printedTotals }}</h3>
          <div>
            <strong
              >{{ review.expected.packageCount ?? "—" }} <small>{{ copy.quantity }}</small></strong
            ><strong>{{ review.expected.grossWeightKg ?? "—" }} <small>kg</small></strong
            ><strong>{{ review.expected.declaredVolumeM3 ?? "—" }} <small>m³</small></strong>
          </div>
        </section>
      </div>
      <p v-if="review.invalidRows.length" role="alert">{{ copy.invalidRows }}</p>
      <p
        v-if="review.invalidRows.some((item) => item.fields.includes('packageIdentity'))"
        role="alert"
      >
        {{ copy.identityReview }}
      </p>
      <details v-if="dataIssues.length">
        <summary>{{ copy.issues }} ({{ dataIssues.length }})</summary>
        <ul>
          <li v-for="(issue, index) in dataIssues" :key="index">
            {{ issue.sourceRowNumber ? `${copy.row} ${issue.sourceRowNumber}: ` : ""
            }}{{ (issue.errors || []).join(" / ") }}
          </li>
        </ul>
      </details>
      <div class="screenshot-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ copy.row }}</th>
              <th v-for="key in fields" :key="key">{{ copy[key] }}</th>
              <th>{{ copy.type }}</th>
              <th>{{ copy.nonStack }}</th>
              <th>{{ copy.keepUpright }}</th>
              <th>{{ copy.sourceText }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, index) in rows"
              :key="index"
              :class="{ invalid: review.invalidRows.some((item) => item.index === index) }"
            >
              <th scope="row">{{ index + 1 }}</th>
              <td v-for="key in fields" :key="key">
                <input
                  v-model="row[key]"
                  :type="numericFields.includes(key) ? 'number' : 'text'"
                  :min="numericFields.includes(key) ? 0 : undefined"
                  :step="key === 'quantity' ? 1 : 'any'"
                  :aria-label="`${copy.row} ${index + 1} ${copy[key]}`"
                />
              </td>
              <td>
                <select v-model="row.type" :aria-label="`${copy.row} ${index + 1} ${copy.type}`">
                  <option value="normal">{{ copy.normal }}</option>
                  <option value="pallet">{{ copy.pallet }}</option>
                </select>
              </td>
              <td>
                <input
                  v-model="row.nonStack"
                  type="checkbox"
                  :aria-label="`${copy.row} ${index + 1} ${copy.nonStack}`"
                />
              </td>
              <td>
                <input
                  v-model="row.keepUpright"
                  type="checkbox"
                  :aria-label="`${copy.row} ${index + 1} ${copy.keepUpright}`"
                />
              </td>
              <td>
                <textarea
                  v-model="row.sourceText"
                  :aria-label="`${copy.row} ${index + 1} ${copy.sourceText}`"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <label v-if="!reviewOnly" class="screenshot-confirm"
        ><input
          v-model="confirmed"
          type="checkbox"
          :disabled="
            !review.complete || review.invalidRows.length > 0 || review.blockingIssues.length > 0
          "
        />{{ copy.confirm }}</label
      >
      <button
        v-if="!reviewOnly"
        type="button"
        :disabled="!review.canImport || busy || externalImportBlocked"
        @click="importRows"
      >
        {{ copy.import }}
      </button>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { currentLocale } from "../i18n";
import { screenshotImportMessages } from "../i18n/screenshotImportMessages.js";
import {
  createImageRecognitionTask,
  fetchTextRecognitionCapabilities,
  fetchTextRecognitionTask
} from "../services/excelAgentApi.js";
import {
  buildImageImportPayload,
  reviewImageImport,
  supportsImageRecognition
} from "../services/imageCargoImport.js";
import { isSessionExpired, storedToken } from "../services/authSession";

const props = defineProps({
  sourceFile: { type: Object, default: null },
  coordinated: { type: Boolean, default: false },
  reviewOnly: { type: Boolean, default: false },
  externalImportBlocked: { type: Boolean, default: false }
});
const emit = defineEmits(["import-cargos", "review-change"]);
const copy = computed(
  () => screenshotImportMessages[currentLocale.value] || screenshotImportMessages["zh-CN"]
);
const file = ref(null),
  previewUrl = ref(""),
  task = ref(null),
  rows = ref([]),
  confirmed = ref(false),
  busy = ref(false),
  status = ref("");
const fields = [
  "name",
  "model",
  "packageNo",
  "marks",
  "lengthCm",
  "widthCm",
  "heightCm",
  "quantity",
  "weightKg"
];
const numericFields = ["lengthCm", "widthCm", "heightCm", "quantity", "weightKg"];
const review = computed(() => reviewImageImport(task.value, rows.value, confirmed.value));
const dataIssues = computed(() =>
  (task.value?.issues || []).filter((issue) => issue.code !== "PACKAGE_RECONCILIATION")
);
let revision = 0,
  timer,
  wake,
  taskSession = "";
watch(
  rows,
  () => {
    confirmed.value = false;
  },
  { deep: true, flush: "sync" }
);

function stopWaiting() {
  revision++;
  clearTimeout(timer);
  wake?.();
  wake = null;
  busy.value = false;
}
function cancel() {
  stopWaiting();
  status.value = copy.value.canceled;
}
function selectFile(event) {
  if (props.sourceFile) {
    event.target.value = "";
    return;
  }
  const candidate = event.target.files?.[0];
  event.target.value = "";
  applyFile(candidate);
}
function applyFile(candidate) {
  if (props.sourceFile && candidate !== props.sourceFile) return;
  stopWaiting();
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = "";
  file.value = null;
  task.value = null;
  rows.value = [];
  confirmed.value = false;
  if (!candidate) return;
  if (
    !["image/png", "image/jpeg"].includes(candidate.type) ||
    candidate.size > 5 * 1024 * 1024 ||
    !candidate.size
  ) {
    status.value = copy.value.invalidFile;
    return;
  }
  file.value = candidate;
  previewUrl.value = URL.createObjectURL(candidate);
  status.value = "";
}
async function recognize() {
  if (!file.value || busy.value || (props.sourceFile && file.value !== props.sourceFile)) return;
  const run = ++revision,
    session = storedToken();
  const current = () => run === revision && session === storedToken() && !isSessionExpired();
  task.value = null;
  rows.value = [];
  confirmed.value = false;
  busy.value = true;
  status.value = copy.value.running;
  try {
    const capabilities = await fetchTextRecognitionCapabilities();
    if (!current()) return;
    if (!supportsImageRecognition(capabilities)) throw new Error(copy.value.unsupported);
    let result = await createImageRecognitionTask(file.value, {
      languageHint: currentLocale.value.startsWith("en") ? "en" : "zh"
    });
    if (!current()) return;
    if (result.taskType !== "IMAGE" || result.inputContract !== "cargo-image-v1")
      throw new Error(copy.value.unsupported);
    const deadline = Date.now() + 8 * 60 * 1000;
    while (!["SUCCEEDED", "FAILED"].includes(result.status)) {
      if (Date.now() > deadline) throw new Error(copy.value.timeout);
      await new Promise((resolve) => {
        wake = resolve;
        timer = setTimeout(resolve, 1200);
      });
      wake = null;
      if (!current()) return;
      result = await fetchTextRecognitionTask(result.id);
      if (!current()) return;
    }
    if (result.status !== "SUCCEEDED") throw new Error(copy.value.failed);
    task.value = result;
    taskSession = session;
    rows.value = structuredClone(result.cleanedRows || []);
    status.value = "";
  } catch (error) {
    if (current()) status.value = error?.message || copy.value.failed;
  } finally {
    if (run === revision) busy.value = false;
  }
}
function importRows() {
  if (taskSession !== storedToken() || isSessionExpired()) {
    stopWaiting();
    task.value = null;
    rows.value = [];
    return;
  }
  if (props.reviewOnly || props.externalImportBlocked || !review.value.canImport) return;
  emit("import-cargos", buildImageImportPayload(task.value, rows.value, confirmed.value));
  confirmed.value = false;
}
watch(
  [task, rows, busy],
  () => emit("review-change", { task: task.value, rows: rows.value, busy: busy.value }),
  { deep: true, immediate: true }
);
watch(
  () => props.sourceFile,
  (candidate) => {
    if (candidate) applyFile(candidate);
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  stopWaiting();
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
});
</script>

<style scoped>
.screenshot-import {
  display: grid;
  gap: 16px;
  min-width: 0;
  color: #0c1c3a;
  font: 400 14px/1.6 var(--font-ui);
}
.screenshot-import p {
  margin: 0;
  line-height: 1.6;
}
.screenshot-note {
  padding: 12px 16px;
  border: 1px solid #d6e4ed;
  border-radius: 8px;
  background: #f4f8fb;
}
.screenshot-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.screenshot-picker {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.screenshot-picker:focus-within {
  outline: 2px solid var(--el-color-primary, #1684a3);
  outline-offset: 3px;
}
.screenshot-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
.screenshot-filename {
  min-width: 0;
  overflow-wrap: anywhere;
}
.screenshot-source {
  max-width: 100%;
  max-height: 520px;
  width: 100%;
  display: block;
  object-fit: contain;
  justify-self: start;
  border: 1px solid #d6e4ed;
  border-radius: 8px;
}
.screenshot-table-wrap {
  overflow-x: auto;
}
table {
  border-collapse: collapse;
  min-width: 1250px;
  width: 100%;
}
th,
td {
  border-bottom: 1px solid #d6e4ed;
  padding: 8px;
  text-align: left;
}
td input:not([type="checkbox"]) {
  width: 100%;
  min-width: 65px;
  box-sizing: border-box;
}
td textarea {
  min-width: 180px;
}
.invalid {
  background: #fff7ec;
}
.screenshot-confirm {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  line-height: 1.6;
}
button,
.screenshot-picker {
  justify-self: start;
  padding: 9px 16px;
  border: 1px solid #bad0df;
  border-radius: 6px;
  background: #edf6fc;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.screenshot-source-frame {
  margin: 0;
  border: 1px solid #dce5ee;
  border-radius: 14px;
  overflow: hidden;
  background: #f4f7fb;
}
.screenshot-source-frame figcaption {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 13px 18px;
  background: #fff;
  color: #62778c;
  font-size: 12px;
  border-bottom: 1px solid #e1e8f0;
}
.screenshot-source-frame figcaption strong {
  color: #2b4259;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.screenshot-source-frame .screenshot-source {
  border: 0;
  border-radius: 0;
  padding: 16px;
  box-sizing: border-box;
}
.screenshot-note {
  color: #5c7187;
  font-size: 13px;
  line-height: 1.75;
  background: #f7fafe;
  border-color: #e0e8f0;
}
.screenshot-actions button:first-of-type {
  color: #fff;
  background: #0866e8;
  border-color: #0866e8;
}
.screenshot-actions button {
  min-height: 44px;
  border-radius: 9px;
  font: inherit;
  font-size: 13px;
  transition:
    transform 180ms ease,
    opacity 180ms ease;
}
.screenshot-actions button:hover:not(:disabled) {
  transform: translateY(-1px);
}
.screenshot-table-wrap {
  border: 1px solid #e2e9f3;
  border-radius: 8px;
}
th {
  height: 40px;
  box-sizing: border-box;
  color: #0c1c3a;
  background: #f4f7fc;
  font-size: 13px;
  font-weight: 500;
}
th,
td {
  border-color: #e2e9f3;
}
td {
  height: 46px;
  padding: 5px 8px;
}
td input:not([type="checkbox"]),
td textarea,
td select {
  background: #fff;
  color: #243a5a;
  border: 1px solid #d5e0ef;
  border-radius: 6px;
  min-height: 38px;
  padding: 7px 9px;
  font: inherit;
  font-size: 13px;
}
button:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible {
  outline: 2px solid #0866e8;
  outline-offset: 3px;
}
.screenshot-import input[type="checkbox"] {
  accent-color: #0866e8;
}
.screenshot-import [role="alert"] {
  padding: 12px 16px;
  border: 1px solid #f5d0c6;
  border-radius: 7px;
  background: #fff5f1;
  color: #a84028;
  font-size: 13px;
}
.screenshot-totals {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.screenshot-totals section {
  padding: 18px 20px;
  border: 1px solid #e2e9f3;
  border-radius: 8px;
  background: #fff;
}
.screenshot-totals h3 {
  margin: 0 0 14px;
  color: #0c1c3a;
  font-size: 14px;
  font-weight: 500;
}
.screenshot-totals section > div {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.screenshot-totals strong {
  color: #0866e8;
  font-size: 21px;
  font-weight: 600;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.screenshot-totals small {
  font-size: 13px;
  font-weight: 400;
}
.screenshot-confirm {
  padding: 16px 20px;
  border: 1px solid #e2e9f3;
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
}
.screenshot-confirm + button {
  justify-self: end;
  min-height: 44px;
  padding-inline: 28px;
  color: #fff;
  border-color: #0866e8;
  background: #0866e8;
  font: 500 14px/1.5 var(--font-ui);
}
.screenshot-import button:hover:not(:disabled) {
  border-color: #0755d0;
}
.screenshot-actions button:first-of-type:hover:not(:disabled),
.screenshot-confirm + button:hover:not(:disabled) {
  background: #0755d0;
}
@media (max-width: 680px) {
  .screenshot-totals {
    grid-template-columns: 1fr;
  }
  .screenshot-totals section {
    padding: 16px;
  }
  .screenshot-totals strong {
    font-size: 19px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .screenshot-actions button {
    transition: none;
  }
  .screenshot-actions button:hover:not(:disabled) {
    transform: none;
  }
}
</style>
