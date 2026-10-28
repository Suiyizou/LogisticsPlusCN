# Regression samples

A fixed, deduplicated business sample set for repeatable carrier-agent testing. Each entry records the carrier, the normalized reference, how the router treats it, and what to verify.

Router shorthand:
- **BROWSER** – run the public browser workflow against the carrier's official URL.
- **DELEGATE** – never query in this browser; the existing COSCO/application channel is authoritative and returns `DELEGATED_TO_EXISTING`.
- **EXPLICIT** – the prefix does not match any strong-prefix rule; route by the caller-supplied carrier, or treat as ambiguous if no carrier is given.

## Positive browser samples (expected page or results reachable in principle)

| Carrier | Reference | Route | Verify |
|---|---|---|---|
| ONE | `ONEYMEXG20090500` | BROWSER | Handle onboarding tour + cookie bar; page may require `ONEY`-less B/L suffix; record full ref in evidence. |
| ONE | `ONEYNBOGG0610700` | BROWSER | Same as above. |
| OOCL | `OOLU8882568660` | BROWSER | Type selector; supports B/L / booking / container. |
| OOCL | `OOLU8882566390` | BROWSER | Same as above. |
| HMM | `HDMUPUSM901347A1` | BROWSER | Track & Trace; note HMM may return Access Denied/challenge — that is `HUMAN_REQUIRED`, not "not found". |
| Maersk | `MAEU802356593` | BROWSER | Booking/B/L may be labelled shipment number. |
| Maersk | `MAEU802356608` | BROWSER | Same as above. |
| Maersk | `MAEU802356576` | BROWSER | Same as above. |
| Maersk | `MAEU802356574` | BROWSER | Same as above. |
| Maersk | `MAEU272983676` | BROWSER | Same as above. |
| Maersk | `MAEU802356597` | BROWSER | Same as above. |
| Maersk | `MAEU274403341` | BROWSER | Same as above. |
| Maersk | `MAEU802356573` | BROWSER | Same as above. |
| Maersk | `MAEU802356591` | BROWSER | Same as above. |
| Maersk | `MAEU802356569` | BROWSER | Same as above. |
| Matson | `MATS6788641000` | BROWSER | Public ocean tracking; container / booking / B/L. |
| Matson | `MATS6404988000` | BROWSER | Same as above. |
| Matson | `MATS5307361000` | BROWSER | Same as above. |
| Matson | `MATS3986661000` | BROWSER | Same as above. |
| Matson | `MATS3832040000` | BROWSER | Same as above. |
| Matson | `MATS3640176000` | BROWSER | Same as above. |
| Matson | `MATS1525248000` | BROWSER | Same as above. |
| Evergreen | `EGLV149605962138` | BROWSER | ShipmentLink radio (B/L / booking / container) first, then input, then submit; wait for the result area. |
| MSC | `MEDUW8444954` | BROWSER | Public Track a Shipment may be embedded in a frame; inspect cross-frame elements. |
| Hapag-Lloyd | `HLCUBO2260433677` | BROWSER | Track by booking or container as shown. |
| Yang Ming | `YMJAE237071981` | BROWSER | Single public field accepts container / B/L / booking. |
| Wan Hai | `WHLC040GX05516` | BROWSER | May be guarded by Imperva/verification; stop with `HUMAN_REQUIRED` rather than bypass. |
| ZIM | `ZIMUSNH21290742` | BROWSER | Public field accepts B/L / booking / container. |

## Delegate / existing-channel samples

| Carrier | Reference | Route | Note |
|---|---|---|---|
| COSCO | `COSU6508302440` | DELEGATE | `COSU` routes to the existing COSCO channel; do not run the browser. |

## Carrier-conflict sample

| Marked carrier | Reference | Prefix reading | Route | Note |
|---|---|---|---|---|
| Maersk | `COSU9508236200` | `COSU` → COSCO | DELEGATE | Conflict between the explicit carrier (Maersk) and the `COSU` prefix. The `COSU` prefix routes to the existing COSCO channel, so do not run a Maersk browser workflow. Surface the conflict as a warning; existing-channel result is authoritative. |

## Prefix caveats

- `TJN0940917` (marked CMA CGM) does not start with the `CMDU`/`CMAU` strong prefixes. It needs an explicit carrier selection (or AGENT_DISCOVERY / an ambiguous route if no carrier is supplied). It is not a browser-autodetectable CMA prefix; keep the caller-supplied carrier authority.
- `OOLU8882568660` also appears in chat/CSV sources; already deduplicated here, keep one entry.

## Terminal fixtures

- **FOUND** – a browser sample that returns a visible matching shipment.
- **NOT_FOUND** – a carrier result area that visibly reports `0 results` / `no matching shipment` / `未找到` for an exact reference; ensure no page/request failure wording is mixed in.
- **HUMAN_REQUIRED** – an Access Denied, CAPTCHA, login, or Imperva/verification screen (HMM and Wan Hai are the likely examples).
