import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, ref } from "vue";
import { usePersonalProfile } from "../src/features/account/usePersonalProfile.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness(t) {
  const currentUser = ref({
    id: 1,
    username: "business",
    role: "BUSINESS",
    displayName: "Operator"
  });
  const profiles = [],
    passwords = [],
    events = [];
  const scope = effectScope();
  const api =
    (requests) =>
    (...args) => {
      const request = { ...deferred(), args };
      requests.push(request);
      return request.promise;
    };
  const workflow = scope.run(() =>
    usePersonalProfile({
      currentUser,
      updateOwnProfile: api(profiles),
      changeOwnPassword: api(passwords),
      saveStoredUser: (user) => events.push(["store", user]),
      onUserUpdated: (user) => {
        events.push(["emit", user]);
        currentUser.value = user;
      },
      showSuccess: (key) => events.push(["success", key]),
      t: (key) => key
    })
  );
  t.after(() => scope.stop());
  function enterPassword() {
    Object.assign(workflow.personalPasswordForm, {
      currentPassword: "OldSecret1",
      newPassword: "NewSecret2",
      confirmPassword: "NewSecret2"
    });
  }
  return { workflow, currentUser, profiles, passwords, events, scope, enterPassword };
}

test("dialog only opens for a current account and repeated open preserves unsaved edits", (t) => {
  const { workflow: w, currentUser } = harness(t);
  assert.equal(w.openPersonalProfile(), true);
  w.personalProfileForm.displayName = "Unsaved";
  w.openPersonalProfile();
  assert.equal(w.personalProfileForm.displayName, "Unsaved");
  currentUser.value = null;
  assert.equal(w.personalProfileOpen.value, false);
  assert.equal(w.openPersonalProfile(), false);
});

test("profile validates both display name bounds before calling API", async (t) => {
  const { workflow: w, profiles } = harness(t);
  w.openPersonalProfile();
  for (const name of [" ", "a", "a".repeat(81)]) {
    w.personalProfileForm.displayName = name;
    assert.equal(await w.savePersonalProfile(), false);
    assert.equal(w.personalProfileError.value, "portal.displayNameRule");
  }
  assert.equal(profiles.length, 0);
});

test("profile submission captures name and serializes both own-account writes", async (t) => {
  const { workflow: w, profiles, passwords, events, currentUser, enterPassword } = harness(t);
  w.openPersonalProfile();
  enterPassword();
  w.personalProfileForm.displayName = "  Saved Operator  ";
  const save = w.savePersonalProfile();
  w.personalProfileForm.displayName = "Changed during request";
  assert.equal(await w.savePersonalProfile(), false);
  assert.equal(await w.savePersonalPassword(), false);
  assert.equal(w.closePersonalProfile(), false);
  let closed = false;
  w.beforeClose(() => {
    closed = true;
  });
  assert.equal(closed, false);
  assert.deepEqual(profiles[0].args, ["Saved Operator"]);
  assert.equal(passwords.length, 0);
  const updated = { ...currentUser.value, displayName: "Saved Operator" };
  profiles[0].resolve(updated);
  assert.equal(await save, true);
  assert.deepEqual(
    events.map(([event]) => event),
    ["store", "emit", "success"]
  );
  assert.equal(w.personalProfileOpen.value, false);
  assert.equal(w.busy.value, false);
  assert.equal(w.personalPasswordForm.currentPassword, "");
});

test("password validation reports missing, mismatch and strength errors without writes", async (t) => {
  const { workflow: w, passwords, enterPassword } = harness(t);
  w.openPersonalProfile();
  await w.savePersonalPassword();
  assert.equal(w.personalPasswordError.value, "portal.passwordFieldsRequired");
  enterPassword();
  w.personalPasswordForm.confirmPassword = "Different1";
  await w.savePersonalPassword();
  assert.equal(w.personalPasswordError.value, "portal.passwordMismatch");
  for (const password of ["abc123", "abcdefgh", "12345678", "a1".repeat(65)]) {
    w.personalPasswordForm.newPassword = password;
    w.personalPasswordForm.confirmPassword = password;
    await w.savePersonalPassword();
    assert.equal(w.personalPasswordError.value, "portal.passwordRule");
  }
  assert.equal(passwords.length, 0);
});

test("password update captures exact credentials, blocks profile save, then wipes secrets", async (t) => {
  const { workflow: w, profiles, passwords, events, enterPassword } = harness(t);
  w.openPersonalProfile();
  enterPassword();
  const save = w.savePersonalPassword();
  w.personalPasswordForm.newPassword = "OtherSecret3";
  assert.equal(await w.savePersonalPassword(), false);
  assert.equal(await w.savePersonalProfile(), false);
  assert.equal(profiles.length, 0);
  assert.deepEqual(passwords[0].args, ["OldSecret1", "NewSecret2"]);
  passwords[0].resolve();
  assert.equal(await save, true);
  assert.equal(w.personalProfileOpen.value, true);
  assert.equal(w.personalPasswordSuccess.value, "portal.passwordChanged");
  assert.deepEqual(
    { ...w.personalPasswordForm },
    { currentPassword: "", newPassword: "", confirmPassword: "" }
  );
  assert.equal(events.length, 0);
});

test("closing clears credentials and messages, and reopening loads latest name", (t) => {
  const { workflow: w, currentUser, enterPassword } = harness(t);
  w.openPersonalProfile();
  enterPassword();
  w.personalProfileError.value = "Old error";
  w.personalPasswordError.value = "Old password error";
  w.personalPasswordSuccess.value = "Old success";
  let closed = false;
  w.beforeClose(() => {
    closed = true;
  });
  assert.equal(closed, true);
  assert.equal(w.personalProfileForm.displayName, "");
  assert.equal(w.personalPasswordForm.newPassword, "");
  currentUser.value = { ...currentUser.value, displayName: "Latest" };
  w.openPersonalProfile();
  assert.equal(w.personalProfileForm.displayName, "Latest");
  assert.equal(w.personalProfileError.value, "");
  assert.equal(w.personalPasswordError.value, "");
  assert.equal(w.personalPasswordSuccess.value, "");
});

test("background name refresh preserves unsaved form but account role change closes it", (t) => {
  const { workflow: w, currentUser, enterPassword } = harness(t);
  w.openPersonalProfile();
  enterPassword();
  w.personalProfileForm.displayName = "Unsaved";
  currentUser.value = { ...currentUser.value, displayName: "Server Name" };
  assert.equal(w.personalProfileForm.displayName, "Unsaved");
  assert.equal(w.personalProfileOpen.value, true);
  currentUser.value = { ...currentUser.value, role: "ADMIN" };
  assert.equal(w.personalProfileOpen.value, false);
  assert.equal(w.personalPasswordForm.currentPassword, "");
});

test("late profile response after account switch cannot store or emit old user", async (t) => {
  const { workflow: w, currentUser, profiles, events } = harness(t);
  const oldUser = { ...currentUser.value };
  w.openPersonalProfile();
  const oldSave = w.savePersonalProfile();
  currentUser.value = { id: 2, username: "other", role: "BUSINESS", displayName: "Other" };
  w.openPersonalProfile();
  const newSave = w.savePersonalProfile();
  profiles[0].resolve(oldUser);
  assert.equal(await oldSave, false);
  assert.equal(w.busy.value, true);
  assert.equal(w.personalProfileOpen.value, true);
  assert.equal(events.length, 0);
  profiles[1].resolve({ ...currentUser.value });
  assert.equal(await newSave, true);
  assert.equal(events[0][1].id, 2);
});

test("late password failure after logout does not repopulate cleared secrets or errors", async (t) => {
  const { workflow: w, currentUser, passwords, enterPassword } = harness(t);
  w.openPersonalProfile();
  enterPassword();
  const save = w.savePersonalPassword();
  currentUser.value = null;
  passwords[0].reject(new Error("Old account error"));
  assert.equal(await save, false);
  assert.equal(w.personalPasswordError.value, "");
  assert.equal(w.personalPasswordForm.currentPassword, "");
  assert.equal(w.busy.value, false);
});

test("external forced close invalidates old response when dialog reopens", async (t) => {
  const { workflow: w, profiles, currentUser, events } = harness(t);
  w.openPersonalProfile();
  const save = w.savePersonalProfile();
  w.personalProfileOpen.value = false;
  w.openPersonalProfile();
  w.personalProfileForm.displayName = "Reopened edit";
  profiles[0].resolve({ ...currentUser.value, displayName: "Old result" });
  assert.equal(await save, false);
  assert.equal(w.personalProfileForm.displayName, "Reopened edit");
  assert.equal(events.length, 0);
});

test("profile API failure releases gate and allows explicit retry", async (t) => {
  const { workflow: w, profiles, currentUser, events } = harness(t);
  w.openPersonalProfile();
  const first = w.savePersonalProfile();
  profiles[0].reject(new Error("Profile rejected"));
  assert.equal(await first, false);
  assert.equal(w.personalProfileError.value, "Profile rejected");
  assert.equal(w.busy.value, false);
  assert.equal(events.length, 0);
  const retry = w.savePersonalProfile();
  assert.equal(w.personalProfileError.value, "");
  profiles[1].resolve({ ...currentUser.value });
  assert.equal(await retry, true);
});

test("password API failure shows fallback and does not falsely report success", async (t) => {
  const { workflow: w, passwords, enterPassword } = harness(t);
  w.openPersonalProfile();
  enterPassword();
  const save = w.savePersonalPassword();
  passwords[0].reject({});
  assert.equal(await save, false);
  assert.equal(w.personalPasswordError.value, "portal.passwordChangeFailed");
  assert.equal(w.personalPasswordSuccess.value, "");
  assert.equal(w.busy.value, false);
  w.closePersonalProfile();
  assert.equal(w.personalPasswordForm.currentPassword, "");
});

test("scope disposal clears pending password state and prevents further API calls", async (t) => {
  const { workflow: w, passwords, scope, enterPassword } = harness(t);
  w.openPersonalProfile();
  enterPassword();
  const save = w.savePersonalPassword();
  scope.stop();
  assert.equal(w.personalPasswordForm.newPassword, "");
  assert.equal(w.personalProfileOpen.value, false);
  passwords[0].resolve();
  assert.equal(await save, false);
  assert.equal(w.personalPasswordSuccess.value, "");
  assert.equal(w.openPersonalProfile(), false);
  assert.equal(await w.savePersonalPassword(), false);
  assert.equal(passwords.length, 1);
});

test("scope disposal suppresses stored-user updates from pending profile save", async (t) => {
  const { workflow: w, profiles, currentUser, scope, events } = harness(t);
  w.openPersonalProfile();
  const save = w.savePersonalProfile();
  scope.stop();
  profiles[0].resolve({ ...currentUser.value });
  assert.equal(await save, false);
  assert.equal(events.length, 0);
  assert.equal(w.busy.value, false);
});
