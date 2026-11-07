import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { shipmentTaskPublisherMessages } from "../src/i18n/shipmentTaskPublisherMessages.js";
import { shipmentTaskErrorMessage, shipmentTaskFailurePresentation } from "../src/features/shipments/shipmentTaskFeedback.js";
import { shipmentTaskRetryBody, shipmentTaskRetryRows } from "../src/services/shipmentTaskRetry.js";

const translate = (locale) => (key) => {
  const value = key.split(".").slice(1).reduce((entry, part) => entry?.[part], shipmentTaskPublisherMessages[locale]);
  assert.equal(typeof value, "string", `Missing ${locale} translation: ${key}`);
  return value;
};

for (const locale of ["zh-CN", "en-US"]) {
  test(`${locale} distinguishes carrier verification, no data and query failures without changing terminal state`, () => {
    const t = translate(locale);
    const source = Object.freeze({ status: "FAILED", errorCode: "TRACKING_HUMAN_REQUIRED", error: "old English error", localJobId: "local_1" });
    const verification = shipmentTaskFailurePresentation(source, t);
    const noData = shipmentTaskFailurePresentation({ ...source, errorCode: "TRACKING_NO_BUSINESS_DATA" }, t);
    const query = shipmentTaskFailurePresentation({ ...source, errorCode: "TRACKING_QUERY_FAILED" }, t);
    assert.equal(new Set([verification.label, noData.label, query.label]).size, 3);
    assert.equal(verification.tone, "warning");
    assert.equal(query.tone, "danger");
    assert.equal(shipmentTaskErrorMessage(source, t), verification.message);
    assert.doesNotMatch(verification.message, /暂停|paused|automatic/i);
    assert.equal(source.status, "FAILED");
    assert.equal(source.errorCode, "TRACKING_HUMAN_REQUIRED");
    assert.equal(source.localJobId, "local_1");
    for (const code of ["TRACKING_LOCAL_JOB_FAILED", "UPSTREAM_EMPTY", "TRACKING_LOCAL_UNAVAILABLE", "TRACKING_LOCAL_TIMEOUT"]) {
      assert.ok(shipmentTaskFailurePresentation({ ...source, errorCode: code }, t)?.message);
    }
  });
}

test("old failure codes do not relabel successful, active or manual-placeholder rows", () => {
  const t = translate("zh-CN");
  for (const status of ["SUCCEEDED", "RUNNING", "WAITING", "MANUAL", "PARTIAL", "DRAFT"]) {
    assert.equal(shipmentTaskFailurePresentation({ status, errorCode: "TRACKING_HUMAN_REQUIRED" }, t), null);
  }
  assert.equal(shipmentTaskFailurePresentation({ status: "FAILED", errorCode: "toString" }, t), null);
  assert.equal(shipmentTaskFailurePresentation({ status: "FAILED", errorCode: { code: "TRACKING_HUMAN_REQUIRED" } }, t), null);
  assert.equal(shipmentTaskErrorMessage({ status: "FAILED", errorCode: "UNRECOGNIZED", error: "Specific diagnosis" }, t), "Specific diagnosis");
  assert.equal(shipmentTaskErrorMessage({ status: "FAILED", mainErrorCode: "TRACKING_HUMAN_REQUIRED" }, t), t("shipmentTask.failure.verification.message"));
});

test("retry uses the persistent rowIndex after filtering, never the Excel row or display position", () => {
  const first = { id: "first", rowIndex: 12, sourceRow: 78, status: "FAILED" };
  const second = { id: "second", rowIndex: 0, sourceRow: 2, status: "FAILED" };
  const task = { taskId: "published_1", status: "COMPLETED", items: [first, second] };
  assert.deepEqual(shipmentTaskRetryRows(task, first), [12]);
  assert.deepEqual(shipmentTaskRetryRows(task, second), [0]);
  assert.equal(shipmentTaskRetryRows(task, { ...first }), null, "A stale or foreign item must not be retried");
  assert.equal(shipmentTaskRetryRows(task, first, true), null);
  for (const status of ["RUNNING", "WAITING", "QUEUED", "STOPPING", "STOPPED", "DRAFT"]) {
    assert.equal(shipmentTaskRetryRows({ ...task, status }, first), null);
  }
  for (const status of ["SUCCEEDED", "MANUAL", "PENDING", "RUNNING"]) {
    const item = { ...first, status };
    assert.equal(shipmentTaskRetryRows({ ...task, items: [item] }, item), null);
  }
  for (const rowIndex of [undefined, null, "0", -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const item = { ...first, rowIndex };
    assert.equal(shipmentTaskRetryRows({ ...task, items: [item] }, item), null);
  }
  assert.equal(shipmentTaskRetryRows({ ...task, items: [first, { ...first }] }, first), null);
});

test("explicit invalid row selections never fall back to retrying all failed rows", () => {
  assert.deepEqual(shipmentTaskRetryBody(undefined), {});
  assert.deepEqual(shipmentTaskRetryBody([0, 12]), { rowNumbers: [0, 12] });
  for (const selection of [null, [], "0", ["0"], [0, 0], [-1], [0.5], [NaN], [Infinity], {}, 0]) {
    assert.throws(() => shipmentTaskRetryBody(selection), TypeError);
  }
  const selected = [2];
  const body = shipmentTaskRetryBody(selected);
  selected.push(4);
  assert.deepEqual(body, { rowNumbers: [2] });
});

test("the business API sends only selected row indices and retains whole-batch retry when omitted", async () => {
  const stubUrl = "data:text/javascript;base64," + Buffer.from(
    "export const calls=[]; export const markApiErrorHandled=()=>{}; export function requestJson(path,options){calls.push({path,options});return Promise.resolve({status:'QUEUED'});}"
  ).toString("base64");
  const stub = await import(stubUrl);
  const source = readFileSync(new URL("../src/services/businessCustomerApi.js", import.meta.url), "utf8")
    .replace('"./apiClient"', JSON.stringify(stubUrl))
    .replace('"./shipmentTaskRetry.js"', JSON.stringify(new URL("../src/services/shipmentTaskRetry.js", import.meta.url).href))
    .replace("import.meta.env.VITE_API_BASE_URL", '""');
  const api = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
  await api.retryShipmentBatchTask("published/special", [0]);
  assert.equal(stub.calls[0].path, "/business/shipment-batch-tasks/published%2Fspecial/retry");
  assert.equal(stub.calls[0].options.method, "POST");
  assert.deepEqual(stub.calls[0].options.body, { rowNumbers: [0] });
  await api.retryShipmentBatchTask("published/special");
  assert.deepEqual(stub.calls[1].options.body, {});
  assert.throws(() => api.retryShipmentBatchTask("published/special", []), TypeError);
  assert.equal(stub.calls.length, 2, "Malformed selection must not make an HTTP request");
});
