# Cargo tracking import recognition — 2026-10-30

This report contains workbook structure and aggregate validation only. Raw cells, source identifiers and local regression output remain in ignored `.tmp/import-real-20261030/`.

## Source task workbook

- Sheet1: A1:K94, header row 1, 93 physical rows after the header, 89 nonempty rows; 17 vertical merges. Sheet2 is empty and excluded.
- Headers: 提单号 / 发票号 / 原ETD / 现ETD / 原ETA / 现ETA / 箱量 / 船名航次 / 提单号： / CARRIER / unnamed notes.
- The first 提单号 column contains internal job references. The ninth column 提单号： contains query references. Treating the first column as the bill number is incorrect.
- Query column: 86 populated cells, including one invalid container-volume cell. One reference is stored as an exact safe integer; the rest are text. No selected identifier has unsafe numeric precision in this file.
- 261 numeric Excel date cells. Dates are decoded from serials to `YYYY-MM-DD`, without conversion through UTC. Current ETD/ETA map to estimated times; original ETD/ETA stay visible in the source preview and are not substituted silently.
- Missing source fields: POL, POD and client/customer code. No customer identity can be inferred from this workbook. Customer assignment requires the user's explicit selection (or their already-selected customer context).
- Baseline capabilities are unchanged: COSCO, CMA, MAERSK, HAPAG_LLOYD, MSC, OOCL. Carrier evidence uses the carrier cell, otherwise a strict known bill prefix, otherwise an explicit user selection. It does not carry a carrier across blank rows.
- Real-file regression: 44 ready candidates, 86 reference preview rows, 6 skipped blank/merged-continuation rows, 0 duplicate query identities. There are 47 issues across 43 source rows: 35 recognized but unconfigured carrier issues, 7 unknown carrier issues, 3 carrier-cell/prefix conflicts, 1 nonempty row missing a reference, 1 invalid reference. **The entire batch remains blocked.** Ready candidates are not submitted separately behind the user's back.
- Non-COSCO cases include supported carriers plus additional carrier codes not enabled in this application's backend. Carrier cells also contain container pickup notes, misspellings and blank values. The result sample alone does not prove API support for those carriers.

## Result workbook

- Tracking: A1:AL64, five merged regions. Title/batch/group rows precede the actual header at row 4. It contains 60 result rows, of which 58 have a container identifier; a shipment result without a container remains a result row.
- Its 38 fields are: 船司代码, 船司, 提交单号, 单号类型, 运输状态, 箱号, 运输方式, 运输条款, 当前位置, 箱最新状态, 箱状态时间, 箱型, 封号, 重量, 起运地, 目的地, 船名, 航次, ETD, ETA, ATD, ATA, 起运节点, 离港节点, 到港节点, 最终目的地, 分段数, 分段摘要, 最新节点, 最新时间, 本票事件数, 事件摘要（前 3 条）, 本票箱数, 声明箱数, 查询方式, 耗时(s), 告警, 证据截图.
- This is a tracking-result format, not a task-import template. Recognition reports `RESULT_WORKBOOK` and prevents creating a task from it.

## Existing API and next Node JSON boundary

The import still uses the existing `/api/business/shipment-batch-tasks` request: `sourceFileName`, `channel`, `customerId`, `publishToCustomer`, and `items`. Each item keeps `carrier`, `type`, query `number`, original `displayNumber`, and the existing `ShipmentImportDetails`. COSCO's existing BOOKING query contract strips only a strict COSU numeric prefix, retaining the full bill in `originalBillOfLading`. Other bills retain their prefix and use BILLOFLADING where supported. No endpoint, auth configuration or new carrier capability has been invented.

The current renderer consumes `{ snapshot }`, with `snapshot.provider`, `tracking`, `summary`, `references`, `keyTimes`, `routingLegs`, `containers` and event/timeline data. `shipmentModel.js` reads the same canonical fields from a backend shipment envelope. A future Node adapter should emit this existing snapshot shape. Mapping the sample columns does not reconstruct event arrays from summary text:

| Sample fields                    | Existing canonical destination                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| 船司代码 / 船司                  | provider.code / provider.name                                                            |
| 提交单号 / 单号类型              | tracking.originalNumber / tracking.type (and exact query number separately)              |
| 运输状态                         | summary.status, using the established enum contract                                      |
| 起运地 / 目的地                  | summary.origin / summary.destination                                                     |
| 船名 / 航次                      | routingLegs[].vessel or vesselName / voyage, per current adapter contract                |
| ETD / ETA / ATD / ATA            | keyTimes estimatedDeparture / estimatedArrival / actualDeparture / actualArrival records |
| 箱号 / 箱型 / 封号 / 重量 / 状态 | containers[] fields, preserving container identity and timestamps                        |
| 最新节点 / 最新时间              | summary.latestEvent                                                                      |
| 分段摘要 / 事件摘要              | display summaries only; structured legs/events must come from actual Node JSON           |
| 告警 / 证据截图                  | diagnostics/evidence metadata; never mark absent tracking fields as successful           |

The Node URL, authentication and response payload are still unspecified. Integration must wait for that concrete contract; unknown URLs are not called. Existing backend permission and publication boundaries remain authoritative.

## Validation

40 focused tests cover exact source-column identification, current dates, numeric precision and leading zeros, strict annotation cleanup, unsupported carriers, conflicts, merged continuations, no client carry-forward, duplicate conflicts, result-sheet rejection, workbook async lifecycle, and prevention of task creation with any blocking issue. The existing shipment import regression script and i18n scan pass. Full frontend typecheck passes. No source workbook was added to Git, no real import was submitted, and no deployment was performed.

## Explicit backend adapter mode after the local queue bridge

The default frontend profile remains LEGACY for the old preview backend (six query carriers and the existing COSCO BOOKING numeric-suffix contract). Building the frontend with VITE_TRACKING_ADAPTER_MODE=LOCAL_QUEUE explicitly selects the paired local Node queue contract. The backend recognizes 16 identities; only the 15 implemented desktop adapters are enabled for querying. HEDE remains recognized but blocked because the desktop runner returns CARRIER_NOT_IMPLEMENTED for it. This profile preserves COSCO bill prefixes with BILLOFLADING, retains CMA BOOKING, and uses the backend canonical WAN_HAI code. An unknown mode falls back to LEGACY; neither AUTO/PROXY channel selection nor a JSON file silently changes the adapter mode. There is currently no runtime backend capability-discovery endpoint, so the build flag must be deployed together with the actual backend adapter configuration.

A read-only repeat audit of the original task workbook yields 75 ready candidates under LOCAL_QUEUE, with 15 blocking issues remaining: three unimplemented HEDE adapter issues, three carrier conflicts, seven unresolved carrier cells, one missing reference and one invalid reference. Of the previous 35 unconfigured-carrier issues, 32 are resolved only in the explicitly selected LOCAL_QUEUE profile; the three HEDE rows remain blocked. The complete batch still cannot be submitted until the remaining source issues are resolved. All 35 ready COSCO rows retain their full COSU bill and BILLOFLADING type. Row previews retain raw/normalized source reference, source type, cell address and adapter-mode evidence. These counts validate parsing and request construction; they do not assert successful live carrier queries through frp. The sanitized dual-profile audit is in ignored .tmp/import-real-20261030/adapter-mode-import-acceptance.json.
