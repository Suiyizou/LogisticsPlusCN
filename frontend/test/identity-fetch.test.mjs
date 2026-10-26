import test from "node:test";
import assert from "node:assert/strict";
import { createIdentityFetch, assertResponseIdentity } from "../src/services/identityFetch.js";
const url = "https://example.test/api/business/service-catalog";
test("employee and customer tokens are mutually exclusive and caller headers cannot override identity", async () => {
  for (const headerName of ["X-Auth-Token", "X-Customer-Token"]) {
    let sent;
    const send = createIdentityFetch({
      readToken: () => "actual",
      expire: () => {},
      headerName,
      fetchImpl: async (request) => {
        sent = request;
        return new Response("{}");
      }
    });
    await send(url, { headers: { "X-Auth-Token": "smuggled", "X-Customer-Token": "smuggled" } });
    assert.equal(sent.headers.get(headerName), "actual");
    assert.equal(
      sent.headers.get(headerName === "X-Auth-Token" ? "X-Customer-Token" : "X-Auth-Token"),
      null
    );
  }
});
test("an expired response never clears a newly logged-in session", async () => {
  let token = "old",
    release,
    expired = 0;
  const send = createIdentityFetch({
    readToken: () => token,
    expire: () => expired++,
    headerName: "X-Auth-Token",
    fetchImpl: () => new Promise((resolve) => (release = resolve))
  });
  const pending = send(url);
  token = "new";
  release(new Response("{}", { status: 401 }));
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(expired, 0);
});
test("a successful response from a previous identity is discarded", async () => {
  let token = "old",
    release;
  const send = createIdentityFetch({
    readToken: () => token,
    expire: () => {},
    headerName: "X-Auth-Token",
    fetchImpl: () => new Promise((resolve) => (release = resolve))
  });
  const pending = send(url);
  token = "new";
  release(new Response('{"items":[{"secret":"old account"}]}'));
  await assert.rejects(pending, { name: "AbortError" });
});
test("current-session 401 expires once and an unauthenticated call never reaches network", async () => {
  let token = "old",
    calls = 0,
    expired = 0;
  const send = createIdentityFetch({
    readToken: () => token,
    expire: () => {
      expired++;
      token = "";
    },
    headerName: "X-Customer-Token",
    fetchImpl: async () => {
      calls++;
      return new Response("{}", { status: 401 });
    }
  });
  assert.equal((await send(url)).status, 401);
  await assert.rejects(send(url), { status: 401 });
  assert.equal(calls, 1);
  assert.equal(expired, 1);
});
test("request cancellation and JSON body are preserved", async () => {
  const abort = new AbortController();
  let sent;
  const send = createIdentityFetch({
    readToken: () => "a",
    expire: () => {},
    headerName: "X-Auth-Token",
    fetchImpl: async (request) => {
      sent = request;
      return new Response("{}");
    }
  });
  await send(url, { method: "POST", body: '{"name":"test"}', signal: abort.signal });
  assert.equal(await sent.text(), '{"name":"test"}');
  abort.abort();
  assert.equal(sent.signal.aborted, true);
});

test("identity is checked again after delayed JSON parsing", async () => {
  let token = "old";
  const send = createIdentityFetch({
    readToken: () => token,
    expire: () => {},
    headerName: "X-Auth-Token",
    fetchImpl: async () => new Response('{"items":[]}')
  });
  const response = await send(url);
  assertResponseIdentity(response);
  await response.json();
  token = "new";
  assert.throws(() => assertResponseIdentity(response), { name: "AbortError" });
});
