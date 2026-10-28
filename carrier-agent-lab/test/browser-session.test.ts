import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { connect, createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { BrowserSession, filterCarrierBrowserState } from "../src/browser/browser-session.js";
import { createBrowserTools } from "../src/agent/tools.js";
import { assertNavigableUrl } from "../src/browser/navigation-policy.js";
import { SafeNetworkProxy } from "../src/browser/safe-network-proxy.js";

test("browser request guard blocks private subresources", async () => {
  const browser = new BrowserSession({
    headless: true,
    channel: null,
    timeoutMs: 5_000,
    artifactDir: join(tmpdir(), "carrier-agent-request-policy"),
    navigation: { mode: "public-https" },
  });
  const guard = (browser as unknown as {
    assertRequestUrl: (url: string, navigation: boolean) => Promise<void>;
  }).assertRequestUrl.bind(browser);
  await assert.rejects(guard("https://127.0.0.1/private", false), /private hosts are blocked/);
  await assert.rejects(guard("https://[::ffff:127.0.0.1]/private", false), /private hosts are blocked/);
  await assert.rejects(guard("https://[::ffff:10.0.0.1]/private", false), /private hosts are blocked/);
  await assert.rejects(guard("https://[::]/private", false), /private hosts are blocked/);
  await assert.doesNotReject(guard("https://8.8.8.8/public", false));
  await assert.rejects(guard("https://8.8.8.8:8443/private", false), /standard HTTPS port/);
  await assert.rejects(guard("https://user:secret@8.8.8.8/private", false), /URL credentials/);
  await assert.doesNotReject(guard("data:text/plain,safe", false));
  await assert.rejects(
    assertNavigableUrl("https://REFERENCE.attacker.invalid/", {
      mode: "official-only",
      allowedHosts: ["oocl.com"],
    }),
    /outside the official carrier allowlist/,
  );
});

test("saved login state is restricted to the selected carrier, excluding unrelated identities", () => {
  const state = filterCarrierBrowserState({
    cookies: [
      { name: "session", value: "test-secret", domain: ".maersk.com", path: "/" },
      { name: "another-session", value: "other-secret", domain: ".oocl.com", path: "/" },
      { name: "lookalike", value: "secret", domain: "maersk.com.attacker.example", path: "/" },
    ],
    origins: [
      { origin: "https://www.maersk.com", localStorage: [] },
      { origin: "https://www.oocl.com", localStorage: [] },
    ],
  }, ["maersk.com"]);
  assert.equal(state.cookies.length, 1);
  assert.equal(state.origins.length, 1);
  assert.equal(JSON.stringify(state).includes("other-secret"), false);
  assert.throws(() => filterCarrierBrowserState({ cookies: "bad", origins: [] }, ["maersk.com"]));
});

test("pinned browser proxy rejects private and non-standard CONNECT destinations", async (t) => {
  const proxy = new SafeNetworkProxy({ mode: "public-https" });
  const proxyUrl = await proxy.listen();
  t.after(() => proxy.close());
  assert.match(await connectThroughProxy(proxyUrl, "127.0.0.1:443"), /403 Forbidden/);
  assert.match(await connectThroughProxy(proxyUrl, "8.8.8.8:8443"), /403 Forbidden/);
});

test("closing the pinned proxy destroys an active CONNECT tunnel", async (t) => {
  const target = createNetServer(() => undefined);
  target.listen(0, "127.0.0.1");
  await once(target, "listening");
  t.after(() => new Promise<void>((resolve) => target.close(() => resolve())));
  const targetAddress = target.address();
  assert(targetAddress && typeof targetAddress === "object");
  const proxy = new SafeNetworkProxy({ mode: "public-https", allowLocalhost: true });
  const proxyUrl = new URL(await proxy.listen());
  const client = connect({ host: proxyUrl.hostname, port: Number(proxyUrl.port) });
  await once(client, "connect");
  client.write(`CONNECT 127.0.0.1:${targetAddress.port} HTTP/1.1\r\nHost: 127.0.0.1:${targetAddress.port}\r\n\r\n`);
  const [response] = await once(client, "data") as [Buffer];
  assert.match(response.toString("utf8"), /200 Connection Established/);
  const closed = once(client, "close");
  await proxy.close();
  await Promise.race([
    closed,
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("Proxy tunnel did not close")), 500)),
  ]);
});

test("pinned browser proxy handles a client reset while CONNECT DNS validation is pending", async () => {
  let finishDns!: () => void;
  const dnsPending = new Promise<void>((resolve) => {
    finishDns = resolve;
  });
  const proxy = new SafeNetworkProxy(
    { mode: "public-https" },
    async (rawUrl) => {
      await dnsPending;
      return {
        url: new URL(rawUrl),
        hostname: "example.com",
        address: "93.184.216.34",
        family: 4,
      };
    },
  );
  const client = new PassThrough();
  const forwardConnect = (proxy as unknown as {
    forwardConnect: (request: { url: string }, socket: PassThrough, head: Buffer) => Promise<void>;
  }).forwardConnect.bind(proxy);

  const forwarding = forwardConnect(
    { url: "connect-reset-regression.invalid:443" },
    client,
    Buffer.alloc(0),
  );

  // Regression: Chromium can reset a speculative CONNECT before DNS finishes.
  // The proxy must already own the socket error instead of letting it become an
  // uncaught exception that crashes the service.
  assert.equal(client.listenerCount("error"), 1);
  const reset = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
  client.emit("error", reset);
  finishDns();
  await forwarding;
  assert.equal(client.destroyed, true);
});

test("real browser adapter fills, clicks, reads DOM, and captures visual evidence", async (t) => {
  const server = createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    if (request.url === "/blocked") {
      response.end("<!doctype html><html><title>Access Denied</title><body>You don't have permission to access this page.</body></html>");
      return;
    }
    response.end(`<!doctype html><html><body>
      <label>Booking <input aria-label="Booking number" /></label>
      <button id="search">Search</button><div id="result"></div>
      <script>
        document.querySelector('#search').onclick = () => {
          const value = document.querySelector('input').value;
          document.querySelector('#result').textContent = 'Status: Loaded | Booking: ' + value;
        };
      </script>
    </body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  const artifactDir = await mkdtemp(join(tmpdir(), "carrier-agent-browser-"));
  const browser = new BrowserSession({
    headless: true,
    channel: null,
    timeoutMs: 15_000,
    artifactDir,
    navigation: { mode: "public-https", allowLocalhost: true },
  });
  t.after(async () => {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(artifactDir, { recursive: true, force: true });
  });
  await browser.launch();
  await browser.open(`http://127.0.0.1:${address.port}/`);
  const first = await browser.snapshot();
  const input = first.elements.find((element) => element.name === "Booking number");
  const button = first.elements.find((element) => element.text === "Search");
  assert(input && button);
  await browser.fill(input.ref, "OOLU1234567890");
  await browser.click(button.ref);
  const second = await browser.snapshot();
  assert.match(second.text, /Status: Loaded \| Booking: OOLU1234567890/);
  const screenshot = await browser.screenshot("fixture-result");
  assert.equal(screenshot.mimeType, "image/jpeg");
  assert(screenshot.data.length > 1000);
  assert.match(screenshot.artifactId, /^[0-9a-f-]{36}\.jpg$/);
  assert.equal(basename(screenshot.path), screenshot.artifactId);
  assert.doesNotMatch(screenshot.artifactId, /fixture-result/);
  assert.equal(
    browser.resolveObservedEvidenceSource(
      new URL("/reconstructed/spa/path", screenshot.url).href,
      "DOM",
      "Status: Loaded",
    ),
    screenshot.url,
  );
  assert.equal(
    browser.resolveObservedEvidenceSource(
      new URL("/reconstructed/spa/path", screenshot.url).href,
      "DOM",
      "Not present on the page",
    ),
    null,
  );
  assert.equal(
    browser.resolveObservedEvidenceSource(
      "https://attacker.invalid/reconstructed/spa/path",
      "DOM",
      "Status: Loaded",
    ),
    null,
  );
  const toolSet = createBrowserTools(browser, () => undefined, {
    reference: "OOLU1234567890",
    referenceType: "BOOKING",
  });
  const screenshotTool = toolSet.tools.find((tool) => tool.name === "browser_screenshot");
  assert(screenshotTool);
  const visualResult = await screenshotTool.execute(
    "visual-test",
    { label: "vision-tool" },
    undefined,
    undefined,
    {} as never,
  );
  assert(visualResult.content.some((content) => content.type === "image" && content.data.length > 1000));
  for (let index = 0; index < 9; index += 1) {
    await screenshotTool.execute(
      `bounded-agent-${index}`,
      { label: `bounded-${index}` },
      undefined,
      undefined,
      {} as never,
    );
  }
  await assert.rejects(
    screenshotTool.execute(
      "agent-over-reserved-limit",
      { label: "over-reserved-limit" },
      undefined,
      undefined,
      {} as never,
    ),
    /11 Agent screenshots plus 1 final screenshot per run/,
  );
  const finalScreenshot = await browser.captureFinalScreenshot();
  assert.equal(finalScreenshot.label, "最终浏览器页面截图");
  await assert.rejects(browser.screenshot("over-limit"), /Screenshot limit reached \(12 per run\)/);
  const submitTool = toolSet.tools.find((tool) => tool.name === "submit_tracking_result");
  assert(submitTool);
  const submission = {
    status: "FOUND" as const,
    shipment: { bookingNumber: "OOLU1234567890", billOfLading: null, status: "Loaded" },
    containers: [],
    evidence: [
      { field: "shipment.bookingNumber", value: "Booking: OOLU1234567890", sourceUrl: screenshot.url, method: "DOM" as const },
      { field: "shipment.status", value: "Status: Loaded", sourceUrl: screenshot.url, method: "DOM" as const },
    ],
    warnings: [],
    note: null,
  };
  await assert.rejects(
    submitTool.execute(
      "invalid-source",
      {
        ...submission,
        evidence: submission.evidence.map((evidence) => ({ ...evidence, sourceUrl: "https://attacker.invalid/fake" })),
      },
      undefined,
      undefined,
      {} as never,
    ),
    /Evidence source was not visited/,
  );
  await submitTool.execute("valid-result", submission, undefined, undefined, {} as never);
  assert.equal(toolSet.getSubmission()?.shipment.status, "Loaded");
  await browser.open(`http://127.0.0.1:${address.port}/blocked`);
  const blocked = await browser.snapshot();
  assert.equal(blocked.challengeDetected, true);
  assert.equal(blocked.blockingReason, "ACCESS_DENIED");
});

async function connectThroughProxy(proxyUrl: string, authority: string): Promise<string> {
  const proxy = new URL(proxyUrl);
  const socket = connect({ host: proxy.hostname, port: Number(proxy.port) });
  await once(socket, "connect");
  socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
  const [chunk] = await once(socket, "data") as [Buffer];
  socket.destroy();
  return chunk.toString("utf8");
}

test("carrier SPA hydration is awaited and an empty visited page cannot be mistaken for an unvisited source", async (t) => {
  const fixture = createServer((request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(request.url === "/empty" ? "<html><body></body></html>"
      : "<html><body><script>setTimeout(()=>{document.body.innerHTML='<label>Tracking <input aria-label=Tracking></label>'},150)</script></body></html>");
  });
  fixture.listen(0, "127.0.0.1");
  await once(fixture, "listening");
  const address = fixture.address();
  assert(address && typeof address === "object");
  const artifactDir = await mkdtemp(join(tmpdir(), "carrier-hydration-"));
  const browser = new BrowserSession({
    headless: true, channel: null, timeoutMs: 1500, artifactDir,
    navigation: { mode: "public-https", allowLocalhost: true },
  });
  t.after(async () => {
    await browser.close();
    await new Promise<void>((resolve) => fixture.close(() => resolve()));
    await rm(artifactDir, { recursive: true, force: true });
  });
  await browser.launch();
  const root = `http://127.0.0.1:${address.port}`;
  const hydrated = await browser.open(root);
  assert.equal(hydrated.blockingReason, null);
  assert(hydrated.elements.some((element) => element.tag === "input"));
  const empty = await browser.open(`${root}/empty`);
  assert.equal(empty.blockingReason, "EMPTY_PAGE");
  assert.equal(browser.wasVisited(empty.url), true);
  assert.equal(browser.evidenceWasObserved(empty.url, "DOM", "Invented shipment"), false);
});
