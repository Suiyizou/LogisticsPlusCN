import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, ref } from "vue";
import { useAdminAnnouncements } from "../src/features/admin/useAdminAnnouncements.js";
import { useAnnouncementEditor } from "../src/features/admin/useAnnouncementEditor.js";
import { createAnnouncementPresentation } from "../src/features/admin/announcementPresentation.js";
import { ANNOUNCEMENT_COPY } from "../src/features/admin/announcementCopy.js";
function harness(t) {
  const scope = effectScope(),
    user = ref({ id: 1, role: "ADMIN", username: "admin" });
  const calls = [];
  let editor;
  const presentation = createAnnouncementPresentation({
    getOrigin: () => "https://console.example"
  });
  const workflow = scope.run(() =>
    useAdminAnnouncements({
      currentUser: user,
      isHostBusy: () => false,
      services: {
        fetchAnnouncements: async () => ({ items: [], total: 0 }),
        createAnnouncement: async (payload) => ({ id: 1, ...payload }),
        updateAnnouncement: async (id, payload) => ({ id, ...payload }),
        publishAnnouncement: async () => {},
        disableAnnouncement: async () => {},
        deleteAnnouncement: async () => {},
        uploadImage: async (file) => {
          calls.push(file);
          return {
            url: "https://images.example/body.png",
            originalName: file.name,
            storagePath: "body.png"
          };
        }
      },
      feedback: { clear() {}, handled() {}, success() {}, error() {} },
      t: (key) => key,
      translate: (text) => text,
      copy: () => ANNOUNCEMENT_COPY["en-US"],
      today: () => "2026-10-11",
      safeUrl: presentation.safeAnnouncementUrl,
      confirmDelete: async () => true,
      editor: {
        opened: () => editor?.syncAnnouncementEditorFromMarkdown(),
        cleared: () => editor?.clearEditor(),
        insertImage: (...args) => editor?.insertAnnouncementImageIntoEditor(...args)
      }
    })
  );
  editor = scope.run(() =>
    useAnnouncementEditor({
      workflow,
      presentation,
      copy: () => ANNOUNCEMENT_COPY["en-US"],
      getDocument: () => ({ getSelection: () => null }),
      prompt: () => null
    })
  );
  t.after(() => scope.stop());
  workflow.openAnnouncementEditor();
  return { workflow, editor, calls, user, scope };
}
const image = () => new File(["image"], "body.png", { type: "image/png" });
test("announcement image picker switches insertion mode on the shared draft", (t) => {
  const h = harness(t);
  let clicks = 0;
  h.editor.announcementImageInputRef.value = { click: () => clicks++ };
  h.editor.chooseAnnouncementImage("body");
  assert.equal(h.workflow.announcementImageInsertMode.value, "body");
  assert.equal(clicks, 1);
  h.workflow.pending.value = true;
  h.editor.chooseAnnouncementImage("cover");
  assert.equal(clicks, 1);
  assert.equal(h.workflow.announcementImageInsertMode.value, "body");
});
test("announcement image input uploads the actual file and clears for reselection", async (t) => {
  const h = harness(t),
    file = image(),
    input = { files: [file], value: "selected" };
  await h.editor.handleAnnouncementImageUpload({ target: input });
  assert.deepEqual(h.calls, [file]);
  assert.equal(h.workflow.announcementForm.imageUrl, "https://images.example/body.png");
  assert.equal(input.value, "");
});
test("announcement body upload does not silently replace the cover", async (t) => {
  const h = harness(t);
  h.workflow.announcementForm.imageUrl = "https://images.example/cover.png";
  h.editor.chooseAnnouncementImage("body");
  await h.editor.handleAnnouncementImageUpload({ target: { files: [image()], value: "selected" } });
  assert.equal(h.workflow.announcementForm.imageUrl, "https://images.example/cover.png");
  assert.equal(h.calls.length, 1);
});
test("announcement input ignores unsupported files and resets the picker", async (t) => {
  const h = harness(t),
    input = {
      files: [new File(["pdf"], "document.pdf", { type: "application/pdf" })],
      value: "selected"
    };
  await h.editor.handleAnnouncementImageUpload({ target: input });
  assert.equal(h.calls.length, 0);
  assert.equal(input.value, "");
});
test("announcement cover drop chooses an image among unrelated files", async (t) => {
  const h = harness(t),
    file = image();
  h.workflow.announcementImageDragging.value = true;
  h.editor.handleAnnouncementCoverDrop({
    dataTransfer: { files: [new File(["pdf"], "document.pdf"), file] }
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.calls, [file]);
  assert.equal(h.workflow.announcementImageDragging.value, false);
});
test("announcement drag leave retains highlighting within the same drop zone", (t) => {
  const h = harness(t),
    related = {};
  h.workflow.announcementImageDragging.value = true;
  h.editor.handleAnnouncementImageDragLeave({
    currentTarget: { contains: (node) => node === related },
    relatedTarget: related
  });
  assert.equal(h.workflow.announcementImageDragging.value, true);
  h.editor.handleAnnouncementImageDragLeave({
    currentTarget: { contains: () => false },
    relatedTarget: null
  });
  assert.equal(h.workflow.announcementImageDragging.value, false);
});
test("announcement paste inserts plain text only while editing is authorized", (t) => {
  const h = harness(t);
  let prevented = 0;
  h.editor.handleAnnouncementEditorPaste({
    preventDefault: () => prevented++,
    clipboardData: {
      getData: (format) => {
        assert.equal(format, "text/plain");
        return "Plain";
      }
    }
  });
  assert.equal(prevented, 1);
  h.workflow.pending.value = true;
  h.editor.handleAnnouncementEditorPaste({ preventDefault: () => prevented++ });
  assert.equal(prevented, 1);
});
test("announcement picker and drop cannot mutate a closed or disposed draft", async (t) => {
  const h = harness(t);
  let clicks = 0;
  h.editor.announcementImageInputRef.value = { click: () => clicks++ };
  h.workflow.closeAnnouncementEditor();
  h.editor.chooseAnnouncementImage("body");
  h.editor.handleAnnouncementCoverDrop({ dataTransfer: { files: [image()] } });
  h.workflow.openAnnouncementEditor();
  h.scope.stop();
  h.editor.chooseAnnouncementImage("body");
  h.editor.handleAnnouncementCoverDrop({ dataTransfer: { files: [image()] } });
  assert.equal(clicks, 0);
  assert.equal(h.calls.length, 0);
});
