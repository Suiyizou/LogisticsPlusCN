import assert from "node:assert/strict";
import test from "node:test";
import { createAdminLlmPresentation } from "../src/features/admin/adminLlmPresentation.js";
import { adminWorkflowMessages } from "../src/i18n/adminWorkflowMessages.js";
function harness() {
  let locale = "zh-CN";
  const presentation = createAdminLlmPresentation({
    t: (key, params = {}) => {
      const template = adminWorkflowMessages[locale][key.replace("adminWorkflow.", "")];
      return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name]));
    }
  });
  return { presentation, setLocale: (value) => (locale = value) };
}
test("model state distinguishes unavailable, disabled, missing key and enabled", () => {
  const { presentation: p } = harness();
  assert.equal(p.status(null), "未加载");
  assert.equal(p.status({}), "未加载");
  assert.equal(p.status({ enabled: false, apiKeyConfigured: true }), "已关闭");
  assert.equal(p.status({ enabled: true, apiKeyConfigured: false }), "缺少 Key");
  assert.equal(p.status({ enabled: true, apiKeyConfigured: true }), "已启用");
});
test("configured keys with absent or blank previews do not interpolate undefined", () => {
  const { presentation: p } = harness();
  for (const apiKeyPreview of [undefined, "", "   "])
    assert.equal(p.keyStatus({ apiKeyConfigured: true, apiKeyPreview }), "已配置");
  assert.equal(
    p.keyStatus({ apiKeyConfigured: true, apiKeyPreview: " ***last " }),
    "已配置 ***last"
  );
});
test("key presentation respects unconfigured state and never reads raw credentials", () => {
  const { presentation: p } = harness();
  assert.equal(p.keyStatus(null), "未加载");
  assert.equal(p.keyStatus({}), "未加载");
  assert.equal(p.keyStatus({ apiKeyConfigured: false, apiKeyPreview: "stale" }), "未配置");
  assert.equal(p.keyStatus({ apiKeyConfigured: true, apiKey: "SECRET" }), "已配置");
});
test("existing presentation follows language changes without recreating the workflow", () => {
  const { presentation: p, setLocale } = harness();
  assert.equal(p.status({ enabled: false }), "已关闭");
  setLocale("en-US");
  assert.equal(p.status({ enabled: false }), "Disabled");
  assert.equal(p.keyStatus({ apiKeyConfigured: true }), "Configured");
  assert.equal(
    p.keyStatus({ apiKeyConfigured: true, apiKeyPreview: "***last" }),
    "Configured ***last"
  );
});
