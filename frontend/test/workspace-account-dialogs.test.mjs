import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { computed, effectScope, reactive, ref, watch } from "vue";
import { compileScript, compileTemplate, parse } from "vue/compiler-sfc";
import ts from "typescript";
import { usePersonalProfile } from "../src/features/account/usePersonalProfile.js";

const source = readFileSync(
  new URL("../src/components/workspace/WorkspaceAccountDialogs.vue", import.meta.url),
  "utf8"
);
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness(t) {
  const props = reactive({
    mode: "",
    currentUser: { id: 1, username: "operator", role: "BUSINESS", displayName: "Operator" }
  });
  const events = [],
    profiles = [],
    passwords = [];
  const ast = ts.createSourceFile(
    "account.ts",
    parse(source).descriptor.scriptSetup.content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const body = ast.statements
    .filter((node) => !ts.isImportDeclaration(node))
    .map((node) => node.getText(ast))
    .join("\n");
  const javascript = ts.transpileModule(body, {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext }
  }).outputText;
  const request =
    (queue) =>
    (...args) => {
      const item = { ...deferred(), args };
      queue.push(item);
      return item.promise;
    };
  const scope = effectScope();
  const state = scope.run(() =>
    new Function(
      "defineProps",
      "withDefaults",
      "defineEmits",
      "computed",
      "ref",
      "watch",
      "usePersonalProfile",
      "updateOwnProfile",
      "changeOwnPassword",
      "saveStoredUser",
      "t",
      javascript + "\nreturn { workflow, section, notice };"
    )(
      () => props,
      (value) => value,
      () =>
        (...args) => {
          events.push(args);
          if (args[0] === "close") props.mode = "";
        },
      computed,
      ref,
      watch,
      usePersonalProfile,
      request(profiles),
      request(passwords),
      (user) => events.push(["stored", user]),
      (key) => key
    )
  );
  t.after(() => scope.stop());
  return { ...state, props, events, profiles, passwords, scope };
}
function enterPassword(w) {
  Object.assign(w.personalPasswordForm, {
    currentPassword: "OriginalSecret1",
    newPassword: "UpdatedSecret2",
    confirmPassword: "UpdatedSecret2"
  });
}

test("shell account modes open only their requested section and clear sensitive state on mode change or close", (t) => {
  const h = harness(t),
    w = h.workflow;
  assert.equal(w.personalProfileOpen.value, false);
  h.props.mode = "profile";
  assert.equal(w.personalProfileOpen.value, true);
  assert.equal(h.section.value, "profile");
  assert.equal(w.personalProfileForm.displayName, "Operator");
  enterPassword(w);
  w.personalProfileForm.displayName = "Unsaved edit";
  h.props.mode = "password";
  assert.equal(h.section.value, "password");
  assert.equal(w.personalPasswordForm.currentPassword, "");
  assert.equal(w.personalPasswordForm.newPassword, "");
  assert.equal(w.personalProfileForm.displayName, "Operator");
  enterPassword(w);
  h.props.mode = "";
  assert.equal(w.personalProfileOpen.value, false);
  assert.equal(w.personalPasswordForm.confirmPassword, "");
  assert.equal(w.personalProfileForm.displayName, "");
});

test("profile uses the original own-profile API and publishes the saved user; dialog close resets shell mode", async (t) => {
  const h = harness(t),
    w = h.workflow;
  h.props.mode = "profile";
  w.personalProfileForm.displayName = "  Updated Operator  ";
  const save = w.savePersonalProfile();
  assert.deepEqual(h.profiles[0].args, ["Updated Operator"]);
  const user = { ...h.props.currentUser, displayName: "Updated Operator" };
  h.profiles[0].resolve(user);
  assert.equal(await save, true);
  assert.deepEqual(
    h.events.map(([kind]) => kind),
    ["stored", "user-updated", "close"]
  );
  assert.equal(h.props.mode, "");
  assert.equal(h.notice.value, "portal.profileSaved");
  h.props.mode = "profile";
  assert.equal(h.notice.value, "");
  assert.equal(w.closePersonalProfile(), true);
  assert.equal(h.props.mode, "");
});

test("password changes preserve existing signed-in semantics and wipe credentials without storing them", async (t) => {
  const h = harness(t),
    w = h.workflow;
  h.props.mode = "password";
  enterPassword(w);
  const save = w.savePersonalPassword();
  assert.deepEqual(h.passwords[0].args, ["OriginalSecret1", "UpdatedSecret2"]);
  h.passwords[0].resolve();
  assert.equal(await save, true);
  assert.equal(h.props.mode, "password");
  assert.equal(w.personalPasswordSuccess.value, "portal.passwordChanged");
  assert.deepEqual(
    { ...w.personalPasswordForm },
    { currentPassword: "", newPassword: "", confirmPassword: "" }
  );
  assert.deepEqual(h.events, []);
});

test("switching account panels invalidates an in-flight profile save without disturbing a newer password request", async (t) => {
  const h = harness(t),
    w = h.workflow;
  h.props.mode = "profile";
  const oldSave = w.savePersonalProfile();
  h.props.mode = "password";
  enterPassword(w);
  const newSave = w.savePersonalPassword();
  h.profiles[0].resolve({ ...h.props.currentUser, displayName: "Stale result" });
  assert.equal(await oldSave, false);
  assert.equal(w.busy.value, true);
  assert.equal(h.props.mode, "password");
  assert.deepEqual(h.events, []);
  h.passwords[0].reject(new Error("Password rejected"));
  assert.equal(await newSave, false);
  assert.equal(w.personalPasswordError.value, "Password rejected");
  assert.equal(w.personalProfileError.value, "");
});

test("logout or identity changes clear fields and suppress delayed own-account results", async (t) => {
  const h = harness(t),
    w = h.workflow;
  h.props.mode = "password";
  enterPassword(w);
  const save = w.savePersonalPassword();
  h.props.currentUser = null;
  assert.equal(h.props.mode, "");
  assert.equal(w.personalPasswordForm.currentPassword, "");
  h.passwords[0].resolve();
  assert.equal(await save, false);
  assert.equal(w.personalPasswordSuccess.value, "");
  assert.equal(
    h.events.some(([kind]) => ["stored", "user-updated", "logout"].includes(kind)),
    false
  );
  h.props.mode = "profile";
  assert.equal(h.props.mode, "", "No dialog may open without an authenticated current user");
});

test("account wrapper compiles and retains the shared API/session/error implementation", () => {
  const { descriptor, errors } = parse(source);
  assert.deepEqual(errors, []);
  const script = compileScript(descriptor, { id: "workspace-account" });
  const template = compileTemplate({
    source: descriptor.template.content,
    filename: "WorkspaceAccountDialogs.vue",
    id: "workspace-account",
    compilerOptions: { bindingMetadata: script.bindings }
  });
  assert.deepEqual(template.errors, []);
  assert.match(source, /from "..\/..\/services\/adminApi"/);
  assert.match(source, /from "..\/..\/services\/authSession"/);
  assert.match(source, /:section="section"/);
  assert.doesNotMatch(source, /fetch\(|localStorage|sessionStorage|saveSession/);
});
