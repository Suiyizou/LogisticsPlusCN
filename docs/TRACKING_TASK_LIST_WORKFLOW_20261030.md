# Excel tracking task-list workflow

## Query-only task page (current behavior)

The dedicated `/workspace/tracking/tasks` page defaults to `QUERY_ONLY`. Upload reads and recognizes the first 60 source records locally; it does not submit a request. The main page shows the upload control, a concise row list, and one Start tracking N shipments button. Customer selection, publication, review checkboxes and row exclusion are absent from this page. Detailed column mapping and parser diagnostics are collapsed under advanced details. The original business IMPORT dialog retains its customer, publication, review and conflict checks.

QUERY_ONLY submits to the existing POST `/api/business/shipment-batch-tasks` endpoint with `mode: "QUERY_ONLY"`, source filename, channel and all selected source rows in their original order. It omits customerId/publishToCustomer. Each item preserves sourceRow and the original sourceReference string. Recognition failures use recognitionErrorCode/recognitionError and become individual FAILED results without sending an ambiguous query. The server creates no shipment, customer binding or customer publication. Polling and cancellation reuse the existing task endpoints.

In this mode a CARRIER cell is authoritative only when it matches a recognized carrier alias; other text remains a source remark. Exact known bill prefixes can identify a carrier. The specifically observed named SM vessels SEOUL, KWANGYANG and YANTIAN identify SML when the carrier is absent. A known carrier conflicting with a known bill prefix still fails that row. Unknown references never inherit a prior default carrier. IMPORT recognition stays strict.

Successful results expand inline from the returned item.payload.snapshot. The view displays existing summary facts, normalized containers, routing legs, source entries and source fields, preserving arrays and objects as text. It does not re-query or navigate to a persistence endpoint. Business-unverified source data is labelled; local evidence paths and sensitive diagnostics are excluded from this read-only view.

Read-only regression against the current original file recognized 60/60 selected records with no recognition errors. Rows 32/33/34 use COSU prefix evidence while preserving their carrier-cell remarks; rows 38/53/54/58 use named SM-vessel evidence. The non-identifying audit is in ignored `.tmp/import-real-20261030/query-only-real-preview.json`; no 60-row query was submitted.

## Original business IMPORT workflow

`/workspace/tracking/tasks` is an authenticated alias of the shipments module task page, rendered inside the existing WorkspaceShell and BusinessCustomerPage host. ADMIN/BUSINESS roles can use it. The sidebar shows Shipment tracking → Batch tasks → Task list. The tracking overview and single-query page contain an Excel task-list link; embedded navigation uses the existing same-origin workspace bridge, while standalone links target the protected route.

The page reuses ShipmentListWorkspacePage in inline task mode, createShipmentModulePages, useShipmentBatchTracking and the existing batch-task APIs. The parser is not duplicated. Its review-scope helper runs the same production parser on an explicit subset while retaining original source row numbers, merged-cell evidence and original cell values.

Upload does not start a task. Default scope is the first 60 source candidates, counting nonempty task rows with missing references as visible blocking candidates. Blank rows, totals and merged continuations remain skipped by the existing parser. The page reports total candidates, the first-window count, out-of-window rows and explicitly excluded rows. Excluding a row does not pull row 61 or later into the window. Out-of-window duplicate conflicts do not alter selected payload details. Every row can be expanded to inspect original cells; errors remain visible for excluded rows.

Customer selection is always explicit; the page neither selects the first customer nor inherits a contextual customer silently. Publication defaults to false and is visible. A review checkbox names the customer/visibility/exclusion responsibility and selected query count. Customer, carrier, sheet/column, publication or exclusion changes invalidate that acknowledgement. The submit button says Query and save N shipments and uses the same reviewed subset for conflict inspection and the existing create-task request. Server progress, per-item results, cancellation and task recovery retain the original workflow.

Packing cargo without recognized bill/booking headers is blocked as an unrecognized tracking task sheet. Tracking result workbooks remain blocked. The downloadable UTF-8 BOM CSV contains only business column headers and a blank line. Users enter real carriers and references, with one shipment per row and mixed carriers supported. Invalid examples remain in automated tests only. Users must correct/re-upload or explicitly exclude problematic rows; no implicit exclusions occur.

Read-only original-file first-window audit is in ignored `.tmp/import-real-20261030/task-list-first60-acceptance.json`. No create-task request was submitted against that file or the existing shipment records. LEGACY versus LOCAL_QUEUE capability profiles continue to follow the explicitly configured frontend/backend mode.
