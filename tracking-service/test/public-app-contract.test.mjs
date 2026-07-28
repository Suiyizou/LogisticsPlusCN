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
const businessCustomerSource = await readFile(
  new URL("../../frontend/src/components/BusinessCustomerPage.vue", import.meta.url),
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

test("only internal uploads and per-file edits send role arrays", () => {
  const uploadStart = appSource.indexOf("async function uploadRelatedFiles()");
  const uploadEnd = appSource.indexOf("async function downloadRelatedFile", uploadStart);
  const uploadSource = appSource.slice(uploadStart, uploadEnd);
  assert.match(
    uploadSource,
    /const customerUpload = session\.kind === "CUSTOMER";[\s\S]*?if \(!customerUpload && visibilityRoles\.length === 0\)/
  );
  assert.match(
    uploadSource,
    /if \(!customerUpload\) \{[\s\S]*?formData\.append\("visibilityRoles", role\)[\s\S]*?if \(session\.kind === "INTERNAL"\)[\s\S]*?formData\.append\("visibility", internalVisibility\)/
  );
  assert.match(
    appSource,
    /session\.kind === "INTERNAL" &&[\s\S]*?method: "PATCH",[\s\S]*?visibilityRoles: nextRoles,[\s\S]*?visibility: legacyVisibilityForRoles\(nextRoles\)/
  );
  assert.match(
    appSource,
    /relatedFilesUploadVisibilityField\.hidden =[\s\S]*?!canManageVisibility;/
  );
  assert.match(stylesSource, /\.visibility-role-menu \{[\s\S]*?bottom: calc\(100% \+ 6px\)/);
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

test("system announcements are audience-scoped, read-once, and safely rendered", () => {
  for (const id of [
    "system-messages-button",
    "system-messages-count",
    "system-announcement-dialog",
    "system-announcement-body",
    "system-announcement-close",
    "system-announcement-acknowledge"
  ]) {
    assert.match(indexSource, new RegExp(`id="${id}"`));
  }
  assert.match(
    appSource,
    /function announcementListPath[\s\S]*?\/api\/customer\/announcements\/today[\s\S]*?\/api\/announcements\/today/
  );
  assert.match(
    appSource,
    /function announcementReadPath[\s\S]*?\/api\/customer\/announcements\/\$\{encodedId\}\/read[\s\S]*?\/api\/announcements\/\$\{encodedId\}\/read/
  );
  assert.match(
    appSource,
    /function announcementLocalReadKey[\s\S]*?announcement-read:[\s\S]*?announcementIdentity/
  );
  assert.match(
    appSource,
    /loadSystemAnnouncements\(\{ autoOpen: true \}\)/
  );
  assert.match(
    appSource,
    /systemAnnouncementAutoOpenRequested[\s\S]*?systemAnnouncements\.some\(\(item\) => !item\.read\)/
  );
  assert.match(
    appSource,
    /function announcementInlineMarkdown[\s\S]*?announcementEscapeHtml\(value\)[\s\S]*?announcementSafeUrl/
  );
  assert.match(
    appSource,
    /function announcementSafeUrl[\s\S]*?\["https:", "http:"\][\s\S]*?\^data:image/
  );
  assert.match(stylesSource, /\.tracking-system-messages[\s\S]*?\.system-announcement-dialog/);
});

test("business overview de-duplicates shipments and filters them by assigned customer", () => {
  assert.match(indexSource, /id="history-customer-filter"/);
  assert.match(appSource, /function uniqueHistoryEntries[\s\S]*?historyShipmentKey/);
  assert.match(appSource, /function historyMatchesCustomer[\s\S]*?boundCustomers/);
  assert.match(appSource, /boundCustomers: normalizeHistoryBoundCustomers\(item\.boundCustomers\)/);
});

test("overseas agents manually update only their assigned shipment list", () => {
  assert.match(indexSource, /id="history-following-filter"/);
  assert.match(indexSource, /id="history-eta-sort"[\s\S]*?value="asc"[\s\S]*?value="desc"/);
  assert.match(
    indexSource,
    /id="agent-shipments-nav-item"[\s\S]*?href="#shipments"[\s\S]*?data-view-target="shipments"/
  );
  assert.match(
    indexSource,
    /id="agent-shipments-view"[\s\S]*?data-view="shipments"[\s\S]*?id="agent-management-customer-filter"/
  );
  assert.match(indexSource, /id="agent-management-select-all"/);
  assert.match(indexSource, /id="agent-management-bulk-update"/);
  assert.match(indexSource, /id="agent-management-refresh-all"/);
  assert.match(indexSource, /class="agent-management-bulk-toolbar"/);
  assert.match(indexSource, /id="agent-management-refresh"/);
  assert.match(indexSource, /id="agent-update-task-dialog"/);
  assert.match(indexSource, /id="agent-update-task-progress-bar"/);
  assert.match(indexSource, /id="agent-update-task-results"/);
  assert.match(
    indexSource,
    /agent\.managementTitle[\s\S]*?agent\.columnBusinessReference[\s\S]*?agent\.columnClient[\s\S]*?agent\.columnBoundUsers/
  );
  assert.doesNotMatch(indexSource, /id="agent-shipment-edit-dialog"/);
  assert.match(indexSource, /id="tracking-nav-item"/);
  assert.match(appSource, /function isOverseaAgentSession[\s\S]*?OVERSEA_AGENT/);
  assert.doesNotMatch(appSource, /function saveAgentShipmentEdit/);
  assert.doesNotMatch(appSource, /agent-row-edit/);
  assert.match(
    appSource,
    /function setOverseaAgentShipmentFollowing[\s\S]*?\/api\/customer\/shipments\/\$\{encodeURIComponent\(entry\.shipmentId\)\}\/follow/
  );
  assert.match(
    appSource,
    /function renderAgentShipmentManagement[\s\S]*?agent-shipment-select[\s\S]*?actions\.append\(view, update, follow\)[\s\S]*?agentManagementTableBody\.append/
  );
  assert.match(appSource, /detailActions\.append\(followButton, updateButton\)/);
  assert.match(
    appSource,
    /function refreshOverseaAgentShipment[\s\S]*?\/api\/customer\/shipments\/\$\{encodeURIComponent\(entry\.shipmentId\)\}\/refresh\$\{scopeQuery\}/
  );
  assert.match(
    appSource,
    /function refreshSelectedOverseaAgentShipments[\s\S]*?performOverseaAgentShipmentRefresh/
  );
  assert.match(
    appSource,
    /function refreshAllOverseaAgentShipments[\s\S]*?loadAllRefreshableOverseaAgentShipments[\s\S]*?agent\.refreshAllConfirm/
  );
  assert.match(
    appSource,
    /function createAgentUpdateTask[\s\S]*?agentUpdateTaskDialog\.showModal\(\)/
  );
  assert.match(
    appSource,
    /function renderAgentUpdateTaskDialog[\s\S]*?agentUpdateTaskProgressBar\.style\.width[\s\S]*?agentUpdateTaskResults\.replaceChildren/
  );
  assert.match(
    appSource,
    /function performOverseaAgentShipmentRefresh[\s\S]*?createAgentUpdateTask\(entries, mode\)[\s\S]*?taskItem\.status = "SUCCEEDED"[\s\S]*?taskItem\.status = "FAILED"/
  );
  assert.match(
    appSource,
    /function agentShipmentClientLabel[\s\S]*?businessReferences\.clientNameCode[\s\S]*?agentShipmentCustomers/
  );
  assert.match(
    appSource,
    /agentManagementRefresh\?\.addEventListener\("click"[\s\S]*?loadCustomerAssignedHistory/
  );
  assert.match(
    appSource,
    /function renderHistoryCustomerFilter[\s\S]*?historyAvailableCustomers[\s\S]*?renderFilter\(historyCustomerFilterWrap[\s\S]*?renderFilter\(agentManagementCustomerFilterWrap/
  );
  assert.match(
    appSource,
    /followingOnly: String\(historyFollowingOnly && isOverseaAgentSession\(session\)\)/
  );
  assert.match(
    appSource,
    /if \(isOverseaAgentSession\(session\) && historyCustomerFilter\) \{[\s\S]*?query\.set\("customerId", historyCustomerFilter\)/
  );
  assert.match(
    appSource,
    /function historyCustomerLabel\(customer\) \{[\s\S]*?customer\.clientCode[\s\S]*?logisticsPartyRoleLabel\(customer\.partyRole\)/
  );
  assert.match(
    stylesSource,
    /body\.is-oversea-agent-session #tracking-nav-item[\s\S]*?display: none !important/
  );
  assert.match(
    stylesSource,
    /body\.is-oversea-agent-session #tracking-view > \.query-panel/
  );
  assert.match(
    stylesSource,
    /\.agent-management-bulk-toolbar[\s\S]*?\.agent-management-bulk-update/
  );
  assert.match(
    stylesSource,
    /\.agent-update-task-dialog::backdrop[\s\S]*?\.agent-update-task-progress[\s\S]*?\.agent-update-task-result\.is-running/
  );
  assert.match(
    indexSource,
    /href="#overview"[\s\S]*?data-view-target="overview"[\s\S]*?id="overview-view"/
  );
  assert.doesNotMatch(appSource, /overviewNavItem\.hidden = managed/);
  const restrictedWorkspaceRule = stylesSource.slice(
    stylesSource.indexOf("body.is-oversea-agent-session #tracking-nav-item"),
    stylesSource.indexOf("display: none !important", stylesSource.indexOf("body.is-oversea-agent-session #tracking-nav-item"))
  );
  assert.doesNotMatch(restrictedWorkspaceRule, /\.overview-hero/);
  assert.match(
    appSource,
    /function sortHistoryByEta[\s\S]*?historyEtaSort === "desc"[\s\S]*?historyEtaTimestamp/
  );
});

test("business users can explicitly select the alternate proxy channel", () => {
  assert.match(
    indexSource,
    /class="field channel-field internal-query-channel"[\s\S]*?id="channel-select"[\s\S]*?<option value="PROXY"/
  );
  assert.match(appSource, /PROXY:[\s\S]*?labelKey: "channel\.proxy"/);
  assert.match(stylesSource, /body\.is-internal-session \.internal-query-channel[\s\S]*?display: flex/);
  assert.match(stylesSource, /\.internal-query-channel[\s\S]*?display: none/);
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
  assert.doesNotMatch(indexSource, /id="batch-workspace-trigger"/);
  assert.match(indexSource, /<dialog[^>]*id="batch-workspace-dialog"[\s\S]*?id="batch-import-panel"/);
  assert.doesNotMatch(indexSource, /id="batch-container-details"/);
  assert.match(appSource, /requestBusinessBatchTask\("\/api\/business\/shipment-batch-tasks"/);
  assert.doesNotMatch(appSource, /includeContainerDetails/);
  assert.match(appSource, /\["QUEUED", "RUNNING", "COOLDOWN", "STOPPING"\]/);
  assert.match(appSource, /while \(applyBusinessBatchTask\(snapshot\)\)[\s\S]*?BATCH_TASK_POLL_INTERVAL_MS/);
  assert.match(appSource, /\/api\/business\/shipment-batch-tasks\/\$\{encodedTaskId\}\/cancel/);
  assert.match(appSource, /status === "manual" \|\| item\.manualOnly[\s\S]*?batch\.itemManual/);
  assert.match(appSource, /subtasks: normalizeBatchSubtasks\(remote\.subtasks/);
  assert.match(appSource, /batch-subtask-details[\s\S]*?batch\.childProgress/);
  assert.match(stylesSource, /\.batch-subtask-list[\s\S]*?\.batch-subtask-item/);
  assert.match(
    stylesSource,
    /\.batch-workspace-dialog \{[\s\S]*?width: min\(1440px,[\s\S]*?height: min\(900px/
  );
  assert.match(
    appSource,
    /hasUnsubmittedWork[\s\S]*?item\.status === "pending"[\s\S]*?item\.status === "manual" && !item\.submitted/
  );
  assert.match(
    appSource,
    /batchResumeButton\.hidden =[\s\S]*?item\.status === "pending" \|\| \(item\.status === "manual" && !item\.submitted\)/
  );
});

test("batch progress de-duplicates identical supplemental failure messages", () => {
  assert.match(
    businessCustomerSource,
    /const details = \[\.\.\.new Set\(\(item\.subtasks \|\| \[\]\)[\s\S]*?\.filter\(Boolean\)\)\];/
  );
});

test("business shipment failures remain filterable while the customer review queue stays hidden", () => {
  assert.match(businessCustomerSource, /lastRefreshResult === 'FAILED'/);
  assert.match(businessCustomerSource, /batchTrackProblemsOnly = ref\(false\)/);
  assert.match(businessCustomerSource, /refreshIssuesOnly = ref\(false\)/);
  assert.doesNotMatch(businessCustomerSource, /pendingClientMatches|loadPendingClientMatches/);
});

test("overview shows a database loading state without exposing one-click update", () => {
  assert.match(indexSource, /id="history-loading"[\s\S]*?data-i18n="history\.loadingTitle"/);
  assert.doesNotMatch(indexSource, /id="history-refresh-all"/);
  assert.doesNotMatch(appSource, /startRefreshAllHistory|historyRefreshAllButton/);
  assert.match(
    appSource,
    /historyLoadingState = true;[\s\S]*?historyLoading\.hidden = !historyLoadingState/
  );
});

test("shipment drawer exposes business document slots and database-backed messages", () => {
  for (const category of [
    "EXPORT_CIV_PL", "HOUSE_BILL", "MASTER_BILL", "ARRIVAL_NOTICE",
    "DELIVERY_ORDER", "POD", "DUTY_SUMMARY", "IMPORT_CIV_PL"
  ]) {
    assert.match(indexSource, new RegExp(`data-category-value="${category}"`));
  }
  assert.match(indexSource, /id="related-file-comments"[\s\S]*?id="related-file-comment-form"/);
  assert.match(
    appSource,
    /shipmentFileCommentsPath[\s\S]*?loadRelatedFileComments[\s\S]*?sendRelatedFileComment/
  );
  assert.match(appSource, /await loadRelatedFileComments\(\)/);
  assert.match(stylesSource, /\.related-files-drawer \{[\s\S]*?width: min\(50vw, 1040px\)/);
});

test("common document previews use structured safe renderers", () => {
  assert.match(appSource, /function renderFilePreviewMarkdown[\s\S]*?textContent/);
  assert.match(appSource, /function renderFilePreviewSpreadsheet[\s\S]*?file-preview-table/);
  assert.match(appSource, /function renderFilePreviewWord/);
  assert.match(appSource, /function parseCsvPreview/);
  assert.doesNotMatch(appSource, /filePreviewContent\.innerHTML/);
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
    /async function loadCustomerAssignedHistory\(\)[\s\S]*?fetch\(`\/api\/customer\/shipments\?\$\{query\}`[\s\S]*?item\?\.dataAvailable && item\?\.snapshot/
  );
  assert.match(indexSource, /id="history-pagination"[\s\S]*?id="history-page-size"/);
  assert.match(appSource, /page: String\(historyPage\)[\s\S]*?pageSize: String\(historyPageSize\)/);
  assert.match(
    appSource,
    /function readHistory\(\)[\s\S]*?readFileSession\(\)\.kind === "CUSTOMER"\)[\s\S]*?uniqueHistoryEntries\(customerAssignedHistory\)/
  );

  const requestStart = appSource.indexOf("async function requestTracking(query, options = {})");
  const requestEnd = appSource.indexOf("checkChannelsButton.addEventListener", requestStart);
  const requestSource = appSource.slice(requestStart, requestEnd);
  assert.match(requestSource, /const customerReadOnly = readFileSession\(\)\.kind === "CUSTOMER";/);
  assert.match(
    requestSource,
    /postPublicShipmentTrackingRequest\(query, options\);[\s\S]*?if \(customerReadOnly\) return platform;/
  );
  assert.doesNotMatch(appSource, /loadSnapshot|saveSnapshot|browserCached/);
  assert.match(appSource, /databaseStored: true/);
  assert.match(appSource, /item\.append\(toggle, details\);/);
});

test("opening shipment details never fetches files or silently re-tracks the shipment", () => {
  const renderStart = appSource.indexOf("function renderResult(payload)");
  const renderEnd = appSource.indexOf("function renderHistory()", renderStart);
  const renderSource = appSource.slice(renderStart, renderEnd);
  assert.doesNotMatch(renderSource, /preloadRelatedFilesForContext|loadRelatedFiles\(/);

  const openStart = appSource.indexOf("function openHistoryEntry(entry)");
  const openEnd = appSource.indexOf("function markBatchItemResult", openStart);
  const openSource = appSource.slice(openStart, openEnd);
  assert.match(openSource, /showStoredTrackingQuery\(entry\.query, \{ entry \}\)/);
  assert.doesNotMatch(openSource, /form\.requestSubmit\(\)|requestTracking\(/);

  const batchOpenStart = appSource.indexOf("async function openBatchItem(item)");
  const batchOpenEnd = appSource.indexOf("function applyLanguage", batchOpenStart);
  const batchOpenSource = appSource.slice(batchOpenStart, batchOpenEnd);
  assert.match(batchOpenSource, /showStoredTrackingQuery\(query/);
  assert.match(batchOpenSource, /closeBatchWorkspace\(\)/);
  assert.doesNotMatch(batchOpenSource, /form\.requestSubmit\(\)|requestTracking\(/);

  const filesStart = appSource.indexOf("function openRelatedFilesDrawer()");
  const filesEnd = appSource.indexOf("function closeRelatedFilesDrawer", filesStart);
  assert.match(appSource.slice(filesStart, filesEnd), /loadRelatedFiles\(\)/);
});

test("view navigation keeps browser back-forward state and restores stored tracking details", () => {
  assert.match(
    appSource,
    /function showView\(name, \{ updateLocation = true, pushLocation = false \} = \{\}\)[\s\S]*?window\.history\[pushLocation \? "pushState" : "replaceState"\]/
  );
  assert.match(
    appSource,
    /function syncViewFromLocation\(\)[\s\S]*?trackingQueryFromLocation\(\)[\s\S]*?showStoredTrackingQuery\(query, \{ clearWhenMissing: true \}\)/
  );
  assert.match(
    appSource,
    /showView\(link\.dataset\.viewTarget, \{ pushLocation: true \}\)/
  );
});

test("tracking sidebar returns to the safe caller page and uses the light workspace style", () => {
  assert.match(indexSource, /id="portal-return-link"[\s\S]*?data-i18n="nav\.back"/);
  assert.doesNotMatch(indexSource, /id="portal-return-link"[\s\S]{0,180}?data-home-link/);
  assert.match(
    appSource,
    /requestedReturn\.startsWith\("\/"\) && !requestedReturn\.startsWith\("\/\/"\)[\s\S]*?window\.location\.assign\(safeReturn\)[\s\S]*?window\.history\.back\(\)/
  );
  assert.match(
    stylesSource,
    /body\.is-customer-session \.sidebar \{[\s\S]*?background: #fff;/
  );
});

test("signed-in overview loads account-bound snapshot objects and never offers browser-history clearing", () => {
  const loadStart = appSource.indexOf("async function loadInternalTrackedHistory()");
  const loadEnd = appSource.indexOf("function appendCell", loadStart);
  const loadSource = appSource.slice(loadStart, loadEnd);
  assert.match(loadSource, /fetch\(`\/api\/business\/shipments\?\$\{query\}`/);
  assert.match(loadSource, /item\?\.snapshot && typeof item\.snapshot === "object"/);
  assert.match(loadSource, /PENDING_MANUAL/);
  assert.match(loadSource, /boundShipment: true/);
  assert.doesNotMatch(loadSource, /snapshotJson/);

  const historyStart = appSource.indexOf("function renderHistory()");
  const historyEnd = appSource.indexOf("function cmaSessionErrorMessage", historyStart);
  const historySource = appSource.slice(historyStart, historyEnd);
  assert.match(historySource, /customerHistory\.filter\(\(entry\) => historyMatchesSearch/);
  assert.doesNotMatch(indexSource, /id="clear-history-button"/);
  assert.match(indexSource, /id="history-search-input"[\s\S]*?id="history-search-clear"/);
  assert.match(indexSource, /id="history-title"[\s\S]*?id="history-subtitle"/);
  assert.doesNotMatch(historySource, /t\(\(CHANNELS\[entry\.query\.channel\]/);
  assert.doesNotMatch(historySource, /t\("history\.updated"\)/);
  assert.match(
    historySource,
    /const timelineItems = historyTimeline\(snapshot\);[\s\S]*?if \(timelineItems\.length > 0\)[\s\S]*?if \(timelineSection\) details\.append\(timelineSection\)/
  );
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

test("open details prefers structured facts and removes repeated spreadsheet fields", () => {
  const start = appSource.indexOf("function canonicalExtraInformationKeys(snapshot)");
  const end = appSource.indexOf("function mergeImportedDetailsIntoPayload", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const context = vm.createContext({
    hasText(value) {
      return value !== null && value !== undefined && String(value).trim() !== "";
    },
    hasArrayField(snapshot, collections, fields) {
      return collections.some((collection) =>
        (snapshot?.[collection] ?? []).some((item) =>
          fields.some((field) => context.hasText(item?.[field]))
        )
      );
    },
    businessReferencesForSnapshot(snapshot) {
      return snapshot?.references?.business ?? {};
    },
    containerTypeSummary() {
      return "";
    },
    t(key) {
      return key;
    }
  });
  vm.runInContext(
    `${appSource.slice(start, end)}\n` +
      "globalThis.detailContract = { deduplicatedExtraInformation };",
    context
  );

  const snapshot = {
    tracking: { carrierPrefix: "COSU", originalNumber: "COSU9508426860" },
    summary: {
      billOfLading: "COSU9508426860",
      origin: { name: "SHANGHAI" },
      destination: { name: "LONG BEACH" }
    },
    keyTimes: {
      estimatedDeparture: { time: "22-Jul-26" },
      estimatedFinalArrival: { time: "9-Aug-26" }
    },
    references: {
      business: { clientNameCode: "Hayden US", forwarderJobNumber: "LJSH26070068" }
    },
    routingLegs: [],
    sailingSchedule: [],
    containers: [],
    extraInformation: [
      { key: "carrierPrefix", value: "COSU" },
      { key: "originalBillOfLading", value: "COSU9508426860" },
      { key: "clientNameCode", value: "Hayden US" },
      { key: "forwarderJobNumber", value: "LJSH26070068" },
      { key: "portOfLoading", value: "SHANGHAI" },
      { key: "portOfDischarge", value: "LONG BEACH" },
      { key: "estimatedDeparture", value: "22-Jul-26" },
      { key: "estimatedArrival", value: "9-Aug-26" },
      { key: "vesselVoyage", value: "COSCO EUROPE 114E" },
      { key: "volume", value: "20*40HC" },
      { key: "volume", value: "20*40HC" }
    ]
  };
  const displayed = JSON.parse(
    JSON.stringify(context.detailContract.deduplicatedExtraInformation(snapshot))
  );
  assert.deepEqual(displayed, [
    { key: "vesselVoyage", value: "COSCO EUROPE 114E" },
    { key: "volume", value: "20*40HC" }
  ]);
  assert.match(
    appSource,
    /firstTimedRecord\([\s\S]*?keyTimes\.actualArrival,[\s\S]*?keyTimes\.estimatedFinalArrival/
  );
  assert.match(indexSource, /id="route-panel"[\s\S]*?id="routing-panel"[\s\S]*?id="container-panel"/);
  assert.match(indexSource, /id="supplemental-details-status"/);
  assert.match(appSource, /\/api\/public\/shipments\/\$\{encodeURIComponent\(shipmentId\)\}\/supplemental-details/);
  assert.match(appSource, /if \(containers\.length === 0\) \{[\s\S]*?cell\.colSpan = 8;[\s\S]*?t\("containers\.empty"\)/);
  assert.match(appSource, /const containers = snapshot\.containers \?\? \[\];[\s\S]*?elements\["container-panel"\]\.hidden = false;[\s\S]*?renderContainers\(containers\)/);
  assert.doesNotMatch(appSource, /elements\["container-panel"\]\.hidden = containers\.length === 0/);
  assert.match(appSource, /"references\.title": "订舱信息及参考号"/);
  assert.match(appSource, /"containers\.title": "运输详情"/);
});

test("blank legacy browser business references do not hide database-backed fields", () => {
  const start = appSource.indexOf("function businessReferencesForSnapshot(snapshot)");
  const end = appSource.indexOf("function renderBusinessReferences(snapshot)", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const context = vm.createContext({
    BUSINESS_REFERENCE_PREFIX: "shipment-track:business-references:",
    readSupplementaryRecord() {
      return {
        clientNameCode: "",
        clientPoNumber: "   ",
        forwarderJobNumber: null
      };
    },
    hasText(value) {
      return value !== null && value !== undefined && String(value).trim() !== "";
    }
  });
  vm.runInContext(
    `${appSource.slice(start, end)}\n` +
      "globalThis.businessReferencesForSnapshot = businessReferencesForSnapshot;",
    context
  );

  const values = context.businessReferencesForSnapshot({
    references: {
      business: {
        clientNameCode: "Hayden US",
        clientPoNumber: "HW202600100",
        forwarderJobNumber: "LJSH2607005"
      }
    }
  });
  assert.deepEqual(
    { ...values },
    {
      clientNameCode: "Hayden US",
      clientPoNumber: "HW202600100",
      forwarderJobNumber: "LJSH2607005"
    }
  );
});
