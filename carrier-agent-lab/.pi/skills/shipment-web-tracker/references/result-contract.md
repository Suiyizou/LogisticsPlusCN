# Result contract

The server wraps the terminating tool submission in schema version `1.0`.

- `status`: `FOUND`, `NOT_FOUND`, `HUMAN_REQUIRED`, or `ERROR` from the Agent. Router-only results can also be `AMBIGUOUS` or `DELEGATED_TO_EXISTING`.
- `carrier`: resolved code, display name, official start URL, detection source, and confidence.
- `query`: normalized reference and reference type.
- `shipment`: booking/B/L, status, route endpoints, key times, vessel and voyage. The three identity/status fields are always present; unknown values are `null`.
- `containers`: container summaries and ordered events.
- `evidence`: field, exact observed value, source URL, and `DOM`/`VISION`/`HYBRID` method.
- `warnings`: routing or extraction caveats.
- `note`: short human-readable conclusion.

## Validation behavior

The terminating tool validates the submission before accepting it. A rejected submission returns an error describing the exact mismatch; read it and make at most one targeted correction, then resubmit once. Do not resubmit the identical payload.

- **Evidence provenance.** Every evidence `sourceUrl` must have been visited in this run, and each evidence `value` must actually have been observed by its declared `method`. Rejections on `not visited` or `not observed` mean the evidence was invented or attributed to the wrong page.
- **NOT_FOUND strictness.** `NOT_FOUND` is accepted only with DOM or HYBRID evidence whose value matches a business not-found phrase (for example `0 results`, `no matching shipment`, `no matching records`, `没有/找不到/无匹配`, `查询无结果`). Keep all shipment fields `null`, keep containers empty, and cite the exact page sentence under a neutral field such as `notFoundNotice`; the enum word `NOT_FOUND` is not page evidence. Wording that describes a page or request failure (`request unrecognized`, `access denied`, `forbidden`, `incident id`, `timeout`, `page unavailable`, `404`) invalidates a `NOT_FOUND` and must be `ERROR` or `HUMAN_REQUIRED`.
- **Blocked page.** If any evidence `sourceUrl` was recorded as blocked, the submission cannot conclude `NOT_FOUND`. Stop browsing and submit `HUMAN_REQUIRED` (human step is the blocker) or `ERROR`.
- **FOUND must echo the query.** The reference type determines the required echoed field: `BOOKING` → `shipment.bookingNumber`, `BILL_OF_LADING` → `shipment.billOfLading`, `CONTAINER` → a matching `containers[].number`. `AUTO` requires the reference to appear in one of those fields. The queried reference must also appear, normalized, in at least one evidence value.
- **Field evidence.** Every non-empty shipment/container/event field needs matching evidence whose `field` is the exact field path and whose `value` visibly contains the returned value. `actual`/`estimated` flags require an evidence value containing that word.
- **Preserve categories.** The server keeps the agent's `FOUND` / `NOT_FOUND` / `HUMAN_REQUIRED` / `ERROR`. Do not silently turn an access-denied, request-failure, or empty page into `NOT_FOUND`; that distinction is business-meaningful.

Example:

```json
{
  "status": "FOUND",
  "shipment": {
    "bookingNumber": "EXAMPLE123",
    "billOfLading": null,
    "status": "Loaded on vessel"
  },
  "containers": [],
  "evidence": [
    {
      "field": "shipment.bookingNumber",
      "value": "Booking: EXAMPLE123",
      "sourceUrl": "https://carrier.example/track/result",
      "method": "DOM"
    },
    {
      "field": "shipment.status",
      "value": "Loaded on vessel",
      "sourceUrl": "https://carrier.example/track/result",
      "method": "DOM"
    }
  ],
  "warnings": [],
  "note": "Public carrier page returned a matching shipment."
}
```
