import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as vue from "vue";
function loadTs(path, dependencies) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  const exports = {};
  vm.runInNewContext(
    code,
    {
      exports,
      require: (id) => {
        if (!(id in dependencies)) throw Error(`Unexpected module dependency: ${id}`);
        return dependencies[id];
      },
      AbortController,
      Error,
      Number,
      Reflect
    },
    { filename: path }
  );
  return exports;
}
const model = loadTs("../src/generated/service-catalog-model.ts", {});
const { useServiceCatalog } = loadTs("../src/modules/service-catalog/useServiceCatalog.ts", {
  vue,
  "../../generated/service-catalog-api": {
    createServiceCatalogApi: () => {
      throw Error("Tests must inject authorized API");
    }
  },
  "../../generated/service-catalog-model": model,
  "../../services/apiClient.js": { markApiErrorHandled: () => {} }
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const row = (id, version = 2) => ({
  id,
  version,
  code: id,
  name: "Service " + id,
  description: null,
  enabled: true,
  createdAt: "2026-10-14T00:00:00Z",
  updatedAt: "2026-10-14T00:00:00Z"
});
const pageResult = (items = []) => ({
  items,
  total: items.length,
  page: 0,
  pageSize: 20,
  totalPages: items.length ? 1 : 0
});
function fixture(t, overrides = {}) {
  const calls = { reads: [], creates: [], updates: [], handled: [] };
  const api = {
    list: async (...args) => {
      calls.reads.push(args);
      return pageResult();
    },
    create: async (...args) => {
      calls.creates.push(args);
      return row("new");
    },
    update: async (...args) => {
      calls.updates.push(args);
      return row(args[0]);
    },
    ...overrides
  };
  const scope = vue.effectScope(),
    runtime = scope.run(() =>
      useServiceCatalog((key) => key, { api, handled: (error) => calls.handled.push(error) })
    );
  t.after(() => scope.stop());
  return { runtime, scope, calls };
}
test("reference workflow aborts stale reads and ignores old successes, errors and loading completion", async (t) => {
  const reads = [],
    pending = [deferred(), deferred()];
  const h = fixture(t, {
    list: (...args) => {
      reads.push(args);
      return pending[reads.length - 1].promise;
    }
  });
  const old = h.runtime.refresh();
  h.runtime.query.value = "fresh";
  const current = h.runtime.refresh();
  assert.equal(reads[0][3].aborted, true);
  assert.equal(reads[1][2], "fresh");
  pending[0].resolve(pageResult([row("OLD")]));
  await old;
  assert.equal(h.runtime.loading.value, true);
  assert.equal(h.runtime.rows.value.length, 0);
  pending[1].resolve(pageResult([row("CURRENT")]));
  assert.equal(await current, true);
  assert.equal(h.runtime.rows.value[0].id, "CURRENT");
  assert.equal(h.runtime.loading.value, false);
});
test("409 keeps edited values and dialog open, marks the error handled and preserves submitted version", async (t) => {
  const conflict = Object.assign(Error("stale write"), { status: 409 });
  const calls = [];
  const h = fixture(t, {
    update: async (...args) => {
      calls.push(args);
      throw conflict;
    }
  });
  const source = row("A", 3);
  h.runtime.open(source);
  h.runtime.setDraft("name", "  My changed service  ");
  source.version = 99;
  assert.equal(await h.runtime.save(), false);
  assert.equal(h.runtime.visible.value, true);
  assert.equal(h.runtime.draft.name, "  My changed service  ");
  assert.equal(h.runtime.error.value, "serviceCatalog.stale");
  assert.equal(h.runtime.saving.value, false);
  assert.equal(calls[0][0], "A");
  assert.equal(calls[0][1].version, 3);
  assert.equal(calls[0][1].values.name, "My changed service");
  assert.equal(h.calls.handled[0], conflict);
  assert.equal(h.calls.reads.length, 0);
});
test("saving freezes its target and prevents close, replacement draft, double submission or edits", async (t) => {
  const pending = deferred(),
    calls = [];
  const h = fixture(t, {
    update: (...args) => {
      calls.push(args);
      return pending.promise;
    }
  });
  h.runtime.open(row("A"));
  h.runtime.setDraft("name", "Submitted name");
  const saving = h.runtime.save();
  assert.equal(h.runtime.open(row("B")), false);
  assert.equal(h.runtime.close(), false);
  h.runtime.setDialogOpen(false);
  h.runtime.setDraft("name", "Late edit");
  assert.equal(h.runtime.visible.value, true);
  assert.equal(h.runtime.draft.name, "Submitted name");
  assert.equal(await h.runtime.save(), false);
  assert.equal(calls.length, 1);
  pending.resolve(row("A", 3));
  assert.equal(await saving, true);
  assert.equal(h.runtime.visible.value, false);
});
test("disposing aborts real read/write signals and late writes cannot refresh, reopen or mutate disposed UI", async (t) => {
  const read = deferred(),
    write = deferred();
  let readSignal, writeSignal;
  const h = fixture(t, {
    list: (...args) => {
      readSignal = args[3];
      return read.promise;
    },
    create: (...args) => {
      writeSignal = args[1];
      return write.promise;
    }
  });
  const reading = h.runtime.refresh();
  h.runtime.open();
  const writing = h.runtime.save();
  h.scope.stop();
  assert.equal(readSignal.aborted, true);
  assert.equal(writeSignal.aborted, true);
  read.resolve(pageResult([row("late")]));
  write.resolve(row("saved-remotely"));
  assert.equal(await reading, false);
  assert.equal(await writing, false);
  assert.equal(h.runtime.rows.value.length, 0);
  assert.equal(await h.runtime.refresh(), false);
  assert.equal(h.runtime.open(), false);
  assert.equal(await h.runtime.save(), false);
});
test("search and page changes issue one request each and empty/out-of-range pages recover safely", async (t) => {
  const calls = [];
  const h = fixture(t, {
    list: async (...args) => {
      calls.push(args);
      return args[0] > 0
        ? { ...pageResult([row("last")]), totalPages: 1 }
        : pageResult([row("first")]);
    }
  });
  h.runtime.page.value = 4;
  await h.runtime.search();
  await vue.nextTick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 0);
  assert.equal(await h.runtime.changePage(5), true);
  assert.equal(calls.length, 3);
  assert.equal(h.runtime.page.value, 0);
  assert.equal(h.runtime.rows.value[0].id, "first");
  assert.equal(await h.runtime.changePage(-1), false);
  assert.equal(await h.runtime.changePage(0.5), false);
  assert.equal(calls.length, 3);
});

test("invalid pagination metadata fails once instead of entering a refresh loop", async (t) => {
  let calls = 0;
  const h = fixture(t, {
    list: async () => {
      calls++;
      return { items: [], total: 1, totalPages: 0 };
    }
  });
  assert.equal(await h.runtime.refresh(), false);
  assert.equal(calls, 1);
  assert.equal(h.runtime.error.value, "serviceCatalog.error");
  assert.equal(h.runtime.loading.value, false);
});
