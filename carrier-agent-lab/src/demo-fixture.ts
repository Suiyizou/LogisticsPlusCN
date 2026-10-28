import { createServer, type Server } from "node:http";
import type { CarrierResolution, TrackingRequest } from "./contracts.js";

export const DEMO_REFERENCE = "LABBOOKING123";
export const DEMO_CARRIER_NAME = "Carrier Agent 本地成功演示";
export const DEMO_NOTICE = "本地隔离演示数据，仅用于验证 Agent、真实浏览器和结构化回传链路，不是船司业务数据。";

export interface DemoFixture {
  url: string;
  close(): Promise<void>;
}

export async function startDemoFixture(): Promise<DemoFixture> {
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    });
    response.end(demoFixtureHtml());
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Could not allocate the local Agent demo fixture port");
  }
  let closed = false;
  return {
    url: `http://127.0.0.1:${address.port}/`,
    async close() {
      if (closed) return;
      closed = true;
      await closeServer(server);
    },
  };
}

export function demoTrackingRequest(url: string): TrackingRequest {
  return {
    demo: true,
    carrier: "OTHER",
    carrierName: DEMO_CARRIER_NAME,
    referenceType: "BOOKING",
    reference: DEMO_REFERENCE,
    customUrl: url,
    headed: false,
  };
}

export function demoCarrierResolution(url: string): CarrierResolution {
  return {
    kind: "TRACK",
    carrier: "OTHER",
    carrierName: DEMO_CARRIER_NAME,
    trackingUrl: url,
    detectedBy: "CUSTOM_URL",
    confidence: 1,
    referenceType: "BOOKING",
    warnings: [DEMO_NOTICE],
    candidates: [],
  };
}

export function demoFixtureHtml(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Carrier Lab Fixture</title></head><body>
    <main>
      <h1>Public Shipment Tracking Fixture</h1>
      <p>This page contains fictitious data for an isolated browser-agent demonstration.</p>
      <label>Reference type
        <select aria-label="Reference type"><option value="booking">Booking</option><option value="container">Container</option></select>
      </label>
      <label>Booking number <input aria-label="Booking number" autocomplete="off" /></label>
      <button id="search" type="button">Track shipment</button>
      <section id="result" aria-live="polite"></section>
    </main>
    <script>
      document.querySelector('#search').addEventListener('click', () => {
        const reference = document.querySelector('input').value.trim();
        document.querySelector('#result').innerHTML = reference === '${DEMO_REFERENCE}'
          ? '<h2>Shipment found</h2><dl>'
            + '<dt>Booking</dt><dd>${DEMO_REFERENCE}</dd>'
            + '<dt>Status</dt><dd>Empty Container Returned</dd>'
            + '<dt>Origin</dt><dd>Shanghai</dd>'
            + '<dt>Destination</dt><dd>Rotterdam</dd>'
            + '<dt>ETA</dt><dd>2026-09-01 08:00 UTC+2</dd>'
            + '<dt>Container</dt><dd>LABU1234567</dd>'
            + '<dt>Latest event</dt><dd>Empty return at Rotterdam Depot — 2026-09-03 14:20 UTC+2</dd>'
            + '</dl>'
          : '<p>No shipment found for the supplied reference.</p>';
      });
    </script>
  </body></html>`;
}

function closeServer(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
