import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, nextTick, ref, shallowRef } from "vue";
import { useDialogFocus } from "../src/composables/useDialogFocus.js";
import { usePasswordResetResult } from "../src/features/account/usePasswordResetResult.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function settle() {
  await nextTick();
  await nextTick();
}
function credentialHarness(t) {
  const canManage = ref(true),
    scope = effectScope(),
    copies = [];
  const workflow = scope.run(() =>
    usePasswordResetResult({
      canManage,
      t: (key) => key,
      writeClipboard(text) {
        const request = deferred();
        copies.push({ text, ...request });
        return request.promise;
      }
    })
  );
  t.after(() => scope.stop());
  return { scope, canManage, copies, ...workflow };
}

test("closing reset credentials wipes both fields and a late clipboard result cannot mark a new dialog copied", async (t) => {
  const h = credentialHarness(t),
    result = h.passwordResetResult;
  h.openPasswordResetResult("account-a", "first-secret");
  const pending = h.copyPasswordResetResult();
  h.closePasswordResetResult();
  assert.equal(result.username, "");
  assert.equal(result.password, "");
  h.openPasswordResetResult("account-b", "second-secret");
  h.copies[0].resolve();
  assert.equal(await pending, false);
  assert.equal(result.username, "account-b");
  assert.equal(result.copied, false);
});

test("credential copies use the captured text, reject duplicates and permit an explicit retry after failure", async (t) => {
  const h = credentialHarness(t);
  h.openPasswordResetResult("account-a", "first-secret");
  const first = h.copyPasswordResetResult();
  assert.equal(await h.copyPasswordResetResult(), false);
  assert.equal(h.copies.length, 1);
  assert.match(h.copies[0].text, /account-a/);
  assert.match(h.copies[0].text, /first-secret/);
  h.copies[0].reject(new Error("clipboard denied"));
  assert.equal(await first, false);
  assert.equal(h.passwordResetResult.copying, false);
  const retry = h.copyPasswordResetResult();
  h.copies[1].resolve();
  assert.equal(await retry, true);
  assert.equal(h.passwordResetResult.copied, true);
});

test("permission revocation closes credential results and blocks reopening or copying", async (t) => {
  const h = credentialHarness(t);
  h.openPasswordResetResult("account-a", "first-secret");
  const copy = h.copyPasswordResetResult();
  h.canManage.value = false;
  assert.equal(h.passwordResetResult.open, false);
  assert.equal(h.passwordResetResult.password, "");
  assert.equal(h.openPasswordResetResult("another", "secret"), false);
  assert.equal(await h.copyPasswordResetResult(), false);
  h.copies[0].resolve();
  assert.equal(await copy, false);
});

test("scope disposal wipes credentials and ignores a pending copy completion", async (t) => {
  const h = credentialHarness(t);
  h.openPasswordResetResult("account-a", "first-secret");
  const pending = h.copyPasswordResetResult();
  h.scope.stop();
  h.copies[0].resolve();
  assert.equal(await pending, false);
  assert.equal(h.passwordResetResult.password, "");
  assert.equal(h.openPasswordResetResult("account-b", "new-secret"), false);
});

function focusHarness(t) {
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const style = new Map([["overflow", ["scroll", "important"]]]);
  const body = {
    style: {
      getPropertyValue: (key) => style.get(key)?.[0] || "",
      getPropertyPriority: (key) => style.get(key)?.[1] || "",
      setProperty: (key, value, priority = "") => style.set(key, [value, priority]),
      removeProperty: (key) => style.delete(key)
    }
  };
  const document = { body, activeElement: body };
  Object.defineProperty(globalThis, "document", { value: document, configurable: true });
  const scopes = [];
  t.after(() => {
    for (const scope of scopes) scope.stop();
    if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument);
    else delete globalThis.document;
  });
  function element() {
    return {
      isConnected: true,
      tabIndex: 0,
      disabled: false,
      hidden: false,
      focus() {
        document.activeElement = this;
      },
      matches() {
        return this.disabled;
      },
      closest() {
        return this.hidden;
      },
      getClientRects() {
        return this.hidden ? [] : [{}];
      }
    };
  }
  function modal() {
    const first = element(),
      last = element(),
      disabled = element();
    disabled.disabled = true;
    const dialog = Object.assign(element(), {
      contains: (item) => [dialog, first, last, disabled].includes(item),
      querySelectorAll: () => [first, disabled, last]
    });
    const open = ref(false),
      busy = ref(false),
      scope = effectScope();
    scopes.push(scope);
    const controls = scope.run(() =>
      useDialogFocus({
        dialogElement: shallowRef(dialog),
        isOpen: () => open.value,
        isBusy: () => busy.value,
        close: () => {
          open.value = false;
        }
      })
    );
    return { open, busy, scope, dialog, first, last, ...controls };
  }
  function key(key, shiftKey = false) {
    return {
      key,
      shiftKey,
      prevented: false,
      preventDefault() {
        this.prevented = true;
      },
      stopPropagation() {}
    };
  }
  return { document, style, element, modal, key };
}

test("dialog focus wraps Tab, excludes disabled controls and restores its connected opener on Escape", async (t) => {
  const h = focusHarness(t),
    opener = h.element();
  opener.focus();
  const m = h.modal();
  m.open.value = true;
  await settle();
  assert.equal(h.document.activeElement, m.dialog);
  m.first.focus();
  const back = h.key("Tab", true);
  m.onDialogKeydown(back);
  assert.equal(back.prevented, true);
  assert.equal(h.document.activeElement, m.last);
  const forward = h.key("Tab");
  m.onDialogKeydown(forward);
  assert.equal(h.document.activeElement, m.first);
  m.onDialogKeydown(h.key("Escape"));
  await settle();
  assert.equal(m.open.value, false);
  assert.equal(h.document.activeElement, opener);
  assert.deepEqual(h.style.get("overflow"), ["scroll", "important"]);
});

test("busy dialogs consume Escape and retain the focus and scroll lock until submission ends", async (t) => {
  const h = focusHarness(t),
    m = h.modal();
  m.open.value = true;
  m.busy.value = true;
  await settle();
  const escape = h.key("Escape");
  m.onDialogKeydown(escape);
  await settle();
  assert.equal(escape.prevented, true);
  assert.equal(m.open.value, true);
  assert.equal(h.style.get("overflow")[0], "hidden");
  m.busy.value = false;
  m.onDialogKeydown(h.key("Escape"));
  await settle();
  assert.equal(m.open.value, false);
});

test("closing one of two dialogs does not unlock the document or steal focus from the remaining dialog", async (t) => {
  const h = focusHarness(t),
    a = h.modal(),
    b = h.modal();
  a.open.value = true;
  await settle();
  b.open.value = true;
  await settle();
  a.open.value = false;
  await settle();
  assert.equal(h.style.get("overflow")[0], "hidden");
  assert.equal(h.document.activeElement, b.dialog);
  b.open.value = false;
  await settle();
  assert.deepEqual(h.style.get("overflow"), ["scroll", "important"]);
});

test("dialog disposal releases its scroll lock and rapid closing prevents delayed focus", async (t) => {
  const h = focusHarness(t),
    opener = h.element();
  opener.focus();
  const m = h.modal();
  m.open.value = true;
  m.open.value = false;
  await settle();
  assert.equal(h.document.activeElement, opener);
  m.open.value = true;
  await settle();
  m.scope.stop();
  assert.deepEqual(h.style.get("overflow"), ["scroll", "important"]);
  assert.equal(h.document.activeElement, opener);
});

test("opening a dialog preserves focus already assigned to its primary action", async (t) => {
  const h = focusHarness(t),
    m = h.modal();
  m.open.value = true;
  await nextTick();
  m.last.focus();
  await settle();
  assert.equal(h.document.activeElement, m.last);
  m.onDialogKeydown(h.key("Tab"));
  assert.equal(h.document.activeElement, m.first);
});
