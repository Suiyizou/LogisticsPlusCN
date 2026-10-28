import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, ref } from "vue";
import {
  useAdminFilePreview,
  ADMIN_TEXT_PREVIEW_LIMIT
} from "../src/features/admin/useAdminFilePreview.js";
import { adminFilePreviewKind } from "../src/features/admin/adminFileRules.js";
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness(t) {
  const user = ref({ id: 1, role: "ADMIN", username: "admin" }),
    urls = [],
    revoked = [],
    errors = [],
    ids = [];
  const downloads = [];
  const service = { fetch: async () => new Blob(["data"], { type: "text/plain" }) };
  const scope = effectScope();
  const workflow = scope.run(() =>
    useAdminFilePreview({
      currentUser: user,
      fetchBlob: (id) => {
        ids.push(id);
        return service.fetch(id);
      },
      createObjectUrl: (blob) => {
        const url = "blob:" + urls.length;
        urls.push([url, blob]);
        return url;
      },
      revokeObjectUrl: (url) => revoked.push(url),
      t: (key, params) => key + (params?.name ? ":" + params.name : ""),
      handled: (error) => errors.push(error),
      downloadFile: async (file) => {
        downloads.push(file);
        return true;
      }
    })
  );
  t.after(() => scope.stop());
  return { workflow, user, urls, revoked, errors, ids, service, scope, downloads };
}
test("file classification preserves PDF/images/text and rejects Office and unknown binary", () => {
  assert.equal(adminFilePreviewKind(" Invoice.PDF ", "application/octet-stream"), "pdf");
  assert.equal(adminFilePreviewKind("cargo.png", "image/png"), "image");
  assert.equal(adminFilePreviewKind("data.csv", "application/octet-stream"), "text");
  for (const extension of ["docx", "xls", "pptx", "odt", "zip", "exe"])
    assert.equal(adminFilePreviewKind("data." + extension, "application/octet-stream"), "fallback");
  assert.equal(adminFilePreviewKind("README", "text/plain"), "text");
  assert.equal(adminFilePreviewKind("README", "application/json; charset=utf-8"), "text");
});
for (const [name, kind] of [["cargo.png", "image"]])
  test("preview releases " + kind + " object URLs on replacement and close", async (t) => {
    const h = harness(t);
    await h.workflow.handlePreviewShipmentFile({ id: 0, originalFileName: name });
    assert.equal(h.workflow.filePreviewDialog.kind, kind);
    await h.workflow.handlePreviewShipmentFile({ publicId: "F-2", fileName: name });
    assert.deepEqual(h.revoked, ["blob:0"]);
    h.workflow.closeFilePreviewDialog();
    h.workflow.closeFilePreviewDialog();
    assert.deepEqual(h.revoked, ["blob:0", "blob:1"]);
    assert.deepEqual(h.ids, [0, "F-2"]);
  });
test("closed preview ignores late blobs without creating an object URL", async (t) => {
  const h = harness(t),
    blob = deferred();
  h.service.fetch = () => blob.promise;
  const pending = h.workflow.handlePreviewShipmentFile({ id: 1, fileName: "a.pdf" });
  h.workflow.closeFilePreviewDialog();
  blob.resolve(new Blob(["pdf"]));
  assert.equal(await pending, false);
  assert.equal(h.urls.length, 0);
  assert.equal(h.workflow.filePreviewDialog.open, false);
  assert.equal(h.workflow.reading.value, false);
});
test("only the selected file can render, including late blob text decoding", async (t) => {
  const h = harness(t),
    decode = deferred();
  h.service.fetch = async () => ({
    type: "text/plain",
    size: 4,
    slice: () => ({ text: () => decode.promise })
  });
  const old = h.workflow.handlePreviewShipmentFile({ id: 1, fileName: "old.txt" });
  await new Promise((resolve) => setImmediate(resolve));
  h.service.fetch = async () => new Blob(["current"]);
  await h.workflow.handlePreviewShipmentFile({ id: 2, fileName: "new.txt" });
  decode.resolve("stale");
  assert.equal(await old, false);
  assert.equal(h.workflow.filePreviewDialog.text, "current");
  assert.equal(h.workflow.filePreviewDialog.name, "new.txt");
});
for (const reason of ["switch-back", "role", "dispose"])
  test("preview clears private state and URLs on " + reason, async (t) => {
    const h = harness(t);
    await h.workflow.handlePreviewShipmentFile({ id: 1, fileName: "private.png" });
    const blob = deferred();
    h.service.fetch = () => blob.promise;
    const pending = h.workflow.handlePreviewShipmentFile({ id: 2, fileName: "late.pdf" });
    if (reason === "switch-back") {
      h.user.value = { ...h.user.value, id: 2 };
      h.user.value = { ...h.user.value, id: 1 };
    }
    if (reason === "role") h.user.value = { ...h.user.value, role: "BUSINESS" };
    if (reason === "dispose") h.scope.stop();
    blob.resolve(new Blob(["late"]));
    assert.equal(await pending, false);
    assert.deepEqual(h.revoked, ["blob:0"]);
    assert.equal(h.workflow.filePreviewDialog.name, "");
    assert.equal(h.workflow.filePreviewDialog.pdfBlob, null);
    assert.equal(h.workflow.filePreviewDialog.open, false);
    assert.equal(h.urls.length, 1);
  });
test("late preview errors cannot corrupt the current preview", async (t) => {
  const h = harness(t),
    old = deferred();
  h.service.fetch = () => old.promise;
  const pending = h.workflow.handlePreviewShipmentFile({ id: 1, fileName: "old.pdf" });
  h.service.fetch = async () => new Blob(["current"]);
  await h.workflow.handlePreviewShipmentFile({ id: 2, fileName: "new.txt" });
  old.reject(Error("old failure"));
  assert.equal(await pending, false);
  assert.equal(h.workflow.filePreviewDialog.isError, false);
  assert.equal(h.workflow.filePreviewDialog.text, "current");
  assert.equal(h.errors.length, 1);
});
test("current preview errors remain visible and allow reopening", async (t) => {
  const h = harness(t);
  h.service.fetch = async () => {
    throw Error("denied");
  };
  assert.equal(await h.workflow.handlePreviewShipmentFile({ id: 1, fileName: "a.pdf" }), false);
  assert.equal(h.workflow.filePreviewDialog.isError, true);
  assert.equal(h.workflow.reading.value, false);
  h.service.fetch = async () => new Blob(["retry"]);
  assert.equal(await h.workflow.handlePreviewShipmentFile({ id: 1, fileName: "a.txt" }), true);
  assert.equal(h.workflow.filePreviewDialog.isError, false);
});
test("text previews are bounded while retaining inert HTML and Unicode content", async (t) => {
  const h = harness(t),
    text = "<script>evil()</script>\n中文\n";
  h.service.fetch = async () => new Blob([text]);
  await h.workflow.handlePreviewShipmentFile({ id: 1, fileName: "a.html" });
  assert.equal(h.workflow.filePreviewDialog.text, text);
  h.service.fetch = async () => new Blob(["x".repeat(ADMIN_TEXT_PREVIEW_LIMIT + 20)]);
  await h.workflow.handlePreviewShipmentFile({ id: 2, fileName: "large.log" });
  assert.equal(h.workflow.filePreviewDialog.text.length, ADMIN_TEXT_PREVIEW_LIMIT);
  assert.equal(
    h.workflow.filePreviewDialog.message,
    "adminWorkflow.textPreviewTruncated:large.log"
  );
});
test("Office/binary previews do not decode bytes into fake extracted text", async (t) => {
  const h = harness(t);
  h.service.fetch = async () => ({
    type: "application/octet-stream",
    text: () => {
      throw Error("must not decode");
    }
  });
  assert.equal(
    await h.workflow.handlePreviewShipmentFile({ id: 1, fileName: "insurance.docx" }),
    true
  );
  assert.equal(h.workflow.filePreviewDialog.kind, "fallback");
  assert.equal(h.workflow.filePreviewDialog.isError, false);
});
test("deleted/missing/unauthorized files cannot open and deleting only the selected file closes it", async (t) => {
  const h = harness(t);
  assert.equal(await h.workflow.handlePreviewShipmentFile({ id: 1, deletedAt: "today" }), false);
  assert.equal(await h.workflow.handlePreviewShipmentFile({ fileName: "a.pdf" }), false);
  await h.workflow.handlePreviewShipmentFile({ id: 0, fileName: "a.pdf" });
  h.workflow.closeDeletedFile(2);
  assert.equal(h.workflow.filePreviewDialog.open, true);
  h.workflow.closeDeletedFile(0);
  assert.equal(h.workflow.filePreviewDialog.open, false);
  h.user.value = { ...h.user.value, role: "CUSTOMER" };
  assert.equal(await h.workflow.handlePreviewShipmentFile({ id: 1 }), false);
  assert.deepEqual(h.ids, [0]);
});

test("PDF keeps only the authenticated Blob and clears it on close without browser object URLs", async (t) => {
  const h = harness(t);
  const blob = new Blob(["pdf bytes"], { type: "application/pdf" });
  h.service.fetch = async () => blob;
  await h.workflow.handlePreviewShipmentFile({ id: 4, fileName: "sample.pdf" });
  assert.equal(h.workflow.filePreviewDialog.pdfBlob, blob);
  assert.equal(h.workflow.filePreviewDialog.kind, "pdf");
  assert.equal(h.workflow.filePreviewDialog.url, "");
  assert.equal(h.workflow.filePreviewDialog.message, "");
  assert.equal(h.urls.length, 0);
  h.user.value = { ...h.user.value, id: 9 };
  assert.equal(h.workflow.filePreviewDialog.pdfBlob, null);
  assert.equal(h.workflow.filePreviewDialog.open, false);
});

test("PDF fallback download reuses the selected authenticated download action and cannot run after close or identity change", async (t) => {
  const h = harness(t);
  await h.workflow.handlePreviewShipmentFile({ id: 8, fileName: "private.pdf" });
  assert.equal(await h.workflow.downloadPreviewFile(), true);
  assert.equal(h.downloads[0].id, 8);
  h.workflow.closeFilePreviewDialog();
  assert.equal(await h.workflow.downloadPreviewFile(), false);
  await h.workflow.handlePreviewShipmentFile({ id: 9, fileName: "other.pdf" });
  h.user.value = { ...h.user.value, role: "BUSINESS" };
  assert.equal(await h.workflow.downloadPreviewFile(), false);
  assert.equal(h.downloads.length, 1);
});
