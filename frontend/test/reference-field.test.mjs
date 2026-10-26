import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { parse, compileScript } from "@vue/compiler-sfc";
import * as vue from "vue";
const filename = new URL("../src/components/platform/ReferenceField.vue", import.meta.url);
const { descriptor } = parse(readFileSync(filename, "utf8"));
const script = compileScript(descriptor, { id: "reference-field-test", inlineTemplate: true });
const code = ts.transpileModule(script.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const exports = {};
vm.runInNewContext(code, {
  exports,
  require: (id) => {
    assert.equal(id, "vue");
    return vue;
  }
});
const Field = exports.default;
function fixture(t, type, required, initial) {
  const value = vue.ref(initial),
    disabled = vue.ref(false),
    updates = [];
  const renderer = vue.createRenderer({
    createElement: (type) => ({ type, children: [], props: {}, parent: null }),
    createText: (text) => ({ type: "text", text }),
    createComment: (text) => ({ type: "comment", text }),
    setText: (node, text) => {
      node.text = text;
    },
    setElementText: (node, text) => {
      node.text = text;
    },
    patchProp: (node, key, _old, next) => {
      node.props[key] = next;
    },
    insert: (node, parent, anchor) => {
      if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
      node.parent = parent;
      const index = parent.children.indexOf(anchor);
      parent.children.splice(index < 0 ? parent.children.length : index, 0, node);
    },
    remove: (node) => {
      if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
    },
    parentNode: (node) => node.parent,
    nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] || null
  });
  const container = { children: [] };
  const app = renderer.createApp({
    render: () =>
      vue.h(Field, {
        field: { type, required, maxLength: 64 },
        modelValue: value.value,
        disabled: disabled.value,
        trueLabel: "Enabled",
        falseLabel: "Disabled",
        "onUpdate:modelValue": (next) => {
          updates.push(next);
          value.value = next;
        }
      })
  });
  app.mount(container);
  t.after(() => app.unmount());
  return {
    value,
    disabled,
    updates,
    node: () => container.children.find((node) => node.type !== "comment")
  };
}
test("optional boolean presents null/true/false as distinct selectable values", async (t) => {
  const h = fixture(t, "boolean", false, null);
  assert.equal(h.node().type, "select");
  assert.equal(h.node().props.value, "");
  assert.deepEqual(
    h.node().children.map((option) => option.props.value),
    ["", "true", "false"]
  );
  for (const [input, expected] of [
    ["false", false],
    ["true", true],
    ["", null]
  ]) {
    h.node().props.onChange({ target: { value: input } });
    await vue.nextTick();
    assert.equal(h.value.value, expected);
    assert.equal(h.node().props.value, input);
  }
  assert.equal(h.node().children[1].text, "Enabled");
  assert.equal(h.node().children[2].text, "Disabled");
});
test("required boolean remains a checkbox and permits a valid false value", async (t) => {
  const h = fixture(t, "boolean", true, false);
  assert.equal(h.node().type, "input");
  assert.equal(h.node().props.type, "checkbox");
  assert.equal(h.node().props.checked, false);
  assert.equal(h.node().props.required, undefined);
  h.node().props.onChange({ target: { checked: true } });
  await vue.nextTick();
  assert.equal(h.value.value, true);
  h.node().props.onChange({ target: { checked: false } });
  assert.equal(h.value.value, false);
});
test("nullable integer controls preserve explicit null and integer values", async (t) => {
  const h = fixture(t, "integer", false, null);
  assert.equal(h.node().props.value, "");
  h.node().props.onInput({ target: { value: "42" } });
  await vue.nextTick();
  assert.equal(h.value.value, 42);
  assert.equal(h.node().props.value, 42);
  h.node().props.onInput({ target: { value: "" } });
  assert.equal(h.value.value, null);
});
test("disabled fields never emit changes and malformed boolean option values are ignored", async (t) => {
  const h = fixture(t, "boolean", false, null);
  h.node().props.onChange({ target: { value: "malformed" } });
  assert.equal(h.updates.length, 0);
  h.disabled.value = true;
  await vue.nextTick();
  h.node().props.onChange({ target: { value: "true" } });
  assert.equal(h.updates.length, 0);
  assert.equal(h.node().props.disabled, true);
});
