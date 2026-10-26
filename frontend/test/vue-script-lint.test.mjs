import assert from "node:assert/strict";
import test from "node:test";
import { lintVueScriptSources } from "../../scripts/lib/vue-script-lint.mjs";

test("Vue binding guard understands setup macros, imports and browser APIs", async () => {
  const result = await lintVueScriptSources([
    {
      file: "frontend/src/GuardFixture.vue",
      source: `<template><b>{{ title }}</b></template>
    <script setup>
      import { ref } from 'vue';
      const props = defineProps({ title: String });
      const emit = defineEmits(['update']);
      const title = ref(props.title);
      function save() { window.localStorage.setItem('title', title.value); emit('update', title.value); }
      defineExpose({ save });
    </script>`
    }
  ]);
  assert.equal(result.checked, 1);
  assert.equal(result.results.length, 0);
});

test("Vue binding guard catches missing page helpers despite a successful SFC build", async () => {
  const result = await lintVueScriptSources([
    {
      file: "frontend/src/GuardFixture.vue",
      source: "<script setup>function showInfo() { clearPageMessage(); }</script>"
    }
  ]);
  assert.equal(result.results[0].messages[0].ruleId, "no-undef");
  assert.match(result.results[0].messages[0].message, /clearPageMessage/);
});

test("normal and setup scripts can share bindings; generated helper names are resolved", async () => {
  const result = await lintVueScriptSources([
    {
      file: "frontend/src/GuardFixture.vue",
      source: `<script>const label = 'Shared'; export default { name: 'Fixture' };</script>
    <script setup>const title = label; defineExpose({ title });</script>`
    }
  ]);
  assert.equal(result.checked, 1);
  assert.equal(result.results.length, 0);
});

test("unsupported TS scripts are explicitly reported rather than claiming type coverage", async () => {
  const result = await lintVueScriptSources([
    {
      file: "frontend/src/GuardFixture.vue",
      source: "<script setup lang='ts'>const label: string = 'Typed';</script>"
    }
  ]);
  assert.equal(result.checked, 0);
  assert.deepEqual(result.skipped, ["frontend/src/GuardFixture.vue"]);
});

test("Vue script syntax errors fail the quality guard", async () => {
  const result = await lintVueScriptSources([
    { file: "frontend/src/GuardFixture.vue", source: "<script setup>const broken = ;</script>" }
  ]);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].fatalErrorCount, 1);
});

test("setup-template-only missing handlers fail, even when the script is valid", async () => {
  const result = await lintVueScriptSources([
    {
      file: "frontend/src/TemplateFixture.vue",
      source: `<template><button v-for="row in rows" :key="row.id" :disabled="!isTransferableCustomer(row)" @click="missingHandler(row)">{{ row.id }}</button></template>
    <script setup>const rows = [];</script>`
    }
  ]);
  const messages = result.results.flatMap((item) => item.messages);
  assert.equal(messages.length, 2);
  assert.ok(messages.every((item) => item.ruleId === "vue-bindings/setup"));
  assert.ok(messages.some((item) => item.message.includes("isTransferableCustomer")));
  assert.ok(messages.some((item) => item.message.includes("missingHandler")));
});

test("template guard respects props, imports, slots, loops, globals and literal text", async () => {
  const result = await lintVueScriptSources([
    {
      file: "frontend/src/TemplateFixture.vue",
      source: `<template><div>_ctx.literal</div><div>{{ '_ctx.literal' }}</div>
      <Widget v-slot="{ page }"><div v-for="row in rows" :key="row.id" @click="save(row)">{{ page.title }} {{ title }} {{ Math.max(row.value, 0) }} {{ $attrs.id }}</div></Widget></template>
    <script setup>import Widget from './Widget.vue'; defineProps({ title: String, rows: Array }); function save(row) { return row; }</script>`
    }
  ]);
  assert.equal(result.results.length, 0);
});
