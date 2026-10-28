# Test results — 2026-08-18

## Automated module tests

- `npm run build`: passed.
- `npm test`: 52/52 passed.
- Compiled production start plus `GET /api/health` and preview-page fetch: passed.
- Covered deployment defaults, bounded artifact TTL configuration, startup cleanup across process restarts, source/compiled root resolution, finite FIFO queue and `429` overflow, headed-mode rejection, carrier routing, numeric-booking ambiguity, COSCO delegation, schema validation, pi skill discovery, HTTP API, real Chromium DOM handles, form fill, click, blocked-page recognition, screenshot capture/limits, image tool content, five-part public audit events, Assistant-only message completion, safe stop/error categories, terminal-failure priority, automatic-retry completion, safe failure reasons and retry modes, rich-event redaction, attachment ownership, traversal rejection, 5 MB serving limits, concurrent artifact deletion, and deletion of bytes when attachment events are truncated.

## Complete pi Agent fixture

The fixture uses a local HTML shipment page and does not reuse port `30141`.

- `ollama/qwen3-vl-local`: discovered as a vision model but returned an empty Assistant message before any tool call. The runner rejected it with a model/tool compatibility error.
- `siliconflow/Qwen/Qwen3-VL-8B-Instruct`: passed in 8 turns. It opened the browser, inspected the DOM, selected booking mode, filled `LABBOOKING123`, clicked tracking, read the result, and submitted `FOUND` with the exact booking number, shipment status, route, ETA, container, event timeline, and DOM evidence.
- The fixture deliberately returned `Empty Container Returned`; the structured result preserved that as a continuing business status rather than converting it into a generic completion state.

## Official-site reachability smoke test

The check ran in headless Chrome without submitting any booking/B/L/container number.

| Carrier | Official page reached | Usable in this smoke environment | Observed state |
|---|---:|---:|---|
| Maersk | yes | no | `EMPTY_PAGE` after dynamic load wait |
| OOCL | yes | no | `REQUEST_REJECTED` notice with incident ID |
| CMA CGM | yes | no | `SECURITY_CHECK` |
| Hapag-Lloyd | yes | no | Cloudflare-style `SECURITY_CHECK` |
| MSC | yes | no | `ACCESS_DENIED` |

Screenshots are stored under `artifacts/site-smoke/` and intentionally excluded from Git.

## Conclusion

The Agent/browser/result pipeline works end to end with a compatible tool-calling vision model, and its internal preview deployment now has bounded capacity and a health contract. A normal browser reduces API-level blocking but does not eliminate carrier anti-automation controls. Production use still needs explicit model qualification, environment-specific browser testing, and a human-handoff path for CAPTCHA/security checks. A valid business-reference acceptance test still requires authorized current samples from each carrier.
