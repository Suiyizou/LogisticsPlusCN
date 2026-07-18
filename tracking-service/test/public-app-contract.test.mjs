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
      "globalThis.contract = { fileSessionFingerprint, trackingResponseMessage, isPublicTrackingRouteUnavailable };",
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

test("directed sharing exposes a required customer selector only through server permissions", () => {
  assert.match(indexSource, /id="related-files-target-customer-field"[\s\S]*?id="related-files-target-customer"/);
  assert.match(indexSource, /id="related-files-target-customer-hint"[\s\S]*?data-i18n="files\.targetRequired"/);
  assert.match(
    appSource,
    /function canAssignRelatedFilesCustomer[\s\S]*?canManageFileVisibility\(session\)[\s\S]*?relatedFilesPermissions\?\.canAssignCustomer === true/
  );
  assert.match(
    appSource,
    /session\.kind === "INTERNAL"[\s\S]*?relatedFilesPermissions\?\.canAssignCustomer === true[\s\S]*?Array\.isArray\(payload\?\.assignableCustomers\)/
  );
  assert.match(stylesSource, /\.related-files-target-customer,[\s\S]*?grid-column: 1 \/ -1/);
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

test("shared uploads and visibility updates require a concrete customer target", () => {
  const uploadStart = appSource.indexOf("async function uploadRelatedFiles()");
  const uploadEnd = appSource.indexOf("async function downloadRelatedFile", uploadStart);
  const uploadSource = appSource.slice(uploadStart, uploadEnd);
  assert.match(
    uploadSource,
    /internalVisibility === "PARTIES"[\s\S]*?!targetCustomerId[\s\S]*?return;/
  );
  assert.match(
    uploadSource,
    /if \(session\.kind === "INTERNAL"\)[\s\S]*?formData\.append\("visibility", internalVisibility\)[\s\S]*?formData\.append\("targetCustomerId", targetCustomerId\)/
  );
  assert.match(
    appSource,
    /method: "PATCH",[\s\S]*?visibility: nextVisibility,[\s\S]*?targetCustomerId:[\s\S]*?nextVisibility === "PARTIES" \? nextTargetCustomerId : null/
  );
});

test("customer file cards never disclose another customer's display name", () => {
  assert.match(
    appSource,
    /function relatedFileSharingLabel\(file, session = readFileSession\(\)\) \{[\s\S]*?if \(session\.kind === "CUSTOMER"\) return t\("files\.sharedWithSelf"\);[\s\S]*?relatedFileTargetDisplayName\(file\)/
  );
});
