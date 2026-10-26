import assert from "node:assert/strict";
import test from "node:test";
import {
  assertModuleMessageData,
  collectFileChineseLines,
  isModuleMessageFile
} from "../scripts/lib/i18n-source-boundaries.mjs";

const path = "src/modules/service-catalog/messages.js";
const bundle = `export default { "zh-CN": { sample: { title: "服务", metadata: [1, -2, true, false, null] } }, "en-US": { sample: { title: "Service" } } };`;

test("only the actual one-level module messages.js discovery path is a translation file", () => {
  assert.equal(isModuleMessageFile(path), true);
  for (const candidate of [
    "src/modules/service-catalog/runtime.js",
    "src/modules/service-catalog/customerMessages.js",
    "src/modules/service-catalog/nested/messages.js",
    "src/modules/messages.js",
    "src/features/service-catalog/messages.js",
    "src/modules/service-catalog/messages.ts"
  ])
    assert.equal(isModuleMessageFile(candidate), false, candidate);
});

test("formal bilingual data-only bundles are exempt from the hardcoded text scan", () => {
  assert.doesNotThrow(() => assertModuleMessageData(path, bundle));
  assert.deepEqual(collectFileChineseLines(path, bundle), []);
});

test("other module JavaScript and nested messages files retain Chinese detection", () => {
  for (const candidate of [
    "src/modules/service-catalog/runtime.js",
    "src/modules/service-catalog/customerMessages.js",
    "src/modules/service-catalog/nested/messages.js"
  ]) {
    assert.deepEqual(collectFileChineseLines(candidate, 'const label = "服务";'), [
      { file: candidate, line: 1, text: 'const label = "服务";' }
    ]);
  }
});

test("translation filenames cannot conceal imports or top-level executable statements", () => {
  for (const source of [
    `import value from "./runtime.js"; ${bundle}`,
    `console.log("隐藏"); ${bundle}`,
    `${bundle} console.log("隐藏");`,
    `const values = {}; export default values;`
  ])
    assert.throws(() => collectFileChineseLines(path, source), /data-only/);
});

test("translation values reject computed keys, runtime expressions, spreads and functions", () => {
  for (const value of [
    `{ ["computed"]: "隐藏" }`,
    `{ ...other }`,
    `{ title: translate("隐藏") }`,
    `{ title }`,
    `{ title() { return "隐藏"; } }`,
    `{ get title() { return "隐藏"; } }`,
    `{ title: () => "隐藏" }`,
    `{ title: [ ...values ] }`,
    `{ title: \`value \${runtime}\` }`
  ]) {
    const source = `export default { "zh-CN": ${value}, "en-US": {} };`;
    assert.throws(() => collectFileChineseLines(path, source), /data-only/);
  }
});

test("translation objects reject duplicate and prototype keys", () => {
  for (const value of ['{ title: "一", title: "二" }', '{ "__proto__": {} }'])
    assert.throws(
      () => assertModuleMessageData(path, `export default { "zh-CN": ${value}, "en-US": {} };`),
      /data-only/
    );
});

test("translation bundles must parse and provide both installed locale objects", () => {
  for (const source of [
    "export default {",
    "export default [];",
    'export default { "zh-CN": {} };',
    'export default { "zh-CN": "服务", "en-US": {} };'
  ])
    assert.throws(() => collectFileChineseLines(path, source));
});
