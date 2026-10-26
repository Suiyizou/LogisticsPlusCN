import assert from "node:assert/strict";
import test from "node:test";
import { effectScope } from "vue";
import { useWorkspaceFeedback } from "../src/features/shared/useWorkspaceFeedback.js";

function harness(context) {
  const callbacks = [],
    cancelled = [],
    handled = [],
    scope = effectScope();
  let language = "zh";
  const feedback = scope.run(() =>
    useWorkspaceFeedback({
      t: (key, params) => `${language}:${key}${params ? `:${params.count}` : ""}`,
      markApiErrorHandled: (error) => handled.push(error),
      scheduler: {
        setTimeout: (callback, duration) => {
          callbacks.push({ callback, duration });
          return callbacks.length;
        },
        clearTimeout: (id) => cancelled.push(id)
      }
    })
  );
  context.after(() => scope.stop());
  return {
    ...feedback,
    scope,
    callbacks,
    cancelled,
    handled,
    language: (value) => {
      language = value;
    }
  };
}

test("workspace error classification retains user messages and hides transport details", (context) => {
  const h = harness(context);
  for (const [message, key] of [
    ["operational data unavailable", "customers.refreshReturnedNoData"],
    ["Tracked shipment not found", "customers.trackedShipmentNotFound"],
    ["explicit operator access required", "customers.shipmentAccessRequired"],
    ["Playwright browser channel timeout", "customers.friendlyError"],
    ["", "fallback"]
  ]) {
    const error = new Error(message);
    h.showError(error, "fallback");
    assert.equal(h.pageMessage.value, `zh:${key}`);
    assert.equal(h.messageIsError.value, true);
    assert.equal(h.handled.at(-1), error);
  }
  h.showError(new Error("Please complete the client code"), "fallback");
  assert.equal(h.pageMessage.value, "Please complete the client code");
});

test("success clears prior errors, follows current language and replaced timers cannot hide new feedback", (context) => {
  const h = harness(context);
  h.showError(new Error("failure"), "fallback");
  h.showSuccess("first", { count: 1 });
  assert.equal(h.pageMessage.value, "");
  assert.equal(h.messageIsError.value, false);
  assert.equal(h.toastMessage.value, "zh:first:1");
  h.language("en");
  h.showSuccess("second");
  assert.ok(h.cancelled.includes(1));
  h.callbacks[0].callback();
  assert.equal(h.toastMessage.value, "en:second");
  assert.equal(h.callbacks[1].duration, 2600);
  h.callbacks[1].callback();
  assert.equal(h.toastMessage.value, "");
});

test("info and explicit clear reset error styling without interfering with an active success toast", (context) => {
  const h = harness(context);
  h.showSuccess("saved");
  h.showError(new Error("failure"), "fallback");
  h.showInfo("refreshing");
  assert.equal(h.pageMessage.value, "zh:refreshing");
  assert.equal(h.messageIsError.value, false);
  assert.equal(h.toastMessage.value, "zh:saved");
  h.clearMessage();
  assert.equal(h.pageMessage.value, "");
  assert.equal(h.toastMessage.value, "zh:saved");
});

test("workspace disposal clears timers and feedback and ignores late workflow callbacks", (context) => {
  const h = harness(context);
  h.showSuccess("saved");
  h.showInfo("loading");
  h.scope.stop();
  assert.ok(h.cancelled.includes(1));
  h.callbacks[0].callback();
  h.showSuccess("late");
  h.showInfo("late");
  h.showError(new Error("late failure"), "fallback");
  assert.equal(h.pageMessage.value, "");
  assert.equal(h.toastMessage.value, "");
  assert.equal(h.handled.length, 0);
  assert.equal(h.callbacks.length, 1);
});
