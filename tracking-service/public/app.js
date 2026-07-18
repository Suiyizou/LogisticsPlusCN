const form = document.querySelector("#tracking-form");
const submitButton = document.querySelector("#submit-button");
const carrierSelect = document.querySelector("#carrier-select");
const channelSelect = document.querySelector("#channel-select");
const trackingType = document.querySelector("#tracking-type");
const trackingNumber = document.querySelector("#tracking-number");
const carrierNotice = document.querySelector("#carrier-notice");
const sourceTag = document.querySelector("#source-tag");
const emptyState = document.querySelector("#empty-state");
const results = document.querySelector("#results");
const errorPanel = document.querySelector("#error-panel");
const errorMessage = document.querySelector("#error-message");
const alertTitle = document.querySelector("#alert-title");
const channelState = document.querySelector("#channel-state");
const channelStatusText = document.querySelector("#channel-status-text");
const overviewMonitorStatus = document.querySelector("#overview-monitor-status");
const activeViewTitle = document.querySelector("#active-view-title");
const historyEmpty = document.querySelector("#history-empty");
const historyTableWrap = document.querySelector("#history-table-wrap");
const historyTableBody = document.querySelector("#history-table-body");
const clearHistoryButton = document.querySelector("#clear-history-button");
const journeyStage = document.querySelector("#journey-stage");
const checkChannelsButton = document.querySelector("#check-channels-button");
const channelCheckSummary = document.querySelector("#channel-check-summary");
const networkProbe = document.querySelector("#network-probe");
const playwrightProbe = document.querySelector("#playwright-probe");
const networkProbeStatus = document.querySelector("#network-probe-status");
const playwrightProbeStatus = document.querySelector("#playwright-probe-status");
const networkProbeLatency = document.querySelector("#network-probe-latency");
const playwrightProbeLatency = document.querySelector("#playwright-probe-latency");
const appShell = document.querySelector(".app-shell");
const systemWaitOverlay = document.querySelector("#system-wait-overlay");
const systemWaitMessage = document.querySelector("#system-wait-message");
const platformRouteOverlay = document.querySelector("#platform-route-overlay");
const batchFileInput = document.querySelector("#batch-file-input");
const batchSelectButton = document.querySelector("#batch-select-button");
const batchResumeButton = document.querySelector("#batch-resume-button");
const batchClearButton = document.querySelector("#batch-clear-button");
const batchImportEmpty = document.querySelector("#batch-import-empty");
const batchImportSummary = document.querySelector("#batch-import-summary");
const batchFileName = document.querySelector("#batch-file-name");
const batchProgressLabel = document.querySelector("#batch-progress-label");
const batchProgressTrack = document.querySelector("#batch-progress-track");
const batchSuccessCount = document.querySelector("#batch-success-count");
const batchFailedCount = document.querySelector("#batch-failed-count");
const batchPendingCount = document.querySelector("#batch-pending-count");
const batchStatusText = document.querySelector("#batch-status-text");
const batchResultList = document.querySelector("#batch-result-list");
const batchImportMessage = document.querySelector("#batch-import-message");
const relatedFilesButton = document.querySelector("#related-files-button");
const relatedFilesCount = document.querySelector("#related-files-count");
const relatedFilesBackdrop = document.querySelector("#related-files-backdrop");
const relatedFilesDrawer = document.querySelector("#related-files-drawer");
const relatedFilesCloseButton = document.querySelector("#related-files-close-button");
const relatedFilesShipmentReference = document.querySelector("#related-files-shipment-reference");
const trackingAccount = document.querySelector("#tracking-account");
const trackingAccountTrigger = document.querySelector("#tracking-account-trigger");
const trackingAccountMark = document.querySelector("#tracking-account-mark");
const trackingAccountName = document.querySelector("#tracking-account-name");
const trackingAccountRole = document.querySelector("#tracking-account-role");
const trackingAccountMenu = document.querySelector("#tracking-account-menu");
const trackingAccountLogoutButton = document.querySelector("#tracking-account-logout");
const relatedFilesAuthRequired = document.querySelector("#related-files-auth-required");
const relatedFilesAuthTitle = document.querySelector("#related-files-auth-title");
const relatedFilesAuthDescription = document.querySelector("#related-files-auth-description");
const relatedFilesAuthLink = document.querySelector("#related-files-auth-link");
const relatedFilesContent = document.querySelector("#related-files-content");
const relatedFilesLoading = document.querySelector("#related-files-loading");
const relatedFilesError = document.querySelector("#related-files-error");
const relatedFilesErrorMessage = document.querySelector("#related-files-error-message");
const relatedFilesRetryButton = document.querySelector("#related-files-retry-button");
const relatedFilesEmpty = document.querySelector("#related-files-empty");
const relatedFilesList = document.querySelector("#related-files-list");
const relatedFilesUploadPanel = document.querySelector("#related-files-upload-panel");
const relatedFilesUserName = document.querySelector("#related-files-user-name");
const relatedFilesCategory = document.querySelector("#related-files-category");
const relatedFilesCategorySelect = document.querySelector("#related-files-category-select");
const relatedFilesCategoryTrigger = document.querySelector("#related-files-category-trigger");
const relatedFilesCategoryLabel = document.querySelector("#related-files-category-label");
const relatedFilesCategoryMenu = document.querySelector("#related-files-category-menu");
const relatedFilesCategoryOptions = Array.from(document.querySelectorAll("[data-category-value]"));
const relatedFilesUploadVisibilityField = document.querySelector("#related-files-upload-visibility-field");
const relatedFilesUploadVisibility = document.querySelector("#related-files-upload-visibility");
const relatedFilesTargetCustomerField = document.querySelector("#related-files-target-customer-field");
const relatedFilesTargetCustomer = document.querySelector("#related-files-target-customer");
const relatedFilesTargetCustomerHint = document.querySelector("#related-files-target-customer-hint");
const relatedFilesUploadInput = document.querySelector("#related-files-upload-input");
const relatedFilesSelectButton = document.querySelector("#related-files-select-button");
const relatedFilesUploadButton = document.querySelector("#related-files-upload-button");
const relatedFilesSelection = document.querySelector("#related-files-selection");
const relatedFilesUploadMessage = document.querySelector("#related-files-upload-message");
const documentDrawerLayer = document.querySelector("#document-drawer-layer");
const documentDrawer = document.querySelector("#document-drawer");
const documentList = document.querySelector("#document-list");
const businessReferenceDialog = document.querySelector("#business-reference-dialog");
const businessReferenceForm = document.querySelector("#business-reference-form");
const documentEditorDialog = document.querySelector("#document-editor-dialog");
const documentEditorForm = document.querySelector("#document-editor-form");

const CACHE_VERSION = 3;
const CACHE_TTL_MS = 24 * 60 * 60_000;
const CACHE_LIMIT = 20;
const CACHE_PREFIX = "shipment-track:v3:";
const CACHE_INDEX_KEY = "shipment-track:v3:index";
const LEGACY_CACHE_INDEX_KEY = "shipment-track:v2:index";
const MIGRATION_KEY = "shipment-track:v3:migrated";
const LANGUAGE_KEY = "shipment-track:language";
const BATCH_STORAGE_KEY = "shipment-track:batch-import:v1";
const BATCH_VERSION = 1;
const BATCH_IMPORT_LIMIT = 50;
const BATCH_FILE_SIZE_LIMIT = 2 * 1024 * 1024;
const BATCH_REQUEST_INTERVAL_MS = 2_100;
const BATCH_RETRY_BASE_MS = 2_200;
const BATCH_RETRY_LIMIT = 2;
const BATCH_RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const PLATFORM_AUTH_TOKEN_KEY = "cargo-planner-auth-token";
const PLATFORM_AUTH_USER_KEY = "cargo-planner-auth-user";
const CUSTOMER_AUTH_TOKEN_KEY = "cargo-planner-customer-token";
const CUSTOMER_AUTH_SESSION_KEY = "cargo-planner-customer-session";
const APP_BASE_URL = new URL("./", document.baseURI);

function appUrl(path) {
  return new URL(String(path).replace(/^\/+/, ""), APP_BASE_URL).toString();
}

function requireAuthorizedResponse(response) {
  if (response.status === 401) {
    window.location.replace("/");
    throw new Error("Platform session expired");
  }
  return response;
}
const BUSINESS_REFERENCE_PREFIX = "shipment-track:business-references:";
const DOCUMENT_METADATA_PREFIX = "shipment-track:documents:";

const DOCUMENT_TYPES = Object.freeze([
  {
    code: "EXPORT_CIV_PL",
    labelKey: "documents.type.exportCivPl",
    uploaders: ["shipper"],
    visibility: ["pending", "uploader", "agents", "all"]
  },
  {
    code: "HOUSE_BILL",
    labelKey: "documents.type.houseBill",
    uploaders: ["forwarder"],
    visibility: ["all"]
  },
  {
    code: "MASTER_BILL",
    labelKey: "documents.type.masterBill",
    uploaders: ["forwarder"],
    visibility: ["agents"]
  },
  {
    code: "ARRIVAL_NOTICE",
    labelKey: "documents.type.arrivalNotice",
    uploaders: ["overseasAgent"],
    visibility: ["pending", "agents", "consignee", "all"]
  },
  {
    code: "DELIVERY_ORDER",
    labelKey: "documents.type.deliveryOrder",
    uploaders: ["overseasAgent"],
    visibility: ["pending", "agents", "consignee"]
  },
  {
    code: "POD",
    labelKey: "documents.type.pod",
    uploaders: ["overseasAgent"],
    visibility: ["shipperConsignee"]
  },
  {
    code: "DUTY_SUMMARY",
    labelKey: "documents.type.dutySummary",
    uploaders: ["overseasAgent"],
    visibility: ["pending", "agents", "consignee"]
  },
  {
    code: "IMPORT_CIV_PL",
    labelKey: "documents.type.importCivPl",
    uploaders: ["shipper", "consignee"],
    visibility: ["pending", "shipperConsignee", "agents", "all"]
  }
]);

const CARRIERS = Object.freeze({
  COSCO: {
    code: "COSCO",
    name: "COSCO SHIPPING",
    enabled: true,
    source: "COSCO · PUBLIC WEB"
  },
  CMA: {
    code: "CMA",
    name: "CMA CGM",
    enabled: true,
    source: "CMA CGM · SERVER HTML"
  }
});

const CHANNELS = Object.freeze({
  AUTO: {
    code: "AUTO",
    labelKey: "channel.auto",
    sourceKey: "source.auto"
  },
  NETWORK: {
    code: "NETWORK",
    labelKey: "channel.network",
    sourceKey: "source.network"
  },
  PLAYWRIGHT: {
    code: "PLAYWRIGHT",
    labelKey: "channel.playwright",
    sourceKey: "source.playwright"
  }
});

const TYPE_KEYS = Object.freeze({
  BILLOFLADING: "type.bill",
  BOOKING: "type.booking",
  CONTAINER: "type.container"
});

const MESSAGES = {
  en: {
    "meta.title": "Shipment Track · Carrier Intelligence",
    "meta.description": "A unified multi-carrier shipment tracking workspace",
    "brand.subtitle": "Carrier intelligence desk",
    "nav.ariaLabel": "Primary navigation",
    "nav.workspace": "Workspace",
    "nav.portal": "Open workbenches",
    "nav.overview": "Overview",
    "nav.tracking": "Shipment tracking",
    "nav.carriers": "Carrier adapters",
    "carrier.connected": "Connected · 2 channels",
    "carrier.planned": "Adapter reserved",
    "carrier.cmaConnected": "Connected · HTML/PDF",
    "carrier.cmaOption": "CMA CGM · CONNECTED",
    "carrier.cmaNotice": "CMA CGM uses its server-rendered HTML tracking page.",
    "sidebar.architecture": "UNIFIED ADAPTER",
    "breadcrumb.workspace": "Workspace",
    "overview.kicker": "SHIPMENT DASHBOARD",
    "overview.title": "Your shipments, moving in plain sight.",
    "overview.description": "See ports, sailing dates and arrival status at a glance, then expand any shipment for its latest movement.",
    "overview.startTracking": "Track a shipment",
    "overview.savedSearches": "Saved searches",
    "overview.carriersUsed": "Carriers used",
    "overview.lastUpdated": "Last updated",
    "overview.monitoring": "Carrier monitoring",
    "overview.noRecords": "No records",
    "workbench.kicker": "QUERY WORKBENCH",
    "workbench.title": "Channel health",
    "workbench.description": "COSCO uses the network API first and switches to the browser DOM automatically when needed.",
    "workbench.policy": "API FIRST · DOM FALLBACK",
    "workbench.check": "Check both channels",
    "workbench.checking": "Checking both channels…",
    "workbench.primary": "PRIMARY · NETWORK API",
    "workbench.fallback": "FALLBACK · BROWSER DOM",
    "workbench.networkName": "Network interface",
    "workbench.playwrightName": "Playwright browser",
    "workbench.notChecked": "Not checked",
    "workbench.available": "Available",
    "workbench.unavailable": "Unavailable",
    "workbench.helper": "The check uses the current shipment number; it does not add a tracking record.",
    "workbench.checkedAt": "Both channels checked at {time}",
    "workbench.checkFailed": "Channel check failed: {message}",
    "workbench.latency": "{time} ms",
    "history.title": "Tracked shipments",
    "history.subtitle": "Latest carrier snapshots stored on this browser",
    "history.clear": "Clear history",
    "history.emptyTitle": "No shipment history yet",
    "history.emptyDescription": "Your successful searches will appear here.",
    "history.carrier": "Carrier",
    "history.reference": "Shipment No.",
    "history.route": "Route",
    "history.latestStatus": "Latest status",
    "history.queriedAt": "Queried at",
    "history.open": "Open details",
    "history.delete": "Delete",
    "history.deleteLabel": "Delete tracking history for {number}",
    "history.confirmDelete": "Delete the saved tracking history for {number}? This only removes the browser snapshot.",
    "history.departed": "Departed",
    "history.etd": "ETD",
    "history.arrived": "Arrived",
    "history.eta": "ETA",
    "history.originPort": "Origin port",
    "history.destinationPort": "Destination port",
    "history.currentLocation": "Current location",
    "history.updated": "Snapshot updated",
    "history.recentMovement": "Recent movement",
    "history.expand": "Expand shipment {number}",
    "history.collapse": "Collapse shipment {number}",
    "history.noTimeline": "No confirmed movement events yet.",
    "history.confirmClear": "Clear all locally saved shipment history?",
    "tracking.kicker": "SHIPMENT INTELLIGENCE",
    "tracking.title": "Shipment tracking",
    "tracking.description": "Query carrier sources and shape them into one consistent snapshot.",
    "account.menu": "Open account menu",
    "account.home": "Platform home",
    "account.signOut": "Sign out",
    "account.customer": "Customer access",
    "account.roleAdmin": "Administrator",
    "account.roleBusiness": "Business operator",
    "account.roleUser": "Internal user",
    "files.trigger": "Related files",
    "files.unavailable": "Related files will be available after this shipment is saved by the platform.",
    "files.kicker": "SHIPMENT DOCUMENTS",
    "files.title": "Related files",
    "files.close": "Close related files",
    "files.loginTitle": "Sign in to manage shipment files",
    "files.loginDescription": "Shipment documents are available to authenticated enterprise users.",
    "files.loginAction": "Sign in to the platform",
    "files.customerSession": "Customer access",
    "files.customerLogout": "Sign out",
    "files.customerLoginAction": "Sign in with customer code",
    "files.customerSignedOut": "Customer session ended. Public shipment tracking remains available.",
    "files.customerLoginExpired": "Your customer session has expired. Sign in again with your customer code to access assigned files.",
    "files.customerNotAssigned": "This shipment is not assigned to your customer account. Ask your service representative to link the booking or bill number.",
    "files.forbidden": "Your account does not have access to the files for this shipment.",
    "files.logisticsRoleAgent": "Freight agent",
    "files.logisticsRoleShipper": "Shipper",
    "files.logisticsRoleConsignee": "Consignee",
    "files.loading": "Loading related files…",
    "files.errorTitle": "Files could not be loaded",
    "files.retry": "Try again",
    "files.emptyTitle": "No related files yet",
    "files.emptyDescription": "Upload cargo details, invoices or shipping documents for this shipment.",
    "files.uploadTitle": "Add files",
    "files.uploadDescription": "Files are linked to this shipment record.",
    "files.category": "Category",
    "files.categoryCargo": "Cargo details",
    "files.categoryInvoice": "Invoice",
    "files.categoryShipping": "Shipping document",
    "files.categoryOther": "Other",
    "files.visibility": "Visibility",
    "files.visibilityParties": "Both parties",
    "files.visibilityInternal": "Internal only",
    "files.targetCustomer": "Share with customer",
    "files.targetPlaceholder": "Select a customer",
    "files.targetRequired": "Select a specific customer before uploading a shared file.",
    "files.targetUnavailable": "No customer is available for sharing. Assign a customer first or keep this file internal.",
    "files.targetRequiredForFile": "Choose a customer to finish sharing this file.",
    "files.sharedWith": "Shared with {name}",
    "files.sharedWithSelf": "Shared with your account",
    "files.sharedWithCustomer": "Shared with assigned customer",
    "files.customerSelectionRequired": "Customer selection required",
    "files.select": "Choose files",
    "files.upload": "Upload",
    "files.uploading": "Uploading files…",
    "files.uploaded": "{count} file(s) uploaded.",
    "files.noSelection": "No files selected.",
    "files.selection": "{count} file(s) selected · {size}",
    "files.uploadFailed": "Upload failed: {message}",
    "files.serverError": "The server could not save the file. Please try again or contact the administrator.",
    "files.download": "Download",
    "files.downloading": "Downloading…",
    "files.downloadFailed": "Download failed: {message}",
    "files.delete": "Delete",
    "files.confirmDelete": "Delete “{name}” from this shipment?",
    "files.deleteFailed": "Delete failed: {message}",
    "files.visibilityUpdateFailed": "Visibility could not be updated: {message}",
    "files.contextMissing": "This result is not connected to a saved shipment record yet.",
    "files.unknownUploader": "Enterprise user",
    "files.unknownDate": "Upload time not provided",
    "result.transportTerms": "Transport terms",
    "result.containerType": "Container type",
    "summary.services": "Selected services",
    "summary.sea": "Ocean",
    "summary.inland": "Inland",
    "summary.customs": "Customs",
    "summary.warehouse": "Warehouse",
    "query.carrier": "Carrier",
    "query.channel": "Query channel",
    "query.type": "Shipment number type",
    "query.number": "Shipment No.",
    "query.submit": "Track shipment",
    "query.loading": "Tracking…",
    "wait.tracking": "Retrieving the latest shipment data…",
    "wait.channels": "Checking carrier channels…",
    "wait.home": "Returning to the DrewesLogistics home page…",
    "wait.batch": "Processing the imported shipment queue…",
    "wait.complete": "Request completed",
    "batch.title": "Batch tracking import",
    "batch.subtitle": "Import an Excel or CSV list and query shipments one at a time",
    "batch.localBadge": "This device only",
    "batch.selectFile": "Select Excel / CSV",
    "batch.columns": "Recognizes Booking / Booking Ref / Booking No. and Bill of Lading / B/L / MBL / B/L No. columns.",
    "batch.localNotice": "Queue and result status are stored only in this browser on this device.",
    "batch.resume": "Continue pending queries",
    "batch.clear": "Clear imported queue",
    "batch.emptyTitle": "No imported queue",
    "batch.emptyDescription": "Choose a spreadsheet to begin batch tracking.",
    "batch.file": "Imported file",
    "batch.success": "Succeeded",
    "batch.failed": "Failed",
    "batch.pending": "Pending",
    "batch.parsing": "Reading {name}…",
    "batch.unsupportedFile": "Choose an .xlsx, .xls, or .csv file no larger than 2 MB.",
    "batch.noRecognizedColumns": "No supported column was found. Use Booking / Booking Ref / Booking No. or Bill of Lading / B/L / MBL / B/L No.",
    "batch.noRows": "No valid shipment numbers were found in the recognized columns.",
    "batch.workerUnsupported": "This browser cannot process spreadsheets in a background worker.",
    "batch.workerFailed": "The background spreadsheet parser stopped unexpectedly.",
    "batch.parseTimeout": "Spreadsheet parsing took too long. Try a smaller file.",
    "batch.limit": "Found {found} unique rows. The first {limit} were imported to keep this browser responsive.",
    "batch.ready": "{count} unique shipment numbers imported.",
    "batch.running": "Querying {current} of {total}: {number}",
    "batch.completed": "Batch complete: {success} succeeded and {failed} failed.",
    "batch.restored": "The locally saved queue is ready to continue.",
    "batch.importFailed": "The spreadsheet could not be read: {message}",
    "batch.itemPending": "Pending",
    "batch.itemRunning": "Querying",
    "batch.itemSuccess": "Succeeded",
    "batch.itemCached": "Reused device cache",
    "batch.itemFailed": "Failed",
    "batch.listAria": "Imported shipment queue",
    "batch.openItem": "Open and query {type} {number}",
    "batch.confirmClear": "Clear the imported queue and its status from this device? Saved shipment snapshots are kept.",
    "query.helper": "Automatic mode calls the network interface first and uses the Playwright browser only as a fallback.",
    "channel.auto": "Automatic · API first, DOM fallback",
    "channel.network": "Channel 1 · Network interface",
    "channel.playwright": "Channel 2 · Playwright browser",
    "source.auto": "COSCO · API FIRST · DOM FALLBACK",
    "source.network": "COSCO · CHANNEL 1 · NETWORK",
    "source.playwright": "COSCO · CHANNEL 2 · PLAYWRIGHT",
    "type.bill": "Bill of lading",
    "type.booking": "Booking number",
    "type.container": "Container number",
    "error.title": "Tracking request failed",
    "error.generic": "Tracking failed. Please try again.",
    "error.http": "Tracking failed (HTTP {status})",
    "error.localFallback": "{message} Showing the latest browser snapshot instead.",
    "notice.cacheTitle": "Live refresh unavailable",
    "empty.title": "Ready when you are",
    "empty.description": "Enter a bill, booking or container number to begin.",
    "metrics.actualDeparture": "Actual departure",
    "metrics.actualArrival": "Actual arrival",
    "metrics.notDeparted": "Not departed",
    "metrics.notArrived": "Not arrived",
    "metrics.estimatedDelivery": "Estimated final delivery",
    "metrics.latestEvent": "Latest event",
    "metrics.noLatestEvent": "No latest event",
    "journey.currentStage": "Current stage",
    "journey.departed": "Departed",
    "journey.arrived": "Port arrival",
    "journey.delivered": "Final destination",
    "journey.progress": "{completed} of {total} milestones confirmed",
    "journey.awaiting": "Awaiting the next carrier event",
    "route.title": "Route story",
    "route.origin": "Origin",
    "route.destination": "Destination",
    "route.nodes": "{count} nodes",
    "route.noNodes": "The carrier did not provide route nodes.",
    "route.unknownLocation": "Unknown location",
    "route.noEvent": "Event name not provided",
    "route.progress": "Route progress {progress}%",
    "route.stage.origin": "Place of receipt",
    "route.stage.departure": "Departure port",
    "route.stage.arrival": "Arrival port",
    "route.stage.destination": "Final destination",
    "route.stage.waypoint": "Route waypoint",
    "references.title": "Carrier identifiers",
    "references.masterBill": "Master bill",
    "references.booking": "Booking number",
    "references.external": "Other carrier references",
    "business.kicker": "BUSINESS REFERENCES",
    "business.edit": "Edit business references",
    "business.dialogTitle": "Edit shipment identifiers",
    "business.clientCode": "Client name code",
    "business.clientPo": "Client PO number",
    "business.forwarderJob": "Forwarder job number",
    "routing.title": "Routing legs",
    "routing.legs": "{count} legs",
    "routing.leg": "Leg",
    "routing.transport": "Mode / vessel",
    "routing.voyage": "Service / voyage",
    "routing.loadPort": "Load port",
    "routing.dischargePort": "Discharge port",
    "routing.estimatedDeparture": "Est. departure",
    "routing.truckInfoProvided": "Trucking information is provided by the trucking company.",
    "routing.actualDeparture": "Actual departure",
    "routing.estimatedArrival": "Est. arrival",
    "routing.actualArrival": "Actual arrival",
    "routing.masterBill": "Master bill",
    "routing.empty": "The carrier did not provide enough data to compose routing legs.",
    "trackingEvents.title": "Tracking information",
    "trackingEvents.subtitle": "Estimated and confirmed carrier milestones",
    "trackingEvents.movement": "Movement",
    "trackingEvents.estimate": "Estimate",
    "trackingEvents.actual": "Actual",
    "trackingEvents.emptyPickup": "Empty container picked up at origin",
    "trackingEvents.gatedIn": "Container gated in at origin",
    "trackingEvents.loaded": "Container loaded on vessel",
    "trackingEvents.departure": "Vessel departure from first load port",
    "trackingEvents.arrival": "Vessel arrival at final discharge port",
    "trackingEvents.gatedOut": "Container gated out",
    "trackingEvents.emptyReturn": "Empty container returned",
    "containers.title": "Container details",
    "containers.count": "{count} containers",
    "containers.number": "Container",
    "containers.type": "Type",
    "containers.mode": "Mode",
    "containers.terms": "Terms",
    "containers.location": "Current location",
    "containers.status": "Latest status",
    "containers.time": "Status time",
    "containers.details": "Details",
    "containers.openDetails": "View timeline",
    "containers.closeDetails": "Hide timeline",
    "containers.noMilestones": "No container-specific milestones were returned.",
    "containers.enriched": "Completed by container sub-query",
    "containers.empty": "The carrier did not provide container-level details.",
    "documents.kicker": "SHIPMENT FILES",
    "documents.title": "Document details",
    "documents.open": "Documents",
    "documents.intro": "One primary file is retained for each topic. Add, edit or delete the file and its visibility metadata here.",
    "documents.file": "File",
    "documents.uploader": "Upload subject",
    "documents.visibility": "Visible to",
    "documents.notUploaded": "Not uploaded",
    "documents.add": "Add file",
    "documents.edit": "Edit",
    "documents.delete": "Delete",
    "documents.updated": "Updated {time}",
    "documents.currentFile": "Current file: {name}",
    "documents.chooseFile": "Choose a file before saving.",
    "documents.confirmDelete": "Delete {name} from this shipment?",
    "documents.type.exportCivPl": "CIV & PL · Export invoice and packing list",
    "documents.type.houseBill": "House bill of lading",
    "documents.type.masterBill": "Master bill of lading · MB/L",
    "documents.type.arrivalNotice": "Arrival notice",
    "documents.type.deliveryOrder": "Delivery order",
    "documents.type.pod": "POD · Proof of delivery",
    "documents.type.dutySummary": "Duty summary",
    "documents.type.importCivPl": "Import CIV & PL",
    "documents.subject.shipper": "Shipper",
    "documents.subject.forwarder": "Freight forwarder",
    "documents.subject.overseasAgent": "Overseas agent",
    "documents.subject.consignee": "Consignee",
    "documents.visibility.pending": "To be confirmed",
    "documents.visibility.uploader": "Uploader only",
    "documents.visibility.agents": "Agents",
    "documents.visibility.consignee": "Consignee",
    "documents.visibility.shipperConsignee": "Shipper and consignee",
    "documents.visibility.all": "All shipment parties",
    "raw.title": "Decoded source payload",
    "raw.cacheNotice": "The browser cache stores the unified snapshot only, not the carrier's raw payload.",
    "common.notProvided": "Not provided",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "cache.live": "Live result",
    "cache.server": "Server cache",
    "cache.browser": "Browser cache",
    "cache.savedAt": "Saved {time}",
    "status.available": "Channel 1 network available",
    "status.unavailable": "Channel 1 network unavailable",
    "status.checking": "Channel 1 network checking",
    "status.disabled": "Channel 1 monitor disabled",
    "status.unknown": "Channel 1 awaiting check",
    "status.shortAvailable": "Healthy",
    "status.shortUnavailable": "Unavailable",
    "status.shortChecking": "Checking",
    "status.shortDisabled": "Disabled",
    "status.shortUnknown": "Awaiting check",
    "status.lastCheck": "Last check: {time}",
    "status.nextCheck": "Next check: {time}",
    "status.error": "Error: {message}"
  },
  zh: {
    "meta.title": "Shipment Track · 船司货运工作台",
    "meta.description": "统一的多船司货运跟踪工作台",
    "brand.subtitle": "船司数据工作台",
    "nav.ariaLabel": "主导航",
    "nav.workspace": "工作区",
    "nav.portal": "进入业务工作台",
    "nav.overview": "总览",
    "nav.tracking": "货物跟踪",
    "nav.carriers": "船司适配器",
    "carrier.connected": "已接入 · 双通道",
    "carrier.planned": "已预留适配器",
    "carrier.cmaConnected": "已接入 · HTML/PDF",
    "carrier.cmaOption": "CMA CGM · 已接入",
    "carrier.cmaNotice": "CMA CGM 使用服务端渲染 HTML 查询通道。",
    "sidebar.architecture": "统一适配层",
    "breadcrumb.workspace": "工作台",
    "overview.kicker": "运输看板",
    "overview.title": "每一票货物，进度一眼可见。",
    "overview.description": "直观看到港口、离港日期和到达状态，也可展开单条货物查看最新动态。",
    "overview.startTracking": "查询一票货物",
    "overview.savedSearches": "已保存查询",
    "overview.carriersUsed": "已使用船司",
    "overview.lastUpdated": "最近更新",
    "overview.monitoring": "船司监控",
    "overview.noRecords": "暂无记录",
    "workbench.kicker": "查询工作台",
    "workbench.title": "通道健康状态",
    "workbench.description": "COSCO 默认优先调用网络接口，必要时自动切换浏览器 DOM 托底。",
    "workbench.policy": "接口优先 · DOM 托底",
    "workbench.check": "检测双通道",
    "workbench.checking": "正在检测两个通道…",
    "workbench.primary": "主通道 · 网络接口",
    "workbench.fallback": "托底通道 · 浏览器 DOM",
    "workbench.networkName": "网络接口",
    "workbench.playwrightName": "Playwright 浏览器",
    "workbench.notChecked": "尚未检测",
    "workbench.available": "可用",
    "workbench.unavailable": "不可用",
    "workbench.helper": "检测使用当前运输单号，不会写入查询记录。",
    "workbench.checkedAt": "双通道检测完成：{time}",
    "workbench.checkFailed": "通道检测失败：{message}",
    "workbench.latency": "{time} 毫秒",
    "history.title": "运输任务",
    "history.subtitle": "当前浏览器保存的最新船司快照",
    "history.clear": "清空记录",
    "history.emptyTitle": "还没有查询记录",
    "history.emptyDescription": "成功查询的货物会显示在这里。",
    "history.carrier": "船司",
    "history.reference": "运输单号",
    "history.route": "路线",
    "history.latestStatus": "最新状态",
    "history.queriedAt": "查询时间",
    "history.open": "打开详情",
    "history.delete": "删除",
    "history.deleteLabel": "删除 {number} 的跟踪历史",
    "history.confirmDelete": "确定删除 {number} 的本地跟踪历史吗？只会移除浏览器快照。",
    "history.departed": "已离港",
    "history.etd": "预计离港",
    "history.arrived": "已到达",
    "history.eta": "预计到达",
    "history.originPort": "起运港",
    "history.destinationPort": "目的港",
    "history.currentLocation": "当前位置",
    "history.updated": "快照更新时间",
    "history.recentMovement": "最近动态",
    "history.expand": "展开运输任务 {number}",
    "history.collapse": "收起运输任务 {number}",
    "history.noTimeline": "船司尚未提供已确认的运输动态。",
    "history.confirmClear": "确定清空当前浏览器保存的全部查询记录吗？",
    "tracking.kicker": "货运信息",
    "tracking.title": "货物跟踪",
    "tracking.description": "查询船司数据源，并转换为统一的运输状态快照。",
    "account.menu": "打开账户菜单",
    "account.home": "返回平台首页",
    "account.signOut": "退出登录",
    "account.customer": "客户身份",
    "account.roleAdmin": "系统管理员",
    "account.roleBusiness": "业务员",
    "account.roleUser": "内部用户",
    "files.trigger": "相关文件",
    "files.unavailable": "平台保存这票货物后即可使用相关文件。",
    "files.kicker": "货物文档",
    "files.title": "相关文件",
    "files.close": "关闭相关文件",
    "files.loginTitle": "登录后管理货物文件",
    "files.loginDescription": "货物明细、账单和寄运文件仅向已登录企业用户开放。",
    "files.loginAction": "登录平台",
    "files.customerSession": "客户身份",
    "files.customerLogout": "退出客户登录",
    "files.customerLoginAction": "使用客户码重新登录",
    "files.customerSignedOut": "已退出客户登录，仍可继续使用公开货物追踪。",
    "files.customerLoginExpired": "客户登录已过期，请重新使用客户码登录后查看已关联文件。",
    "files.customerNotAssigned": "这票货物尚未关联到您的客户账号，请联系业务员绑定对应订舱号或提单号。",
    "files.forbidden": "当前账号无权查看这票货物的相关文件。",
    "files.logisticsRoleAgent": "货运代理",
    "files.logisticsRoleShipper": "发货人",
    "files.logisticsRoleConsignee": "收货人",
    "files.loading": "正在加载相关文件…",
    "files.errorTitle": "暂时无法加载文件",
    "files.retry": "重新加载",
    "files.emptyTitle": "还没有相关文件",
    "files.emptyDescription": "可以为这票货物上传货物明细、账单或寄运文件。",
    "files.uploadTitle": "添加文件",
    "files.uploadDescription": "文件将关联到当前货物记录。",
    "files.category": "文件类别",
    "files.categoryCargo": "货物明细",
    "files.categoryInvoice": "账单",
    "files.categoryShipping": "寄运文件",
    "files.categoryOther": "其他",
    "files.visibility": "可见范围",
    "files.visibilityParties": "双方可见",
    "files.visibilityInternal": "仅内部可见",
    "files.targetCustomer": "共享给客户",
    "files.targetPlaceholder": "请选择客户",
    "files.targetRequired": "共享文件前，请先选择一个具体客户。",
    "files.targetUnavailable": "当前没有可共享的客户，请先分配客户，或将文件保留为仅内部可见。",
    "files.targetRequiredForFile": "请选择客户后再完成此文件的共享。",
    "files.sharedWith": "已共享给 {name}",
    "files.sharedWithSelf": "已共享给您的账号",
    "files.sharedWithCustomer": "已共享给关联客户",
    "files.customerSelectionRequired": "需要选择客户",
    "files.select": "选择文件",
    "files.upload": "上传",
    "files.uploading": "正在上传文件…",
    "files.uploaded": "已上传 {count} 个文件。",
    "files.noSelection": "尚未选择文件。",
    "files.selection": "已选择 {count} 个文件 · {size}",
    "files.uploadFailed": "上传失败：{message}",
    "files.serverError": "服务器暂时无法保存文件，请稍后重试或联系管理员。",
    "files.download": "下载",
    "files.downloading": "正在下载…",
    "files.downloadFailed": "下载失败：{message}",
    "files.delete": "删除",
    "files.confirmDelete": "确定从这票货物中删除“{name}”吗？",
    "files.deleteFailed": "删除失败：{message}",
    "files.visibilityUpdateFailed": "无法更新可见范围：{message}",
    "files.contextMissing": "当前结果尚未关联到平台货物记录。",
    "files.unknownUploader": "企业用户",
    "files.unknownDate": "未提供上传时间",
    "result.transportTerms": "运输条款",
    "result.containerType": "箱型",
    "summary.services": "已选服务",
    "summary.sea": "海运",
    "summary.inland": "陆运",
    "summary.customs": "关务",
    "summary.warehouse": "仓储",
    "query.carrier": "船司",
    "query.channel": "查询通道",
    "query.type": "运输单号类型",
    "query.number": "运输单号",
    "query.submit": "查询运输信息",
    "query.loading": "查询中…",
    "wait.tracking": "正在获取最新货物信息…",
    "wait.channels": "正在检测船司查询通道…",
    "wait.home": "正在返回 DrewesLogistics 首页…",
    "wait.batch": "正在逐条处理导入的货物队列…",
    "wait.complete": "请求已完成",
    "batch.title": "批量导入查询",
    "batch.subtitle": "导入 Excel 或 CSV 清单，按顺序逐票查询",
    "batch.localBadge": "仅保存在本设备",
    "batch.selectFile": "选择 Excel / CSV",
    "batch.columns": "支持 Booking / Booking Ref / 订舱号，以及 Bill of Lading / B/L / MBL / 提单号列。",
    "batch.localNotice": "队列和处理状态仅保存在本设备的当前浏览器中。",
    "batch.resume": "继续查询待处理项目",
    "batch.clear": "清除导入队列",
    "batch.emptyTitle": "尚未导入查询队列",
    "batch.emptyDescription": "请选择表格文件开始批量货物查询。",
    "batch.file": "导入文件",
    "batch.success": "成功",
    "batch.failed": "失败",
    "batch.pending": "待处理",
    "batch.parsing": "正在读取 {name}…",
    "batch.unsupportedFile": "请选择不超过 2 MB 的 .xlsx、.xls 或 .csv 文件。",
    "batch.noRecognizedColumns": "没有找到支持的列，请使用 Booking / Booking Ref / 订舱号或 Bill of Lading / B/L / MBL / 提单号。",
    "batch.noRows": "识别到的列中没有有效运输单号。",
    "batch.workerUnsupported": "当前浏览器无法在后台线程中处理表格。",
    "batch.workerFailed": "后台表格解析器意外停止。",
    "batch.parseTimeout": "表格解析时间过长，请尝试更小的文件。",
    "batch.limit": "共识别 {found} 条唯一记录。为保持页面流畅，本次导入前 {limit} 条。",
    "batch.ready": "已导入 {count} 条唯一运输单号。",
    "batch.running": "正在查询第 {current}/{total} 条：{number}",
    "batch.completed": "批量查询完成：成功 {success} 条，失败 {failed} 条。",
    "batch.restored": "本设备保存的队列已恢复，可以继续处理。",
    "batch.importFailed": "无法读取表格：{message}",
    "batch.itemPending": "待处理",
    "batch.itemRunning": "查询中",
    "batch.itemSuccess": "成功",
    "batch.itemCached": "复用本设备缓存",
    "batch.itemFailed": "失败",
    "batch.listAria": "已导入的货物查询队列",
    "batch.openItem": "打开并查询{type} {number}",
    "batch.confirmClear": "确定清除此设备上的导入队列和处理状态吗？已保存的货物快照会保留。",
    "query.helper": "自动模式优先调用网络接口，失败后才启用 Playwright 浏览器托底。",
    "channel.auto": "自动 · 接口优先，DOM 托底",
    "channel.network": "通道一 · 网络接口",
    "channel.playwright": "通道二 · Playwright 浏览器",
    "source.auto": "COSCO · 接口优先 · DOM 托底",
    "source.network": "COSCO · 通道一 · 网络接口",
    "source.playwright": "COSCO · 通道二 · PLAYWRIGHT",
    "type.bill": "提单号",
    "type.booking": "订舱号",
    "type.container": "箱号",
    "error.title": "查询失败",
    "error.generic": "查询失败，请稍后重试。",
    "error.http": "查询失败（HTTP {status}）",
    "error.localFallback": "{message} 当前展示最近一次浏览器缓存结果。",
    "notice.cacheTitle": "实时刷新暂不可用",
    "empty.title": "等待查询",
    "empty.description": "输入提单号、订舱号或箱号即可开始。",
    "metrics.actualDeparture": "实际离港",
    "metrics.actualArrival": "实际到港",
    "metrics.notDeparted": "未离港",
    "metrics.notArrived": "未到港",
    "metrics.estimatedDelivery": "预计到达最终目的地",
    "metrics.latestEvent": "最新动态",
    "metrics.noLatestEvent": "暂无最新动态",
    "journey.currentStage": "当前阶段",
    "journey.departed": "已离港",
    "journey.arrived": "已到港",
    "journey.delivered": "最终目的地",
    "journey.progress": "已确认 {completed}/{total} 个主要节点",
    "journey.awaiting": "等待船司更新下一节点",
    "route.title": "路线详情",
    "route.origin": "起始地",
    "route.destination": "目的地",
    "route.nodes": "{count} 个节点",
    "route.noNodes": "船司未提供路线节点。",
    "route.unknownLocation": "未知地点",
    "route.noEvent": "船司未提供事件名称",
    "route.progress": "路线进度 {progress}%",
    "route.stage.origin": "起运节点",
    "route.stage.departure": "离港节点",
    "route.stage.arrival": "到港节点",
    "route.stage.destination": "最终目的地",
    "route.stage.waypoint": "运输节点",
    "references.title": "船司识别号",
    "references.masterBill": "主提单号",
    "references.booking": "订舱号",
    "references.external": "其他船司参考号",
    "business.kicker": "业务参考号",
    "business.edit": "编辑业务参考号",
    "business.dialogTitle": "编辑票单识别信息",
    "business.clientCode": "客户名称代码",
    "business.clientPo": "客户订单号",
    "business.forwarderJob": "货代订单号",
    "routing.title": "分段运输 Routing",
    "routing.legs": "{count} 段",
    "routing.leg": "段",
    "routing.transport": "运输 / 船名",
    "routing.voyage": "航线 / 航次",
    "routing.loadPort": "装载港",
    "routing.dischargePort": "卸载港",
    "routing.estimatedDeparture": "预计离港",
    "routing.truckInfoProvided": "拖车信息由拖车公司提供。",
    "routing.actualDeparture": "实际离港",
    "routing.estimatedArrival": "预计到港",
    "routing.actualArrival": "实际到港",
    "routing.masterBill": "主提单",
    "routing.empty": "船司未提供可组成分段运输的数据。",
    "trackingEvents.title": "TRACKING 信息",
    "trackingEvents.subtitle": "预计时间与实际发生时间",
    "trackingEvents.movement": "运输节点",
    "trackingEvents.estimate": "预计时间",
    "trackingEvents.actual": "实际发生时间",
    "trackingEvents.emptyPickup": "提空箱时间",
    "trackingEvents.gatedIn": "进港时间",
    "trackingEvents.loaded": "装船时间",
    "trackingEvents.departure": "开船时间",
    "trackingEvents.arrival": "到港时间",
    "trackingEvents.gatedOut": "提箱时间",
    "trackingEvents.emptyReturn": "还空箱时间",
    "containers.title": "集装箱明细",
    "containers.count": "{count} 个箱",
    "containers.number": "箱号",
    "containers.type": "箱型",
    "containers.mode": "运输方式",
    "containers.terms": "运输条款",
    "containers.location": "当前位置",
    "containers.status": "最新状态",
    "containers.time": "状态时间",
    "containers.details": "详情",
    "containers.openDetails": "查看箱子轨迹",
    "containers.closeDetails": "收起箱子轨迹",
    "containers.noMilestones": "船司未返回该箱的独立轨迹。",
    "containers.enriched": "已通过箱号子查询补全",
    "containers.empty": "船司未提供箱级明细。",
    "documents.kicker": "票单文件",
    "documents.title": "文件详情",
    "documents.open": "文件详情",
    "documents.intro": "每个主题保留一份主文件，可在这里新增、编辑或删除文件及可见权限信息。",
    "documents.file": "文件",
    "documents.uploader": "上传主体",
    "documents.visibility": "可见主体",
    "documents.notUploaded": "尚未上传",
    "documents.add": "新增文件",
    "documents.edit": "编辑",
    "documents.delete": "删除",
    "documents.updated": "更新于 {time}",
    "documents.currentFile": "当前文件：{name}",
    "documents.chooseFile": "保存前请选择文件。",
    "documents.confirmDelete": "确定从当前票单删除 {name} 吗？",
    "documents.type.exportCivPl": "CIV & PL · 出口箱单和发票",
    "documents.type.houseBill": "货代提单 · House B/L",
    "documents.type.masterBill": "海运提单 · MB/L",
    "documents.type.arrivalNotice": "到货通知 · Arrival Notice",
    "documents.type.deliveryOrder": "派送单 · Delivery Order",
    "documents.type.pod": "送货签收单 · POD",
    "documents.type.dutySummary": "进口税单 · Duty Summary",
    "documents.type.importCivPl": "进口箱单和发票 · Import CIV & PL",
    "documents.subject.shipper": "发货方",
    "documents.subject.forwarder": "货代公司",
    "documents.subject.overseasAgent": "海外代理",
    "documents.subject.consignee": "收货人",
    "documents.visibility.pending": "待确认",
    "documents.visibility.uploader": "仅上传方可见",
    "documents.visibility.agents": "代理可见",
    "documents.visibility.consignee": "收货人可见",
    "documents.visibility.shipperConsignee": "发货人和收货人可见",
    "documents.visibility.all": "全部主体可见",
    "raw.title": "原始解码结果",
    "raw.cacheNotice": "浏览器缓存仅保存统一快照，不保存船司原始报文。",
    "common.notProvided": "上游未提供",
    "common.cancel": "取消",
    "common.save": "保存",
    "cache.live": "实时查询",
    "cache.server": "服务端缓存",
    "cache.browser": "浏览器缓存",
    "cache.savedAt": "保存于 {time}",
    "status.available": "通道一网络接口可用",
    "status.unavailable": "通道一网络接口异常",
    "status.checking": "通道一网络接口检测中",
    "status.disabled": "通道一监控已停用",
    "status.unknown": "通道一等待检测",
    "status.shortAvailable": "监控正常",
    "status.shortUnavailable": "监控异常",
    "status.shortChecking": "正在检测",
    "status.shortDisabled": "监控停用",
    "status.shortUnknown": "等待检测",
    "status.lastCheck": "最近检测：{time}",
    "status.nextCheck": "下次检测：{time}",
    "status.error": "错误：{message}"
  }
};

const elements = Object.fromEntries(
  [
    "result-carrier",
    "result-type",
    "result-number",
    "result-primary-facts",
    "result-traffic-term-fact",
    "result-traffic-term",
    "result-container-types-fact",
    "result-container-types",
    "summary-booking-number",
    "summary-origin-name",
    "summary-destination-name",
    "summary-latest-detail",
    "summary-service-sea",
    "summary-service-inland",
    "summary-service-customs",
    "summary-service-warehouse",
    "cache-status",
    "fetched-at",
    "actual-departure",
    "actual-departure-location",
    "actual-arrival",
    "actual-arrival-location",
    "estimated-delivery",
    "estimated-delivery-location",
    "latest-event",
    "latest-event-detail",
    "origin-flag",
    "origin-name",
    "origin-code",
    "destination-flag",
    "destination-name",
    "destination-code",
    "route-count",
    "route-flow",
    "route-summary-line",
    "route-summary-marker",
    "master-bill",
    "booking-numbers",
    "external-references",
    "client-name-code",
    "client-po-number",
    "forwarder-job-number",
    "reference-information",
    "routing-count",
    "routing-table-body",
    "tracking-events-table-body",
    "container-count",
    "container-table-body",
    "document-filled-count",
    "document-drawer-shipment",
    "raw-json"
  ].map((id) => [id, document.querySelector(`#${id}`)])
);

let currentLanguage = "en";
try {
  currentLanguage = localStorage.getItem(LANGUAGE_KEY) === "zh" ? "zh" : "en";
} catch {
  // Storage policies must not prevent the application from starting.
}
let activeView = "overview";
let currentPayload = null;
let lastChannelStatus = { status: "unknown" };
let loading = false;
let resultAnimationTimer = null;
let viewTransitionSequence = 0;
let trackingRequestSequence = 0;
let lastChannelCheck = null;
let channelCheckLoading = false;
const activeWaitOperations = new Map();
let systemWaitCompletionTimer = null;
let batchState = null;
let batchRunning = false;
let batchImportNotice = null;
let lastBatchRequestAt = 0;
const expandedHistoryKeys = new Set();
let relatedFilesShipmentId = null;
let relatedFilesShipmentNumber = "";
let relatedFilesItems = [];
let relatedFilesPermissions = {};
let relatedFilesAssignableCustomers = [];
let relatedFilesSelectedTargetCustomerId = "";
let relatedFilesCustomerAccess = null;
let relatedFilesLoadingState = false;
let relatedFilesErrorText = "";
let relatedFilesRequestSequence = 0;
let relatedFilesUploading = false;
let relatedFilesCloseTimer = null;
let relatedFilesCategoryOpen = false;
let trackingAccountMenuOpen = false;
let relatedFilesExpiredSessionKind = "";
let platformPrincipalAwaitingRefresh = false;
let customerPrincipalAwaitingRefresh = false;
let relatedFilesSessionFingerprint = fileSessionFingerprint();
const trackingPayloadSessionFingerprints = new WeakMap();

function t(key, variables = {}) {
  const template = MESSAGES[currentLanguage]?.[key] ?? MESSAGES.en[key] ?? key;
  return Object.entries(variables).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)),
    template
  );
}

function locale() {
  return currentLanguage === "zh" ? "zh-CN" : "en-US";
}

function valueOrDash(value, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function formatDateTime(value, timezone) {
  if (!value) return "—";
  const formatted = String(value).replace("T", " ");
  return timezone ? `${formatted} ${timezone}` : formatted;
}

function formatLocalDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale(), {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function readPlatformSession() {
  let token = "";
  let user = null;
  try {
    token = localStorage.getItem(PLATFORM_AUTH_TOKEN_KEY) || "";
    user = JSON.parse(localStorage.getItem(PLATFORM_AUTH_USER_KEY) || "null");
  } catch {
    token = "";
    user = null;
  }
  if (platformPrincipalAwaitingRefresh) user = null;
  return { token, user };
}

function readCustomerSession() {
  let token = "";
  let storedSession = null;
  try {
    token = localStorage.getItem(CUSTOMER_AUTH_TOKEN_KEY) || "";
    storedSession = JSON.parse(
      localStorage.getItem(CUSTOMER_AUTH_SESSION_KEY) || "null"
    );
  } catch {
    token = "";
    storedSession = null;
  }
  if (customerPrincipalAwaitingRefresh) storedSession = null;

  const customer =
    storedSession?.customer ??
    storedSession?.principal ??
    storedSession?.user ??
    storedSession;
  return { token, customer, storedSession };
}

function readFileSession() {
  const customerSession = readCustomerSession();
  if (customerSession.token) {
    return {
      kind: "CUSTOMER",
      token: customerSession.token,
      principal: customerSession.customer,
      storedSession: customerSession.storedSession,
      user: null
    };
  }

  const platformSession = readPlatformSession();
  if (platformSession.token) {
    return {
      kind: "INTERNAL",
      token: platformSession.token,
      principal: platformSession.user,
      storedSession: platformSession.user,
      user: platformSession.user
    };
  }

  return { kind: "ANONYMOUS", token: "", principal: null, user: null };
}

/* TRACKING_CONTRACT_HELPERS_START */
function hashSessionIdentity(value) {
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const character = value.charCodeAt(index);
    hashA ^= character;
    hashA = Math.imul(hashA, 0x01000193);
    hashB ^= character;
    hashB = Math.imul(hashB, 0x5bd1e995);
    hashB ^= hashB >>> 13;
  }
  return `${(hashA >>> 0).toString(36)}${(hashB >>> 0).toString(36)}`;
}

function fileSessionFingerprint(session = readFileSession()) {
  let identity = "";
  try {
    identity = JSON.stringify({
      kind: session?.kind ?? "ANONYMOUS",
      token: session?.token ?? "",
      principal: session?.principal ?? null,
      storedSession: session?.storedSession ?? null,
      user: session?.user ?? null
    });
  } catch {
    identity = `${session?.kind ?? "ANONYMOUS"}:${session?.token ?? ""}`;
  }
  return `${session?.kind ?? "ANONYMOUS"}:${hashSessionIdentity(identity)}`;
}

function trackingResponseMessage(payload, response) {
  const directMessage = typeof payload?.message === "string" ? payload.message.trim() : "";
  const nestedMessage =
    typeof payload?.error?.message === "string" ? payload.error.message.trim() : "";
  const stringError = typeof payload?.error === "string" ? payload.error.trim() : "";
  return (
    directMessage ||
    nestedMessage ||
    stringError ||
    `${response?.status ?? ""} ${response?.statusText || "Request failed"}`.trim()
  );
}

function isPublicTrackingRouteUnavailable(result) {
  const { response, payload } = result ?? {};
  if (response?.status === 405) return true;
  if (response?.status !== 404) return false;

  const headerMarker = response?.headers?.get?.("X-Route-Not-Found");
  if (String(headerMarker ?? "").toLowerCase() === "true") return true;
  if (payload?.routeNotFound === true || payload?.endpointNotFound === true) return true;

  const code = String(
    payload?.code ?? payload?.errorCode ?? payload?.error?.code ?? ""
  ).trim().toUpperCase();
  if (["ROUTE_NOT_FOUND", "ENDPOINT_NOT_FOUND", "NO_HANDLER"].includes(code)) return true;

  const path = String(payload?.path ?? payload?.instance ?? "")
    .split("?", 1)[0]
    .replace(/\/+$/, "");
  const targetsPublicRoute = path === "/api/public/shipments/track";
  const message = trackingResponseMessage(payload, { status: 404, statusText: "" });
  const routeMarker =
    /(?:no\s+(?:static\s+resource|handler|route|endpoint)|route\s+not\s+found|endpoint\s+not\s+found|cannot\s+post)/i;
  const messageNamesPublicRoute = message.includes("/api/public/shipments/track");
  if (routeMarker.test(message) && (targetsPublicRoute || messageNamesPublicRoute)) return true;

  const hasSpecificMessage =
    (typeof payload?.message === "string" && payload.message.trim()) ||
    (typeof payload?.error?.message === "string" && payload.error.message.trim());
  const genericError = typeof payload?.error === "string" ? payload.error.trim() : "";
  return (
    targetsPublicRoute &&
    !hasSpecificMessage &&
    /^not found$/i.test(genericError)
  );
}
/* TRACKING_CONTRACT_HELPERS_END */

function clearSensitiveRelatedFilesDom() {
  relatedFilesList.replaceChildren();
  relatedFilesCount.textContent = "0";
  relatedFilesCount.hidden = true;
  relatedFilesUserName.textContent = "";
  relatedFilesErrorMessage.textContent = "";
  relatedFilesLoading.hidden = true;
  relatedFilesError.hidden = true;
  relatedFilesSelection.textContent = "";
  relatedFilesTargetCustomerField.hidden = true;
  relatedFilesTargetCustomerHint.hidden = true;
  renderRelatedFilesTargetOptions();
}

function resetRelatedFilesSessionState({ expiredKind = "" } = {}) {
  relatedFilesRequestSequence += 1;
  relatedFilesItems = [];
  relatedFilesPermissions = {};
  relatedFilesAssignableCustomers = [];
  relatedFilesSelectedTargetCustomerId = "";
  relatedFilesCustomerAccess = null;
  relatedFilesLoadingState = false;
  relatedFilesErrorText = "";
  relatedFilesUploading = false;
  relatedFilesExpiredSessionKind = expiredKind;
  relatedFilesUploadInput.value = "";
  setRelatedFilesCategory("CARGO_DETAIL");
  setRelatedFilesCategoryOpen(false);
  setTrackingAccountMenuOpen(false);
  relatedFilesUploadVisibility.value = "INTERNAL";
  setRelatedFilesUploadMessage();
  closeRelatedFilesDrawer({ immediate: true });
  clearSensitiveRelatedFilesDom();
}

function synchronizeRelatedFilesSession(
  session = readFileSession(),
  { force = false, expiredKind = "" } = {}
) {
  const nextFingerprint = fileSessionFingerprint(session);
  if (!force && nextFingerprint === relatedFilesSessionFingerprint) return false;
  relatedFilesSessionFingerprint = nextFingerprint;
  resetRelatedFilesSessionState({ expiredKind });
  return true;
}

function isCurrentRelatedFilesSession(fingerprint) {
  return (
    fingerprint === relatedFilesSessionFingerprint &&
    fingerprint === fileSessionFingerprint(readFileSession())
  );
}

function clearPlatformSession(expectedToken = null) {
  try {
    if (
      expectedToken !== null &&
      localStorage.getItem(PLATFORM_AUTH_TOKEN_KEY) !== expectedToken
    ) {
      return false;
    }
    localStorage.removeItem(PLATFORM_AUTH_TOKEN_KEY);
    localStorage.removeItem(PLATFORM_AUTH_USER_KEY);
    return true;
  } catch {
    // The public tracking page remains usable when browser storage is unavailable.
    return false;
  }
}

function clearCustomerSession(expectedToken = null) {
  try {
    if (
      expectedToken !== null &&
      localStorage.getItem(CUSTOMER_AUTH_TOKEN_KEY) !== expectedToken
    ) {
      return false;
    }
    localStorage.removeItem(CUSTOMER_AUTH_TOKEN_KEY);
    localStorage.removeItem(CUSTOMER_AUTH_SESSION_KEY);
    return true;
  } catch {
    // Public tracking remains available even if browser storage is unavailable.
    return false;
  }
}

function clearFileSession(session = readFileSession(), { expired = false } = {}) {
  if (fileSessionFingerprint(readFileSession()) !== fileSessionFingerprint(session)) {
    return false;
  }

  let cleared = false;
  if (session.kind === "CUSTOMER") cleared = clearCustomerSession(session.token);
  if (session.kind === "INTERNAL") cleared = clearPlatformSession(session.token);
  if (!cleared) return false;

  synchronizeRelatedFilesSession(readFileSession(), {
    force: true,
    expiredKind: expired ? session.kind : ""
  });
  renderRelatedFilesDrawer();
  return true;
}

function platformAuthHeaders() {
  const { token } = readPlatformSession();
  return token ? { "X-Auth-Token": token } : {};
}

function trackingAuthHeaders() {
  const session = readFileSession();
  if (session.kind === "CUSTOMER") return { "X-Customer-Token": session.token };
  if (session.kind === "INTERNAL") return { "X-Auth-Token": session.token };
  return {};
}

function fileAuthHeaders(session = readFileSession()) {
  if (session.kind === "CUSTOMER") return { "X-Customer-Token": session.token };
  if (session.kind === "INTERNAL") return { "X-Auth-Token": session.token };
  return {};
}

function shipmentFilesPath(session, shipmentId) {
  const encodedShipmentId = encodeURIComponent(shipmentId);
  return session.kind === "CUSTOMER"
    ? `/api/customer/shipments/${encodedShipmentId}/files`
    : `/api/shipments/${encodedShipmentId}/files`;
}

function shipmentFilePath(session, fileId, suffix = "") {
  const encodedFileId = encodeURIComponent(fileId);
  const base = session.kind === "CUSTOMER"
    ? `/api/customer/shipment-files/${encodedFileId}`
    : `/api/shipment-files/${encodedFileId}`;
  return `${base}${suffix}`;
}

function fileSessionDisplayName(session = readFileSession()) {
  const principal = session.principal ?? {};
  return (
    principal.displayName ??
    principal.customerName ??
    principal.name ??
    principal.username ??
    principal.customerCode ??
    principal.code ??
    ""
  );
}

function fileSessionRoleLabel(session = readFileSession()) {
  if (session.kind === "CUSTOMER") {
    return customerLogisticsRoleLabel(session) || t("account.customer");
  }
  const role = String(session.user?.role ?? "").trim().toUpperCase();
  return t({ ADMIN: "account.roleAdmin", BUSINESS: "account.roleBusiness" }[role] ?? "account.roleUser");
}

function setTrackingAccountMenuOpen(open) {
  trackingAccountMenuOpen = Boolean(open && !trackingAccount.hidden);
  trackingAccount.classList.toggle("is-open", trackingAccountMenuOpen);
  trackingAccountTrigger.setAttribute("aria-expanded", String(trackingAccountMenuOpen));
  trackingAccountMenu.setAttribute("aria-hidden", String(!trackingAccountMenuOpen));
}

function renderTrackingAccount(session = readFileSession()) {
  const authenticated = Boolean(session.token);
  trackingAccount.hidden = !authenticated;
  if (!authenticated) {
    trackingAccountName.textContent = "";
    trackingAccountRole.textContent = "";
    trackingAccountMark.textContent = "U";
    setTrackingAccountMenuOpen(false);
    return;
  }
  const name = fileSessionDisplayName(session) || t("account.roleUser");
  trackingAccountName.textContent = name;
  trackingAccountRole.textContent = fileSessionRoleLabel(session);
  trackingAccountMark.textContent = Array.from(name.trim())[0]?.toUpperCase() || "U";
}

function customerLogisticsRoleLabel(session = readFileSession()) {
  if (session.kind !== "CUSTOMER") return "";
  const role = String(
    session.principal?.partyRole ??
    session.principal?.logisticsRole ??
    session.storedSession?.partyRole ??
    session.storedSession?.logisticsRole ??
    ""
  ).trim().toUpperCase();
  return logisticsPartyRoleLabel(role);
}

function logisticsPartyRoleLabel(value) {
  const key = {
    AGENT: "files.logisticsRoleAgent",
    SHIPPER: "files.logisticsRoleShipper",
    CONSIGNEE: "files.logisticsRoleConsignee"
  }[String(value ?? "").trim().toUpperCase()];
  return key ? t(key) : "";
}

function canManageFileVisibility(session = readFileSession()) {
  if (session.kind !== "INTERNAL") return false;
  const role = String(session.user?.role ?? "").trim().toUpperCase();
  return role === "BUSINESS" || role === "ADMIN";
}

function canAssignRelatedFilesCustomer(session = readFileSession()) {
  return (
    canManageFileVisibility(session) &&
    relatedFilesPermissions?.canAssignCustomer === true
  );
}

function normalizeAssignableCustomer(customer) {
  return {
    id: String(customer?.id ?? customer?.publicId ?? "").trim(),
    username: String(customer?.username ?? customer?.customerCode ?? "").trim(),
    displayName: String(customer?.displayName ?? customer?.customerName ?? "").trim(),
    partyRole: String(customer?.partyRole ?? "").trim().toUpperCase(),
    relationshipRole: String(customer?.relationshipRole ?? "").trim().toUpperCase()
  };
}

function relatedFilesCustomerOptionLabel(customer) {
  const primary = customer.displayName || customer.username || customer.id;
  const roleLabel = logisticsPartyRoleLabel(customer.partyRole);
  const details = [
    customer.username && customer.username !== primary ? customer.username : "",
    roleLabel
  ].filter(Boolean);
  return details.length > 0 ? `${primary} · ${details.join(" · ")}` : primary;
}

function renderRelatedFilesTargetOptions() {
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = t("files.targetPlaceholder");
  const options = relatedFilesAssignableCustomers.map((customer) => {
    const option = document.createElement("option");
    option.value = customer.id;
    option.textContent = relatedFilesCustomerOptionLabel(customer);
    return option;
  });
  relatedFilesTargetCustomer.replaceChildren(placeholder, ...options);
  const selectionAvailable = relatedFilesAssignableCustomers.some(
    (customer) => customer.id === relatedFilesSelectedTargetCustomerId
  );
  if (!selectionAvailable) relatedFilesSelectedTargetCustomerId = "";
  relatedFilesTargetCustomer.value = relatedFilesSelectedTargetCustomerId;
}

function shipmentRecordId(payload) {
  return (
    payload?.shipmentRecord?.publicId ??
    payload?.shipmentRecord?.id ??
    payload?.shipmentId ??
    null
  );
}

function setRelatedFilesContext(payload) {
  const session = readFileSession();
  synchronizeRelatedFilesSession(session);
  const nextShipmentId = shipmentRecordId(payload);
  const nextShipmentNumber = String(
    payload?.snapshot?.tracking?.number ?? payload?.shipmentRecord?.trackingNumber ?? ""
  );
  const contextChanged = String(nextShipmentId ?? "") !== String(relatedFilesShipmentId ?? "");
  const payloadSessionFingerprint =
    payload && typeof payload === "object"
      ? trackingPayloadSessionFingerprints.get(payload)
      : null;

  relatedFilesShipmentId = nextShipmentId ? String(nextShipmentId) : null;
  relatedFilesShipmentNumber = nextShipmentNumber;
  relatedFilesCustomerAccess =
    payloadSessionFingerprint === relatedFilesSessionFingerprint &&
    typeof payload?.fileAccess === "boolean"
      ? payload.fileAccess
      : null;
  relatedFilesButton.disabled = !relatedFilesShipmentId;
  relatedFilesButton.title = relatedFilesShipmentId ? "" : t("files.unavailable");
  relatedFilesShipmentReference.textContent = nextShipmentNumber || "—";

  if (contextChanged) {
    relatedFilesRequestSequence += 1;
    relatedFilesItems = [];
    relatedFilesPermissions = {};
    relatedFilesAssignableCustomers = [];
    relatedFilesSelectedTargetCustomerId = "";
    relatedFilesErrorText = "";
    relatedFilesLoadingState = false;
    relatedFilesUploadInput.value = "";
    setRelatedFilesUploadMessage();
    if (!relatedFilesDrawer.hidden) closeRelatedFilesDrawer();
  }

  renderRelatedFilesDrawer();
}

function formatFileSize(value) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function fileCategoryLabel(value) {
  const key = {
    CARGO_DETAIL: "files.categoryCargo",
    INVOICE: "files.categoryInvoice",
    SHIPPING: "files.categoryShipping",
    OTHER: "files.categoryOther"
  }[String(value ?? "").toUpperCase()];
  return t(key ?? "files.categoryOther");
}

const RELATED_FILE_CATEGORY_KEYS = Object.freeze({
  CARGO_DETAIL: "files.categoryCargo",
  INVOICE: "files.categoryInvoice",
  SHIPPING: "files.categoryShipping",
  OTHER: "files.categoryOther"
});

function setRelatedFilesCategory(value) {
  const category = Object.hasOwn(RELATED_FILE_CATEGORY_KEYS, value) ? value : "OTHER";
  relatedFilesCategory.value = category;
  const key = RELATED_FILE_CATEGORY_KEYS[category];
  relatedFilesCategoryLabel.dataset.i18n = key;
  relatedFilesCategoryLabel.textContent = t(key);
  relatedFilesCategoryOptions.forEach((option) => {
    const selected = option.dataset.categoryValue === category;
    option.classList.toggle("is-selected", selected);
    option.setAttribute("aria-selected", String(selected));
  });
}

function setRelatedFilesCategoryOpen(open) {
  relatedFilesCategoryOpen = Boolean(open && !relatedFilesCategoryTrigger.disabled);
  relatedFilesCategorySelect.classList.toggle("is-open", relatedFilesCategoryOpen);
  relatedFilesCategoryTrigger.setAttribute("aria-expanded", String(relatedFilesCategoryOpen));
  relatedFilesCategoryMenu.setAttribute("aria-hidden", String(!relatedFilesCategoryOpen));
}

function fileVisibilityLabel(value) {
  return t(
    String(value ?? "").toUpperCase() === "INTERNAL"
      ? "files.visibilityInternal"
      : "files.visibilityParties"
  );
}

function normalizeRelatedFileItem(item) {
  const rawVisibility = String(item?.visibility ?? "PARTIES").toUpperCase();
  return {
    ...item,
    id: item?.id ?? item?.publicId ?? item?.fileId,
    originalFileName:
      item?.originalFileName ?? item?.fileName ?? item?.name ?? "shipment-file",
    extension:
      item?.extension ??
      String(item?.originalFileName ?? item?.fileName ?? "")
        .split(".")
        .pop(),
    sizeBytes: Number(item?.sizeBytes ?? item?.size ?? 0),
    category: String(item?.category ?? "OTHER").toUpperCase(),
    visibility: rawVisibility === "INTERNAL_ONLY" ? "INTERNAL" : rawVisibility,
    targetCustomerId: String(item?.targetCustomerId ?? "").trim(),
    targetCustomerDisplayName: String(
      item?.targetCustomerDisplayName ?? item?.targetCustomerName ?? ""
    ).trim(),
    uploaderDisplayName:
      item?.uploaderDisplayName ??
      item?.uploadedBy?.displayName ??
      item?.uploadedBy?.username ??
      item?.uploaderName ??
      "",
    uploadedAt: item?.uploadedAt ?? item?.createdAt ?? null,
    canDelete: item?.canDelete === true,
    canChangeVisibility: item?.canChangeVisibility === true
  };
}

function relatedFilesApiMessage(payload, response) {
  if (response.status >= 500) return t("files.serverError");
  return (
    payload?.message ??
    payload?.error?.message ??
    `${response.status} ${response.statusText || "Request failed"}`
  );
}

async function requestRelatedFilesApi(path, options = {}) {
  const session = options.session ?? readFileSession();
  if (!session.token) {
    const error = new Error(t("files.loginTitle"));
    error.status = 401;
    throw error;
  }

  const headers = {
    Accept: "application/json",
    ...fileAuthHeaders(session),
    ...(options.headers ?? {})
  };
  const isFormData = options.body instanceof FormData;
  if (options.body && !isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body:
      options.body && !isFormData && typeof options.body !== "string"
        ? JSON.stringify(options.body)
        : options.body
  });
  const payload = await response.json().catch(() => ({}));

  if (response.status === 401) {
    clearFileSession(session, { expired: true });
    const error = new Error(
      session.kind === "CUSTOMER"
        ? t("files.customerLoginExpired")
        : t("files.loginTitle")
    );
    error.status = 401;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(
      response.status === 403
        ? session.kind === "CUSTOMER"
          ? t("files.customerNotAssigned")
          : t("files.forbidden")
        : relatedFilesApiMessage(payload, response)
    );
    error.status = response.status;
    throw error;
  }
  return payload;
}

function setRelatedFilesUploadMessage(message = "", variant = "") {
  relatedFilesUploadMessage.hidden = !message;
  relatedFilesUploadMessage.textContent = message;
  relatedFilesUploadMessage.dataset.variant = variant;
}

function relatedFilesUploadTargetMissing(session = readFileSession()) {
  return (
    session.kind === "INTERNAL" &&
    relatedFilesUploadVisibility.value === "PARTIES" &&
    (!canAssignRelatedFilesCustomer(session) || !relatedFilesSelectedTargetCustomerId)
  );
}

function updateRelatedFilesSelection() {
  const session = readFileSession();
  const files = Array.from(relatedFilesUploadInput.files ?? []);
  const totalSize = files.reduce((total, file) => total + Number(file.size ?? 0), 0);
  const targetMissing = relatedFilesUploadTargetMissing(session);
  const targetFieldVisible =
    canAssignRelatedFilesCustomer(session) &&
    relatedFilesUploadVisibility.value === "PARTIES";
  relatedFilesTargetCustomerField.hidden = !targetFieldVisible;
  relatedFilesTargetCustomerHint.hidden = !targetFieldVisible || !targetMissing;
  relatedFilesTargetCustomerHint.textContent = t(
    relatedFilesAssignableCustomers.length > 0
      ? "files.targetRequired"
      : "files.targetUnavailable"
  );
  relatedFilesSelection.textContent =
    files.length > 0
      ? t("files.selection", { count: files.length, size: formatFileSize(totalSize) })
      : t("files.noSelection");
  relatedFilesSelection.dataset.state = files.length > 0 ? "ready" : "empty";
  relatedFilesUploadButton.disabled =
    relatedFilesUploading ||
    files.length === 0 ||
    !relatedFilesShipmentId ||
    targetMissing;
}

function relatedFileActionButton(labelKey, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = t(labelKey);
  button.addEventListener("click", handler);
  return button;
}

function relatedFileTargetCustomer(file) {
  return relatedFilesAssignableCustomers.find(
    (customer) => customer.id === String(file.targetCustomerId ?? "")
  );
}

function relatedFileTargetDisplayName(file) {
  const customer = relatedFileTargetCustomer(file);
  return (
    file.targetCustomerDisplayName ||
    customer?.displayName ||
    customer?.username ||
    ""
  );
}

function relatedFileSharingLabel(file, session = readFileSession()) {
  if (file.visibility === "INTERNAL") return t("files.visibilityInternal");
  if (session.kind === "CUSTOMER") return t("files.sharedWithSelf");
  const targetName = relatedFileTargetDisplayName(file);
  return targetName
    ? t("files.sharedWith", { name: targetName })
    : t("files.customerSelectionRequired");
}

function createRelatedFileItem(file) {
  const session = readFileSession();
  synchronizeRelatedFilesSession(session);
  const sessionFingerprint = relatedFilesSessionFingerprint;
  const item = document.createElement("li");
  item.className = "related-file-item";
  item.dataset.fileId = String(file.id ?? "");

  const extension = document.createElement("span");
  extension.className = "related-file-extension";
  extension.textContent = String(file.extension || "FILE").slice(0, 5).toUpperCase();

  const content = document.createElement("div");
  content.className = "related-file-content";
  const name = document.createElement("strong");
  name.textContent = file.originalFileName;
  name.title = file.originalFileName;
  const metadata = document.createElement("span");
  metadata.textContent = [
    file.uploaderDisplayName || t("files.unknownUploader"),
    file.uploadedAt ? formatLocalDateTime(file.uploadedAt) : t("files.unknownDate"),
    formatFileSize(file.sizeBytes)
  ].join(" · ");
  const badges = document.createElement("div");
  badges.className = "related-file-badges";
  const category = document.createElement("span");
  category.textContent = fileCategoryLabel(file.category);
  badges.append(category);

  const sharing = document.createElement("span");
  sharing.className = `related-file-sharing is-${file.visibility.toLowerCase()}`;
  sharing.textContent = relatedFileSharingLabel(file, session);
  badges.append(sharing);

  if (file.canChangeVisibility && canManageFileVisibility(session)) {
    const canAssignCustomer = canAssignRelatedFilesCustomer(session);
    const editor = document.createElement("div");
    editor.className = "related-file-sharing-editor";
    const visibility = document.createElement("select");
    visibility.className = "related-file-visibility-select";
    visibility.setAttribute("aria-label", t("files.visibility"));
    for (const value of ["PARTIES", "INTERNAL"]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = fileVisibilityLabel(value);
      option.disabled =
        value === "PARTIES" &&
        !canAssignCustomer &&
        file.visibility !== "PARTIES";
      visibility.append(option);
    }
    visibility.value = file.visibility === "INTERNAL" ? "INTERNAL" : "PARTIES";

    const targetCustomer = document.createElement("select");
    targetCustomer.className = "related-file-target-select";
    targetCustomer.setAttribute("aria-label", t("files.targetCustomer"));
    const targetPlaceholder = document.createElement("option");
    targetPlaceholder.value = "";
    targetPlaceholder.textContent = t("files.targetPlaceholder");
    targetCustomer.append(targetPlaceholder);
    for (const customer of relatedFilesAssignableCustomers) {
      const option = document.createElement("option");
      option.value = customer.id;
      option.textContent = relatedFilesCustomerOptionLabel(customer);
      targetCustomer.append(option);
    }
    if (
      file.targetCustomerId &&
      !relatedFilesAssignableCustomers.some(
        (customer) => customer.id === file.targetCustomerId
      )
    ) {
      const currentTarget = document.createElement("option");
      currentTarget.value = file.targetCustomerId;
      currentTarget.textContent =
        file.targetCustomerDisplayName || t("files.sharedWithCustomer");
      targetCustomer.append(currentTarget);
    }
    targetCustomer.value = file.targetCustomerId || "";

    const editorHint = document.createElement("span");
    editorHint.className = "related-file-sharing-hint";
    editorHint.textContent = t(
      relatedFilesAssignableCustomers.length > 0
        ? "files.targetRequiredForFile"
        : "files.targetUnavailable"
    );

    const syncEditor = () => {
      const sharingWithCustomer = visibility.value === "PARTIES";
      targetCustomer.hidden = !canAssignCustomer || !sharingWithCustomer;
      editorHint.hidden =
        !canAssignCustomer ||
        !sharingWithCustomer ||
        Boolean(targetCustomer.value);
      editor.classList.toggle(
        "needs-target",
        canAssignCustomer && sharingWithCustomer && !targetCustomer.value
      );
    };

    const persistSharing = async (nextVisibility, nextTargetCustomerId) => {
      if (!isCurrentRelatedFilesSession(sessionFingerprint)) return;
      if (
        nextVisibility === "PARTIES" &&
        (!canAssignCustomer || !nextTargetCustomerId)
      ) {
        syncEditor();
        targetCustomer.focus({ preventScroll: true });
        return;
      }
      const previousVisibility = file.visibility;
      const previousTargetCustomerId = file.targetCustomerId;
      const previousTargetCustomerDisplayName = file.targetCustomerDisplayName;
      visibility.disabled = true;
      targetCustomer.disabled = true;
      try {
        await requestRelatedFilesApi(
          shipmentFilePath(session, file.id, "/visibility"),
          {
            method: "PATCH",
            body: {
              visibility: nextVisibility,
              targetCustomerId:
                nextVisibility === "PARTIES" ? nextTargetCustomerId : null
            },
            session
          }
        );
        if (!isCurrentRelatedFilesSession(sessionFingerprint)) return;
        file.visibility = nextVisibility;
        file.targetCustomerId =
          nextVisibility === "PARTIES" ? String(nextTargetCustomerId) : "";
        file.targetCustomerDisplayName =
          nextVisibility === "PARTIES"
            ? relatedFileTargetCustomer(file)?.displayName ||
              relatedFileTargetCustomer(file)?.username ||
              file.targetCustomerDisplayName
            : "";
        sharing.className = `related-file-sharing is-${file.visibility.toLowerCase()}`;
        sharing.textContent = relatedFileSharingLabel(file, session);
        setRelatedFilesUploadMessage();
      } catch (error) {
        if (!isCurrentRelatedFilesSession(sessionFingerprint)) return;
        file.visibility = previousVisibility;
        file.targetCustomerId = previousTargetCustomerId;
        file.targetCustomerDisplayName = previousTargetCustomerDisplayName;
        visibility.value = previousVisibility;
        targetCustomer.value = previousTargetCustomerId || "";
        setRelatedFilesUploadMessage(
          t("files.visibilityUpdateFailed", { message: error?.message || t("error.generic") }),
          "error"
        );
      } finally {
        if (isCurrentRelatedFilesSession(sessionFingerprint)) {
          visibility.disabled = false;
          targetCustomer.disabled = false;
          syncEditor();
        }
      }
    };

    visibility.addEventListener("change", () => {
      if (!isCurrentRelatedFilesSession(sessionFingerprint)) return;
      if (visibility.value === "INTERNAL") {
        targetCustomer.value = "";
        syncEditor();
        void persistSharing("INTERNAL", null);
        return;
      }
      syncEditor();
      if (targetCustomer.value) {
        void persistSharing("PARTIES", targetCustomer.value);
      } else {
        targetCustomer.focus({ preventScroll: true });
      }
    });
    targetCustomer.addEventListener("change", () => {
      if (!isCurrentRelatedFilesSession(sessionFingerprint)) return;
      syncEditor();
      if (visibility.value === "PARTIES" && targetCustomer.value) {
        void persistSharing("PARTIES", targetCustomer.value);
      }
    });
    editor.append(visibility);
    if (canAssignCustomer) editor.append(targetCustomer, editorHint);
    syncEditor();
    badges.append(editor);
  }
  content.append(name, metadata, badges);

  const actions = document.createElement("div");
  actions.className = "related-file-actions";
  actions.append(
    relatedFileActionButton("files.download", "related-file-download", (event) => {
      void downloadRelatedFile(file, event.currentTarget);
    })
  );
  if (file.canDelete) {
    actions.append(
      relatedFileActionButton("files.delete", "related-file-delete", () => {
        void deleteRelatedFile(file);
      })
    );
  }

  item.append(extension, content, actions);
  return item;
}

function renderRelatedFilesDrawer() {
  const session = readFileSession();
  synchronizeRelatedFilesSession(session);
  const authenticated = Boolean(session.token);
  const hasItems = relatedFilesItems.length > 0;
  const isCustomer = session.kind === "CUSTOMER";
  const canManageVisibility = canManageFileVisibility(session);
  const canAssignCustomer = canAssignRelatedFilesCustomer(session);
  renderTrackingAccount(session);
  setRelatedFilesCategory(relatedFilesCategory.value);

  if (
    session.kind !== "INTERNAL" ||
    !canManageVisibility ||
    (relatedFilesUploadVisibility.value === "PARTIES" && !canAssignCustomer)
  ) {
    relatedFilesUploadVisibility.value = "INTERNAL";
    relatedFilesSelectedTargetCustomerId = "";
  }
  if (relatedFilesUploadVisibility.value === "INTERNAL") {
    relatedFilesSelectedTargetCustomerId = "";
  }
  renderRelatedFilesTargetOptions();
  const partiesOption = relatedFilesUploadVisibility.querySelector(
    'option[value="PARTIES"]'
  );
  if (partiesOption) partiesOption.disabled = !canAssignCustomer;

  relatedFilesShipmentReference.textContent = relatedFilesShipmentNumber || "—";
  relatedFilesButton.hidden = !authenticated;
  relatedFilesButton.disabled = !authenticated || !relatedFilesShipmentId;
  relatedFilesButton.title =
    isCustomer && relatedFilesCustomerAccess === false
      ? t("files.customerNotAssigned")
      : authenticated && !relatedFilesShipmentId
        ? t("files.unavailable")
        : "";
  relatedFilesCount.textContent = String(relatedFilesItems.length);
  relatedFilesCount.hidden = !hasItems;

  relatedFilesAuthRequired.hidden = authenticated;
  const customerSessionExpired =
    !authenticated && relatedFilesExpiredSessionKind === "CUSTOMER";
  relatedFilesAuthTitle.textContent = t(
    customerSessionExpired ? "files.customerLoginExpired" : "files.loginTitle"
  );
  relatedFilesAuthDescription.textContent = t(
    customerSessionExpired ? "files.customerLoginExpired" : "files.loginDescription"
  );
  relatedFilesAuthLink.textContent = t(
    customerSessionExpired ? "files.customerLoginAction" : "files.loginAction"
  );
  relatedFilesAuthLink.href = customerSessionExpired ? "/" : "/workbenches";
  relatedFilesContent.hidden = !authenticated;
  relatedFilesUploadPanel.hidden =
    !authenticated ||
    !relatedFilesShipmentId ||
    relatedFilesPermissions?.canUpload === false;
  relatedFilesUserName.textContent =
    fileSessionDisplayName(session);
  relatedFilesUploadVisibilityField.hidden = !canManageVisibility;

  relatedFilesLoading.hidden = !relatedFilesLoadingState;
  relatedFilesError.hidden = !relatedFilesErrorText || relatedFilesLoadingState;
  relatedFilesErrorMessage.textContent = relatedFilesErrorText;
  relatedFilesEmpty.hidden =
    relatedFilesLoadingState || Boolean(relatedFilesErrorText) || hasItems;
  relatedFilesList.hidden =
    relatedFilesLoadingState || Boolean(relatedFilesErrorText) || !hasItems;
  relatedFilesList.replaceChildren(
    ...relatedFilesItems.map((item) => createRelatedFileItem(item))
  );

  relatedFilesSelectButton.disabled = relatedFilesUploading;
  relatedFilesUploadInput.disabled = relatedFilesUploading;
  relatedFilesUploadButton.classList.toggle("is-uploading", relatedFilesUploading);
  relatedFilesUploadButton.setAttribute("aria-busy", String(relatedFilesUploading));
  relatedFilesCategory.disabled = relatedFilesUploading;
  relatedFilesCategoryTrigger.disabled = relatedFilesUploading;
  if (relatedFilesUploading) setRelatedFilesCategoryOpen(false);
  relatedFilesUploadVisibility.disabled = relatedFilesUploading;
  relatedFilesTargetCustomer.disabled = relatedFilesUploading;
  updateRelatedFilesSelection();
}

function openRelatedFilesDrawer() {
  const session = readFileSession();
  synchronizeRelatedFilesSession(session);
  if (!relatedFilesShipmentId || !session.token) return;
  if (relatedFilesCloseTimer) {
    window.clearTimeout(relatedFilesCloseTimer);
    relatedFilesCloseTimer = null;
  }
  relatedFilesBackdrop.hidden = false;
  relatedFilesDrawer.hidden = false;
  relatedFilesButton.setAttribute("aria-expanded", "true");
  document.body.classList.add("related-files-open");
  requestAnimationFrame(() => {
    relatedFilesBackdrop.classList.add("is-open");
    relatedFilesDrawer.classList.add("is-open");
    relatedFilesDrawer.focus({ preventScroll: true });
  });

  if (session.kind === "CUSTOMER" && relatedFilesCustomerAccess === false) {
    relatedFilesErrorText = t("files.customerNotAssigned");
    renderRelatedFilesDrawer();
  } else {
    void loadRelatedFiles();
  }
}

function closeRelatedFilesDrawer({ immediate = false } = {}) {
  setRelatedFilesCategoryOpen(false);
  relatedFilesButton.setAttribute("aria-expanded", "false");
  relatedFilesBackdrop.classList.remove("is-open");
  relatedFilesDrawer.classList.remove("is-open");
  document.body.classList.remove("related-files-open");
  if (relatedFilesCloseTimer) window.clearTimeout(relatedFilesCloseTimer);
  if (immediate) {
    relatedFilesBackdrop.hidden = true;
    relatedFilesDrawer.hidden = true;
    relatedFilesCloseTimer = null;
    return;
  }
  relatedFilesCloseTimer = window.setTimeout(() => {
    relatedFilesBackdrop.hidden = true;
    relatedFilesDrawer.hidden = true;
    relatedFilesCloseTimer = null;
  }, 220);
}

async function loadRelatedFiles() {
  const session = readFileSession();
  synchronizeRelatedFilesSession(session);
  if (!relatedFilesShipmentId || !session.token) {
    renderRelatedFilesDrawer();
    return;
  }

  const sessionFingerprint = relatedFilesSessionFingerprint;
  const requestSequence = ++relatedFilesRequestSequence;
  relatedFilesLoadingState = true;
  relatedFilesErrorText = "";
  relatedFilesPermissions = {};
  relatedFilesAssignableCustomers = [];
  relatedFilesSelectedTargetCustomerId = "";
  renderRelatedFilesDrawer();

  try {
    const payload = await requestRelatedFilesApi(
      shipmentFilesPath(session, relatedFilesShipmentId),
      { session }
    );
    if (
      requestSequence !== relatedFilesRequestSequence ||
      !isCurrentRelatedFilesSession(sessionFingerprint)
    ) return;
    const items = Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.files)
        ? payload.files
        : [];
    relatedFilesItems = items.map(normalizeRelatedFileItem);
    relatedFilesPermissions = payload?.permissions ?? {};
    const assignableCustomers =
      session.kind === "INTERNAL" &&
      relatedFilesPermissions?.canAssignCustomer === true &&
      Array.isArray(payload?.assignableCustomers)
        ? payload.assignableCustomers
        : [];
    const seenCustomerIds = new Set();
    relatedFilesAssignableCustomers = assignableCustomers
      .map(normalizeAssignableCustomer)
      .filter((customer) => {
        if (!customer.id || seenCustomerIds.has(customer.id)) return false;
        seenCustomerIds.add(customer.id);
        return true;
      });
    if (session.kind === "CUSTOMER") relatedFilesCustomerAccess = true;
  } catch (error) {
    if (
      requestSequence !== relatedFilesRequestSequence ||
      !isCurrentRelatedFilesSession(sessionFingerprint)
    ) return;
    if (session.kind === "CUSTOMER" && error?.status === 403) {
      relatedFilesCustomerAccess = false;
    }
    if (error?.status !== 401 || relatedFilesExpiredSessionKind === "CUSTOMER") {
      relatedFilesErrorText = error?.message || t("error.generic");
    }
  } finally {
    if (
      requestSequence === relatedFilesRequestSequence &&
      isCurrentRelatedFilesSession(sessionFingerprint)
    ) {
      relatedFilesLoadingState = false;
      renderRelatedFilesDrawer();
    }
  }
}

async function uploadRelatedFiles() {
  const files = Array.from(relatedFilesUploadInput.files ?? []);
  if (!relatedFilesShipmentId || files.length === 0 || relatedFilesUploading) return;

  const session = readFileSession();
  synchronizeRelatedFilesSession(session);
  if (!session.token) {
    renderRelatedFilesDrawer();
    return;
  }

  const internalVisibility =
    canManageFileVisibility(session)
      ? relatedFilesUploadVisibility.value || "INTERNAL"
      : "INTERNAL";
  const targetCustomerId = relatedFilesSelectedTargetCustomerId;
  if (
    session.kind === "INTERNAL" &&
    internalVisibility === "PARTIES" &&
    (!canAssignRelatedFilesCustomer(session) || !targetCustomerId)
  ) {
    setRelatedFilesUploadMessage(t("files.targetRequired"), "error");
    updateRelatedFilesSelection();
    relatedFilesTargetCustomer.focus({ preventScroll: true });
    return;
  }

  const sessionFingerprint = relatedFilesSessionFingerprint;
  relatedFilesUploading = true;
  setRelatedFilesUploadMessage(t("files.uploading"), "progress");
  renderRelatedFilesDrawer();
  const formData = new FormData();
  for (const file of files) formData.append("files", file);
  formData.append("category", relatedFilesCategory.value || "OTHER");
  if (session.kind === "INTERNAL") {
    formData.append("visibility", internalVisibility);
    if (internalVisibility === "PARTIES") {
      formData.append("targetCustomerId", targetCustomerId);
    }
  }

  try {
    await requestRelatedFilesApi(
      shipmentFilesPath(session, relatedFilesShipmentId),
      { method: "POST", body: formData, session }
    );
    if (!isCurrentRelatedFilesSession(sessionFingerprint)) return;
    relatedFilesUploadInput.value = "";
    setRelatedFilesUploadMessage(t("files.uploaded", { count: files.length }), "success");
    await loadRelatedFiles();
  } catch (error) {
    if (!isCurrentRelatedFilesSession(sessionFingerprint)) return;
    if (error?.status !== 401) {
      setRelatedFilesUploadMessage(
        t("files.uploadFailed", { message: error?.message || t("error.generic") }),
        "error"
      );
    }
  } finally {
    if (isCurrentRelatedFilesSession(sessionFingerprint)) {
      relatedFilesUploading = false;
      renderRelatedFilesDrawer();
    }
  }
}

async function downloadRelatedFile(file, button) {
  const session = readFileSession();
  synchronizeRelatedFilesSession(session);
  if (!file?.id || !session.token) return;
  const sessionFingerprint = relatedFilesSessionFingerprint;
  const previousLabel = button.textContent;
  button.disabled = true;
  button.textContent = t("files.downloading");
  try {
    const response = await fetch(
      shipmentFilePath(session, file.id, "/download"),
      { headers: { ...fileAuthHeaders(session) } }
    );
    if (response.status === 401) {
      clearFileSession(session, { expired: true });
      return;
    }
    if (!isCurrentRelatedFilesSession(sessionFingerprint)) return;
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(
        response.status === 403
          ? session.kind === "CUSTOMER"
            ? t("files.customerNotAssigned")
            : t("files.forbidden")
          : relatedFilesApiMessage(payload, response)
      );
    }
    const blob = await response.blob();
    if (!isCurrentRelatedFilesSession(sessionFingerprint)) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.originalFileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (error) {
    if (!isCurrentRelatedFilesSession(sessionFingerprint)) return;
    setRelatedFilesUploadMessage(
      t("files.downloadFailed", { message: error?.message || t("error.generic") }),
      "error"
    );
  } finally {
    if (isCurrentRelatedFilesSession(sessionFingerprint)) {
      button.disabled = false;
      button.textContent = previousLabel;
    }
  }
}

async function deleteRelatedFile(file) {
  if (
    !file?.id ||
    !file.canDelete ||
    !window.confirm(t("files.confirmDelete", { name: file.originalFileName }))
  ) {
    return;
  }
  const session = readFileSession();
  synchronizeRelatedFilesSession(session);
  if (!session.token) return;
  const sessionFingerprint = relatedFilesSessionFingerprint;
  try {
    await requestRelatedFilesApi(
      shipmentFilePath(session, file.id),
      { method: "DELETE", session }
    );
    if (!isCurrentRelatedFilesSession(sessionFingerprint)) return;
    relatedFilesItems = relatedFilesItems.filter((item) => item.id !== file.id);
    setRelatedFilesUploadMessage();
    renderRelatedFilesDrawer();
  } catch (error) {
    if (!isCurrentRelatedFilesSession(sessionFingerprint)) return;
    if (error?.status !== 401) {
      setRelatedFilesUploadMessage(
        t("files.deleteFailed", { message: error?.message || t("error.generic") }),
        "error"
      );
    }
  }
}

function normalizeCountryCode(countryCode) {
  const code = String(countryCode ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return code === "UK" ? "GB" : code;
}

function setCountryFlag(element, countryCode) {
  const code = normalizeCountryCode(countryCode);
  element.className = `flag-icon ${code ? "flag-image" : "flag-generic"}`;
  element.replaceChildren();
  if (code) {
    const image = document.createElement("img");
    image.src = appUrl(`api/flags/4x3/${code.toLowerCase()}`);
    image.alt = "";
    image.loading = "lazy";
    image.addEventListener("error", () => {
      element.className = "flag-icon flag-code";
      element.textContent = code;
    });
    element.append(image);
  }
  element.dataset.countryCode = code;
  element.title = code || t("route.unknownLocation");
  element.setAttribute("aria-label", code || t("route.unknownLocation"));
}

function createCountryFlag(countryCode) {
  const flag = document.createElement("i");
  setCountryFlag(flag, countryCode);
  return flag;
}

function trackingTypeLabel(type) {
  return t(TYPE_KEYS[type] ?? "type.bill");
}

function normalizeQuery(query) {
  return {
    carrier: String(query.carrier ?? "COSCO").trim().toUpperCase(),
    channel: String(query.channel ?? "AUTO").trim().toUpperCase(),
    type: String(query.type ?? "BILLOFLADING").trim().toUpperCase(),
    number: String(query.number ?? "")
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase()
  };
}

function cacheKey(query) {
  const normalized = normalizeQuery(query);
  return `${CACHE_PREFIX}${normalized.carrier}:${normalized.channel}:${normalized.type}:${normalized.number}`;
}

function snapshotStorageIdentity(snapshot) {
  const provider = String(snapshot?.provider?.code ?? "COSCO").trim().toUpperCase();
  const type = String(snapshot?.tracking?.type ?? "BILLOFLADING").trim().toUpperCase();
  const number = String(snapshot?.tracking?.number ?? "").trim().toUpperCase();
  return `${provider}:${type}:${number}`;
}

function readSupplementaryRecord(prefix, snapshot, fallback) {
  if (!snapshot?.tracking?.number) return fallback;
  try {
    const stored = JSON.parse(
      localStorage.getItem(`${prefix}${snapshotStorageIdentity(snapshot)}`) ?? "null"
    );
    return stored && typeof stored === "object" ? stored : fallback;
  } catch {
    return fallback;
  }
}

function writeSupplementaryRecord(prefix, snapshot, value) {
  if (!snapshot?.tracking?.number) return;
  try {
    localStorage.setItem(
      `${prefix}${snapshotStorageIdentity(snapshot)}`,
      JSON.stringify(value)
    );
  } catch {
    // Restricted storage should not prevent the detail view from remaining usable.
  }
}

function businessReferencesForSnapshot(snapshot) {
  const upstream = snapshot?.references?.business ?? {};
  const stored = readSupplementaryRecord(BUSINESS_REFERENCE_PREFIX, snapshot, {});
  return {
    clientNameCode: stored.clientNameCode ?? upstream.clientNameCode ?? "",
    clientPoNumber: stored.clientPoNumber ?? upstream.clientPoNumber ?? "",
    forwarderJobNumber: stored.forwarderJobNumber ?? upstream.forwarderJobNumber ?? ""
  };
}

function renderBusinessReferences(snapshot) {
  const references = businessReferencesForSnapshot(snapshot);
  elements["client-name-code"].textContent = valueOrDash(references.clientNameCode);
  elements["client-po-number"].textContent = valueOrDash(references.clientPoNumber);
  elements["forwarder-job-number"].textContent = valueOrDash(references.forwarderJobNumber);
}

function openBusinessReferenceDialog() {
  if (!currentPayload?.snapshot) return;
  const references = businessReferencesForSnapshot(currentPayload.snapshot);
  document.querySelector("#business-client-code-input").value = references.clientNameCode;
  document.querySelector("#business-client-po-input").value = references.clientPoNumber;
  document.querySelector("#business-forwarder-job-input").value =
    references.forwarderJobNumber;
  businessReferenceDialog.showModal();
}

function documentMetadataForSnapshot(snapshot) {
  return readSupplementaryRecord(DOCUMENT_METADATA_PREFIX, snapshot, {});
}

function documentDefinition(code) {
  return DOCUMENT_TYPES.find((definition) => definition.code === code) ?? null;
}

function documentSubjectLabel(subject) {
  return t(`documents.subject.${subject}`);
}

function documentVisibilityLabel(visibility) {
  return t(`documents.visibility.${visibility}`);
}

function populateSelect(select, values, labeler, selectedValue) {
  select.replaceChildren();
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labeler(value);
    option.selected = value === selectedValue;
    select.append(option);
  }
  select.disabled = values.length === 1;
}

function openDocumentEditor(code) {
  if (!currentPayload?.snapshot) return;
  const definition = documentDefinition(code);
  if (!definition) return;
  const metadata = documentMetadataForSnapshot(currentPayload.snapshot);
  const existing = metadata[code] ?? null;
  const fileInput = document.querySelector("#document-file-input");

  document.querySelector("#document-type-input").value = code;
  document.querySelector("#document-editor-topic").textContent = t(definition.labelKey);
  document.querySelector("#document-editor-title").textContent = t(
    existing ? "documents.edit" : "documents.add"
  );
  document.querySelector("#document-current-file").textContent = existing?.fileName
    ? t("documents.currentFile", { name: existing.fileName })
    : "";
  fileInput.value = "";
  populateSelect(
    document.querySelector("#document-uploader-input"),
    definition.uploaders,
    documentSubjectLabel,
    existing?.uploader ?? definition.uploaders[0]
  );
  populateSelect(
    document.querySelector("#document-visibility-input"),
    definition.visibility,
    documentVisibilityLabel,
    existing?.visibility ?? definition.visibility[0]
  );
  documentEditorDialog.showModal();
}

function closeDocumentDrawer() {
  documentDrawer.setAttribute("aria-hidden", "true");
  documentDrawerLayer.classList.remove("is-open");
  window.setTimeout(() => {
    if (!documentDrawerLayer.classList.contains("is-open")) documentDrawerLayer.hidden = true;
  }, 220);
}

function renderDocumentDrawer(snapshot = currentPayload?.snapshot) {
  if (!snapshot) return;
  const metadata = documentMetadataForSnapshot(snapshot);
  const filledCount = DOCUMENT_TYPES.filter((definition) => metadata[definition.code]).length;
  elements["document-filled-count"].textContent = `${filledCount}/${DOCUMENT_TYPES.length}`;
  elements["document-drawer-shipment"].textContent = snapshot.tracking.number;
  documentList.replaceChildren();

  for (const definition of DOCUMENT_TYPES) {
    const item = document.createElement("article");
    item.className = "document-item";
    const existing = metadata[definition.code] ?? null;

    const heading = document.createElement("div");
    heading.className = "document-item-heading";
    const title = document.createElement("strong");
    title.textContent = t(definition.labelKey);
    const state = document.createElement("span");
    state.className = existing ? "is-present" : "is-empty";
    state.textContent = existing?.fileName ?? t("documents.notUploaded");
    heading.append(title, state);

    const constraints = document.createElement("dl");
    for (const [label, value] of [
      [t("documents.uploader"), documentSubjectLabel(existing?.uploader ?? definition.uploaders[0])],
      [
        t("documents.visibility"),
        documentVisibilityLabel(existing?.visibility ?? definition.visibility[0])
      ]
    ]) {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      row.append(dt, dd);
      constraints.append(row);
    }

    const actions = document.createElement("div");
    actions.className = "document-item-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = existing ? "document-edit-button" : "document-add-button";
    editButton.textContent = t(existing ? "documents.edit" : "documents.add");
    editButton.addEventListener("click", () => openDocumentEditor(definition.code));
    actions.append(editButton);

    if (existing) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "document-delete-button";
      deleteButton.textContent = t("documents.delete");
      deleteButton.addEventListener("click", () => {
        if (!window.confirm(t("documents.confirmDelete", { name: existing.fileName }))) return;
        const nextMetadata = { ...documentMetadataForSnapshot(snapshot) };
        delete nextMetadata[definition.code];
        writeSupplementaryRecord(DOCUMENT_METADATA_PREFIX, snapshot, nextMetadata);
        renderDocumentDrawer(snapshot);
      });
      actions.append(deleteButton);
    }

    if (existing?.updatedAt) {
      const updated = document.createElement("small");
      updated.textContent = t("documents.updated", {
        time: formatLocalDateTime(existing.updatedAt)
      });
      actions.prepend(updated);
    }

    item.append(heading, constraints, actions);
    documentList.append(item);
  }
}

function openDocumentDrawer() {
  if (!currentPayload?.snapshot) return;
  renderDocumentDrawer(currentPayload.snapshot);
  documentDrawerLayer.hidden = false;
  requestAnimationFrame(() => {
    documentDrawerLayer.classList.add("is-open");
    documentDrawer.setAttribute("aria-hidden", "false");
  });
}

function legacyCacheKey(query) {
  const normalized = normalizeQuery(query);
  return `${CACHE_PREFIX}${normalized.carrier}:${normalized.type}:${normalized.number}`;
}

function readCacheIndex() {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_INDEX_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeCacheIndex(keys) {
  localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(keys.slice(0, CACHE_LIMIT)));
}

function rememberCacheKey(key) {
  const keys = [key, ...readCacheIndex().filter((item) => item !== key)];
  for (const oldKey of keys.slice(CACHE_LIMIT)) localStorage.removeItem(oldKey);
  writeCacheIndex(keys);
}

function removeCacheKey(key) {
  try {
    localStorage.removeItem(key);
    writeCacheIndex(readCacheIndex().filter((item) => item !== key));
  } catch {
    // Browser storage may be disabled.
  }
}

function saveSnapshot(query, payload, savedAt = new Date().toISOString()) {
  if (!payload?.snapshot) return;
  const normalized = normalizeQuery(query);

  try {
    const key = cacheKey(normalized);
    localStorage.setItem(
      key,
      JSON.stringify({
        version: CACHE_VERSION,
        savedAt,
        query: normalized,
        snapshot: payload.snapshot,
        shipmentId: shipmentRecordId(payload),
        shipmentRecord: payload.shipmentRecord ?? null
      })
    );
    rememberCacheKey(key);
  } catch {
    // A successful live query must still render when LocalStorage is unavailable.
  }
}

function readCacheEntry(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "null");
    const savedAt = Date.parse(stored?.savedAt ?? "");
    const expectedContainerCount = (stored?.snapshot?.summary?.containers ?? []).reduce(
      (total, container) => total + Number(container?.quantity ?? container?.count ?? 0),
      0
    );
    const hasCompleteContainerDetails =
      expectedContainerCount <= 0 || (stored?.snapshot?.containers?.length ?? 0) > 0;
    const valid =
      stored?.version === CACHE_VERSION &&
      stored?.query &&
      stored?.snapshot?.tracking &&
      stored?.snapshot?.summary &&
      hasCompleteContainerDetails &&
      Number.isFinite(savedAt) &&
      Date.now() - savedAt <= CACHE_TTL_MS;

    if (!valid) {
      if (stored) removeCacheKey(key);
      return null;
    }
    return { ...stored, query: normalizeQuery(stored.query) };
  } catch {
    removeCacheKey(key);
    return null;
  }
}

function loadSnapshot(query) {
  const stored = readCacheEntry(cacheKey(query)) ?? readCacheEntry(legacyCacheKey(query));
  if (!stored) return null;
  return {
    snapshot: stored.snapshot,
    raw: null,
    cached: false,
    browserCached: true,
    browserCachedAt: stored.savedAt,
    shipmentId: stored.shipmentId ?? stored.shipmentRecord?.publicId ?? null,
    shipmentRecord: stored.shipmentRecord ?? null
  };
}

function readHistory() {
  const records = readCacheIndex()
    .map((key) => ({ key, entry: readCacheEntry(key) }))
    .filter((record) => record.entry)
    .sort((left, right) => Date.parse(right.entry.savedAt) - Date.parse(left.entry.savedAt));
  const seenShipmentRecords = new Set();
  const duplicateKeys = new Set();
  const latestRecords = [];

  for (const record of records) {
    const shipmentNumber = String(
      record.entry.snapshot?.tracking?.number ?? record.entry.query?.number ?? ""
    )
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase();

    const shipmentRecordKey = [
      record.entry.query?.carrier ?? "COSCO",
      record.entry.query?.type ?? record.entry.snapshot?.tracking?.type ?? "BILLOFLADING",
      shipmentNumber
    ].join(":");

    if (shipmentNumber && seenShipmentRecords.has(shipmentRecordKey)) {
      duplicateKeys.add(record.key);
      continue;
    }

    if (shipmentNumber) seenShipmentRecords.add(shipmentRecordKey);
    latestRecords.push(record);
  }

  if (duplicateKeys.size > 0) {
    try {
      for (const key of duplicateKeys) localStorage.removeItem(key);
      writeCacheIndex(readCacheIndex().filter((key) => !duplicateKeys.has(key)));
    } catch {
      // Deduplication is best-effort when browser storage is unavailable.
    }
  }

  return latestRecords.map((record) => record.entry);
}

function migrateLegacyCache() {
  try {
    if (localStorage.getItem(MIGRATION_KEY)) return;
    const legacyKeys = JSON.parse(localStorage.getItem(LEGACY_CACHE_INDEX_KEY) ?? "[]");
    if (Array.isArray(legacyKeys)) {
      for (const legacyKey of legacyKeys) {
        const stored = JSON.parse(localStorage.getItem(legacyKey) ?? "null");
        if (!stored?.snapshot?.tracking) continue;
        if (stored.snapshot.tracking.type === "CONTAINER") continue;
        const query = {
          carrier: "COSCO",
          channel: stored.query?.channel ?? stored.snapshot.channel ?? "AUTO",
          type: stored.snapshot.tracking.type,
          number: stored.snapshot.tracking.number
        };
        saveSnapshot(query, { snapshot: stored.snapshot }, stored.savedAt);
      }
    }
    localStorage.setItem(MIGRATION_KEY, "1");
  } catch {
    // Migration is best-effort and never blocks the application.
  }
}

function appendCell(row, value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = valueOrDash(value);
  if (className) cell.className = className;
  row.append(cell);
}

function setLoading(value) {
  loading = value;
  submitButton.classList.remove("is-loading");
  submitButton.setAttribute("aria-busy", String(loading));
  const label = submitButton.querySelector(".button-label");
  if (label) label.textContent = t(loading ? "query.loading" : "query.submit");
  submitButton.disabled = loading || !CARRIERS[carrierSelect.value]?.enabled;
  results.classList.toggle("is-refreshing", loading && !results.hidden);
}

function renderSystemWait() {
  const activeOperations = [...activeWaitOperations.values()];
  const currentOperation = activeOperations.at(-1);

  if (!currentOperation) {
    systemWaitOverlay.dataset.state = "idle";
    systemWaitOverlay.hidden = true;
    systemWaitOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-system-waiting");
    if (!document.body.classList.contains("is-page-leaving")) {
      appShell.inert = false;
      document.body.removeAttribute("aria-busy");
    }
    return;
  }

  systemWaitMessage.dataset.i18n = currentOperation.messageKey;
  systemWaitMessage.textContent = t(currentOperation.messageKey);
  systemWaitOverlay.dataset.state = "loading";
  systemWaitOverlay.hidden = false;
  systemWaitOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-system-waiting");
  appShell.inert = true;
  document.body.setAttribute("aria-busy", "true");
}

function beginSystemWait(type, messageKey) {
  if (systemWaitCompletionTimer) {
    window.clearTimeout(systemWaitCompletionTimer);
    systemWaitCompletionTimer = null;
  }
  const token = Symbol(type);
  activeWaitOperations.set(token, { type, messageKey });
  renderSystemWait();
  return token;
}

function endSystemWait(token, { complete = false } = {}) {
  if (!token) return;
  activeWaitOperations.delete(token);
  if (activeWaitOperations.size > 0 || !complete) {
    renderSystemWait();
    return;
  }

  systemWaitMessage.dataset.i18n = "wait.complete";
  systemWaitMessage.textContent = t("wait.complete");
  systemWaitOverlay.dataset.state = "complete";
  systemWaitOverlay.hidden = false;
  systemWaitOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-system-waiting");
  appShell.inert = true;
  document.body.setAttribute("aria-busy", "true");
  systemWaitCompletionTimer = window.setTimeout(() => {
    systemWaitCompletionTimer = null;
    renderSystemWait();
  }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 240 : 520);
}

function clearSystemWaitType(type) {
  for (const [token, operation] of activeWaitOperations) {
    if (operation.type === type) activeWaitOperations.delete(token);
  }
  renderSystemWait();
}

function showPlatformRouteWait() {
  platformRouteOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-page-leaving");
  appShell.inert = true;
  document.body.setAttribute("aria-busy", "true");
}

function hidePlatformRouteWait() {
  platformRouteOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-page-leaving");
  if (activeWaitOperations.size === 0) {
    appShell.inert = false;
    document.body.removeAttribute("aria-busy");
  }
}

function batchCounts() {
  const items = batchState?.items ?? [];
  return items.reduce(
    (counts, item) => {
      if (item.status === "success") counts.success += 1;
      else if (item.status === "failed") counts.failed += 1;
      else counts.pending += 1;
      return counts;
    },
    { success: 0, failed: 0, pending: 0 }
  );
}

function persistBatchState() {
  if (!batchState) {
    try {
      localStorage.removeItem(BATCH_STORAGE_KEY);
    } catch {
      // Queue clearing still works in memory when storage is unavailable.
    }
    return;
  }

  batchState.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(BATCH_STORAGE_KEY, JSON.stringify(batchState));
  } catch {
    // The imported queue remains usable for this tab when storage is unavailable.
  }
}

function restoreBatchState() {
  try {
    const stored = JSON.parse(localStorage.getItem(BATCH_STORAGE_KEY) ?? "null");
    if (stored?.version !== BATCH_VERSION || !Array.isArray(stored.items)) return null;

    const items = stored.items
      .slice(0, BATCH_IMPORT_LIMIT)
      .map((item, index) => {
        const type = item?.type === "BOOKING" ? "BOOKING" : "BILLOFLADING";
        const number = String(item?.number ?? "")
          .trim()
          .replace(/\s+/g, "")
          .toUpperCase();
        if (!/^[A-Z0-9-]{4,35}$/.test(number)) return null;
        const status = ["success", "failed"].includes(item?.status)
          ? item.status
          : "pending";
        return {
          id: `${type}:${number}:${index}`,
          type,
          number,
          status,
          source: status === "success" ? String(item?.source ?? "live") : null,
          error: status === "failed" ? String(item?.error ?? "") : null,
          attempts: Number.isFinite(item?.attempts) ? item.attempts : 0,
          updatedAt: item?.updatedAt ?? null
        };
      })
      .filter(Boolean);

    if (items.length === 0) return null;
    return {
      version: BATCH_VERSION,
      fileName: String(stored.fileName ?? "Imported queue"),
      createdAt: stored.createdAt ?? new Date().toISOString(),
      updatedAt: stored.updatedAt ?? null,
      status: items.some((item) => item.status === "pending") ? "paused" : "complete",
      items
    };
  } catch {
    return null;
  }
}

function setBatchImportNotice(key = null, variables = {}, variant = "info") {
  batchImportNotice = key ? { key, variables, variant } : null;
  if (!batchImportNotice) {
    batchImportMessage.hidden = true;
    batchImportMessage.textContent = "";
    batchImportMessage.removeAttribute("data-variant");
    return;
  }
  batchImportMessage.textContent = t(key, variables);
  batchImportMessage.dataset.variant = variant;
  batchImportMessage.hidden = false;
}

function batchStatusKey(item) {
  if (item.status === "success") {
    return item.source === "device-cache" ? "batch.itemCached" : "batch.itemSuccess";
  }
  if (item.status === "failed") return "batch.itemFailed";
  if (item.status === "running") return "batch.itemRunning";
  return "batch.itemPending";
}

function renderBatchState() {
  const items = batchState?.items ?? [];
  const hasQueue = items.length > 0;
  batchImportEmpty.hidden = hasQueue;
  batchImportSummary.hidden = !hasQueue;
  batchResumeButton.hidden =
    !hasQueue || batchRunning || !items.some((item) => item.status === "pending");
  batchClearButton.hidden = !hasQueue || batchRunning;

  if (batchImportNotice) {
    setBatchImportNotice(
      batchImportNotice.key,
      batchImportNotice.variables,
      batchImportNotice.variant
    );
  }

  if (!hasQueue) {
    batchResultList.replaceChildren();
    return;
  }

  const counts = batchCounts();
  const processed = counts.success + counts.failed;
  const progress = Math.round((processed / items.length) * 100);
  const runningIndex = items.findIndex((item) => item.status === "running");
  batchFileName.textContent = batchState.fileName;
  batchProgressLabel.textContent = `${processed} / ${items.length}`;
  batchProgressTrack.setAttribute("aria-valuemax", String(items.length));
  batchProgressTrack.setAttribute("aria-valuenow", String(processed));
  batchProgressTrack.style.setProperty("--batch-progress", `${progress}%`);
  batchSuccessCount.textContent = String(counts.success);
  batchFailedCount.textContent = String(counts.failed);
  batchPendingCount.textContent = String(counts.pending);

  if (runningIndex >= 0) {
    batchStatusText.textContent = t("batch.running", {
      current: runningIndex + 1,
      total: items.length,
      number: items[runningIndex].number
    });
  } else if (counts.pending === 0) {
    batchStatusText.textContent = t("batch.completed", counts);
  } else if (batchState.status === "ready") {
    batchStatusText.textContent = t("batch.ready", { count: items.length });
  } else {
    batchStatusText.textContent = t("batch.restored");
  }

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `batch-result-item is-${item.status}`;
    row.disabled = batchRunning;
    row.setAttribute(
      "aria-label",
      t("batch.openItem", {
        type: trackingTypeLabel(item.type),
        number: item.number
      })
    );
    const identity = document.createElement("span");
    const type = document.createElement("small");
    type.textContent = trackingTypeLabel(item.type);
    const number = document.createElement("strong");
    number.textContent = item.number;
    identity.append(type, number);
    const status = document.createElement("span");
    const statusDot = document.createElement("i");
    statusDot.setAttribute("aria-hidden", "true");
    const statusCopy = document.createElement("b");
    statusCopy.textContent = t(batchStatusKey(item));
    status.append(statusDot, statusCopy);
    if (item.error) status.title = item.error;
    row.append(identity, status);
    row.addEventListener("click", () => openBatchItem(item));
    fragment.append(row);
  }
  batchResultList.replaceChildren(fragment);
}

async function parseBatchFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (
    !["xlsx", "xls", "csv"].includes(extension) ||
    file.size <= 0 ||
    file.size > BATCH_FILE_SIZE_LIMIT
  ) {
    throw new Error(t("batch.unsupportedFile"));
  }
  if (typeof Worker !== "function") throw new Error(t("batch.workerUnsupported"));

  return new Promise((resolve, reject) => {
    const worker = new Worker(appUrl("batch-import-worker.js"), {
      type: "module",
      name: "shipment-batch-import"
    });
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error(t("batch.parseTimeout")));
    }, 30_000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      worker.terminate();
    };

    worker.addEventListener(
      "message",
      (event) => {
        cleanup();
        if (event.data?.ok) {
          resolve({
            items: Array.isArray(event.data.items) ? event.data.items : [],
            found: Number(event.data.found) || 0
          });
          return;
        }
        const code = event.data?.error?.code;
        const message =
          code === "no_columns"
            ? t("batch.noRecognizedColumns")
            : code === "no_rows"
              ? t("batch.noRows")
              : event.data?.error?.message || t("batch.workerFailed");
        reject(new Error(message));
      },
      { once: true }
    );
    worker.addEventListener(
      "error",
      () => {
        cleanup();
        reject(new Error(t("batch.workerFailed")));
      },
      { once: true }
    );
    worker.postMessage({ file, limit: BATCH_IMPORT_LIMIT });
  });
}

function yieldToBrowser(delay = 80) {
  return new Promise((resolve) => window.setTimeout(resolve, delay));
}

function retryAfterDelay(response) {
  const value = response?.headers?.get("Retry-After")?.trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return null;
  return Math.max(0, retryAt - Date.now());
}

async function waitForBatchRequestWindow() {
  const elapsed = Date.now() - lastBatchRequestAt;
  const remaining = BATCH_REQUEST_INTERVAL_MS - elapsed;
  if (lastBatchRequestAt > 0 && remaining > 0) await yieldToBrowser(remaining);
  lastBatchRequestAt = Date.now();
}

async function requestBatchTracking(query) {
  let result = null;
  for (let attempt = 0; attempt <= BATCH_RETRY_LIMIT; attempt += 1) {
    await waitForBatchRequestWindow();
    result = await requestTracking(query);
    if (
      !BATCH_RETRYABLE_STATUSES.has(result.response.status) ||
      attempt >= BATCH_RETRY_LIMIT
    ) {
      return result;
    }

    const retryDelay =
      retryAfterDelay(result.response) ?? BATCH_RETRY_BASE_MS * 2 ** attempt;
    await yieldToBrowser(retryDelay);
  }
  return result;
}

async function runBatchQueue() {
  if (batchRunning || !batchState?.items?.some((item) => item.status === "pending")) return;

  batchRunning = true;
  batchState.status = "running";
  persistBatchState();
  renderBatchState();
  const waitToken = beginSystemWait("batch", "wait.batch");
  let completed = false;

  try {
    for (const item of batchState.items) {
      if (item.status !== "pending") continue;
      item.status = "running";
      item.attempts += 1;
      item.updatedAt = new Date().toISOString();
      persistBatchState();
      renderBatchState();

      const query = normalizeQuery({
        carrier: "COSCO",
        channel: "AUTO",
        type: item.type,
        number: item.number
      });

      try {
        const localPayload = loadSnapshot(query);
        if (localPayload) {
          item.status = "success";
          item.source = "device-cache";
          item.error = null;
        } else {
          const { response, payload } = await requestBatchTracking(query);
          if (!response.ok) {
            throw new Error(
              trackingResponseMessage(payload, response) ||
              t("error.http", { status: response.status })
            );
          }
          saveSnapshot(query, payload);
          item.status = "success";
          item.source = payload?.cached ? "server-cache" : "live";
          item.error = null;
        }
      } catch (error) {
        item.status = "failed";
        item.source = null;
        item.error = error?.message || t("error.generic");
        if (error?.message === "Platform session expired") throw error;
      }

      item.updatedAt = new Date().toISOString();
      persistBatchState();
      renderBatchState();
      await yieldToBrowser();
    }

    batchState.status = "complete";
    completed = batchCounts().failed === 0;
  } catch {
    if (batchState) batchState.status = "paused";
  } finally {
    batchRunning = false;
    if (batchState) {
      persistBatchState();
      renderBatchState();
    }
    renderHistory();
    endSystemWait(waitToken, { complete: completed });
  }
}

function showError(message, variant = "error") {
  errorMessage.textContent = message;
  errorPanel.dataset.variant = variant;
  alertTitle.textContent = variant === "warning" ? t("notice.cacheTitle") : t("error.title");
  errorPanel.hidden = false;
}

function clearError() {
  errorMessage.textContent = "";
  errorPanel.dataset.variant = "error";
  alertTitle.textContent = t("error.title");
  errorPanel.hidden = true;
}

const ROUTE_STAGE_ICONS = Object.freeze({
  origin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 8.5 12 4l7.5 4.5v10L12 22l-7.5-3.5z"/><path d="M4.5 8.5 12 13l7.5-4.5M12 13v9"/></svg>',
  departure: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16h14l-2 4H7zM8 16V8h8v8M12 8V4M9.5 11h5"/><path d="M3 22c2-1 4-1 6 0 2-1 4-1 6 0 2-1 4-1 6 0"/></svg>',
  arrival: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><path d="M12 7v12M7 11h10M5 15c1.5 4 4 6 7 6s5.5-2 7-6M7 15H4m13 0h3"/></svg>',
  destination: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-13A7 7 0 0 0 5 9c0 6.8 7 13 7 13Z"/><circle cx="12" cy="9" r="2.5"/><path d="m9.5 15.5 1.7 1.7 3.5-3.7"/></svg>',
  waypoint: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 12h3.5c3.5 0 3-6 3.5-6M12 12c3.5 0 3 6 3.5 6"/></svg>'
});

function routeStageKind(node, index, total) {
  const locationType = String(node?.locationType ?? "").trim().toUpperCase();
  if (locationType === "FND" || locationType.includes("FINAL")) return "destination";
  if (["LPOD", "POD"].includes(locationType) || locationType.includes("DISCHARGE")) {
    return "arrival";
  }
  if (["FPOL", "POL"].includes(locationType) || locationType.includes("LOAD")) {
    return "departure";
  }
  if (locationType === "POR" || locationType.includes("RECEIPT")) return "origin";
  if (index === 0) return "origin";
  if (index === total - 1) return "destination";
  return "waypoint";
}

function normalizeLocationName(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function selectDisplayRouteNodes(route) {
  const seen = new Set();
  return route.filter((node) => {
    if (!node) return false;
    const identity = [
      node.locationType,
      normalizeLocationName(node.city),
      node.event,
      node.actualTime ?? node.estimatedTime
    ]
      .map((value) => String(value ?? "").trim().toUpperCase())
      .join("|");
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function calculateRouteProgress(route, snapshot) {
  if (route.length === 0) return 0;
  const finalNode = route.at(-1);
  const finalLocationType = String(finalNode?.locationType ?? "").toUpperCase();
  const latest = snapshot.summary?.latestEvent;
  const latestStage = `${latest?.stage ?? ""} ${latest?.oceanStage ?? ""}`.toUpperCase();
  const destination = normalizeLocationName(snapshot.summary?.destination?.name);
  const latestLocation = normalizeLocationName(latest?.location);
  const reachedDestination =
    Boolean(snapshot.keyTimes?.estimatedDelivery?.actualTime) ||
    Boolean(finalNode?.actualTime && finalLocationType === "FND") ||
    Boolean(finalNode?.active && finalLocationType === "FND") ||
    /FND|FINAL|DELIVER/.test(latestStage) ||
    Boolean(latest?.occurredAt && destination && latestLocation === destination);

  if (reachedDestination) return 100;

  const activeIndex = route.findIndex((node) => node.active);
  const lastActualIndex = route.reduce(
    (lastIndex, node, index) => (node.actualTime ? index : lastIndex),
    -1
  );
  const reachedIndex = Math.max(activeIndex, lastActualIndex);
  if (reachedIndex < 0) return 0;
  if (route.length === 1) return 100;
  return Math.max(6, Math.round((reachedIndex / (route.length - 1)) * 100));
}

function containerTypeSummary(snapshot) {
  const normalizedContainers = (snapshot.containers ?? []).filter((container) => container?.type);
  const fallbackContainers = (snapshot.summary?.containers ?? [])
    .map((container) => ({
      type: container?.containerType ?? container?.cntrType ?? container?.type,
      quantity: Number(container?.quantity ?? container?.count ?? 1)
    }))
    .filter((container) => container.type);
  const source = fallbackContainers.length > 0 ? fallbackContainers : normalizedContainers;
  const counts = new Map();

  for (const container of source) {
    const type = String(container.type).trim().toUpperCase();
    if (!type) continue;
    const quantity = Number.isFinite(container.quantity) && container.quantity > 0
      ? container.quantity
      : 1;
    counts.set(type, (counts.get(type) ?? 0) + quantity);
  }

  return [...counts.entries()]
    .map(([type, count]) => `${type} × ${count}`)
    .join(" · ");
}

function renderPrimaryFacts(snapshot) {
  const trafficTerm =
    snapshot.summary?.trafficTerm ??
    (snapshot.containers ?? []).find((container) => container?.trafficTerm)?.trafficTerm ??
    "";
  const containerTypes = containerTypeSummary(snapshot);

  elements["result-traffic-term"].textContent = valueOrDash(trafficTerm);
  elements["result-container-types"].textContent = valueOrDash(containerTypes);
  elements["result-traffic-term-fact"].hidden = !trafficTerm;
  elements["result-container-types-fact"].hidden = !containerTypes;
  elements["result-primary-facts"].hidden = !trafficTerm && !containerTypes;
}

function renderRoute(route, snapshot = {}) {
  route = selectDisplayRouteNodes(route);
  elements["route-flow"].replaceChildren();
  elements["route-flow"].style.setProperty("--route-columns", Math.max(route.length, 1));
  elements["route-count"].textContent = t("route.nodes", { count: route.length });
  const progress = calculateRouteProgress(route, snapshot);
  const progressLabel = t("route.progress", { progress });
  elements["route-flow"].style.setProperty("--route-progress", `${progress}%`);
  elements["route-flow"].classList.toggle("is-complete", progress === 100);
  elements["route-summary-line"].style.setProperty("--route-progress", `${progress}%`);
  elements["route-summary-line"].classList.toggle("is-complete", progress === 100);
  elements["route-summary-line"].setAttribute("aria-valuenow", String(progress));
  elements["route-summary-line"].setAttribute("aria-label", progressLabel);
  elements["route-summary-line"].title = progressLabel;
  elements["route-summary-marker"].textContent = progress === 100 ? "✓" : "◭";

  if (route.length === 0) {
    const empty = document.createElement("div");
    empty.className = "table-empty";
    empty.textContent = t("route.noNodes");
    elements["route-flow"].append(empty);
    return;
  }

  const explicitActiveIndex = route.findIndex((node) => node.active);
  const lastActualIndex = route.reduce(
    (lastIndex, node, index) => (node.actualTime ? index : lastIndex),
    -1
  );
  const currentIndex = explicitActiveIndex >= 0 ? explicitActiveIndex : lastActualIndex;

  route.forEach((node, index) => {
    const stage = routeStageKind(node, index, route.length);
    const item = document.createElement("article");
    item.className = [
      "route-node",
      `route-stage-${stage}`,
      node.actualTime ? "is-complete" : "",
      index === currentIndex ? "is-active is-current" : ""
    ]
      .filter(Boolean)
      .join(" ");

    const dot = document.createElement("span");
    dot.className = `route-dot route-stage-icon route-stage-icon-${stage}`;
    dot.innerHTML = ROUTE_STAGE_ICONS[stage];
    dot.setAttribute("aria-label", t(`route.stage.${stage}`));
    dot.title = t(`route.stage.${stage}`);

    const type = document.createElement("small");
    type.textContent = valueOrDash(node.locationType, `#${node.sequence}`);

    const city = document.createElement("strong");
    city.append(
      createCountryFlag(node.countryCode),
      document.createTextNode(
        [node.city, node.countryCode].filter(Boolean).join(", ") || t("route.unknownLocation")
      )
    );

    const event = document.createElement("span");
    event.textContent = valueOrDash(node.event, t("route.noEvent"));

    const time = document.createElement("time");
    time.textContent = formatDateTime(node.actualTime ?? node.estimatedTime, node.timezone);

    item.append(dot, type, city, event, time);
    elements["route-flow"].append(item);
  });
}

function renderRoutingLegs(legs) {
  const body = elements["routing-table-body"];
  body.replaceChildren();
  elements["routing-count"].textContent = t("routing.legs", { count: legs.length });

  if (legs.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 10;
    cell.className = "table-empty";
    cell.textContent = t("routing.empty");
    row.append(cell);
    body.append(row);
    return;
  }

  for (const leg of legs) {
    const row = document.createElement("tr");
    appendCell(row, leg.sequence);
    appendCell(row, [leg.mode, leg.vesselName].filter(Boolean).join(" / "));
    appendCell(row, [leg.service, leg.voyage].filter(Boolean).join(" / "));
    const loadPort = document.createElement("td");
    loadPort.className = "port-cell";
    loadPort.append(createCountryFlag(leg.loadCountryCode), valueOrDash(leg.loadPort));
    row.append(loadPort);
    const dischargePort = document.createElement("td");
    dischargePort.className = "port-cell";
    dischargePort.append(
      createCountryFlag(leg.dischargeCountryCode),
      valueOrDash(leg.dischargePort)
    );
    row.append(dischargePort);
    const isTruckLeg = String(leg.mode ?? "").trim().toUpperCase() === "TRUCK";
    const showTruckInfoNote = isTruckLeg && !leg.estimatedDeparture;
    appendCell(
      row,
      showTruckInfoNote
        ? t("routing.truckInfoProvided")
        : formatDateTime(leg.estimatedDeparture),
      showTruckInfoNote ? "truck-source-note" : ""
    );
    appendCell(
      row,
      leg.actualDeparture ? formatDateTime(leg.actualDeparture) : t("metrics.notDeparted"),
      `actual-time${leg.actualDeparture ? "" : " pending-time"}`
    );
    appendCell(row, formatDateTime(leg.estimatedArrival));
    appendCell(
      row,
      leg.actualArrival ? formatDateTime(leg.actualArrival) : t("metrics.notArrived"),
      `actual-time${leg.actualArrival ? "" : " pending-time"}`
    );
    appendCell(row, leg.masterBill);
    body.append(row);
  }
}

function renderReferences(references) {
  elements["master-bill"].textContent = valueOrDash(references.masterBill);
  const bookingNumbers = Array.isArray(references.bookingNumbers)
    ? references.bookingNumbers
    : references.bookingNumbers
      ? [references.bookingNumbers]
      : [];
  elements["booking-numbers"].textContent =
    bookingNumbers.length > 0 ? bookingNumbers.join(", ") : "—";

  if (references.external?.length > 0) {
    elements["external-references"].className = "";
    elements["external-references"].textContent = references.external.join(", ");
  } else {
    elements["external-references"].className = "missing-value";
    elements["external-references"].textContent = t("common.notProvided");
  }

  const list = elements["reference-information"];
  list.replaceChildren();
  const visible = (references.information ?? []).filter((item) => item.name && item.value);

  for (const information of visible) {
    const row = document.createElement("div");
    row.className = "reference-row";
    const name = document.createElement("span");
    name.textContent = information.name;
    const value = document.createElement("strong");
    value.textContent = information.value;
    row.append(name, value);
    list.append(row);
  }
}

function trackingEventCandidates(snapshot) {
  const candidates = [];
  const add = (event, source = "") => {
    if (!event || typeof event !== "object") return;
    const name =
      event.eventName ?? event.name ?? event.event ?? event.status ?? event.description ?? source;
    if (!name) return;
    candidates.push({
      name: String(name),
      estimated:
        event.estimatedEventDateTime ??
        event.estimateDateTime ??
        event.estimatedTime ??
        event.estimate ??
        null,
      actual:
        event.actualEventDateTime ??
        event.occurredAt ??
        event.actualTime ??
        event.eventTime ??
        event.dateTime ??
        null
    });
  };

  for (const status of snapshot.transportStatuses ?? []) add(status);
  for (const container of snapshot.containers ?? []) {
    for (const milestone of container.milestones ?? []) add(milestone);
  }
  for (const node of snapshot.route ?? []) {
    add({
      eventName: node.event ?? node.locationType,
      estimatedTime: node.estimatedTime,
      actualTime: node.actualTime
    });
  }
  return candidates;
}

function renderTrackingEvents(snapshot) {
  const candidates = trackingEventCandidates(snapshot);
  const firstMatching = (patterns) =>
    candidates.find((candidate) => {
      const name = candidate.name.toLowerCase();
      return patterns.some((pattern) => pattern.test(name));
    }) ?? {};
  const oceanLegs = (snapshot.routingLegs ?? []).filter(
    (leg) => String(leg?.mode ?? "").toUpperCase() === "SEA"
  );
  const departureLeg = oceanLegs[0] ?? snapshot.routingLegs?.[0] ?? {};
  const arrivalLeg = oceanLegs.at(-1) ?? snapshot.routingLegs?.at(-1) ?? {};
  const rows = [
    ["trackingEvents.emptyPickup", [/empty.*(pick|gate out)/, /picked up.*origin/]],
    ["trackingEvents.gatedIn", [/gat(e|ed).*in.*origin/, /gate in.*origin/]],
    ["trackingEvents.loaded", [/load(ed)?.*vessel/, /vessel.*load/]],
    ["trackingEvents.departure", [/vessel.*depart/, /depart.*load port/]],
    ["trackingEvents.arrival", [/vessel.*arriv/, /arriv.*discharge port/]],
    ["trackingEvents.gatedOut", [/gat(e|ed).*out/, /container.*pick(ed)? up.*destination/]],
    ["trackingEvents.emptyReturn", [/empty.*return/]]
  ].map(([labelKey, patterns]) => ({ labelKey, ...firstMatching(patterns) }));

  const departure = rows[3];
  departure.estimated ??= departureLeg.estimatedDeparture ?? null;
  departure.actual ??= departureLeg.actualDeparture ?? snapshot.keyTimes?.actualDeparture?.time ?? null;
  const arrival = rows[4];
  arrival.estimated ??=
    arrivalLeg.estimatedArrival ?? snapshot.keyTimes?.estimatedDelivery?.time ?? null;
  arrival.actual ??= arrivalLeg.actualArrival ?? snapshot.keyTimes?.actualArrival?.time ?? null;

  const body = elements["tracking-events-table-body"];
  body.replaceChildren();
  for (const event of rows) {
    const row = document.createElement("tr");
    appendCell(row, t(event.labelKey), "tracking-movement-cell");
    appendCell(row, formatDateTime(event.estimated), event.estimated ? "" : "pending-time");
    appendCell(
      row,
      formatDateTime(event.actual),
      `actual-time${event.actual ? "" : " pending-time"}`
    );
    body.append(row);
  }
}

function renderContainerMilestones(cell, container) {
  const wrapper = document.createElement("div");
  wrapper.className = "container-milestone-detail";
  const heading = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = container.number ?? t("containers.title");
  heading.append(title);
  if (container.detailSource === "CONTAINER_SUBQUERY") {
    const source = document.createElement("span");
    source.textContent = t("containers.enriched");
    heading.append(source);
  }
  wrapper.append(heading);

  const milestones = container.milestones ?? [];
  if (milestones.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = t("containers.noMilestones");
    wrapper.append(empty);
  } else {
    const timeline = document.createElement("div");
    timeline.className = "container-milestone-timeline";
    for (const milestone of milestones) {
      const item = document.createElement("article");
      const marker = document.createElement("i");
      const copy = document.createElement("span");
      const name = document.createElement("strong");
      const meta = document.createElement("small");
      name.textContent = valueOrDash(milestone.name, t("route.noEvent"));
      meta.textContent = [
        milestone.location,
        formatDateTime(milestone.occurredAt),
        milestone.transportMode
      ]
        .filter((value) => value && value !== "—")
        .join(" · ");
      copy.append(name, meta);
      item.append(marker, copy);
      timeline.append(item);
    }
    wrapper.append(timeline);
  }
  cell.append(wrapper);
}

function renderContainers(containers) {
  const body = elements["container-table-body"];
  body.replaceChildren();
  elements["container-count"].textContent = t("containers.count", { count: containers.length });

  if (containers.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
    cell.className = "table-empty";
    cell.textContent = t("containers.empty");
    row.append(cell);
    body.append(row);
    return;
  }

  for (const container of containers) {
    const row = document.createElement("tr");
    appendCell(row, container.number);
    appendCell(row, container.type);
    appendCell(row, container.transportMode);
    appendCell(row, container.trafficTerm);
    appendCell(row, container.currentLocation);
    appendCell(row, container.latestEvent);
    appendCell(row, formatDateTime(container.latestEventTime));
    const actionCell = document.createElement("td");
    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "container-details-button";
    detailsButton.textContent = t("containers.openDetails");
    detailsButton.setAttribute("aria-expanded", "false");
    actionCell.append(detailsButton);
    row.append(actionCell);

    const detailRow = document.createElement("tr");
    detailRow.className = "container-detail-row";
    detailRow.hidden = true;
    const detailCell = document.createElement("td");
    detailCell.colSpan = 8;
    renderContainerMilestones(detailCell, container);
    detailRow.append(detailCell);
    detailsButton.addEventListener("click", () => {
      const expanded = detailsButton.getAttribute("aria-expanded") === "true";
      detailsButton.setAttribute("aria-expanded", String(!expanded));
      detailsButton.textContent = t(
        expanded ? "containers.openDetails" : "containers.closeDetails"
      );
      detailRow.hidden = expanded;
    });
    body.append(row, detailRow);
  }
}

function renderJourney(snapshot) {
  const latest = snapshot.summary?.latestEvent;
  journeyStage.textContent = valueOrDash(latest?.name, t("journey.awaiting"));
}

function restartResultAnimation() {
  clearTimeout(resultAnimationTimer);
  results.classList.remove("is-revealing");
  void results.offsetWidth;
  results.classList.add("is-revealing");
  resultAnimationTimer = setTimeout(() => {
    results.classList.remove("is-revealing");
  }, 1_300);
}

function setSummaryService(element, enabled) {
  element.classList.toggle("is-enabled", enabled);
  element.setAttribute("aria-checked", String(enabled));
}

function renderResult(payload) {
  const snapshot = payload.snapshot;
  const summary = snapshot.summary;
  const keyTimes = snapshot.keyTimes ?? {};
  const latest = summary.latestEvent;
  const providerCode = snapshot.provider?.code ?? "COSCO";
  const resultChannel = CHANNELS[snapshot.channel] ?? CHANNELS.NETWORK;
  const isContainerOnly = snapshot.viewMode === "CONTAINER";

  currentPayload = payload;
  setRelatedFilesContext(payload);
  results.classList.toggle("is-container-only", isContainerOnly);
  sourceTag.textContent = t(resultChannel.sourceKey);
  elements["result-carrier"].textContent = providerCode;
  elements["result-type"].textContent = trackingTypeLabel(snapshot.tracking.type);
  elements["result-number"].textContent = snapshot.tracking.number;
  renderPrimaryFacts(snapshot);

  const bookingNumbers = Array.isArray(summary.bookingNumbers)
    ? summary.bookingNumbers
    : summary.bookingNumbers
      ? [summary.bookingNumbers]
      : [];
  elements["summary-booking-number"].textContent =
    bookingNumbers.length > 0 ? bookingNumbers.join(", ") : "—";
  elements["summary-origin-name"].textContent = valueOrDash(
    [summary.origin?.name, summary.origin?.countryCode].filter(Boolean).join(", ")
  );
  elements["summary-destination-name"].textContent = valueOrDash(
    [summary.destination?.name, summary.destination?.countryCode].filter(Boolean).join(", ")
  );
  elements["summary-latest-detail"].textContent = [
    latest?.location,
    formatDateTime(latest?.occurredAt)
  ]
    .filter((value) => value && value !== "—")
    .join(" · ") || "—";

  const transportModes = new Set(
    (snapshot.routingLegs ?? [])
      .map((leg) => String(leg?.mode ?? "").trim().toUpperCase())
      .filter(Boolean)
  );
  const serviceScopes = (summary.serviceScopes ?? []).map((scope) =>
    String(scope).trim().toLowerCase()
  );
  setSummaryService(
    elements["summary-service-sea"],
    transportModes.has("SEA") || serviceScopes.some((scope) => scope.includes("ocean"))
  );
  setSummaryService(
    elements["summary-service-inland"],
    ["TRUCK", "RAIL", "ROAD", "INLAND"].some((mode) => transportModes.has(mode)) ||
      serviceScopes.some((scope) => scope.includes("truck") || scope.includes("inland"))
  );
  setSummaryService(
    elements["summary-service-customs"],
    serviceScopes.some((scope) => scope.includes("custom"))
  );
  setSummaryService(
    elements["summary-service-warehouse"],
    serviceScopes.some((scope) => scope.includes("warehouse") || scope.includes("storage"))
  );

  const source = payload.browserCached ? "browser" : payload.cached ? "server" : "live";
  elements["cache-status"].dataset.source = source;
  elements["cache-status"].textContent = t(`cache.${source}`);
  elements["cache-status"].title = payload.browserCachedAt
    ? t("cache.savedAt", { time: formatLocalDateTime(payload.browserCachedAt) })
    : "";
  elements["fetched-at"].textContent = formatLocalDateTime(snapshot.fetchedAt);

  elements["actual-departure"].textContent = keyTimes.actualDeparture?.time
    ? formatDateTime(keyTimes.actualDeparture.time)
    : t("metrics.notDeparted");
  elements["actual-departure-location"].textContent = valueOrDash(
    keyTimes.actualDeparture?.location,
    t("common.notProvided")
  );
  elements["actual-arrival"].textContent = keyTimes.actualArrival?.time
    ? formatDateTime(keyTimes.actualArrival.time)
    : t("metrics.notArrived");
  elements["actual-arrival-location"].textContent = valueOrDash(
    keyTimes.actualArrival?.location,
    t("common.notProvided")
  );
  elements["estimated-delivery"].textContent = formatDateTime(
    keyTimes.estimatedDelivery?.actualTime ?? keyTimes.estimatedDelivery?.time,
    keyTimes.estimatedDelivery?.timezone
  );
  elements["estimated-delivery-location"].textContent = valueOrDash(
    keyTimes.estimatedDelivery?.location,
    t("common.notProvided")
  );
  elements["latest-event"].textContent = valueOrDash(latest?.name, t("metrics.noLatestEvent"));
  elements["latest-event-detail"].textContent = [
    latest?.location,
    formatDateTime(latest?.occurredAt),
    latest?.transportMode
  ]
    .filter((item) => item && item !== "—")
    .join(" · ");

  setCountryFlag(elements["origin-flag"], summary.origin.countryCode);
  elements["origin-name"].textContent = valueOrDash(summary.origin.name);
  elements["origin-code"].textContent = valueOrDash(summary.origin.countryCode);
  setCountryFlag(elements["destination-flag"], summary.destination.countryCode);
  elements["destination-name"].textContent = valueOrDash(summary.destination.name);
  elements["destination-code"].textContent = valueOrDash(summary.destination.countryCode);

  renderRoute(snapshot.route ?? [], snapshot);
  renderJourney(snapshot);
  renderRoutingLegs(snapshot.routingLegs ?? []);
  renderReferences(snapshot.references ?? {});
  renderBusinessReferences(snapshot);
  renderTrackingEvents(snapshot);
  renderContainers(snapshot.containers ?? []);
  renderDocumentDrawer(snapshot);
  elements["raw-json"].textContent = payload.raw
    ? JSON.stringify(payload.raw, null, 2)
    : JSON.stringify({ notice: t("raw.cacheNotice"), snapshot }, null, 2);

  emptyState.hidden = true;
  results.hidden = false;
  results.classList.toggle("is-refreshing", loading);
  restartResultAnimation();
}

function formatShipmentDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10) || "—";
  return new Intl.DateTimeFormat(locale(), {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(date);
}

function portCode(value) {
  return String(value ?? "")
    .toUpperCase()
    .match(/\b[A-Z]{5}\b/)?.[0] ?? "";
}

function historyPort(snapshot, side) {
  const route = snapshot.route ?? [];
  const isOrigin = side === "origin";
  const preferredTypes = isOrigin ? ["FPOL", "POR"] : ["LPOD", "FND"];
  const node = preferredTypes
    .map((type) => route.find((item) => item.locationType === type))
    .find(Boolean) ?? (isOrigin ? route[0] : route.at(-1));
  const summary = snapshot.summary?.[side] ?? {};
  const name = node?.city ?? summary.name ?? t("route.unknownLocation");
  const code = portCode(node?.facilityCode) || portCode(name);

  return {
    name,
    code,
    countryCode: node?.countryCode ?? summary.countryCode ?? ""
  };
}

function historyTiming(snapshot) {
  const keyTimes = snapshot.keyTimes ?? {};
  const legs = snapshot.routingLegs ?? [];
  const firstLeg = legs[0] ?? {};
  const lastLeg = legs.at(-1) ?? {};
  const oceanLegs = legs.filter((leg) => String(leg.mode ?? "").toUpperCase() === "SEA");
  const firstOceanLeg = oceanLegs[0] ?? firstLeg;
  const lastOceanLeg = oceanLegs.at(-1) ?? lastLeg;
  const actualDeparture = firstOceanLeg.actualDeparture ?? keyTimes.actualDeparture?.time ?? null;
  const estimatedDeparture = firstOceanLeg.estimatedDeparture ?? null;
  const actualArrival =
    lastOceanLeg.actualArrival ??
    keyTimes.actualArrival?.time ??
    keyTimes.estimatedDelivery?.actualTime ??
    null;
  const estimatedArrival =
    lastOceanLeg.estimatedArrival ?? keyTimes.estimatedDelivery?.time ?? null;

  return {
    departureTime: actualDeparture ?? estimatedDeparture,
    departureIsActual: Boolean(actualDeparture),
    arrivalTime: actualArrival ?? estimatedArrival,
    arrivalIsActual: Boolean(actualArrival),
    actualDeparture,
    actualArrival,
    estimatedArrival
  };
}

function historyProgress(snapshot, timing) {
  if (timing.arrivalIsActual) return 100;
  if (!timing.actualDeparture) return 8;

  const departure = Date.parse(timing.actualDeparture);
  const arrival = Date.parse(timing.estimatedArrival ?? "");
  if (Number.isFinite(departure) && Number.isFinite(arrival) && arrival > departure) {
    const elapsed = (Date.now() - departure) / (arrival - departure);
    return Math.round(Math.min(92, Math.max(18, elapsed * 84 + 8)));
  }

  return snapshot.keyTimes?.actualArrival?.time ? 78 : 52;
}

function historyTimeline(snapshot) {
  const keyTimes = snapshot.keyTimes ?? {};
  const latest = snapshot.summary?.latestEvent;
  const items = [];
  const seen = new Set();
  const add = (name, time, location) => {
    if (!name || !time) return;
    const identity = `${time}|${location ?? ""}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    items.push({ name, time, location });
  };

  add(latest?.name, latest?.occurredAt, latest?.location);
  for (const node of snapshot.route ?? []) {
    add(node.event ?? node.locationType, node.actualTime, node.city);
  }
  for (const status of snapshot.transportStatuses ?? []) {
    if (!status || typeof status !== "object") continue;
    add(
      status.eventName ?? status.event ?? status.status ?? status.description,
      status.actualEventDateTime ?? status.actualTime ?? status.eventTime ?? status.dateTime,
      status.eventLocation ?? status.location ?? status.city
    );
  }
  add(t("metrics.actualArrival"), keyTimes.actualArrival?.time, keyTimes.actualArrival?.location);
  add(t("metrics.actualDeparture"), keyTimes.actualDeparture?.time, keyTimes.actualDeparture?.location);

  return items
    .sort((left, right) => Date.parse(right.time) - Date.parse(left.time))
    .slice(0, 3);
}

function createHistoryPort(port, side) {
  const wrapper = document.createElement("span");
  wrapper.className = `shipment-port shipment-${side}-port`;
  const flag = createCountryFlag(port.countryCode);
  const copy = document.createElement("span");
  const label = document.createElement("small");
  label.className = "shipment-field-label";
  label.textContent = t(side === "origin" ? "history.originPort" : "history.destinationPort");
  const primary = document.createElement("strong");
  primary.textContent = port.code || port.name;
  const secondary = document.createElement("small");
  secondary.textContent = port.code ? port.name : port.countryCode || "—";
  copy.append(label, primary, secondary);
  wrapper.append(flag, copy);
  return wrapper;
}

function setHistoryDetailsExpanded({ item, toggle, details, entryKey, expanded, animate = true }) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  details.getAnimations().forEach((animation) => animation.cancel());
  toggle.setAttribute("aria-expanded", String(expanded));
  item.classList.toggle("is-expanded", expanded);
  toggle.setAttribute(
    "aria-label",
    t(expanded ? "history.collapse" : "history.expand", {
      number: item.dataset.shipmentNumber
    })
  );

  if (expanded) expandedHistoryKeys.add(entryKey);
  else expandedHistoryKeys.delete(entryKey);

  if (!animate || reduceMotion) {
    details.hidden = !expanded;
    return;
  }

  if (expanded) {
    details.hidden = false;
    const targetHeight = details.scrollHeight;
    const animation = details.animate(
      [
        { height: "0px", opacity: 0, transform: "translateY(-8px)" },
        { height: `${targetHeight}px`, opacity: 1, transform: "translateY(0)" }
      ],
      { duration: 320, easing: "cubic-bezier(.2,.75,.2,1)" }
    );
    animation.addEventListener("finish", () => {
      if (toggle.getAttribute("aria-expanded") === "true") details.style.height = "";
    });
    return;
  }

  const currentHeight = details.getBoundingClientRect().height || details.scrollHeight;
  const animation = details.animate(
    [
      { height: `${currentHeight}px`, opacity: 1, transform: "translateY(0)" },
      { height: "0px", opacity: 0, transform: "translateY(-8px)" }
    ],
    { duration: 240, easing: "cubic-bezier(.4,0,.6,1)" }
  );
  animation.addEventListener("finish", () => {
    if (toggle.getAttribute("aria-expanded") === "false") details.hidden = true;
  });
}

function renderHistory() {
  const history = readHistory();

  historyEmpty.hidden = history.length > 0;
  historyTableWrap.hidden = history.length === 0;
  clearHistoryButton.hidden = history.length === 0;
  historyTableBody.replaceChildren();

  let rowIndex = 0;
  for (const entry of history) {
    const item = document.createElement("article");
    item.className = "shipment-history-item";
    item.style.setProperty("--row-index", rowIndex);
    rowIndex += 1;
    const snapshot = entry.snapshot;
    const summary = snapshot.summary;
    const businessReferences = businessReferencesForSnapshot(snapshot);
    const origin = historyPort(snapshot, "origin");
    const destination = historyPort(snapshot, "destination");
    const timing = historyTiming(snapshot);
    const progress = historyProgress(snapshot, timing);
    const detailId = `shipment-history-detail-${rowIndex}`;
    const entryKey = cacheKey(entry.query);
    const initiallyExpanded = expandedHistoryKeys.has(entryKey);

    item.dataset.shipmentNumber = entry.query.number;
    item.classList.add(
      timing.arrivalIsActual ? "is-arrived" : timing.actualDeparture ? "is-in-transit" : "is-planned"
    );
    item.style.setProperty("--shipment-progress", `${progress}%`);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "shipment-row-toggle";
    toggle.setAttribute("aria-expanded", String(initiallyExpanded));
    toggle.setAttribute("aria-controls", detailId);
    toggle.setAttribute(
      "aria-label",
      t(initiallyExpanded ? "history.collapse" : "history.expand", {
        number: entry.query.number
      })
    );

    const transportIcon = document.createElement("span");
    transportIcon.className = "shipment-transport-icon";
    transportIcon.setAttribute("aria-hidden", "true");
    transportIcon.innerHTML =
      '<svg viewBox="0 0 24 24" focusable="false"><path d="M4 13h16l-2.2 6H7L4 13Z"/><path d="M7 13V8h10v5M10 8V5h4v3M8.5 10.5h2M13.5 10.5h2"/><path d="M3 21c1.5-.8 3-.8 4.5 0 1.5-.8 3-.8 4.5 0 1.5-.8 3-.8 4.5 0 1.5-.8 3-.8 4.5 0"/></svg>';

    const identity = document.createElement("span");
    identity.className = "shipment-identity";
    const identityLabel = document.createElement("small");
    identityLabel.className = "shipment-field-label";
    identityLabel.textContent = businessReferences.clientNameCode
      ? `${t("business.clientCode")} · ${businessReferences.clientNameCode}`
      : t("history.reference");
    const number = document.createElement("strong");
    number.textContent = entry.query.number;
    const identityMeta = document.createElement("small");
    identityMeta.textContent = [
      businessReferences.clientPoNumber
        ? `${t("business.clientPo")} ${businessReferences.clientPoNumber}`
        : null,
      businessReferences.forwarderJobNumber
        ? `${t("business.forwarderJob")} ${businessReferences.forwarderJobNumber}`
        : null,
      trackingTypeLabel(entry.query.type),
      entry.query.carrier,
      t((CHANNELS[entry.query.channel] ?? CHANNELS.NETWORK).labelKey)
    ]
      .filter(Boolean)
      .join(" · ");
    identity.append(identityLabel, number, identityMeta);

    const journey = document.createElement("span");
    journey.className = "shipment-journey-dates";
    const dateLabels = document.createElement("span");
    dateLabels.className = "shipment-date-labels";
    const departureDate = document.createElement("span");
    departureDate.innerHTML = `<b>${t(timing.departureIsActual ? "history.departed" : "history.etd")}</b><small>${formatShipmentDate(timing.departureTime)}</small>`;
    const arrivalDate = document.createElement("span");
    arrivalDate.innerHTML = `<b>${t(timing.arrivalIsActual ? "history.arrived" : "history.eta")}</b><small>${formatShipmentDate(timing.arrivalTime)}</small>`;
    dateLabels.append(departureDate, arrivalDate);
    const progressTrack = document.createElement("span");
    progressTrack.className = "shipment-progress-track";
    progressTrack.append(document.createElement("i"));
    journey.append(dateLabels, progressTrack);

    const current = document.createElement("span");
    current.className = "shipment-current-status";
    const currentLabel = document.createElement("span");
    currentLabel.className = "shipment-field-label";
    currentLabel.textContent = t("history.latestStatus");
    const currentName = document.createElement("strong");
    currentName.textContent = valueOrDash(summary.latestEvent?.name, t("metrics.noLatestEvent"));
    const currentTime = document.createElement("small");
    currentTime.textContent = formatLocalDateTime(summary.latestEvent?.occurredAt);
    current.append(currentLabel, currentName, currentTime);

    const chevron = document.createElement("span");
    chevron.className = "shipment-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "⌄";
    toggle.append(
      transportIcon,
      identity,
      createHistoryPort(origin, "origin"),
      journey,
      createHistoryPort(destination, "destination"),
      current,
      chevron
    );

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "history-delete-button";
    deleteButton.textContent = t("history.delete");
    deleteButton.setAttribute(
      "aria-label",
      t("history.deleteLabel", { number: entry.query.number })
    );
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!window.confirm(t("history.confirmDelete", { number: entry.query.number }))) return;
      removeCacheKey(entryKey);
      expandedHistoryKeys.delete(entryKey);
      renderHistory();
    });

    const details = document.createElement("div");
    details.className = "shipment-row-details";
    details.id = detailId;
    details.hidden = !initiallyExpanded;
    item.classList.toggle("is-expanded", initiallyExpanded);

    const facts = document.createElement("dl");
    facts.className = "shipment-detail-facts";
    const factEntries = [
      [t("history.reference"), entry.query.number],
      [t("business.clientCode"), businessReferences.clientNameCode],
      [t("business.clientPo"), businessReferences.clientPoNumber],
      [t("business.forwarderJob"), businessReferences.forwarderJobNumber],
      [t("history.currentLocation"), summary.latestEvent?.location],
      [t("history.updated"), formatLocalDateTime(entry.savedAt)]
    ];
    for (const [label, value] of factEntries) {
      const fact = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = valueOrDash(value);
      fact.append(dt, dd);
      facts.append(fact);
    }

    const timelineSection = document.createElement("section");
    timelineSection.className = "shipment-timeline-section";
    const timelineTitle = document.createElement("strong");
    timelineTitle.className = "shipment-detail-title";
    timelineTitle.textContent = t("history.recentMovement");
    const timeline = document.createElement("div");
    timeline.className = "shipment-mini-timeline";
    const timelineItems = historyTimeline(snapshot);
    if (timelineItems.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = t("history.noTimeline");
      timeline.append(empty);
    } else {
      for (const event of timelineItems) {
        const eventNode = document.createElement("div");
        const marker = document.createElement("i");
        const copy = document.createElement("span");
        const eventName = document.createElement("strong");
        eventName.textContent = event.name;
        const eventMeta = document.createElement("small");
        eventMeta.textContent = [event.location, formatLocalDateTime(event.time)]
          .filter(Boolean)
          .join(" · ");
        copy.append(eventName, eventMeta);
        eventNode.append(marker, copy);
        timeline.append(eventNode);
      }
    }
    timelineSection.append(timelineTitle, timeline);

    const detailActions = document.createElement("div");
    detailActions.className = "shipment-detail-actions";
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "open-history-button";
    openButton.innerHTML = `<span>${t("history.open")}</span><b aria-hidden="true">↗</b>`;
    openButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openHistoryEntry(entry);
    });
    detailActions.append(openButton);
    details.append(facts, timelineSection, detailActions);

    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      setHistoryDetailsExpanded({
        item,
        toggle,
        details,
        entryKey,
        expanded: !expanded
      });
    });

    item.append(toggle, deleteButton, details);
    historyTableBody.append(item);
  }
}

function updateCarrierUI({ resetResult = false } = {}) {
  const carrier = CARRIERS[carrierSelect.value] ?? CARRIERS.COSCO;
  const cmaSelected = carrier.code === "CMA";
  if (cmaSelected) channelSelect.value = "PLAYWRIGHT";
  else if (channelSelect.disabled) channelSelect.value = "AUTO";
  channelSelect.disabled = cmaSelected;
  const channel = CHANNELS[channelSelect.value] ?? CHANNELS.NETWORK;
  sourceTag.textContent = carrier.code === "COSCO" ? t(channel.sourceKey) : carrier.source;
  carrierNotice.hidden = carrier.enabled;
  carrierNotice.textContent = carrier.enabled ? "" : t("carrier.cmaNotice");
  checkChannelsButton.disabled = channelCheckLoading || carrier.code !== "COSCO";
  setLoading(loading);

  if (
    resetResult &&
    (currentPayload?.snapshot?.provider?.code !== carrier.code ||
      currentPayload?.snapshot?.channel !== channel.code)
  ) {
    currentPayload = null;
    setRelatedFilesContext(null);
    results.hidden = true;
    emptyState.hidden = false;
    clearError();
  }
}

function probeElements(channel) {
  return channel === "PLAYWRIGHT"
    ? {
        card: playwrightProbe,
        status: playwrightProbeStatus,
        latency: playwrightProbeLatency
      }
    : {
        card: networkProbe,
        status: networkProbeStatus,
        latency: networkProbeLatency
      };
}

function renderProbe(channel, probe) {
  const target = probeElements(channel);
  const status = probe?.status ?? "unknown";
  const available = probe?.available === true || status === "available";
  const unavailable = probe?.available === false || status === "unavailable";
  target.card.dataset.status = status;
  target.status.textContent = available
    ? t("workbench.available")
    : unavailable
      ? t("workbench.unavailable")
      : status === "checking"
        ? t("status.shortChecking")
        : t("workbench.notChecked");
  target.latency.textContent = Number.isFinite(probe?.responseTimeMs)
    ? t("workbench.latency", { time: probe.responseTimeMs })
    : "—";
  target.card.title = probe?.error ?? "";
}

function renderChannelCheck(result) {
  if (!result?.channels) return;
  lastChannelCheck = result;
  renderProbe("NETWORK", result.channels.NETWORK);
  renderProbe("PLAYWRIGHT", result.channels.PLAYWRIGHT);
  channelCheckSummary.textContent = t("workbench.checkedAt", {
    time: formatLocalDateTime(result.checkedAt)
  });
}

function setChannelCheckLoading(value) {
  channelCheckLoading = value;
  checkChannelsButton.disabled = value || carrierSelect.value !== "COSCO";
  checkChannelsButton.classList.toggle("is-loading", value);
  const label = checkChannelsButton.querySelector("[data-i18n]");
  if (label) label.textContent = t(value ? "workbench.checking" : "workbench.check");
  if (value) {
    renderProbe("NETWORK", { status: "checking" });
    renderProbe("PLAYWRIGHT", { status: "checking" });
    channelCheckSummary.textContent = t("workbench.helper");
  }
}

function renderChannelStatus(status) {
  lastChannelStatus = status ?? { status: "unknown" };
  const state = lastChannelStatus.status ?? "unknown";
  channelState.dataset.status = state;
  channelStatusText.textContent = t(`status.${state}`);
  overviewMonitorStatus.textContent = t(`status.short${state[0].toUpperCase()}${state.slice(1)}`);
  channelState.title = [
    lastChannelStatus.lastCheckedAt
      ? t("status.lastCheck", { time: formatLocalDateTime(lastChannelStatus.lastCheckedAt) })
      : null,
    lastChannelStatus.nextCheckAt
      ? t("status.nextCheck", { time: formatLocalDateTime(lastChannelStatus.nextCheckAt) })
      : null,
    lastChannelStatus.lastError
      ? t("status.error", { message: lastChannelStatus.lastError })
      : null
  ]
    .filter(Boolean)
    .join("\n");

  if (!lastChannelCheck) {
    renderProbe("NETWORK", lastChannelStatus);
  }
}

async function refreshChannelStatus() {
  try {
    const response = requireAuthorizedResponse(
      await fetch(appUrl("api/channels/network/status"), {
        headers: { Accept: "application/json" },
        cache: "no-store"
      })
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderChannelStatus(await response.json());
  } catch {
    renderChannelStatus({ status: "unknown" });
  }
}

function updateUrl(query, { push = false } = {}) {
  const normalized = normalizeQuery(query);
  const url = new URL(window.location.href);
  url.searchParams.set("carrier", normalized.carrier);
  url.searchParams.set("channel", normalized.channel);
  url.searchParams.set("type", normalized.type);
  url.searchParams.set("number", normalized.number);
  url.hash = "tracking";
  window.history[push ? "pushState" : "replaceState"]({}, "", url);
}

function showView(name, { updateLocation = true } = {}) {
  const nextView = name === "tracking" ? "tracking" : "overview";
  const incoming = document.querySelector(`[data-view="${nextView}"]`);
  const outgoing = document.querySelector(".app-view:not([hidden])");
  const transitionId = ++viewTransitionSequence;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let resolveShown;
  const shown = new Promise((resolve) => {
    resolveShown = resolve;
  });

  activeView = nextView;
  document.querySelectorAll("[data-view-target]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.viewTarget === activeView);
  });
  activeViewTitle.textContent = t(`nav.${activeView}`);

  if (updateLocation) {
    const url = new URL(window.location.href);
    url.hash = activeView;
    if (activeView === "overview") {
      url.searchParams.delete("carrier");
      url.searchParams.delete("channel");
      url.searchParams.delete("type");
      url.searchParams.delete("number");
    }
    window.history.replaceState({}, "", url);
  }

  const revealIncoming = () => {
    if (transitionId !== viewTransitionSequence) return;
    document.querySelectorAll(".app-view").forEach((view) => {
      view.hidden = view !== incoming;
      view.getAnimations().forEach((animation) => animation.cancel());
    });
    incoming.hidden = false;
    if (!reduceMotion) {
      incoming.animate(
        [
          { opacity: 0, transform: "translateY(10px)" },
          { opacity: 1, transform: "translateY(0)" }
        ],
        { duration: 320, easing: "cubic-bezier(.2,.75,.2,1)" }
      );
    }
    if (activeView === "overview") renderHistory();
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    resolveShown();
  };

  if (outgoing && outgoing !== incoming && !reduceMotion) {
    outgoing
      .animate(
        [
          { opacity: 1, transform: "translateY(0)" },
          { opacity: 0, transform: "translateY(-6px)" }
        ],
        { duration: 150, easing: "ease-in", fill: "forwards" }
      )
      .finished.catch(() => {})
      .then(revealIncoming);
  } else {
    revealIncoming();
  }

  return shown;
}

function openHistoryEntry(entry) {
  carrierSelect.value = entry.query.carrier;
  channelSelect.value = entry.query.channel ?? "AUTO";
  trackingType.value = entry.query.type;
  trackingNumber.value = entry.query.number;
  updateCarrierUI();
  currentPayload = {
    snapshot: entry.snapshot,
    raw: null,
    cached: false,
    browserCached: true,
    browserCachedAt: entry.savedAt,
    shipmentId: entry.shipmentId ?? entry.shipmentRecord?.publicId ?? null,
    shipmentRecord: entry.shipmentRecord ?? null
  };
  renderResult(currentPayload);
  updateUrl(entry.query, { push: true });
  void showView("tracking", { updateLocation: false }).then(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const currentQuery = normalizeQuery({
          carrier: carrierSelect.value,
          channel: channelSelect.value,
          type: trackingType.value,
          number: trackingNumber.value
        });
        if (
          activeView === "tracking" &&
          cacheKey(currentQuery) === cacheKey(entry.query)
        ) {
          form.requestSubmit();
        }
      });
    });
  });
}

function markBatchItemResult(query, { status, source = null, error = null }) {
  if (!batchState?.items?.length) return;
  const normalized = normalizeQuery(query);
  const item = batchState.items.find(
    (candidate) =>
      candidate.type === normalized.type && candidate.number === normalized.number
  );
  if (!item) return;
  item.status = status;
  item.source = source;
  item.error = error;
  item.attempts = Number(item.attempts || 0) + 1;
  item.updatedAt = new Date().toISOString();
  batchState.status = batchState.items.some((candidate) => candidate.status === "pending")
    ? "paused"
    : "complete";
  persistBatchState();
  renderBatchState();
}

function openBatchItem(item) {
  if (batchRunning) return;
  const query = normalizeQuery({
    carrier: "COSCO",
    channel: "AUTO",
    type: item.type,
    number: item.number
  });
  carrierSelect.value = query.carrier;
  channelSelect.value = query.channel;
  trackingType.value = query.type;
  trackingNumber.value = query.number;
  updateCarrierUI();
  const localPayload = loadSnapshot(query);
  if (localPayload) {
    currentPayload = localPayload;
    renderResult(localPayload);
  } else {
    currentPayload = null;
    setRelatedFilesContext(null);
    results.hidden = true;
    emptyState.hidden = false;
    clearError();
  }
  updateUrl(query, { push: true });
  void showView("tracking", { updateLocation: false }).then(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const currentQuery = normalizeQuery({
          carrier: carrierSelect.value,
          channel: channelSelect.value,
          type: trackingType.value,
          number: trackingNumber.value
        });
        if (activeView === "tracking" && cacheKey(currentQuery) === cacheKey(query)) {
          form.requestSubmit();
        }
      });
    });
  });
}

function applyLanguage(language, { persist = true } = {}) {
  currentLanguage = language === "zh" ? "zh" : "en";
  document.documentElement.lang = currentLanguage === "zh" ? "zh-CN" : "en";
  document.title = t("meta.title");

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-content]").forEach((node) => {
    node.setAttribute("content", t(node.dataset.i18nContent));
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  });
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.language === currentLanguage);
  });

  if (!errorPanel.hidden) {
    alertTitle.textContent =
      errorPanel.dataset.variant === "warning" ? t("notice.cacheTitle") : t("error.title");
  }

  if (persist) {
    try {
      localStorage.setItem(LANGUAGE_KEY, currentLanguage);
    } catch {
      // Language switching still works when storage is disabled.
    }
  }
  activeViewTitle.textContent = t(`nav.${activeView}`);
  updateCarrierUI();
  renderChannelStatus(lastChannelStatus);
  if (lastChannelCheck) renderChannelCheck(lastChannelCheck);
  renderHistory();
  renderBatchState();
  if (currentPayload) renderResult(currentPayload);
  renderRelatedFilesDrawer();
}

async function postTrackingRequest(path, query) {
  const response = requireAuthorizedResponse(
    await fetch(appUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query)
    })
  );
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function postPublicShipmentTrackingRequest(query, { includeAuth = true } = {}) {
  const session = readFileSession();
  const sessionFingerprint = fileSessionFingerprint(session);
  const response = await fetch("/api/public/shipments/track", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(includeAuth ? fileAuthHeaders(session) : {})
    },
    body: JSON.stringify(query)
  });
  const payload = await response.json().catch(() => ({}));
  if (payload && typeof payload === "object") {
    trackingPayloadSessionFingerprints.set(payload, sessionFingerprint);
  }

  if (response.status === 401 && includeAuth && session.token) {
    const cleared = clearFileSession(session, { expired: true });
    if (cleared) return postPublicShipmentTrackingRequest(query, { includeAuth: false });
  }
  return { response, payload };
}

async function requestTracking(query) {
  const platform = await postPublicShipmentTrackingRequest(query);
  if (!isPublicTrackingRouteUnavailable(platform)) return platform;

  const primary = await postTrackingRequest("/api/track", query);

  if (
    query.carrier === "COSCO" &&
    [404, 405].includes(primary.response.status)
  ) {
    const compatibilityPath =
      query.channel === "PLAYWRIGHT"
        ? "/api/track/cosco/playwright"
        : "/api/track/cosco";
    return postTrackingRequest(compatibilityPath, query);
  }

  return primary;
}

checkChannelsButton.addEventListener("click", async () => {
  const carrier = CARRIERS[carrierSelect.value];
  if (!carrier?.enabled || channelCheckLoading) return;

  setChannelCheckLoading(true);
  const waitToken = beginSystemWait("channels", "wait.channels");
  let completed = false;
  try {
    const response = requireAuthorizedResponse(
      await fetch(appUrl("api/channels/check"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: trackingType.value || "BILLOFLADING",
          number: trackingNumber.value.trim() || "6502077380"
        })
      })
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        trackingResponseMessage(payload, response) ||
        t("error.http", { status: response.status })
      );
    }
    renderChannelCheck(payload);
    completed = true;
  } catch (error) {
    renderProbe("NETWORK", { status: "unknown" });
    renderProbe("PLAYWRIGHT", { status: "unknown" });
    channelCheckSummary.textContent = t("workbench.checkFailed", {
      message: error?.message || t("error.generic")
    });
  } finally {
    setChannelCheckLoading(false);
    endSystemWait(waitToken, { complete: completed });
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const query = normalizeQuery({
    carrier: carrierSelect.value,
    channel: channelSelect.value,
    type: trackingType.value,
    number: trackingNumber.value
  });
  const carrier = CARRIERS[query.carrier];

  if (!carrier?.enabled) {
    showError(t("carrier.cmaNotice"), "warning");
    return;
  }

  const requestSequence = ++trackingRequestSequence;
  setLoading(true);
  const waitToken = beginSystemWait("tracking", "wait.tracking");
  let completed = false;
  updateUrl(query);
  const localPayload = loadSnapshot(query);
  if (localPayload) renderResult(localPayload);

  try {
    const { response, payload } = await requestTracking(query);

    if (!response.ok) {
      throw new Error(
        trackingResponseMessage(payload, response) ||
        t("error.http", { status: response.status })
      );
    }

    saveSnapshot(query, payload);
    markBatchItemResult(query, {
      status: "success",
      source: payload?.cached ? "server-cache" : "live"
    });
    renderHistory();
    if (requestSequence !== trackingRequestSequence) return;
    renderResult(payload);
    completed = true;
  } catch (error) {
    if (requestSequence !== trackingRequestSequence) return;
    const message = error?.message || t("error.generic");
    markBatchItemResult(query, {
      status: localPayload ? "success" : "failed",
      source: localPayload ? "device-cache" : null,
      error: localPayload ? null : message
    });
    showError(
      localPayload ? t("error.localFallback", { message }) : message,
      localPayload ? "warning" : "error"
    );
  } finally {
    if (requestSequence === trackingRequestSequence) setLoading(false);
    endSystemWait(waitToken, { complete: completed });
  }
});

carrierSelect.addEventListener("change", () => {
  trackingRequestSequence += 1;
  setLoading(false);
  clearSystemWaitType("tracking");
  updateCarrierUI({ resetResult: true });
});
channelSelect.addEventListener("change", () => updateCarrierUI({ resetResult: true }));

batchSelectButton.addEventListener("click", () => {
  if (!batchRunning) batchFileInput.click();
});

batchFileInput.addEventListener("change", async () => {
  const file = batchFileInput.files?.[0];
  if (!file || batchRunning) return;

  batchSelectButton.disabled = true;
  batchSelectButton.setAttribute("aria-busy", "true");
  setBatchImportNotice("batch.parsing", { name: file.name });

  try {
    const imported = await parseBatchFile(file);
    const items = imported.items;
    batchState = {
      version: BATCH_VERSION,
      fileName: file.name,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      status: "ready",
      items
    };
    if (imported.found > BATCH_IMPORT_LIMIT) {
      setBatchImportNotice(
        "batch.limit",
        { found: imported.found, limit: BATCH_IMPORT_LIMIT },
        "warning"
      );
    } else {
      setBatchImportNotice();
    }
    persistBatchState();
    renderBatchState();
    void runBatchQueue();
  } catch (error) {
    setBatchImportNotice(
      "batch.importFailed",
      { message: error?.message || t("error.generic") },
      "error"
    );
  } finally {
    batchSelectButton.disabled = false;
    batchSelectButton.removeAttribute("aria-busy");
    batchFileInput.value = "";
  }
});

batchResumeButton.addEventListener("click", () => {
  void runBatchQueue();
});

batchClearButton.addEventListener("click", () => {
  if (batchRunning || !window.confirm(t("batch.confirmClear"))) return;
  batchState = null;
  batchImportNotice = null;
  persistBatchState();
  renderBatchState();
  setBatchImportNotice();
});

relatedFilesButton.addEventListener("click", openRelatedFilesDrawer);
relatedFilesCloseButton.addEventListener("click", closeRelatedFilesDrawer);
relatedFilesBackdrop.addEventListener("click", closeRelatedFilesDrawer);
relatedFilesRetryButton.addEventListener("click", () => {
  void loadRelatedFiles();
});
relatedFilesSelectButton.addEventListener("click", () => {
  if (!relatedFilesUploading) relatedFilesUploadInput.click();
});
relatedFilesCategoryTrigger.addEventListener("click", () => {
  setRelatedFilesCategoryOpen(!relatedFilesCategoryOpen);
});
relatedFilesCategoryOptions.forEach((option) => {
  option.addEventListener("click", () => {
    setRelatedFilesCategory(option.dataset.categoryValue);
    setRelatedFilesCategoryOpen(false);
    relatedFilesCategoryTrigger.focus({ preventScroll: true });
    setRelatedFilesUploadMessage();
  });
});
relatedFilesUploadInput.addEventListener("change", () => {
  setRelatedFilesUploadMessage();
  updateRelatedFilesSelection();
});
relatedFilesUploadVisibility.addEventListener("change", () => {
  if (relatedFilesUploadVisibility.value === "INTERNAL") {
    relatedFilesSelectedTargetCustomerId = "";
    relatedFilesTargetCustomer.value = "";
  }
  setRelatedFilesUploadMessage();
  updateRelatedFilesSelection();
});
relatedFilesTargetCustomer.addEventListener("change", () => {
  relatedFilesSelectedTargetCustomerId = relatedFilesTargetCustomer.value;
  setRelatedFilesUploadMessage();
  updateRelatedFilesSelection();
});
relatedFilesUploadButton.addEventListener("click", () => {
  void uploadRelatedFiles();
});
trackingAccountTrigger.addEventListener("click", () => {
  setTrackingAccountMenuOpen(!trackingAccountMenuOpen);
});
trackingAccountLogoutButton.addEventListener("click", async () => {
  const session = readFileSession();
  if (!session.token) return;
  trackingAccountLogoutButton.disabled = true;
  try {
    await fetch(session.kind === "CUSTOMER" ? "/api/customer/logout" : "/api/auth/logout", {
      method: "POST",
      headers: { ...fileAuthHeaders(session) }
    });
  } catch {
    // Local sign-out must remain available when the server cannot be reached.
  } finally {
    clearFileSession(session);
    trackingAccountLogoutButton.disabled = false;
    setTrackingAccountMenuOpen(false);
    renderRelatedFilesDrawer();
    showPlatformRouteWait();
    window.setTimeout(() => window.location.assign("/"), 120);
  }
});
document.addEventListener("click", (event) => {
  if (trackingAccountMenuOpen && !trackingAccount.contains(event.target)) {
    setTrackingAccountMenuOpen(false);
  }
  if (relatedFilesCategoryOpen && !relatedFilesCategorySelect.contains(event.target)) {
    setRelatedFilesCategoryOpen(false);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (trackingAccountMenuOpen) setTrackingAccountMenuOpen(false);
  if (relatedFilesCategoryOpen) setRelatedFilesCategoryOpen(false);
  if (!relatedFilesDrawer.hidden) closeRelatedFilesDrawer();
});

window.addEventListener("storage", (event) => {
  if (
    event.key === null ||
    [
      PLATFORM_AUTH_TOKEN_KEY,
      PLATFORM_AUTH_USER_KEY,
      CUSTOMER_AUTH_TOKEN_KEY,
      CUSTOMER_AUTH_SESSION_KEY
    ].includes(event.key)
  ) {
    if (event.key === null) {
      platformPrincipalAwaitingRefresh = false;
      customerPrincipalAwaitingRefresh = false;
    } else if (event.key === PLATFORM_AUTH_TOKEN_KEY) {
      platformPrincipalAwaitingRefresh = Boolean(
        event.newValue && event.newValue !== event.oldValue
      );
    } else if (event.key === PLATFORM_AUTH_USER_KEY) {
      platformPrincipalAwaitingRefresh = false;
    } else if (event.key === CUSTOMER_AUTH_TOKEN_KEY) {
      customerPrincipalAwaitingRefresh = Boolean(
        event.newValue && event.newValue !== event.oldValue
      );
    } else if (event.key === CUSTOMER_AUTH_SESSION_KEY) {
      customerPrincipalAwaitingRefresh = false;
    }
    synchronizeRelatedFilesSession(readFileSession(), { expiredKind: "" });
    renderRelatedFilesDrawer();
  }
});

document.querySelectorAll("[data-language]").forEach((button) => {
  button.addEventListener("click", () => applyLanguage(button.dataset.language));
});

document.querySelectorAll("[data-view-target]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    showView(link.dataset.viewTarget);
  });
});

document.querySelectorAll("[data-home-link]").forEach((link) => {
  link.addEventListener("click", (event) => {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) return;

    event.preventDefault();
    if (document.body.classList.contains("is-page-leaving")) return;
    showPlatformRouteWait();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => window.location.assign(link.href), reduceMotion ? 0 : 180);
    window.setTimeout(hidePlatformRouteWait, 6000);
  });
});

document.querySelector("#start-tracking-button").addEventListener("click", () => {
  showView("tracking");
  trackingNumber.focus();
});

clearHistoryButton.addEventListener("click", () => {
  if (!window.confirm(t("history.confirmClear"))) return;
  for (const key of readCacheIndex()) localStorage.removeItem(key);
  localStorage.removeItem(CACHE_INDEX_KEY);
  expandedHistoryKeys.clear();
  renderHistory();
});

document.querySelector("#edit-business-references").addEventListener("click", () => {
  openBusinessReferenceDialog();
});

businessReferenceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!currentPayload?.snapshot) return;
  const references = {
    clientNameCode: document.querySelector("#business-client-code-input").value.trim(),
    clientPoNumber: document.querySelector("#business-client-po-input").value.trim(),
    forwarderJobNumber: document
      .querySelector("#business-forwarder-job-input")
      .value.trim()
  };
  writeSupplementaryRecord(
    BUSINESS_REFERENCE_PREFIX,
    currentPayload.snapshot,
    references
  );
  businessReferenceDialog.close();
  renderBusinessReferences(currentPayload.snapshot);
  renderHistory();
});

document.querySelector("#open-document-drawer").addEventListener("click", openDocumentDrawer);
document.querySelector("#close-document-drawer").addEventListener("click", closeDocumentDrawer);
document.querySelector("#document-drawer-backdrop").addEventListener("click", closeDocumentDrawer);

documentEditorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!currentPayload?.snapshot) return;
  const code = document.querySelector("#document-type-input").value;
  const definition = documentDefinition(code);
  if (!definition) return;
  const metadata = documentMetadataForSnapshot(currentPayload.snapshot);
  const existing = metadata[code] ?? null;
  const file = document.querySelector("#document-file-input").files?.[0] ?? null;

  if (!file && !existing) {
    window.alert(t("documents.chooseFile"));
    return;
  }

  const nextMetadata = {
    ...metadata,
    [code]: {
      fileName: file?.name ?? existing.fileName,
      fileSize: file?.size ?? existing.fileSize ?? null,
      mimeType: file?.type ?? existing.mimeType ?? null,
      lastModified: file?.lastModified ?? existing.lastModified ?? null,
      uploader: document.querySelector("#document-uploader-input").value,
      visibility: document.querySelector("#document-visibility-input").value,
      updatedAt: new Date().toISOString()
    }
  };
  writeSupplementaryRecord(DOCUMENT_METADATA_PREFIX, currentPayload.snapshot, nextMetadata);
  documentEditorDialog.close();
  renderDocumentDrawer(currentPayload.snapshot);
});

document.querySelectorAll("[data-dialog-close]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(`#${button.dataset.dialogClose}`)?.close();
  });
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !documentDrawerLayer.hidden) closeDocumentDrawer();
});

function syncViewFromLocation() {
  const nextView = window.location.hash === "#tracking" ? "tracking" : "overview";
  if (nextView === activeView) return;
  showView(nextView, { updateLocation: false });
}

window.addEventListener("hashchange", syncViewFromLocation);
window.addEventListener("popstate", syncViewFromLocation);
window.addEventListener("pageshow", () => {
  if (systemWaitCompletionTimer) {
    window.clearTimeout(systemWaitCompletionTimer);
    systemWaitCompletionTimer = null;
  }
  hidePlatformRouteWait();
  activeWaitOperations.clear();
  renderSystemWait();
  synchronizeRelatedFilesSession(readFileSession(), { expiredKind: "" });
  renderRelatedFilesDrawer();
});

migrateLegacyCache();
batchState = restoreBatchState();
if (batchState) persistBatchState();
applyLanguage(currentLanguage, { persist: false });

const initial = new URLSearchParams(window.location.search);
const initialNumber = initial.get("number");
if (initialNumber) {
  const initialQuery = normalizeQuery({
    carrier: initial.get("carrier") || "COSCO",
    channel: initial.get("channel") || "AUTO",
    type: initial.get("type") || "BILLOFLADING",
    number: initialNumber
  });
  carrierSelect.value = CARRIERS[initialQuery.carrier] ? initialQuery.carrier : "COSCO";
  channelSelect.value = CHANNELS[initialQuery.channel] ? initialQuery.channel : "AUTO";
  trackingType.value = TYPE_KEYS[initialQuery.type] ? initialQuery.type : "BILLOFLADING";
  trackingNumber.value = initialQuery.number;
  updateCarrierUI();
  showView("tracking", { updateLocation: false });
  form.requestSubmit();
} else {
  showView(window.location.hash === "#tracking" ? "tracking" : "overview", {
    updateLocation: false
  });
}

void refreshChannelStatus();
setInterval(() => {
  void refreshChannelStatus();
}, 60_000);
