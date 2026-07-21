import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const appSource = await readFile(
  new URL("../public/app.js", import.meta.url),
  "utf8"
);
const indexSource = await readFile(
  new URL("../public/index.html", import.meta.url),
  "utf8"
);
const stylesSource = await readFile(
  new URL("../public/styles.css", import.meta.url),
  "utf8"
);

function loadContractHelpers() {
  const startMarker = "/* TRACKING_CONTRACT_HELPERS_START */";
  const endMarker = "/* TRACKING_CONTRACT_HELPERS_END */";
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker);
  assert.notEqual(start, -1, "tracking contract helper start marker is missing");
  assert.notEqual(end, -1, "tracking contract helper end marker is missing");

  const context = vm.createContext({});
  vm.runInContext(
    `${appSource.slice(start + startMarker.length, end)}\n` +
      "globalThis.contract = { fileSessionFingerprint, trackingResponseMessage, isPublicTrackingRouteUnavailable, isRestorableBatchNumber };",
    context
  );
  return context.contract;
}

function response(status, { statusText = "", routeNotFound = false } = {}) {
  return {
    status,
    statusText,
    headers: {
      get(name) {
        return name === "X-Route-Not-Found" && routeNotFound ? "true" : null;
      }
    }
  };
}

test("scopes related-file identity to a non-plaintext session fingerprint", () => {
  const { fileSessionFingerprint } = loadContractHelpers();
  const base = {
    kind: "CUSTOMER",
    token: "customer-secret-token",
    principal: { id: 7, customerName: "Acme", partyRole: "SHIPPER" },
    storedSession: { customer: { id: 7 } },
    user: null
  };

  const fingerprint = fileSessionFingerprint(base);
  assert.equal(fingerprint, fileSessionFingerprint(structuredClone(base)));
  assert.equal(fingerprint.includes(base.token), false);
  assert.notEqual(fingerprint, fileSessionFingerprint({ ...base, token: "another-token" }));
  assert.notEqual(
    fingerprint,
    fileSessionFingerprint({
      ...base,
      principal: { ...base.principal, customerName: "Other customer" }
    })
  );
  assert.notEqual(fingerprint, fileSessionFingerprint({ ...base, kind: "INTERNAL" }));
});

test("falls back only when the Spring public tracking route is unavailable", () => {
  const { isPublicTrackingRouteUnavailable } = loadContractHelpers();

  assert.equal(
    isPublicTrackingRouteUnavailable({
      response: response(404, { statusText: "Not Found" }),
      payload: {
        status: 404,
        error: "Not Found",
        message: "Tracking adapter request failed: shipment was not found"
      }
    }),
    false,
    "a valid route returning a business no-result must remain authoritative"
  );
  assert.equal(
    isPublicTrackingRouteUnavailable({
      response: response(404, { statusText: "Not Found" }),
      payload: {
        status: 404,
        error: "Not Found",
        path: "/api/public/shipments/track"
      }
    }),
    true,
    "the generic Spring missing-route response remains compatible with older deployments"
  );
  assert.equal(
    isPublicTrackingRouteUnavailable({
      response: response(404),
      payload: { code: "ROUTE_NOT_FOUND" }
    }),
    true
  );
  assert.equal(
    isPublicTrackingRouteUnavailable({ response: response(405), payload: {} }),
    true
  );
  assert.equal(
    isPublicTrackingRouteUnavailable({
      response: response(404),
      payload: { error: "Not Found" }
    }),
    false,
    "an ambiguous 404 without an explicit endpoint marker must not trigger a second query"
  );
});

test("uses top-level Spring messages before legacy nested errors", () => {
  const { trackingResponseMessage } = loadContractHelpers();
  assert.equal(
    trackingResponseMessage(
      { message: "Spring message", error: { message: "Legacy message" } },
      response(400, { statusText: "Bad Request" })
    ),
    "Spring message"
  );
  assert.equal(
    trackingResponseMessage(
      { error: { message: "Legacy message" } },
      response(400, { statusText: "Bad Request" })
    ),
    "Legacy message"
  );
});

test("auth storage changes invoke the centralized sensitive related-file reset", () => {
  assert.match(
    appSource,
    /function resetRelatedFilesSessionState[\s\S]*?relatedFilesItems = \[\];[\s\S]*?relatedFilesPermissions = \{\};[\s\S]*?relatedFilesCustomerAccess = null;[\s\S]*?relatedFilesLoadingState = false;[\s\S]*?relatedFilesErrorText = "";[\s\S]*?relatedFilesUploadInput\.value = "";[\s\S]*?setRelatedFilesUploadMessage\(\);[\s\S]*?closeRelatedFilesDrawer\(\{ immediate: true \}\)/
  );
  assert.match(
    appSource,
    /window\.addEventListener\("storage"[\s\S]*?synchronizeRelatedFilesSession\(readFileSession\(\), \{ expiredKind: "" \}\)/
  );
  assert.match(
    appSource,
    /function clearFileSession[\s\S]*?synchronizeRelatedFilesSession\(readFileSession\(\), \{[\s\S]*?force: true/
  );
});

test("shipment files expose a three-role multi-select governed by server permissions", () => {
  for (const role of ["OVERSEA_AGENT", "SHIPPER", "CONSIGNEE"]) {
    assert.match(indexSource, new RegExp(`type="checkbox" value="${role}" data-related-files-upload-role`));
  }
  assert.match(indexSource, /class="visibility-role-picker" id="related-files-upload-visibility"/);
  assert.match(
    appSource,
    /function allowedRelatedFileVisibilityRoles[\s\S]*?allowedVisibilityRoles[\s\S]*?FILE_VISIBILITY_ROLES/
  );
  assert.match(
    appSource,
    /function normalizeFileVisibilityRoles[\s\S]*?legacy === "INTERNAL"[\s\S]*?legacy === "PARTIES"/
  );
  assert.match(stylesSource, /\.visibility-role-picker[\s\S]*?\.visibility-role-menu/);
});

test("session and shipment changes discard target-customer candidates", () => {
  assert.match(
    appSource,
    /function resetRelatedFilesSessionState[\s\S]*?relatedFilesAssignableCustomers = \[\];[\s\S]*?relatedFilesSelectedTargetCustomerId = "";/
  );
  assert.match(
    appSource,
    /if \(contextChanged\) \{[\s\S]*?relatedFilesAssignableCustomers = \[\];[\s\S]*?relatedFilesSelectedTargetCustomerId = "";/
  );
});

test("uploads and per-file edits send role arrays while retaining legacy visibility", () => {
  const uploadStart = appSource.indexOf("async function uploadRelatedFiles()");
  const uploadEnd = appSource.indexOf("async function downloadRelatedFile", uploadStart);
  const uploadSource = appSource.slice(uploadStart, uploadEnd);
  assert.match(
    uploadSource,
    /selectedRelatedFilesUploadRoles\(\)[\s\S]*?visibilityRoles\.length === 0[\s\S]*?return;/
  );
  assert.match(
    uploadSource,
    /for \(const role of visibilityRoles\) formData\.append\("visibilityRoles", role\)[\s\S]*?formData\.append\("visibility", internalVisibility\)/
  );
  assert.match(
    appSource,
    /method: "PATCH",[\s\S]*?visibilityRoles: nextRoles,[\s\S]*?visibility: legacyVisibilityForRoles\(nextRoles\)/
  );
});

test("customer file cards never disclose another customer's display name", () => {
  assert.match(
    appSource,
    /function relatedFileSharingLabel\(file, session = readFileSession\(\)\) \{[\s\S]*?if \(session\.kind === "CUSTOMER"\) return t\("files\.sharedWithSelf"\);[\s\S]*?fileVisibilityRolesLabel\(file\.visibilityRoles\)/
  );
  const labelStart = appSource.indexOf("function relatedFileSharingLabel");
  const labelEnd = appSource.indexOf("function createRelatedFileItem", labelStart);
  assert.doesNotMatch(appSource.slice(labelStart, labelEnd), /relatedFileTargetDisplayName/);
});

test("documents use one shipment-file drawer and sensitive bill metadata is always hidden", () => {
  assert.match(indexSource, /id="related-files-button"[\s\S]*?data-i18n="files\.trigger"/);
  assert.doesNotMatch(indexSource, /id="open-document-drawer"/);
  assert.match(
    appSource,
    /const internalReferencePattern =[\s\S]*?surrender[\s\S]*?filter\(\(item\) =>[\s\S]*?!internalReferencePattern\.test/
  );
});

test("every result element registered by the renderer exists in the page", () => {
  const elementMap = appSource.match(/const elements = Object\.fromEntries\(([\s\S]*?)\n\);/)?.[1];
  assert.ok(elementMap, "result element registry is missing");

  const registeredIds = [...elementMap.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const pageIds = new Set([...indexSource.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
  const missingIds = registeredIds.filter((id) => !pageIds.has(id));

  assert.deepEqual(missingIds, [], `renderer references missing DOM ids: ${missingIds.join(", ")}`);
});

test("file preview uses a same-origin preview endpoint and safe blob rendering", () => {
  assert.match(indexSource, /id="file-preview-dialog"[\s\S]*?id="file-preview-download"/);
  assert.match(
    appSource,
    /function safeSameOriginFileUrl[\s\S]*?resolved\.origin !== window\.location\.origin[\s\S]*?!resolved\.pathname\.startsWith\("\/api\/"\)/
  );
  assert.match(appSource, /shipmentFilePath\(session, file\.id, "\/preview"\)/);
  assert.match(appSource, /iframe\.setAttribute\("sandbox", ""\)/);
});

test("batch work is submitted to Spring, polled, and cancelled as a background task", () => {
  assert.match(appSource, /requestBusinessBatchTask\("\/api\/business\/shipment-batch-tasks"/);
  assert.match(appSource, /while \(applyBusinessBatchTask\(snapshot\)\)[\s\S]*?BATCH_TASK_POLL_INTERVAL_MS/);
  assert.match(appSource, /\/api\/business\/shipment-batch-tasks\/\$\{encodedTaskId\}\/cancel/);
  assert.match(appSource, /status === "manual" \|\| item\.manualOnly[\s\S]*?batch\.itemManual/);
  assert.match(appSource, /subtasks: normalizeBatchSubtasks\(remote\.subtasks/);
  assert.match(appSource, /batch-subtask-details[\s\S]*?batch\.childProgress/);
  assert.match(stylesSource, /\.batch-subtask-list[\s\S]*?\.batch-subtask-item/);
  assert.match(
    appSource,
    /hasUnsubmittedWork[\s\S]*?item\.status === "pending"[\s\S]*?item\.status === "manual" && !item\.submitted/
  );
  assert.match(
    appSource,
    /batchResumeButton\.hidden =[\s\S]*?item\.status === "pending" \|\| \(item\.status === "manual" && !item\.submitted\)/
  );
});

test("batch recovery clears missing tasks and defers stop until task creation", () => {
  assert.match(
    appSource,
    /error\.status = response\.status[\s\S]*?function recoverMissingBusinessBatchTask\(\)/
  );
  assert.match(
    appSource,
    /error\?\.status === 404 && batchState\.taskId[\s\S]*?recoverMissingBusinessBatchTask\(\)/
  );
  assert.match(
    appSource,
    /if \(batchStopRequested\) \{[\s\S]*?snapshot = await cancelBatchTask\(submittedTaskId\)/
  );
  assert.match(
    appSource,
    /backend returns the newly allocated task id\.[\s\S]*?if \(!taskId\) return;/
  );
  const statusStart = appSource.indexOf("function batchItemStatusFromServer");
  const statusEnd = appSource.indexOf("function applyBusinessBatchTask", statusStart);
  assert.doesNotMatch(appSource.slice(statusStart, statusEnd), /\|\| manualOnly/);
});

test("batch restore preserves safe manual reference punctuation", () => {
  const { isRestorableBatchNumber } = loadContractHelpers();
  assert.equal(isRestorableBatchNumber("ABC/123.45"), true);
  assert.equal(isRestorableBatchNumber("784-84422343"), true);
  assert.equal(isRestorableBatchNumber("../unsafe"), false);
  assert.equal(isRestorableBatchNumber("ABC/123."), false);
  assert.match(
    appSource,
    /if \(!isRestorableBatchNumber\(number\)\) return null;/
  );
});

test("batch resume waits for the previous polling loop to settle", () => {
  assert.match(appSource, /let batchRunPromise = null;/);
  assert.match(
    appSource,
    /batchResumeButton\.hidden =[\s\S]*?Boolean\(batchRunPromise\)/
  );
  assert.match(
    appSource,
    /function runBatchQueue\(\) \{[\s\S]*?if \(batchRunPromise\) return batchRunPromise;[\s\S]*?const currentRun = executeBatchQueue\(\);[\s\S]*?batchRunPromise = null;[\s\S]*?renderBatchState\(\);/
  );
});

test("spreadsheet import previews the detected sheet and column before starting", () => {
  assert.match(indexSource, /id="batch-column-preview"[\s\S]*?id="batch-preview-sheet"[\s\S]*?id="batch-preview-column"/);
  assert.match(appSource, /const preview = await parseBatchFile\(file\)[\s\S]*?showBatchColumnPreview\(file, preview\)/);
  assert.match(
    appSource,
    /batchPreviewConfirm\?\.addEventListener\("click"[\s\S]*?parseBatchFile\(file, \{[\s\S]*?sheetName: sheet\.name,[\s\S]*?columnIndex,[\s\S]*?type: batchPreviewType\.value[\s\S]*?startImportedBatch\(fileName, imported\)/
  );
});

test("customer tracking is database-backed, assigned-only, and never falls back to carrier lookup", () => {
  assert.match(
    appSource,
    /async function loadCustomerAssignedHistory\(\)[\s\S]*?fetch\("\/api\/customer\/shipments"[\s\S]*?item\?\.dataAvailable && item\?\.snapshot/
  );
  assert.match(
    appSource,
    /function readHistory\(\)[\s\S]*?readFileSession\(\)\.kind === "CUSTOMER"\) return customerAssignedHistory;/
  );

  const requestStart = appSource.indexOf("async function requestTracking(query, options = {})");
  const requestEnd = appSource.indexOf("checkChannelsButton.addEventListener", requestStart);
  const requestSource = appSource.slice(requestStart, requestEnd);
  assert.match(requestSource, /const customerReadOnly = readFileSession\(\)\.kind === "CUSTOMER";/);
  assert.match(
    requestSource,
    /postPublicShipmentTrackingRequest\(query, options\);[\s\S]*?if \(customerReadOnly\) return platform;/
  );
  assert.match(
    appSource,
    /const localPayload = customerReadOnly \? null : mergeImportedDetailsIntoPayload/
  );
  assert.match(appSource, /if \(readFileSession\(\)\.kind === "CUSTOMER"\) item\.append\(toggle, details\);/);
});

test("opening shipment details never fetches files or silently re-tracks the shipment", () => {
  const renderStart = appSource.indexOf("function renderResult(payload)");
  const renderEnd = appSource.indexOf("function renderHistory()", renderStart);
  const renderSource = appSource.slice(renderStart, renderEnd);
  assert.doesNotMatch(renderSource, /preloadRelatedFilesForContext|loadRelatedFiles\(/);

  const openStart = appSource.indexOf("function openHistoryEntry(entry)");
  const openEnd = appSource.indexOf("function markBatchItemResult", openStart);
  const openSource = appSource.slice(openStart, openEnd);
  assert.match(openSource, /renderResult\(currentPayload\)/);
  assert.doesNotMatch(openSource, /form\.requestSubmit\(\)|requestTracking\(/);

  const filesStart = appSource.indexOf("function openRelatedFilesDrawer()");
  const filesEnd = appSource.indexOf("function closeRelatedFilesDrawer", filesStart);
  assert.match(appSource.slice(filesStart, filesEnd), /loadRelatedFiles\(\)/);
});

test("signed-in overview loads account-bound snapshot objects and never offers browser-history clearing", () => {
  const loadStart = appSource.indexOf("async function loadInternalTrackedHistory()");
  const loadEnd = appSource.indexOf("function migrateLegacyCache", loadStart);
  const loadSource = appSource.slice(loadStart, loadEnd);
  assert.match(loadSource, /fetch\("\/api\/business\/shipments"/);
  assert.match(loadSource, /item\?\.snapshot && typeof item\.snapshot === "object"/);
  assert.match(loadSource, /PENDING_MANUAL/);
  assert.match(loadSource, /boundShipment: true/);
  assert.doesNotMatch(loadSource, /snapshotJson/);

  const historyStart = appSource.indexOf("function renderHistory()");
  const historyEnd = appSource.indexOf("function cmaSessionErrorMessage", historyStart);
  const historySource = appSource.slice(historyStart, historyEnd);
  assert.match(historySource, /clearHistoryButton\.hidden = accountBound \|\| history\.length === 0/);
  assert.match(indexSource, /id="history-title"[\s\S]*?id="history-subtitle"/);
});

test("exposes real carrier selection and restricts CMA session maintenance to managers", () => {
  assert.match(
    indexSource,
    /<label for="carrier-select"[^>]*data-i18n="query\.carrier"[\s\S]*?<select id="carrier-select" name="carrier">[\s\S]*?<option value="COSCO">[\s\S]*?<option value="CMA">/
  );
  assert.match(indexSource, /data-carrier-select="COSCO"/);
  assert.match(indexSource, /data-carrier-select="CMA"/);
  assert.match(
    appSource,
    /function renderCmaSessionPanel[\s\S]*?canManageFileVisibility\(session\)[\s\S]*?cmaSessionForm\.hidden = !canManage/
  );
  assert.match(
    appSource,
    /fetch\("\/api\/tracking\/cma-session"[\s\S]*?method: "PATCH"[\s\S]*?fileAuthHeaders\(session\)/
  );
  assert.doesNotMatch(appSource, /localStorage\.setItem\([^\n]*cma[^\n]*sessionCookie/i);
});
