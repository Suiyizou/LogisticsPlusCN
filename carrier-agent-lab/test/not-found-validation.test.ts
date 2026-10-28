import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createBrowserTools } from "../src/agent/tools.js";
import { BrowserSession, type PageSnapshot } from "../src/browser/browser-session.js";
import type { AgentSubmission } from "../src/contracts.js";

const SOURCE_URL = "https://tracking.example.test/result";

test("NOT_FOUND accepts explicit DOM business-negative evidence", async () => {
  const result = await submitNotFound({
    value: "No matching shipment was found for the supplied bill of lading.",
    method: "DOM",
  });
  assert.equal(result.status, "NOT_FOUND");
  assert.equal((await submitNotFound({
    value: "未找到对应的提单记录。",
    method: "DOM",
  })).status, "NOT_FOUND");
});

test("NOT_FOUND discards an unobserved structured sentinel while retaining exact business evidence", async () => {
  const negativeText = "No results found";
  const browser = {
    wasVisited: (sourceUrl: string) => sourceUrl === SOURCE_URL,
    evidenceWasObserved: (
      sourceUrl: string,
      method: "DOM" | "VISION" | "HYBRID",
      value: string,
    ) => sourceUrl === SOURCE_URL && method === "DOM" && value === negativeText,
    blockingReasonFor: () => null,
  } as unknown as BrowserSession;
  const toolSet = createBrowserTools(browser, () => undefined, {
    reference: "SYNTHETIC123",
    referenceType: "BILL_OF_LADING",
  });
  const submitTool = toolSet.tools.find((tool) => tool.name === "submit_tracking_result");
  assert(submitTool);
  await submitTool.execute("not-found-normalization", {
    status: "NOT_FOUND",
    shipment: { bookingNumber: null, billOfLading: null, status: "NOT_FOUND" },
    containers: [{ number: "INVENTED123", status: "NOT_FOUND" }],
    evidence: [
      {
        field: "shipment.status",
        value: "NOT_FOUND",
        sourceUrl: SOURCE_URL,
        method: "DOM",
      },
      {
        field: "notFoundNotice",
        value: negativeText,
        sourceUrl: SOURCE_URL,
        method: "DOM",
      },
    ],
    warnings: [],
    note: null,
  }, undefined, undefined, {} as never);
  const accepted = toolSet.getSubmission();
  assert(accepted);
  assert.deepEqual(accepted.shipment, {
    bookingNumber: null,
    billOfLading: null,
    status: null,
  });
  assert.deepEqual(accepted.containers, []);
  assert.deepEqual(accepted.evidence.map((item) => item.field), ["notFoundNotice"]);
});

test("NOT_FOUND rejects visual-only or ambiguous evidence", async () => {
  await assert.rejects(
    submitNotFound({ value: "No matching shipment was found.", method: "VISION" }),
    /requires explicit DOM or HYBRID evidence/,
  );
  await assert.rejects(
    submitNotFound({ value: "Search completed.", method: "DOM" }),
    /requires explicit DOM or HYBRID evidence/,
  );
  await assert.rejects(
    submitNotFound({ value: "Not Found", method: "DOM" }),
    /requires explicit DOM or HYBRID evidence/,
  );
});

test("NOT_FOUND rejects a blocked page even when a business-negative phrase can be cherry-picked", async () => {
  await assert.rejects(
    submitNotFound(
      { value: "No matching shipment was found.", method: "DOM" },
      "REQUEST_REJECTED",
    ),
    /blocked or failed page \(REQUEST_REJECTED\)/,
  );
});

test("browser incident page records a blocker that prevents cherry-picked NOT_FOUND evidence", async (t) => {
  const server = createServer((request, response) => {
    if (request.url === "/missing-zh") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<!doctype html><html><title>页面不存在</title><body>未找到您访问的页面</body></html>");
      return;
    }
    if (request.url === "/missing") {
      response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<!doctype html><html><title>404 Not Found</title><body>404 Not Found</body></html>");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html><title>Request error</title><body>
      <p>Your page request is unrecognized. Please quote incident ID DEMO-42.</p>
      <p>No matching shipment was found.</p>
    </body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  const artifactDir = await mkdtemp(join(tmpdir(), "carrier-agent-not-found-"));
  const browser = new BrowserSession({
    headless: true,
    channel: null,
    timeoutMs: 10_000,
    artifactDir,
    navigation: { mode: "public-https", allowLocalhost: true },
  });
  t.after(async () => {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(artifactDir, { recursive: true, force: true });
  });
  await browser.launch();
  const snapshot = await browser.open(`http://127.0.0.1:${address.port}/result`);
  assert.equal(snapshot.blockingReason, "REQUEST_REJECTED");

  const toolSet = createBrowserTools(browser, () => undefined, {
    reference: "SYNTHETIC123",
    referenceType: "BILL_OF_LADING",
  });
  const submitTool = toolSet.tools.find((tool) => tool.name === "submit_tracking_result");
  assert(submitTool);
  await assert.rejects(
    submitTool.execute(
      "incident-page",
      {
        status: "NOT_FOUND",
        shipment: { bookingNumber: null, billOfLading: null, status: null },
        containers: [],
        evidence: [{
          field: "query.result",
          value: "No matching shipment was found.",
          sourceUrl: snapshot.url,
          method: "DOM",
        }],
        warnings: [],
        note: null,
      },
      undefined,
      undefined,
      {} as never,
    ),
    /blocked or failed page \(REQUEST_REJECTED\)/,
  );

  const missing = await browser.open(`http://127.0.0.1:${address.port}/missing`);
  assert.equal(missing.blockingReason, "REQUEST_REJECTED");
  await assert.rejects(
    submitTool.execute(
      "404-page",
      {
        status: "NOT_FOUND",
        shipment: { bookingNumber: null, billOfLading: null, status: null },
        containers: [],
        evidence: [{
          field: "query.result",
          value: "Not Found",
          sourceUrl: missing.url,
          method: "DOM",
        }],
        warnings: [],
        note: null,
      },
      undefined,
      undefined,
      {} as never,
    ),
    /blocked or failed page \(REQUEST_REJECTED\)/,
  );

  const missingChinese = await browser.open(`http://127.0.0.1:${address.port}/missing-zh`);
  assert.equal(missingChinese.blockingReason, "REQUEST_REJECTED");
  await assert.rejects(
    submitTool.execute(
      "chinese-page-missing",
      {
        status: "NOT_FOUND",
        shipment: { bookingNumber: null, billOfLading: null, status: null },
        containers: [],
        evidence: [{
          field: "query.result",
          value: "未找到您访问的页面",
          sourceUrl: missingChinese.url,
          method: "DOM",
        }],
        warnings: [],
        note: null,
      },
      undefined,
      undefined,
      {} as never,
    ),
    /blocked or failed page \(REQUEST_REJECTED\)/,
  );
});

test("NOT_FOUND rejects operational failure text instead of treating it as a shipment result", async () => {
  for (const value of [
    "Your page request is unrecognized. Please quote incident ID DEMO-42. No matching shipment was found.",
    "Access denied. No matching shipment was found.",
    "Request timed out. No matching shipment was found.",
  ]) {
    await assert.rejects(
      submitNotFound({ value, method: "HYBRID" }),
      /page\/request failure/,
    );
  }
});

test("NOT_FOUND rejects Chinese page-missing text instead of treating it as a shipment result", async () => {
  for (const value of [
    "未找到您访问的页面",
    "找不到页面，请检查网址",
    "您访问的网页不存在",
  ]) {
    await assert.rejects(
      submitNotFound({ value, method: "DOM" }),
      /page\/request failure/,
    );
  }
});

test("HUMAN_REQUIRED accepts observed human-verification DOM evidence", async () => {
  const result = await submitHumanRequired({
    value: "Please complete the CAPTCHA to continue tracking.",
    method: "DOM",
  });
  assert.equal(result.status, "HUMAN_REQUIRED");
});

test("HUMAN_REQUIRED accepts screenshot evidence only when BrowserSession recorded SECURITY_CHECK", async () => {
  const result = await submitHumanRequired(
    { value: "Visual challenge shown", method: "VISION" },
    "SECURITY_CHECK",
  );
  assert.equal(result.status, "HUMAN_REQUIRED");

  await assert.rejects(
    submitHumanRequired({ value: "Invented CAPTCHA", method: "VISION" }),
    /requires explicit DOM or HYBRID human-intervention blocker evidence or a recorded SECURITY_CHECK/,
  );
});

test("HUMAN_REQUIRED accepts observed access blockers but rejects unrelated evidence and populated data", async () => {
  assert.equal((await submitHumanRequired({
    value: "Access Denied",
    method: "DOM",
  })).status, "HUMAN_REQUIRED");
  await assert.rejects(
    submitHumanRequired({ value: "Search completed", method: "DOM" }),
    /requires explicit DOM or HYBRID human-intervention blocker evidence or a recorded SECURITY_CHECK/,
  );
  await assert.rejects(
    submitHumanRequired(
      { value: "CAPTCHA verification required", method: "DOM" },
      null,
      { bookingNumber: "SYNTHETIC123", billOfLading: null, status: null },
    ),
    /must keep shipment fields null and containers empty/,
  );
  await assert.rejects(
    submitHumanRequired(
      { value: "CAPTCHA verification required", method: "DOM" },
      null,
      { bookingNumber: null, billOfLading: null, status: null },
      [{ number: "MSKU1234567" }],
    ),
    /must keep shipment fields null and containers empty/,
  );
});

async function submitNotFound(
  evidence: { value: string; method: "DOM" | "VISION" | "HYBRID" },
  blockingReason: PageSnapshot["blockingReason"] = null,
): Promise<AgentSubmission> {
  const browser = {
    wasVisited: (sourceUrl: string) => sourceUrl === SOURCE_URL,
    evidenceWasObserved: (
      sourceUrl: string,
      method: "DOM" | "VISION" | "HYBRID",
      value: string,
    ) => sourceUrl === SOURCE_URL && method === evidence.method && value === evidence.value,
    blockingReasonFor: (sourceUrl: string) => sourceUrl === SOURCE_URL ? blockingReason : null,
  } as unknown as BrowserSession;
  const toolSet = createBrowserTools(browser, () => undefined, {
    reference: "SYNTHETIC123",
    referenceType: "BILL_OF_LADING",
  });
  const submitTool = toolSet.tools.find((tool) => tool.name === "submit_tracking_result");
  assert(submitTool);
  const submission: AgentSubmission = {
    status: "NOT_FOUND",
    shipment: { bookingNumber: null, billOfLading: null, status: null },
    containers: [],
    evidence: [{
      field: "query.result",
      value: evidence.value,
      sourceUrl: SOURCE_URL,
      method: evidence.method,
    }],
    warnings: [],
    note: null,
  };
  await submitTool.execute("not-found-test", submission, undefined, undefined, {} as never);
  const accepted = toolSet.getSubmission();
  assert(accepted);
  return accepted;
}

async function submitHumanRequired(
  evidence: { value: string; method: "DOM" | "VISION" | "HYBRID" },
  blockingReason: PageSnapshot["blockingReason"] = null,
  shipment: AgentSubmission["shipment"] = {
    bookingNumber: null,
    billOfLading: null,
    status: null,
  },
  containers: AgentSubmission["containers"] = [],
): Promise<AgentSubmission> {
  const browser = {
    wasVisited: (sourceUrl: string) => sourceUrl === SOURCE_URL,
    evidenceWasObserved: (
      sourceUrl: string,
      method: "DOM" | "VISION" | "HYBRID",
      value: string,
    ) => sourceUrl === SOURCE_URL && method === evidence.method && value === evidence.value,
    blockingReasonFor: (sourceUrl: string) => sourceUrl === SOURCE_URL ? blockingReason : null,
  } as unknown as BrowserSession;
  const toolSet = createBrowserTools(browser, () => undefined, {
    reference: "SYNTHETIC123",
    referenceType: "BILL_OF_LADING",
  });
  const submitTool = toolSet.tools.find((tool) => tool.name === "submit_tracking_result");
  assert(submitTool);
  await submitTool.execute(
    "human-required-test",
    {
      status: "HUMAN_REQUIRED",
      shipment,
      containers,
      evidence: [{
        field: "blockingNotice",
        value: evidence.value,
        sourceUrl: SOURCE_URL,
        method: evidence.method,
      }],
      warnings: [],
      note: null,
    },
    undefined,
    undefined,
    {} as never,
  );
  const accepted = toolSet.getSubmission();
  assert(accepted);
  return accepted;
}
