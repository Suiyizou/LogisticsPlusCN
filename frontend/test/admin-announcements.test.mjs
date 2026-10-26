import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, nextTick, ref } from "vue";
import { useAdminAnnouncements } from "../src/features/admin/useAdminAnnouncements.js";
import { ANNOUNCEMENT_COPY } from "../src/features/admin/announcementCopy.js";

const admin = (id = 1) => ({ id, username: `admin-${id}`, role: "ADMIN" });
const record = (id = 1, status = "DRAFT") => ({
  id,
  title: `Notice ${id}`,
  contentMarkdown: "Body",
  displayDate: "2026-10-11",
  audience: "ALL",
  status
});
const image = () => new File(["image"], "cover.png", { type: "image/png" });
const uploaded = (name = "cover") => ({
  url: `https://images.example/${name}.png`,
  storagePath: `${name}.png`,
  originalName: `${name}.png`
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness(t) {
  const user = ref(admin()),
    hostBusy = ref(false),
    calls = [],
    events = [];
  const implementations = {
    fetchAnnouncements: async () => ({ items: [record()], total: 1 }),
    createAnnouncement: async (payload) => ({ ...record(2), ...payload }),
    updateAnnouncement: async (id, payload) => ({ ...record(id, "PUBLISHED"), ...payload }),
    publishAnnouncement: async () => {},
    disableAnnouncement: async () => {},
    deleteAnnouncement: async () => {},
    uploadImage: async () => uploaded(),
    confirmDelete: async () => true
  };
  const invoke =
    (name) =>
    (...args) => {
      calls.push([name, ...args]);
      return implementations[name](...args);
    };
  const scope = effectScope();
  const workflow = scope.run(() =>
    useAdminAnnouncements({
      currentUser: user,
      isHostBusy: () => hostBusy.value,
      services: Object.fromEntries(
        Object.keys(implementations)
          .filter((name) => name !== "confirmDelete")
          .map((name) => [name, invoke(name)])
      ),
      t: (key) => key,
      translate: (text) => text,
      copy: () => ANNOUNCEMENT_COPY["en-US"],
      today: () => "2026-10-11",
      safeUrl: (value) => (/^https?:\/\//.test(value) ? value : ""),
      confirmDelete: invoke("confirmDelete"),
      editor: {
        opened: () => events.push(["opened"]),
        cleared: () => events.push(["cleared"]),
        insertImage: (...args) => events.push(["image", ...args])
      },
      feedback: {
        clear: () => events.push(["clear"]),
        handled: (error) => events.push(["handled", error]),
        success: (text) => events.push(["success", text]),
        error: (text) => events.push(["error", text])
      }
    })
  );
  t.after(() => scope.stop());
  return {
    workflow,
    user,
    hostBusy,
    scope,
    implementations,
    calls,
    events,
    called: (name) => calls.filter((call) => call[0] === name)
  };
}
function fill(h) {
  h.workflow.openAnnouncementEditor();
  Object.assign(h.workflow.announcementForm, {
    title: " Notice ",
    contentMarkdown: " Body ",
    imageUrl: "",
    illustrationRef: ""
  });
}
test("announcement pagination accepts only the latest response", async (t) => {
  const h = harness(t),
    first = deferred(),
    second = deferred();
  h.implementations.fetchAnnouncements = () => first.promise;
  const old = h.workflow.loadAnnouncementPageWithoutLoading();
  h.implementations.fetchAnnouncements = () => second.promise;
  const latest = h.workflow.changeAnnouncementPage(2);
  second.resolve({ items: [record(21)], total: 21 });
  assert.equal(await latest, true);
  first.resolve({ items: [record()], total: 1 });
  assert.equal(await old, false);
  assert.equal(h.workflow.announcements.value[0].id, 21);
  assert.equal(h.workflow.announcementPage.value, 2);
  assert.equal(h.workflow.busy.value, false);
});
test("initialization can read while the host is busy; user refresh cannot", async (t) => {
  const h = harness(t);
  h.hostBusy.value = true;
  assert.equal(await h.workflow.loadAnnouncementPage(), false);
  assert.equal(await h.workflow.loadAnnouncementPageWithoutLoading(), true);
  assert.equal(h.called("fetchAnnouncements").length, 1);
});
test("page size changes reset to the first page and reject invalid numbers", async (t) => {
  const h = harness(t);
  h.workflow.announcementPage.value = 3;
  assert.equal(await h.workflow.changeAnnouncementPageSize(10), true);
  assert.deepEqual(h.called("fetchAnnouncements")[0][1], { page: 0, size: 10 });
  for (const page of [0, -1, 1.5, NaN])
    assert.equal(await h.workflow.changeAnnouncementPage(page), false);
  assert.equal(await h.workflow.changeAnnouncementPageSize(0), false);
});
test("empty last page corrects once using server total", async (t) => {
  const h = harness(t);
  h.implementations.fetchAnnouncements = async ({ page }) => ({
    items: page === 0 ? [record()] : [],
    total: 1
  });
  await h.workflow.changeAnnouncementPage(3);
  assert.equal(h.workflow.announcementPage.value, 1);
  assert.deepEqual(
    h.called("fetchAnnouncements").map((call) => call[1].page),
    [2, 0]
  );
});
test("a newer selection wins over an older page correction", async (t) => {
  const h = harness(t),
    correction = deferred();
  h.implementations.fetchAnnouncements = async ({ page }) =>
    page === 2 ? { items: [], total: 1 } : correction.promise;
  const old = h.workflow.changeAnnouncementPage(3);
  await Promise.resolve();
  h.implementations.fetchAnnouncements = async () => ({ items: [record(21)], total: 30 });
  await h.workflow.changeAnnouncementPage(2);
  correction.resolve({ items: [record()], total: 1 });
  assert.equal(await old, false);
  assert.equal(h.workflow.announcementPage.value, 2);
});
test("late read errors cannot overwrite newer feedback", async (t) => {
  const h = harness(t),
    late = deferred();
  h.implementations.fetchAnnouncements = () => late.promise;
  const old = h.workflow.loadAnnouncementPage();
  h.implementations.fetchAnnouncements = async () => ({ items: [record(2)], total: 1 });
  await h.workflow.loadAnnouncementPage();
  late.reject(Error("old"));
  assert.equal(await old, false);
  assert.equal(h.events.filter((e) => e[0] === "error").length, 0);
});
test("current read failure reports the error and releases busy", async (t) => {
  const h = harness(t);
  h.implementations.fetchAnnouncements = async () => {
    throw Error("read failed");
  };
  assert.equal(await h.workflow.loadAnnouncementPage(), false);
  assert.ok(h.events.some((e) => e[0] === "error" && e[1] === "read failed"));
  assert.equal(h.workflow.busy.value, false);
});
test("missing total falls back to returned records", async (t) => {
  const h = harness(t);
  h.implementations.fetchAnnouncements = async () => ({ items: [record(), record(2)] });
  await h.workflow.loadAnnouncementPage();
  assert.equal(h.workflow.announcementTotal.value, 2);
});
test("editor preserves zero id, legacy visibility, stored image and local display date", async (t) => {
  const h = harness(t);
  h.workflow.openAnnouncementEditor({
    ...record(0),
    audience: undefined,
    visibility: "employee",
    imageUrl: "/api/public/announcement-images/test.png"
  });
  await nextTick();
  assert.equal(h.workflow.editingAnnouncementId.value, 0);
  assert.equal(h.workflow.announcementForm.audience, "EMPLOYEE");
  assert.equal(h.workflow.announcementUploadedPath.value, "announcement-images/test.png");
  assert.ok(h.events.some((e) => e[0] === "opened"));
  h.workflow.closeAnnouncementEditor();
  fill(h);
  assert.equal(h.workflow.announcementForm.displayDate, "2026-10-11");
});
test("closed drafts never run a queued DOM editor callback", async (t) => {
  const h = harness(t);
  fill(h);
  h.workflow.closeAnnouncementEditor();
  await nextTick();
  assert.equal(h.events.filter((e) => e[0] === "opened").length, 0);
});
test("required fields and unsafe cover URLs prevent API submission", async (t) => {
  const h = harness(t);
  h.workflow.openAnnouncementEditor();
  assert.equal(await h.workflow.handleSaveAnnouncement(), false);
  assert.equal(h.workflow.announcementDialogError.value, ANNOUNCEMENT_COPY["en-US"].required);
  Object.assign(h.workflow.announcementForm, {
    title: "Title",
    contentMarkdown: "Body",
    imageUrl: "javascript:alert(1)"
  });
  assert.equal(await h.workflow.handleSaveAnnouncement(), false);
  assert.equal(h.called("createAnnouncement").length, 0);
});
test("save trims a fixed snapshot and prevents duplicate submissions and closing", async (t) => {
  const h = harness(t),
    saving = deferred();
  fill(h);
  h.implementations.createAnnouncement = () => saving.promise;
  const task = h.workflow.handleSaveAnnouncement();
  assert.equal(h.workflow.canEdit.value, false);
  assert.equal(h.workflow.closeAnnouncementEditor(), false);
  assert.equal(await h.workflow.handleSaveAnnouncement(), false);
  h.workflow.announcementForm.title = "changed programmatically";
  assert.equal(h.called("createAnnouncement")[0][1].title, "Notice");
  assert.equal(h.called("createAnnouncement")[0][1].imageUrl, null);
  assert.equal(Object.isFrozen(h.called("createAnnouncement")[0][1]), true);
  saving.resolve(record(2));
  assert.equal(await task, true);
  assert.equal(h.called("createAnnouncement").length, 1);
  assert.equal(h.workflow.announcementDialogOpen.value, false);
});
test("editing published content omits status and uses existing id", async (t) => {
  const h = harness(t);
  h.workflow.openAnnouncementEditor(record(0, "PUBLISHED"));
  await h.workflow.handleSaveAnnouncement();
  assert.equal(h.called("updateAnnouncement")[0][1], 0);
  assert.equal("status" in h.called("updateAnnouncement")[0][2], false);
  assert.equal(h.called("createAnnouncement").length, 0);
});
test("failed save retains the draft and displays a local error", async (t) => {
  const h = harness(t);
  fill(h);
  h.implementations.createAnnouncement = async () => {
    throw Error("save failed");
  };
  assert.equal(await h.workflow.handleSaveAnnouncement(), false);
  assert.equal(h.workflow.announcementDialogOpen.value, true);
  assert.equal(h.workflow.announcementForm.title, " Notice ");
  assert.equal(h.workflow.announcementDialogError.value, "save failed");
  assert.equal(h.workflow.busy.value, false);
});
test("committed create survives failed refresh and closes the submitted draft", async (t) => {
  const h = harness(t);
  fill(h);
  h.implementations.fetchAnnouncements = async () => {
    throw Error("refresh failed");
  };
  assert.equal(await h.workflow.handleSaveAnnouncement(), true);
  assert.equal(h.workflow.announcements.value[0].id, 2);
  assert.equal(h.workflow.announcementDialogOpen.value, false);
  assert.ok(h.events.some((e) => e[1] === "adminWorkflow.savedRefreshFailed"));
  assert.equal(h.called("createAnnouncement").length, 1);
});
test("committed update survives failed refresh with server publication state", async (t) => {
  const h = harness(t);
  await h.workflow.loadAnnouncementPage();
  h.workflow.openAnnouncementEditor(record());
  h.workflow.announcementForm.title = "Updated";
  h.implementations.fetchAnnouncements = async () => {
    throw Error("refresh");
  };
  assert.equal(await h.workflow.handleSaveAnnouncement(), true);
  assert.equal(h.workflow.announcements.value[0].status, "PUBLISHED");
  assert.equal(h.workflow.announcements.value[0].title, "Updated");
});
for (const [method, api, status] of [
  ["handlePublishAnnouncement", "publishAnnouncement", "PUBLISHED"],
  ["handleDeactivateAnnouncement", "disableAnnouncement", "DISABLED"]
]) {
  test(`${api} updates the known list and preview even if refresh fails`, async (t) => {
    const h = harness(t);
    await h.workflow.loadAnnouncementPage();
    h.workflow.openAnnouncementPreview(record());
    h.implementations.fetchAnnouncements = async () => {
      throw Error("refresh");
    };
    assert.equal(await h.workflow[method](record()), true);
    assert.equal(h.workflow.announcements.value[0].status, status);
    assert.equal(h.workflow.announcementPreviewRecord.value.status, status);
    assert.equal(h.called(api).length, 1);
  });
}
test("delete confirmation fixes the target and blocks duplicate actions", async (t) => {
  const h = harness(t),
    confirmation = deferred(),
    target = record();
  await h.workflow.loadAnnouncementPage();
  h.implementations.confirmDelete = () => confirmation.promise;
  const task = h.workflow.handleDeleteAnnouncement(target);
  target.id = 9;
  assert.equal(await h.workflow.handleDeleteAnnouncement(record(2)), false);
  assert.equal(Object.isFrozen(h.called("confirmDelete")[0][1]), true);
  confirmation.resolve(true);
  assert.equal(await task, true);
  assert.equal(h.called("deleteAnnouncement")[0][1], 1);
});
test("cancelled confirmation performs no deletion", async (t) => {
  const h = harness(t);
  h.implementations.confirmDelete = async () => false;
  assert.equal(await h.workflow.handleDeleteAnnouncement(record()), false);
  assert.equal(h.called("deleteAnnouncement").length, 0);
  assert.equal(h.workflow.busy.value, false);
});
test("delete retains local removal and clears preview after a failed refresh", async (t) => {
  const h = harness(t);
  await h.workflow.loadAnnouncementPage();
  h.workflow.openAnnouncementPreview(record());
  h.implementations.fetchAnnouncements = async () => {
    throw Error("refresh");
  };
  assert.equal(await h.workflow.handleDeleteAnnouncement(record()), true);
  assert.equal(h.workflow.announcements.value.length, 0);
  assert.equal(h.workflow.announcementTotal.value, 0);
  assert.equal(h.workflow.announcementPreviewRecord.value, null);
});
test("list mutations cannot interfere with an open draft", async (t) => {
  const h = harness(t);
  fill(h);
  assert.equal(await h.workflow.handlePublishAnnouncement(record()), false);
  assert.equal(await h.workflow.handleDeleteAnnouncement(record()), false);
  assert.equal(h.called("publishAnnouncement").length, 0);
});
test("cover upload fills image and attribution, while body upload invokes the editor", async (t) => {
  const h = harness(t);
  fill(h);
  assert.equal(await h.workflow.uploadAnnouncementImageFile(image()), true);
  assert.equal(h.workflow.announcementForm.imageUrl, uploaded().url);
  assert.equal(h.workflow.announcementForm.illustrationRef, "cover.png");
  h.workflow.announcementForm.illustrationRef = "Custom credit";
  assert.equal(
    await h.workflow.uploadAnnouncementImageFile(image(), { insertIntoEditor: true }),
    true
  );
  assert.deepEqual(
    h.events.find((e) => e[0] === "image"),
    ["image", uploaded().url, "cover.png"]
  );
  assert.equal(h.workflow.announcementForm.illustrationRef, "Custom credit");
});
test("uploading prevents save and duplicate upload", async (t) => {
  const h = harness(t),
    upload = deferred();
  fill(h);
  h.implementations.uploadImage = () => upload.promise;
  const task = h.workflow.uploadAnnouncementImageFile(image());
  assert.equal(await h.workflow.handleSaveAnnouncement(), false);
  assert.equal(await h.workflow.uploadAnnouncementImageFile(image()), false);
  upload.resolve(uploaded());
  await task;
  assert.equal(h.called("uploadImage").length, 1);
});
test("late cover upload preserves a manually changed URL", async (t) => {
  const h = harness(t),
    upload = deferred();
  fill(h);
  h.implementations.uploadImage = () => upload.promise;
  const task = h.workflow.uploadAnnouncementImageFile(image());
  h.workflow.announcementForm.imageUrl = "https://manual.example/image.png";
  upload.resolve(uploaded());
  assert.equal(await task, false);
  assert.equal(h.workflow.announcementForm.imageUrl, "https://manual.example/image.png");
  assert.equal(h.workflow.announcementImageUploading.value, false);
});
test("closing during upload cannot populate a new draft or clear its pending flag", async (t) => {
  const h = harness(t),
    oldUpload = deferred(),
    newUpload = deferred();
  fill(h);
  h.implementations.uploadImage = () => oldUpload.promise;
  const old = h.workflow.uploadAnnouncementImageFile(image(), { insertIntoEditor: true });
  h.workflow.closeAnnouncementEditor();
  fill(h);
  h.implementations.uploadImage = () => newUpload.promise;
  const latest = h.workflow.uploadAnnouncementImageFile(image());
  oldUpload.resolve(uploaded("old"));
  assert.equal(await old, false);
  assert.equal(h.workflow.announcementImageUploading.value, true);
  assert.equal(h.events.filter((e) => e[0] === "image").length, 0);
  newUpload.resolve(uploaded("new"));
  assert.equal(await latest, true);
  assert.equal(h.workflow.announcementForm.imageUrl, uploaded("new").url);
});
test("empty or unsafe upload response reports failure instead of success", async (t) => {
  const h = harness(t);
  fill(h);
  for (const url of ["", "javascript:alert(1)"]) {
    h.implementations.uploadImage = async () => ({ url });
    assert.equal(await h.workflow.uploadAnnouncementImageFile(image()), false);
    assert.equal(h.workflow.announcementDialogError.value, ANNOUNCEMENT_COPY["en-US"].uploadFailed);
  }
  assert.equal(h.events.filter((e) => e[0] === "success").length, 0);
});
test("upload failure keeps the original draft and releases the upload flag", async (t) => {
  const h = harness(t);
  fill(h);
  h.workflow.announcementImageInsertMode.value = "body";
  h.implementations.uploadImage = async () => {
    throw Error("upload failed");
  };
  assert.equal(await h.workflow.uploadAnnouncementImageFile(image()), false);
  assert.equal(h.workflow.announcementForm.title, " Notice ");
  assert.equal(h.workflow.announcementImageUploading.value, false);
  assert.equal(h.workflow.announcementImageInsertMode.value, "cover");
});
for (const end of ["switch-back", "revoke", "dispose"]) {
  test(`late save responses are discarded after ${end}`, async (t) => {
    const h = harness(t),
      save = deferred();
    fill(h);
    h.implementations.createAnnouncement = () => save.promise;
    const task = h.workflow.handleSaveAnnouncement();
    if (end === "switch-back") {
      h.user.value = admin(2);
      h.user.value = admin();
    } else if (end === "revoke") h.user.value = { ...admin(), role: "BUSINESS" };
    else h.scope.stop();
    save.resolve(record(2));
    assert.equal(await task, false);
    assert.equal(h.workflow.announcementDialogOpen.value, false);
    assert.equal(h.workflow.announcements.value.length, 0);
    assert.equal(h.workflow.busy.value, false);
    assert.equal(h.events.filter((e) => e[0] === "success").length, 0);
  });
}
test("session changes invalidate upload, read and preview state", async (t) => {
  const h = harness(t),
    upload = deferred(),
    read = deferred();
  fill(h);
  h.workflow.openAnnouncementPreview(record());
  h.implementations.uploadImage = () => upload.promise;
  const uploadTask = h.workflow.uploadAnnouncementImageFile(image());
  h.implementations.fetchAnnouncements = () => read.promise;
  const readTask = h.workflow.loadAnnouncementPageWithoutLoading();
  h.user.value = admin(2);
  upload.resolve(uploaded());
  read.resolve({ items: [record()], total: 1 });
  assert.equal(await uploadTask, false);
  assert.equal(await readTask, false);
  assert.equal(h.workflow.announcementPreviewRecord.value, null);
  assert.equal(h.workflow.announcementForm.title, "");
  assert.equal(h.workflow.busy.value, false);
});
test("session changes during delete confirmation prevent the destructive API", async (t) => {
  const h = harness(t),
    confirmation = deferred();
  h.implementations.confirmDelete = () => confirmation.promise;
  const task = h.workflow.handleDeleteAnnouncement(record());
  h.user.value = admin(2);
  confirmation.resolve(true);
  assert.equal(await task, false);
  assert.equal(h.called("deleteAnnouncement").length, 0);
});
test("display name changes preserve the current draft", async (t) => {
  const h = harness(t);
  fill(h);
  h.user.value = { ...h.user.value, displayName: "Renamed" };
  assert.equal(h.workflow.announcementDialogOpen.value, true);
  assert.equal(h.workflow.announcementForm.title, " Notice ");
});
test("unauthorized and host-busy entry points do not call services", async (t) => {
  const h = harness(t);
  h.hostBusy.value = true;
  assert.equal(h.workflow.openAnnouncementEditor(), false);
  assert.equal(await h.workflow.handlePublishAnnouncement(record()), false);
  h.hostBusy.value = false;
  h.user.value = { ...admin(), role: "CUSTOMER" };
  assert.equal(await h.workflow.loadAnnouncementPageWithoutLoading(), false);
  assert.equal(h.workflow.openAnnouncementEditor(), false);
  assert.equal(await h.workflow.handleDeleteAnnouncement(record()), false);
  assert.equal(h.calls.length, 0);
});
test("announcement locale copy exposes matching keys for both languages", () => {
  assert.deepEqual(
    Object.keys(ANNOUNCEMENT_COPY["en-US"]).sort(),
    Object.keys(ANNOUNCEMENT_COPY["zh-CN"]).sort()
  );
});
