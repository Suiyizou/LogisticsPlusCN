# Tracking JSON compatibility and local preview — 2026-10-30

The current public tracking page now reads the supplied `tracking.v1` by-carrier JSON through a compatibility adapter, while retaining existing canonical snapshot rendering and query routes. This does not add a Node URL, proxy, API credential, carrier browser automation, or new real-time query capability.

## Local acceptance workflow

Open the cargo tracking overview, choose **Preview tracking JSON / 本地货踪 JSON 预览**, and select the supplied by-carrier JSON. The in-memory table shows carrier badges, exact original reference, source query status, extracted container count and source shipment-event count. Filter by carrier or use a row's **View details** button. **Exit preview** returns to the overview and restores the prior displayed snapshot; **Clear local preview** releases the loaded file. Reloading the page releases preview data.

File size is limited to 20 MB and the record set to 500. Inputs may be one `tracking.v1` record, an array of records, the supplied `{schema, generated_at, by_carrier}` envelope, or an existing `{snapshot}` response with a valid tracking number and summary object. A by-carrier group's code must match the record's explicit carrier code. Malformed records are rejected before selection.

Preview does not update the query form, browser query URL, saved snapshots, shipment accounts, customers, files or local shipment storage. It strips persisted record identifiers, suppresses supplementary record reads/writes, disables document context and hides editing/query controls until preview exits. It does not open source screenshot/text paths, fetch source URLs or create a URL proxy. A language preference change remains the application's existing preference action, separate from record preview.

## Source fidelity

- Missing provider codes become UNKNOWN, never COSCO. Carrier grouping is preserved; aliases are explicit.
- Shipments use the supplied origin/destination as summary facts. Those endpoint labels do not become invented milestone events or completion evidence.
- Only supplied transport legs create a transport-leg table. Vessel/voyage remain visible when present without a leg.
- Only supplied ETD/ETA/ATD/ATA fields create typed time records, preserving their original format; untyped milestone descriptions remain source text. Missing actual dates do not mean “not departed” or “not arrived.”
- Source shipment events retain order and count. HMM/MSC supplementary structured histories are shown separately, avoiding duplicate event-count inflation. Shipment events are never broadcast to every container.
- Empty sections and entirely absent table columns are hidden. Containers without their own events do not offer an empty timeline. A source status of NO_BUSINESS_DATA is explicit, with source warnings and verification state shown.
- Original reference strings retain leading zeros and prefixes. Business/customer bindings are not inferred.
- All source text is inserted as text; source URLs and local evidence paths are not image or hyperlink fetch targets.

## Real-file verification

The by-carrier JSON contains 12 records: HMM, SML, COSCO, MATSON, OOCL, MSC, EVERGREEN, HAPAG_LLOYD, KMTC, MAERSK, YML and ZIM. Their supplied container counts are respectively 5, 15, 0, 1, 3, 29, 1, 0, 1, 1, 1 and 1. Source shipment-event counts are 3, 1, 4, 1, 10, 29, 0, 0, 4, 0, 0 and 12. Only the COSCO record contains a structured leg; HAPAG_LLOYD reports NO_BUSINESS_DATA. The grouped XLSX has these same 12 carrier worksheets, each with a title row followed by a second-row header. It is treated as a result artifact rather than a task-import template.

Local browser acceptance opened and exited all 12 detail records using the real file, with no JavaScript page errors, no HTTP writes and no storage writes. COSCO/Hapag container sections are hidden; only supplied COSCO legs are shown. Detailed raw file inspection and browser snapshots stay in ignored `.tmp/import-real-20261030/`; sanitized summaries are `tracking-render-result.json`, `tracking-browser-result.json` and `by-carrier-xlsx-structure.json` there.

The synthetic fixtures reproduce the observed nullability, fields and cardinalities without customer identifiers. 19 adapter/12-carrier cases plus 32 existing response/presentation tests pass (51 total). The import suite has 35 focused cases, the legacy import regression and i18n scan pass, and full frontend typecheck passes.

## Node contract boundary

`tracking-v1-adapter.mjs` exports `normalizeTrackingPayload` (existing snapshots pass through unchanged), `adaptTrackingV1`, `readTrackingPreview`, `detailSections`, and a safe carrier badge helper. Direct Node compatibility uses the NODE_JSON source marker; local preview always marks LOCAL_JSON. The resulting existing snapshot shape has provider, tracking, summary, references, keyTimes, route, routingLegs and containers, plus source events and sourceDetails. The source record's query status, warnings, confidence and verification flag remain explicit.

The current application's query adapters remain COSCO/CMA/MAERSK/HAPAG_LLOYD/MSC/OOCL. Recognizing HMM or another carrier in a task spreadsheet is separate from that capability. Task import now distinguishes CARRIER_NOT_CONFIGURED from UNKNOWN_CARRIER and blocks both before submission. A supplied result file can be previewed for all 12 carriers without enabling any unsupported query.

The future Node endpoint, authentication, time semantics and payload contract require concrete configuration. No network endpoint was invented. Existing backend authorization, query routes, publication and snapshot persistence remain unchanged.

## Static overlay packaging

The existing static-overlay Dockerfile copies individual assets. Include `public/tracking-v1-adapter.mjs`, `public/tracking-json-preview.mjs`, and `public/tracking-json-preview.css` alongside app.js/index.html when packaging this change. No deployment or commit was performed by this implementation agent. Official COSCO/OOCL assets use the existing `public/carriers/SOURCES.md` provenance; other carriers retain a neutral text badge rather than an invented official logo.
