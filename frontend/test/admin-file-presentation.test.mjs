import test from "node:test";
import assert from "node:assert/strict";
import { createAdminFilePresentation } from "../src/features/admin/adminFilePresentation.js";
function setup() {
  let language = "zh";
  const dates = [];
  const view = createAdminFilePresentation({
    t: (key) => `${language}:${key}`,
    roleText: (role) => `${language}:${role}`,
    formatDate: (date) => {
      dates.push(date);
      return `${language}:${date}`;
    }
  });
  return {
    view,
    dates,
    setLanguage: (value) => {
      language = value;
    }
  };
}
test("file sizes retain unit boundaries and reject invalid values", () => {
  const { view } = setup();
  for (const [size, expected] of [
    [undefined, "0 B"],
    [0, "0 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1048576, "1.0 MB"],
    [1536, "1.5 KB"],
    [-1, "-"],
    [NaN, "-"],
    [Infinity, "-"]
  ])
    assert.equal(view.formatFileSize(size), expected);
});
test("dates validate before delegating and consult the live formatter", () => {
  const { view, dates, setLanguage } = setup();
  for (const date of [undefined, null, "", "not-a-date"]) assert.equal(view.fileDate(date), "-");
  assert.deepEqual(dates, []);
  assert.equal(view.fileDate("2026-10-12T08:00:00Z"), "zh:2026-10-12T08:00:00Z");
  setLanguage("en");
  assert.equal(view.fileDate("2026-10-12"), "en:2026-10-12");
});
test("identifiers preserve zero and missing markers without exposing null", () => {
  const { view } = setup();
  for (const id of [undefined, null, ""]) assert.equal(view.identifier(id), "-");
  assert.equal(view.identifier(0), "0");
  assert.equal(view.identifier("SH-1"), "SH-1");
});
test("file row keys distinguish zero and use public identifiers first", () => {
  const { view } = setup();
  assert.equal(view.shipmentFileKey({ id: 0 }), "0");
  assert.equal(view.shipmentFileKey({ id: 0, publicId: "F-0" }), "F-0");
  assert.equal(view.shipmentFileKey({}), "");
});
test("shipment identifiers retain legacy nested and flat field fallbacks", () => {
  const { view } = setup();
  assert.equal(view.shipmentPublicId({ shipmentPublicId: 0, shipmentId: 2 }), "0");
  assert.equal(view.shipmentPublicId({ shipment: { publicId: "SH-2" }, shipmentId: 2 }), "SH-2");
  assert.equal(view.shipmentPublicId({ shipmentId: "SH-3" }), "SH-3");
  assert.equal(view.shipmentPublicId({ shipmentPublicId: null }), "-");
});
test("references accept flat strings, legacy objects and nested primary references", () => {
  const { view } = setup();
  for (const [record, expected] of [
    [{ shipmentReference: "BL · 123" }, "BL · 123"],
    [{ reference: { referenceType: "BL", referenceNo: "123" } }, "BL · 123"],
    [{ shipmentReference: { type: "BK", normalizedReferenceNo: "456" } }, "BK · 456"],
    [{ shipment: { primaryReference: { type: "BL", number: "789" } } }, "BL · 789"],
    [{ referenceType: "BK", referenceNo: "123" }, "BK · 123"],
    [{ shipment: { referenceType: "BL", referenceNo: "987" } }, "BL · 987"],
    [{ shipmentReference: {} }, "-"],
    [{}, "-"]
  ])
    assert.equal(view.shipmentFileReference(record), expected);
});
test("uploader fallbacks preserve zero and consult live role labels", () => {
  const { view, setLanguage } = setup();
  assert.equal(
    view.shipmentFileUploader({ uploaderDisplayName: "A", uploader: { displayName: "B" } }),
    "A"
  );
  assert.equal(view.shipmentFileUploader({ uploader: { displayName: "B" } }), "B");
  assert.equal(view.shipmentFileUploader({ ownerDisplayName: "C" }), "C");
  assert.equal(view.shipmentFileUploader({ uploadedBy: "D" }), "D");
  assert.equal(view.shipmentFileUploader({}), "-");
  assert.equal(
    view.shipmentFileUploaderDetail({ uploaderUserId: 0, uploaderRoleSnapshot: "ADMIN" }),
    "zh:ADMIN · ID 0"
  );
  setLanguage("en");
  assert.equal(
    view.shipmentFileUploaderDetail({ uploader: { role: "BUSINESS", id: 2 } }),
    "en:BUSINESS · ID 2"
  );
  assert.equal(view.shipmentFileUploaderDetail({ uploaderUserId: null }), "-");
});
test("visibility labels normalize legacy values and follow language changes", () => {
  const { view, setLanguage } = setup();
  for (const [code, label] of [
    ["shipper", "Shipper"],
    ["CONSIGNEE", "Consignee"],
    ["OVERSEA_AGENT", "OverseaAgent"],
    ["INTERNAL", "Internal"],
    ["PARTIES", "Parties"],
    ["PUBLIC", "Public"]
  ])
    assert.equal(view.shipmentFileVisibilityText(code), `zh:admin.files.visibility${label}`);
  assert.equal(view.shipmentFileVisibilityText("legacy"), "zh:admin.files.visibilityShipper");
  assert.equal(view.shipmentFileVisibilityClass(undefined), "shipper");
  setLanguage("en");
  assert.equal(view.shipmentFileVisibilityText("public"), "en:admin.files.visibilityPublic");
});
test("deleted timestamps override stale ready or pending statuses", () => {
  const { view } = setup();
  for (const status of ["READY", "pending", "DELETED"]) {
    const file = { status, deletedAt: "2026-10-12T08:00:00Z" };
    assert.equal(view.shipmentFileStatusText(file), "zh:admin.files.statusDeleted");
    assert.equal(view.isShipmentFileDeleted(file), true);
    assert.equal(view.isShipmentFilePending(file), false);
  }
});
test("pending and quarantine labels share normalized state and action rules", () => {
  const { view, setLanguage } = setup();
  assert.equal(
    view.shipmentFileStatusText({ status: "quarantined" }),
    "zh:admin.files.statusQuarantined"
  );
  assert.equal(view.isShipmentFilePending({ status: "pending" }), true);
  assert.equal(view.isShipmentFilePending({ status: "READY" }), false);
  assert.equal(view.shipmentFileStatusText({}), "zh:admin.files.statusReady");
  setLanguage("en");
  assert.equal(view.shipmentFileStatusText({ status: "pending" }), "en:admin.files.statusPending");
});
