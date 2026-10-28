# Carrier Agent Lab

An internally deployable TypeScript preview for public carrier tracking with the official pi SDK, a real Playwright browser, DOM inspection, visual screenshots, and a strict result contract. It runs as a separate service but can be reached by the main backend through the Compose overlay. It does not reuse the local Agent/Web extension on port `30141`.

## Official carrier entry points

- Maersk: <https://www.maersk.com/tracking/>
- OOCL: <https://www.oocl.com/eng/ourservices/eservices/cargotracking/pages/cargotracking.aspx>
- CMA CGM: <https://www.cma-cgm.com/ebusiness/tracking>
- Hapag-Lloyd: <https://www.hapag-lloyd.com/solutions/tracking/#/?language=en>
- MSC: <https://www.msc.com/en/track-a-shipment>
- Matson: <https://www.matson.com/shipment-tracking.html>
- ONE: <https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking>
- HMM: <https://www.hmm21.com/e-service/general/trackNTrace/TrackNTrace.do>
- Evergreen: <https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do>
- Yang Ming: <https://www.yangming.com/en/esolution/cargo_tracking>
- Wan Hai: <https://www.wanhai.com/views/cargo_track_v2/tracking_query.xhtml>
- ZIM: <https://www.zim.com/tools/track-a-shipment>
- COSCO: delegated to the existing application channel.

The manager-only `/customers?section=carrier-agent` workbench calls the main backend proxy at `/api/business/carrier-agent/**`; browser clients never call port `4317` directly. Its query form starts one structured lookup and shows a sanitized timeline of decision summaries, browser tool calls, retries, duration/outcome metadata, and result validation. The retired `/tracking/#carrier-agent` page now falls back to the ordinary tracking overview. Private model reasoning, raw DOM, filled values, credentials, business references, signed URL state, base64 media, and server paths are never included in that timeline. Screenshots appear only as run-scoped attachment metadata and are fetched through the authenticated backend proxy. Results remain read-only preview data and are not persisted into shipment snapshots.

## Local development

```powershell
Copy-Item .env.example .env
npm ci
npx playwright install chromium
npm run dev
```

The production entry point runs compiled JavaScript and resolves `public/` and `.pi/` from the package root:

```powershell
npm run build
npm start
```

Open <http://127.0.0.1:4317>. pi uses its normal `~/.pi/agent/auth.json`, `models.json`, or provider environment variables. If `PI_PROVIDER` and `PI_MODEL` are omitted, the module chooses the first authenticated model that supports image input.

Vision support alone does not guarantee reliable tool calling. For repeatable validation, explicitly choose a model that passes `smoke:agent`, for example:

```powershell
$env:PI_PROVIDER='siliconflow'
$env:PI_MODEL='Qwen/Qwen3-VL-8B-Instruct'
npm run smoke:agent
```

## Internal Docker preview

The Playwright runtime is pinned to `mcr.microsoft.com/playwright:v1.62.1-noble`. From the repository root, prepare a readable pi Agent directory containing the required `auth.json`/`models.json` (or point `PI_AGENT_HOST_DIR` at one), then run. The directory stays mounted read-only; each run copies only those two files into a private writable temporary directory for pi's lock files and removes the copy during cleanup. The Docker overlay defaults to the fixture-qualified `siliconflow/Qwen/Qwen3-VL-8B-Instruct`; override both `PI_PROVIDER` and `PI_MODEL` together only after another model passes the full Agent smoke workflow.

```powershell
docker compose -f docker-compose.yml -f docker-compose.carrier-agent.yml up -d --build
```

The overlay:

- exposes port `4317` only to the internal Compose network;
- sets `APP_CARRIER_AGENT_BASE_URL=http://carrier-agent:4317` on the backend and waits for Agent health;
- forces headless Chromium and rejects caller attempts to enable a headed browser;
- runs one query at a time and holds at most five waiting queries by default;
- caps each run at six minutes / eighteen Agent turns by default, pins validated DNS answers through an internal proxy, and limits top-level browsing to the selected carrier's approved hosts.

Override the capacity only after measuring browser/model resource use with `TRACKING_AGENT_MAX_CONCURRENCY` and `TRACKING_AGENT_QUEUE_LIMIT`.

Unlisted carriers require a caller-confirmed official public tracking URL before the browser starts. This prevents a model or untrusted webpage from selecting an arbitrary site and receiving the shipment reference. Screenshot bytes are supplied to the vision model in memory and retained only as opaque run-scoped artifacts for authenticated review. Each run is limited to 12 JPEG screenshots, each screenshot and served artifact is capped at 5 MB, at most 100 run records are retained, truncated attachment events delete their bytes, and evicted runs delete their artifact directory (a maximum in-process retention envelope of 6,000 MB). On startup the service removes orphaned UUID run directories older than 24 hours; `TRACKING_ARTIFACT_TTL_HOURS` can set this from 1 through 168 hours and out-of-range values are clamped.

## HTTP contract

- `GET /api/health` — service and queue health (`ok: true`, `status: "UP"`, `service: "carrier-agent-lab"`).
- `GET /api/carriers` — configured carrier metadata.
- `POST /api/runs` — enqueue a query; returns `429` with `code: "QUEUE_FULL"` when full.
- `GET /api/runs/:id` — poll state and structured result.
- `GET /api/runs/:id/artifacts/:artifactId` — read one screenshot declared by that run; the browser UI must access this only through the authenticated main-backend proxy.
- `DELETE /api/runs/:id` — cancel a queued or running query.

Public events keep the original `message`, `status`, and `data` fields for compatibility and can add `turn`, `decisionSummary`, `toolName`, `toolCallId`, `toolInput`, `toolOutput`, `durationMs`, `outcome`, and `attachments`. Every key event also exposes five bounded audit fields: `stage`, `rationale`, `action`, `observation`, and `nextStep`. These contain deterministic templates and allowlisted facts such as public origin, element/evidence counts, blocker category, tool outcome, and elapsed time—never model-authored reasoning. Failures can add `retry: { willRetry, mode, attempt?, maxAttempts?, reason? }`, where `mode` distinguishes `AUTOMATIC`, `AGENT_REASSESS`, and `NONE`. If no final structured tool call exists, the runner publishes one safe terminal category—`AGENT_TURN_LIMIT`, `TOOL_FAILURE`, `MODEL_TRANSPORT_ERROR`, `MODEL_OUTPUT_LIMIT`, `MODEL_ABORTED`, or `MODEL_NO_FINAL_TOOL_CALL`—using only Assistant stop reason and allowlisted model/tool error categories. Screenshot attachments have exactly `{ type: "SCREENSHOT", artifactId, label, mimeType: "image/jpeg" }`; they never contain a URL, filesystem path, or image bytes.

The preview page uses relative asset and API URLs, so it can sit behind a path prefix. Its back link returns to `/workbenches`.

For local acceptance testing only, set `TRACKING_ENABLE_DEMO=true` and send `demo: true` with the fixed fictitious `LABBOOKING123` request. The service then runs the same model, Playwright, tool, evidence-validation, and normalized-result path against an isolated local fixture. The response is prominently labelled as demo data; caller-supplied demo references or URLs are not used. The Compose preview overlay enables this button by default, while the standalone service keeps it disabled.

## Verify

```powershell
npm run build
npm test
npm run smoke:agent
npm run smoke:sites
```

`smoke:agent` runs the complete pi skill/browser/result loop against an isolated local fixture. `smoke:sites` checks only public-page reachability and captures screenshots; it does not submit identifiers. End-to-end business validation requires a separately authorized live-test step.

See [architecture](docs/ARCHITECTURE.md) and the packaged [skill](.pi/skills/shipment-web-tracker/SKILL.md).
