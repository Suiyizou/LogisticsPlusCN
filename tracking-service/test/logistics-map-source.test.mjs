import assert from "node:assert/strict";
import test from "node:test";
import { createLogisticsMapSource } from "../public/logistics-map-source.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function pageResult(page, total, prefix = "SYNTHETIC") {
  const offset = (page - 1) * 100;
  return {
    page,
    total,
    totalPages: Math.ceil(total / 100),
    items: Array.from({ length: Math.min(100, total - offset) }, (_, index) => ({
      shipmentId: `${prefix}-${offset + index + 1}`
    }))
  };
}

test("walks all reported pages with the same scope and publishes the result together", async () => {
  const requests = [];
  const changes = [];
  const laterPage = deferred();
  const pageRequested = deferred();
  const source = createLogisticsMapSource({
    fetchPage: async (params, signal) => {
      assert.equal(signal.aborted, false);
      requests.push(params);
      if (params.page === 2) {
        pageRequested.resolve();
        await laterPage.promise;
      }
      return pageResult(params.page, 207);
    },
    onChange: (state) => changes.push(state)
  });

  const result = source.setScope("customer-1", { customerId: "customer-1", unfinishedOnly: true });
  assert.equal(source.setScope("customer-1"), result);
  await pageRequested.promise;
  assert.deepEqual(source.getState(), { records: [], loading: true, error: null });
  laterPage.resolve();
  const state = await result;
  assert.equal(state.records.length, 207);
  assert.equal(state.records[206].shipmentId, "SYNTHETIC-207");
  assert.equal(changes.length, 2);
  assert.deepEqual(
    requests,
    [1, 2, 3].map((page) => ({
      page,
      pageSize: 100,
      customerId: "customer-1",
      unfinishedOnly: true
    }))
  );
});

test("aborts a previous scope and rejects its stale success even if fetch ignores the signal", async () => {
  const oldFetch = deferred();
  const oldStarted = deferred();
  const changes = [];
  let oldSignal;
  const source = createLogisticsMapSource({
    fetchPage: ({ account }, signal) => {
      if (account === "old") {
        oldSignal = signal;
        oldStarted.resolve();
        return oldFetch.promise;
      }
      return pageResult(1, 1, "NEW");
    },
    onChange: (state) => changes.push(state)
  });

  const pending = source.setScope("old-role-token", { account: "old" });
  await oldStarted.promise;
  const replacement = source.setScope("new-role-token", { account: "new" });
  assert.equal(oldSignal.aborted, true);
  assert.equal((await replacement).records[0].shipmentId, "NEW-1");
  oldFetch.resolve(pageResult(1, 1, "OLD"));
  assert.equal(await pending, null);
  assert.equal(changes.length, 3);
  assert.deepEqual(source.getState().records, [{ shipmentId: "NEW-1" }]);
  await source.setScope(null);
  assert.deepEqual(source.getState(), { records: [], loading: false, error: null });
});

test("publishes page errors without exposing loaded records, and refresh can recover", async () => {
  let errorKind = "network";
  const source = createLogisticsMapSource({
    fetchPage: ({ page }) => {
      if (page === 2 && errorKind === "network") throw new Error("request failed");
      if (page === 2 && errorKind === "pagination") return pageResult(2, 201);
      return pageResult(page, 102);
    }
  });

  const failed = await source.setScope("internal");
  assert.equal(failed.error.message, "request failed");
  assert.deepEqual(failed.records, []);
  errorKind = "pagination";
  const changed = await source.refresh();
  assert.match(changed.error.message, /incomplete page/);
  assert.deepEqual(changed.records, []);
  errorKind = null;
  const recovered = await source.refresh();
  assert.equal(recovered.records.length, 102);
  assert.equal(recovered.error, null);
});

test("destroy cancels a request and prevents future page requests and publication", async () => {
  const pendingPage = deferred();
  const started = deferred();
  const changes = [];
  let requestSignal;
  const source = createLogisticsMapSource({
    fetchPage: (_params, signal) => {
      requestSignal = signal;
      started.resolve();
      return pendingPage.promise;
    },
    onChange: (state) => changes.push(state)
  });
  const pending = source.setScope("internal");
  await started.promise;
  source.destroy();
  assert.equal(requestSignal.aborted, true);
  pendingPage.resolve(pageResult(1, 1));
  await pending;
  await source.setScope("new-scope");
  assert.equal(changes.length, 1);
  assert.deepEqual(source.getState(), { records: [], loading: false, error: null });
});

test("accepts the endpoint's page one response with no records and zero total pages", async () => {
  let fetches = 0;
  const source = createLogisticsMapSource({
    fetchPage: ({ page }) => {
      fetches += 1;
      assert.equal(page, 1);
      return { items: [], total: 0, page: 1, totalPages: 0 };
    }
  });
  assert.deepEqual(await source.setScope("empty"), { records: [], loading: false, error: null });
  assert.equal(fetches, 1);
});
