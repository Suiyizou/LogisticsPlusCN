# Carrier Agent Lab architecture

This module is a separate process from the existing tracking adapter and from the local service on port `30141`. The main backend reaches it over the internal Compose network; the separate process keeps model/browser failures and capacity limits isolated.

## Execution flow

1. The preview page or main backend posts a reference, reference type, and carrier selection.
2. The deterministic router applies explicit carrier selection first, then strong prefix hints. Numeric booking numbers remain ambiguous unless a carrier is supplied.
   For an unlisted carrier, the caller must supply a confirmed official public tracking URL; the run is locked to that host.
3. COSCO returns `DELEGATED_TO_EXISTING`; the existing accurate channel remains authoritative.
4. Other configured carriers launch an isolated Chromium/Chrome context. Browser visibility is a deployment policy, not a preview-page control.
5. The host reads the one packaged `shipment-web-tracker` skill and injects its contents. The pi SDK exposes only scoped browser tools and a terminating structured-output tool—there is no general filesystem tool.
6. The Agent starts from the official carrier URL, reads the DOM, operates browser inputs, and requests screenshots when vision is needed.
7. The terminating tool validates the payload; the server adds router metadata and returns schema `1.0`.

## Runtime boundary

- `TRACKING_HOST` defaults to `127.0.0.1`; the container explicitly binds `0.0.0.0` only inside the Compose network.
- `GET /api/health` reports liveness and queue occupancy.
- The scheduler defaults to one active run and five waiting runs. A further submission returns HTTP `429`/`QUEUE_FULL`.
- Each run has a five-minute deadline and twelve-turn limit. A timed-out run retains its concurrency slot until its browser/model cleanup actually settles.
- The container runs headless and sets `TRACKING_BROWSER_ALLOW_HEADED=false`; a client cannot turn on a visible browser.
- Production starts `dist/src/server.js`. Root discovery accounts for the `dist/src` location so `public/`, `.pi/`, and `artifacts/` resolve correctly.

## Browser and vision boundary

- Playwright drives a normal browser process with click, fill, keyboard, select, mouse-wheel, frame inspection, and screenshots.
- Interactive element handles are produced from the current DOM snapshot and become stale after a new snapshot.
- Screenshot bytes are returned as image tool content, so the selected pi model must advertise image input support.
- Navigation is HTTPS-only, uses standard port 443, and is locked to the selected carrier's hosts. IPv4, IPv6, mapped IPv4, local, private, reserved, and multicast destinations are blocked.
- All Chromium traffic passes through a local proxy that connects to the exact validated DNS answer, preventing DNS-rebinding between policy validation and socket creation. Service workers and non-proxied WebRTC UDP are disabled.
- Website content is treated as untrusted data. Interactive third-party frames are blocked, and the Agent has no filesystem or arbitrary-code tool.
- Every evidence URL must have been visited. DOM evidence values must occur in a captured DOM snapshot, visual evidence requires an actual screenshot, and non-empty shipment/container/event fields require matching field evidence.
- Visual evidence proves that the cited page was captured and supplied to the configured vision model; semantic reading of pixels remains a model-trust boundary and is surfaced through the `VISION`/`HYBRID` method instead of being treated as DOM verification.
- Public trace events expose template-based decision summaries and allowlisted tool summaries, never model chain-of-thought, raw DOM, query values, credentials, or base64 media. Each critical event separates `stage`, `rationale`, `action`, `observation`, and `nextStep`; tool/model failures additionally state whether retry is automatic, requires Agent reassessment, or will not occur. `message_end` creates an audit event only for Assistant-role messages, stores only an allowlisted `stopReason`/error category, and does not copy message or error content. `auto_retry_end` publishes whether automatic recovery succeeded. Missing structured submissions are classified in priority order as turn limit, last tool failure, model stop failure, or no final tool call. Screenshot events carry only an opaque run-scoped `artifactId`.
- Screenshot bytes remain in the run artifact directory for authenticated review. The lab serves only an artifact declared by that exact run, rejects traversal/undeclared/oversized files, and never returns a filesystem path. Runs allow at most 12 screenshots of at most 5 MB each; attachment bytes are removed when their event is truncated and whole directories are removed when a retained run is evicted.
- Before accepting requests, startup cleanup removes orphaned UUID run directories older than the configured artifact TTL (24 hours by default, constrained to 1 hour–7 days). Named smoke-test directories and run IDs still retained by the in-memory manager are not touched.
- Artifact responses use one bounded file read followed by a single buffered response. Concurrent deletion therefore produces either a complete image or a clean `404`, without a stream error after headers have been sent.
- CAPTCHA, login, and other human-only challenges stop with `HUMAN_REQUIRED`; there is no stealth or challenge-bypass code.

## Carrier detection

| Prefix hint | Route |
|---|---|
| `MAEU`, `MSKU` | Maersk |
| `OOLU` | OOCL |
| `CMDU`, `CMAU` | CMA CGM |
| `COSU` | Existing COSCO channel |
| `HLCU` | Hapag-Lloyd |
| `MSCU`, `MEDU` | MSC |
| `MATS` | Matson |
| `ONEY` | ONE |
| `HDMU` | HMM |
| `EGLV` | Evergreen |
| `YMJA` | Yang Ming |
| `WHLC` | Wan Hai |
| `ZIMU` | ZIM |

These are narrow routing hints prepared from the supplied business samples, not proof or input-validation rules. ISO container prefixes normally identify equipment ownership and pure numeric booking numbers overlap between carriers. Business-supplied carrier data therefore has precedence, while a conflict between an explicit carrier and another configured prefix is surfaced as a warning.

## Test levels

- Router and contract unit tests require no model or network.
- Browser fixture test exercises DOM snapshot, field fill, click, keyboard-compatible browser input, result reading, and screenshot capture.
- Server tests exercise health, the integrated preview page, headed-mode policy, queue overflow, and router-only completion without an LLM.
- `npm run smoke:sites` can open the configured public websites without submitting a ticket. Live reference testing is a separate, explicitly authorized step and is intentionally excluded from platform preparation.
