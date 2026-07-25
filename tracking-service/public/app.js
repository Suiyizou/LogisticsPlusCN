const form = document.querySelector("#tracking-form");
const submitButton = document.querySelector("#submit-button");
const carrierSelect = document.querySelector("#carrier-select");
const carrierNavItems = Array.from(document.querySelectorAll("[data-carrier-select]"));
const channelSelect = document.querySelector("#channel-select");
document.body.classList.toggle(
  "is-embedded",
  new URLSearchParams(window.location.search).get("embed") === "1"
);
const trackingType = document.querySelector("#tracking-type");
const trackingNumber = document.querySelector("#tracking-number");
const carrierNotice = document.querySelector("#carrier-notice");
const sourceTag = document.querySelector("#source-tag");
const queryHelper = document.querySelector("#query-helper");
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
const historySearchInput = document.querySelector("#history-search-input");
const historySearchClear = document.querySelector("#history-search-clear");
const historyCustomerFilterWrap = document.querySelector("#history-customer-filter-wrap");
const historyCustomerFilterSelect = document.querySelector("#history-customer-filter");
const historyEtaSortSelect = document.querySelector("#history-eta-sort");
const historyFollowingFilter = document.querySelector("#history-following-filter");
const historyTitle = document.querySelector("#history-title");
const historySubtitle = document.querySelector("#history-subtitle");
const historyEmptyTitle = document.querySelector("#history-empty-title");
const historyEmptyDescription = document.querySelector("#history-empty-description");
const historyLoading = document.querySelector("#history-loading");
const historyPagination = document.querySelector("#history-pagination");
const historyPagePrevious = document.querySelector("#history-page-previous");
const historyPageNext = document.querySelector("#history-page-next");
const historyPageInfo = document.querySelector("#history-page-info");
const historyPageSizeSelect = document.querySelector("#history-page-size");
const agentShipmentTableHead = document.querySelector("#agent-shipment-table-head");
const agentShipmentsNavItem = document.querySelector("#agent-shipments-nav-item");
const agentManagementFollowingFilter = document.querySelector("#agent-management-following-filter");
const agentManagementCustomerFilterWrap = document.querySelector("#agent-management-customer-filter-wrap");
const agentManagementCustomerFilterSelect = document.querySelector("#agent-management-customer-filter");
const agentManagementSearchInput = document.querySelector("#agent-management-search-input");
const agentManagementSearchClear = document.querySelector("#agent-management-search-clear");
const agentManagementSelectAll = document.querySelector("#agent-management-select-all");
const agentManagementSelectedCount = document.querySelector("#agent-management-selected-count");
const agentManagementBulkUpdate = document.querySelector("#agent-management-bulk-update");
const agentManagementBulkUpdateLabel = document.querySelector("#agent-management-bulk-update-label");
const agentManagementRefresh = document.querySelector("#agent-management-refresh");
const agentManagementBulkStatus = document.querySelector("#agent-management-bulk-status");
const agentManagementLoading = document.querySelector("#agent-management-loading");
const agentManagementEmpty = document.querySelector("#agent-management-empty");
const agentManagementTableWrap = document.querySelector("#agent-management-table-wrap");
const agentManagementTableBody = document.querySelector("#agent-management-table-body");
const agentManagementPagination = document.querySelector("#agent-management-pagination");
const agentManagementPagePrevious = document.querySelector("#agent-management-page-previous");
const agentManagementPageNext = document.querySelector("#agent-management-page-next");
const agentManagementPageInfo = document.querySelector("#agent-management-page-info");
const agentManagementPageSizeSelect = document.querySelector("#agent-management-page-size");
const trackingNavItem = document.querySelector("#tracking-nav-item");
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
const batchStopButton = document.querySelector("#batch-stop-button");
const batchClearButton = document.querySelector("#batch-clear-button");
const batchImportEmpty = document.querySelector("#batch-import-empty");
const batchImportSummary = document.querySelector("#batch-import-summary");
const batchFileName = document.querySelector("#batch-file-name");
const batchProgressLabel = document.querySelector("#batch-progress-label");
const batchProgressTrack = document.querySelector("#batch-progress-track");
const batchSuccessCount = document.querySelector("#batch-success-count");
const batchCoreCount = document.querySelector("#batch-core-count");
const batchFailedCount = document.querySelector("#batch-failed-count");
const batchManualCount = document.querySelector("#batch-manual-count");
const batchPendingCount = document.querySelector("#batch-pending-count");
const batchStatusText = document.querySelector("#batch-status-text");
const batchResultList = document.querySelector("#batch-result-list");
const batchImportMessage = document.querySelector("#batch-import-message");
const batchWorkspaceDialog = document.querySelector("#batch-workspace-dialog");
const batchWorkspaceClose = document.querySelector("#batch-workspace-close");
const batchColumnPreview = document.querySelector("#batch-column-preview");
const batchPreviewFileName = document.querySelector("#batch-preview-file-name");
const batchPreviewSheet = document.querySelector("#batch-preview-sheet");
const batchPreviewColumn = document.querySelector("#batch-preview-column");
const batchPreviewType = document.querySelector("#batch-preview-type");
const batchPreviewTableHead = document.querySelector("#batch-preview-table-head");
const batchPreviewTableBody = document.querySelector("#batch-preview-table-body");
const batchPreviewCancel = document.querySelector("#batch-preview-cancel");
const batchPreviewConfirm = document.querySelector("#batch-preview-confirm");
const extraInformationSection = document.querySelector("#extra-information-section");
const extraInformationList = document.querySelector("#extra-information-list");
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
const relatedFilesUploadVisibilitySummary = document.querySelector("#related-files-upload-visibility-summary");
const relatedFilesUploadVisibilityHint = document.querySelector("#related-files-upload-visibility-hint");
const relatedFilesUploadRoleInputs = Array.from(
  document.querySelectorAll("[data-related-files-upload-role]")
);
const relatedFilesTargetCustomerField = document.querySelector("#related-files-target-customer-field");
const relatedFilesTargetCustomer = document.querySelector("#related-files-target-customer");
const relatedFilesTargetCustomerHint = document.querySelector("#related-files-target-customer-hint");
const relatedFilesUploadInput = document.querySelector("#related-files-upload-input");
const relatedFilesSelectButton = document.querySelector("#related-files-select-button");
const relatedFilesUploadButton = document.querySelector("#related-files-upload-button");
const relatedFilesSelection = document.querySelector("#related-files-selection");
const relatedFilesUploadMessage = document.querySelector("#related-files-upload-message");
const relatedFileComments = document.querySelector("#related-file-comments");
const relatedFileCommentsCount = document.querySelector("#related-file-comments-count");
const relatedFileCommentsLoading = document.querySelector("#related-file-comments-loading");
const relatedFileCommentsEmpty = document.querySelector("#related-file-comments-empty");
const relatedFileCommentsList = document.querySelector("#related-file-comments-list");
const relatedFileCommentForm = document.querySelector("#related-file-comment-form");
const relatedFileCommentInput = document.querySelector("#related-file-comment-input");
const relatedFileCommentSend = document.querySelector("#related-file-comment-send");
const relatedFileCommentMessage = document.querySelector("#related-file-comment-message");
const documentDrawerLayer = document.querySelector("#document-drawer-layer");
const documentDrawer = document.querySelector("#document-drawer");
const documentList = document.querySelector("#document-list");
const businessReferenceDialog = document.querySelector("#business-reference-dialog");
const businessReferenceForm = document.querySelector("#business-reference-form");
const documentEditorDialog = document.querySelector("#document-editor-dialog");
const documentEditorForm = document.querySelector("#document-editor-form");
const cmaSessionPanel = document.querySelector("#cma-session-panel");
const cmaSessionPermission = document.querySelector("#cma-session-permission");
const cmaSessionForm = document.querySelector("#cma-session-form");
const cmaSessionStatusElement = document.querySelector("#cma-session-status");
const cmaSessionCookie = document.querySelector("#cma-session-cookie");
const cmaSessionUserAgent = document.querySelector("#cma-session-user-agent");
const cmaSessionSave = document.querySelector("#cma-session-save");
const cmaSessionClear = document.querySelector("#cma-session-clear");
const cmaSessionMessage = document.querySelector("#cma-session-message");

const LANGUAGE_KEY = "shipment-track:language";
const BATCH_STORAGE_KEY = "shipment-track:batch-import:v2";
const BATCH_VERSION = 2;
const BATCH_IMPORT_LIMIT = 50;
const BATCH_FILE_SIZE_LIMIT = 2 * 1024 * 1024;
const BATCH_REQUEST_INTERVAL_MS = 10_000;
const BATCH_RETRY_BASE_MS = 2_200;
const BATCH_RETRY_LIMIT = 2;
const BATCH_RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const BATCH_TASK_POLL_INTERVAL_MS = 1_500;
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
const FILE_VISIBILITY_ROLES = Object.freeze([
  "OVERSEA_AGENT",
  "SHIPPER",
  "CONSIGNEE"
]);

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
  },
  PROXY: {
    code: "PROXY",
    labelKey: "channel.proxy",
    sourceKey: "source.proxy"
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
    "nav.home": "Return to homepage",
    "nav.back": "Back",
    "nav.confirmReturn": "Leave shipment tracking and return now?",
    "nav.overview": "Overview",
    "nav.agentShipments": "Shipment management",
    "nav.agentShipmentDetail": "Shipment details",
    "nav.tracking": "Shipment tracking",
    "nav.profile": "Personal information",
    "profile.kicker": "CUSTOMER PROFILE",
    "profile.title": "Personal information",
    "profile.description": "Review the identity and shipment access assigned by your service representative.",
    "profile.account": "CUSTOMER ACCOUNT",
    "profile.active": "Active",
    "profile.username": "Login account",
    "profile.code": "Customer code",
    "profile.verified": "Verified",
    "profile.role": "Freight identity",
    "profile.help": "To change account information or reset credentials, contact your service representative.",
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
    "overview.agentKicker": "OVERSEAS AGENT DESK",
    "overview.agentTitle": "Your customer shipments, moving in plain sight.",
    "overview.agentDescription": "Review every authorized shipment in one overview, then filter by customer code before updating that customer's tracking.",
    "overview.agentStartTracking": "Choose a customer code",
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
    "history.subtitle": "Latest shipment snapshots stored in the database",
    "history.agentTitle": "My shipments",
    "history.agentSubtitle": "Authorized shipments across linked customers; filter by customer code to update tracking",
    "history.accountTitle": "My shipments",
    "history.accountSubtitle": "Shipments bound to the current account",
    "history.loadingTitle": "Retrieving shipment list",
    "history.loadingDescription": "Loading the latest records from the database…",
    "history.emptyTitle": "No shipment history yet",
    "history.emptyDescription": "Your successful searches will appear here.",
    "history.accountEmptyTitle": "No shipments are bound to this account yet",
    "history.accountEmptyDescription": "Assigned shipments will appear here.",
    "history.searchPlaceholder": "Search shipment, job, port or status",
    "history.searchLabel": "Search shipments",
    "history.searchClear": "Clear shipment search",
    "history.previousPage": "Previous",
    "history.nextPage": "Next",
    "history.pageSize": "Per page",
    "history.pageInfo": "Page {page} of {pages} · {total} shipments",
    "history.searchEmptyTitle": "No matching shipments",
    "history.searchEmptyDescription": "Try another shipment number, job number, client, port or status.",
    "history.customerFilter": "Customer filter",
    "history.customerFilterLabel": "Filter shipments by customer",
    "history.currentCustomer": "Current customer",
    "history.etaSort": "ETA order",
    "history.etaSortLabel": "Sort shipments by ETA",
    "history.etaAscending": "ETA ascending",
    "history.etaDescending": "ETA descending",
    "agent.followingOnly": "Following only",
    "agent.showAll": "Show all",
    "agent.follow": "Follow",
    "agent.unfollow": "Following",
    "agent.update": "Update now",
    "agent.updating": "Updating…",
    "agent.updateFailed": "Shipment update failed: {message}",
    "agent.selectCustomerToUpdate": "Select a customer code before updating this shipment.",
    "agent.followFailed": "Follow-up selection could not be saved: {message}",
    "agent.lastAgentUpdate": "Agent update {time}",
    "agent.emptyTitle": "No shipments have been assigned",
    "agent.emptyDescription": "Authorized shipments for the current service customer will appear here.",
    "agent.columnIndex": "No.",
    "agent.columnReference": "Shipment No.",
    "agent.columnBusinessReference": "Business No.",
    "agent.columnCarrier": "Carrier",
    "agent.columnClient": "Client No./Name",
    "agent.columnBoundUsers": "Bound users",
    "agent.columnCustomers": "Service customer",
    "agent.columnStatus": "Status",
    "agent.columnNote": "Note",
    "agent.columnUpdated": "Last updated",
    "agent.columnActions": "Actions",
    "agent.view": "View",
    "agent.noCustomer": "Service customer unavailable",
    "agent.managementKicker": "SHIPMENT MANAGEMENT",
    "agent.managementTitle": "Confirmed tracked shipments",
    "agent.managementDescription": "Select a customer code, review assigned shipments, and update one or many tracking records.",
    "agent.managementEmptyTitle": "No assigned shipments",
    "agent.managementEmptyDescription": "Authorized customer shipments will appear here.",
    "agent.columnSelectIndex": "Select / No.",
    "agent.selectAllPage": "Select current page",
    "agent.selectedCount": "{count} selected",
    "agent.bulkUpdate": "Update selected ({count})",
    "agent.bulkUpdating": "Updating {current}/{total}",
    "agent.bulkUpdateComplete": "{success} shipments updated",
    "agent.bulkUpdatePartial": "{success} updated, {failed} failed",
    "agent.refreshList": "Refresh",
    "history.allCustomers": "All customers",
    "history.carrier": "Carrier",
    "history.reference": "Shipment No.",
    "history.route": "Route",
    "history.latestStatus": "Latest status",
    "history.queriedAt": "Queried at",
    "history.open": "Open details",
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
    "tracking.kicker": "SHIPMENT INTELLIGENCE",
    "tracking.title": "Shipment tracking",
    "tracking.description": "Query carrier sources and shape them into one consistent snapshot.",
    "account.menu": "Open account menu",
    "account.home": "Platform home",
    "account.workbench": "Workbench",
    "account.signIn": "Sign in",
    "account.signOut": "Sign out",
    "account.customer": "Customer access",
    "account.roleAdmin": "Administrator",
    "account.roleBusiness": "Business operator",
    "account.roleUser": "Internal user",
    "welcome.greeting": "Welcome",
    "welcome.subtitle": ", welcome to the tracking platform.",
    "files.trigger": "Shipment files",
    "files.unavailable": "Shipment files will be available after this shipment is saved by the platform.",
    "files.kicker": "SHIPMENT DOCUMENTS",
    "files.title": "Shipment files",
    "files.close": "Close shipment files",
    "files.loginTitle": "Sign in to manage shipment files",
    "files.loginDescription": "Shipment documents are available to authenticated enterprise users.",
    "files.loginAction": "Sign in to the platform",
    "files.customerSession": "Customer access",
    "files.customerLogout": "Sign out",
    "files.customerLoginAction": "Sign in with user code",
    "files.customerSignedOut": "Customer session ended. Public shipment tracking remains available.",
    "files.customerLoginExpired": "Your customer session has expired. Sign in again with your user code to access assigned files.",
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
    "files.visibilityShipper": "Shipper",
    "files.visibilityConsignee": "Consignee",
    "files.visibilityOverseaAgent": "Overseas agent",
    "files.visibilityAllRoles": "All shipment roles",
    "files.visibilityRequired": "Select at least one role.",
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
    "files.preview": "Preview",
    "files.previewing": "Loading…",
    "files.previewTitle": "File preview",
    "files.previewFailed": "Preview failed: {message}",
    "files.previewNotSupported": "Preview is not supported for this file type. Please download the file to view it.",
    "files.previewDownloadTip": "If the preview is incomplete, please download the file to view the original content.",
    "files.previewTextFallback": "Showing extracted text content for {name}.",
    "files.previewTooLarge": "This file is too large for an in-browser text preview. Download it to view the original.",
    "files.commentsTitle": "File messages",
    "files.commentsDescription": "Messages shared with people who can access this shipment.",
    "files.commentsLoading": "Loading messages…",
    "files.commentsEmpty": "No messages yet.",
    "files.commentLabel": "Add a message",
    "files.commentPlaceholder": "Leave a note about the shipment documents",
    "files.commentSend": "Send",
    "files.commentSending": "Sending…",
    "files.commentSent": "Message sent.",
    "files.commentFailed": "Message could not be sent: {message}",
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
    "query.enterNumber": "Enter a shipment number first.",
    "query.submit": "Track shipment",
    "query.loading": "Tracking…",
    "wait.history": "Retrieving the shipment record from the database…",
    "wait.tracking": "Retrieving the latest shipment data…",
    "wait.channels": "Checking carrier channels…",
    "wait.home": "Returning to the DrewesLogistics home page…",
    "wait.batch": "Processing the imported shipment queue…",
    "wait.complete": "Request completed",
    "batch.title": "Batch tracking import",
    "batch.subtitle": "Import an Excel or CSV list and process it as a background task",
    "batch.localBadge": "Background task",
    "batch.selectFile": "Select Excel / CSV",
    "batch.columns": "Recognizes M/B/L No. and Booking columns. Job Number, Vessel/Voy, POL, POD, PO No., ETD, ETA, Volume and Client Code are imported as supplementary information.",
    "batch.localNotice": "After it starts, the task continues in the background. Use Terminate task below to stop pending queries.",
    "batch.resume": "Continue pending queries",
    "batch.stop": "Terminate task",
    "batch.stopping": "Stopping the current batch query…",
    "batch.stopped": "Batch task stopped. Pending items can be resumed.",
    "batch.clear": "Clear imported queue",
    "batch.emptyTitle": "No imported queue",
    "batch.emptyDescription": "Choose a spreadsheet to begin batch tracking.",
    "batch.workspaceOpen": "Batch tracking",
    "batch.workspaceClose": "Close batch tracking",
    "batch.file": "Imported file",
    "batch.success": "Succeeded",
    "batch.core": "Core saved",
    "batch.failed": "Failed",
    "batch.manual": "Manual entry",
    "batch.pending": "Pending",
    "batch.parsing": "Reading {name}…",
    "batch.unsupportedFile": "Choose an .xlsx, .xls, or .csv file no larger than 2 MB.",
    "batch.noRecognizedColumns": "No supported column was found. Use Booking / Booking Ref / Booking No. or Bill of Lading / B/L / MBL / M/B/L No.",
    "batch.noRows": "No valid shipment numbers were found in the recognized columns.",
    "batch.workerUnsupported": "This browser cannot process spreadsheets in a background worker.",
    "batch.workerFailed": "The background spreadsheet parser stopped unexpectedly.",
    "batch.parseTimeout": "Spreadsheet parsing took too long. Try a smaller file.",
    "batch.previewTitle": "Confirm the tracking column",
    "batch.previewDescription": "Review the spreadsheet and choose the one column that contains the shipment numbers.",
    "batch.previewSheet": "Worksheet",
    "batch.previewColumn": "Track column",
    "batch.previewType": "Number type",
    "batch.previewRecommended": "Recommended",
    "batch.previewRows": "The first rows are shown only for confirmation; your selected column is the final source.",
    "batch.previewConfirm": "Use this column and start",
    "batch.previewRequired": "Choose a worksheet and tracking column before starting.",
    "batch.limit": "Found {found} unique rows. The first {limit} were imported to keep this browser responsive.",
    "batch.ready": "{count} unique shipment numbers imported.",
    "batch.running": "Querying {current} of {total}: {number}",
    "batch.completed": "Batch complete: {success} tracked, {manual} saved for manual entry and {failed} failed.",
    "batch.restored": "The locally saved queue is ready to continue.",
    "batch.importFailed": "The spreadsheet could not be read: {message}",
    "batch.backgroundFailed": "The background task could not be refreshed: {message}",
    "batch.requiresBusiness": "Sign in as a business operator or administrator to start a batch task.",
    "batch.itemPending": "Pending",
    "batch.itemRunning": "Querying",
    "batch.itemSuccess": "Succeeded",
    "batch.itemDatabase": "Reused database snapshot",
    "batch.itemCached": "Reused device cache",
    "batch.itemFailed": "Failed",
    "batch.itemCoreSaved": "Core saved · waiting for container pass",
    "batch.itemPartial": "Core saved · container details partial",
    "batch.itemManual": "Saved · manual entry required",
    "batch.childProgress": "{done}/{total} container tasks",
    "batch.childContainerList": "Discover container numbers",
    "batch.childContainer": "Container {number}",
    "batch.childSkipped": "Already complete",
    "batch.childRetry": "Waiting to retry",
    "batch.childAttempts": "{count} attempts",
    "batch.childRetryAt": "Retry at {time}",
    "batch.childError": "Reason: {message}",
    "batch.listAria": "Imported shipment queue",
    "batch.openItem": "Open saved details for {type} {number}",
    "batch.detailUnavailable": "This task does not have a saved shipment result yet.",
    "batch.confirmClear": "Clear the imported queue and its status from this device? Saved shipment snapshots are kept.",
    "query.helper": "Automatic mode calls the network interface first and uses the Playwright browser only as a fallback.",
    "query.cmaHelper": "CMA queries use the Playwright browser with the encrypted server-side DataDome session.",
    "cmaSession.kicker": "CMA ACCESS SESSION",
    "cmaSession.title": "DataDome session",
    "cmaSession.description": "Business users and administrators can save the CMA browser session here. It is encrypted by the backend and never returned; a successful query is still required to verify it.",
    "cmaSession.permission": "Only signed-in business users or administrators can maintain this session.",
    "cmaSession.cookie": "DataDome value or Cookie header",
    "cmaSession.cookieHelp": "Paste only the datadome value, or the complete CMA request Cookie header. The saved value is never shown again.",
    "cmaSession.userAgent": "Browser User-Agent",
    "cmaSession.userAgentHelp": "Filled from this browser because DataDome may bind the session to it.",
    "cmaSession.save": "Save encrypted session",
    "cmaSession.clear": "Clear session",
    "cmaSession.checking": "Checking…",
    "cmaSession.configured": "Saved · verify with a query · {time}",
    "cmaSession.notConfigured": "Not configured",
    "cmaSession.saved": "The CMA session was encrypted and saved. Run a CMA query to verify that the server can use it.",
    "cmaSession.cleared": "The CMA session was cleared.",
    "cmaSession.required": "Enter a DataDome value or CMA Cookie header.",
    "cmaSession.loadFailed": "Could not read the CMA session status: {message}",
    "cmaSession.saveFailed": "Could not save the CMA session: {message}",
    "cmaSession.clearConfirm": "Clear the saved CMA DataDome session?",
    "channel.auto": "Automatic · API first, DOM fallback",
    "channel.network": "Channel 1 · Network interface",
    "channel.playwright": "Channel 2 · Playwright browser",
    "channel.proxy": "Proxy · Alternate outbound IP",
    "source.auto": "COSCO · API FIRST · DOM FALLBACK",
    "source.network": "COSCO · CHANNEL 1 · NETWORK",
    "source.playwright": "COSCO · CHANNEL 2 · PLAYWRIGHT",
    "source.proxy": "COSCO · SOCKS5 PROXY",
    "type.bill": "Bill of lading",
    "type.booking": "Booking number",
    "type.container": "Container number",
    "error.title": "Tracking request failed",
    "error.generic": "Tracking failed. Please try again.",
    "error.customerFriendly": "Tracking failed. Please try again later or contact customer service.",
    "error.http": "Tracking failed (HTTP {status})",
    "notice.cacheTitle": "Live refresh unavailable",
    "empty.title": "Ready when you are",
    "empty.description": "Enter a bill, booking or container number to begin.",
    "metrics.actualDeparture": "Actual departure",
    "metrics.actualArrival": "Actual arrival",
    "metrics.estimatedDeparture": "Estimated departure",
    "metrics.estimatedArrival": "Estimated final arrival",
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
    "references.title": "Booking information & references",
    "references.masterBill": "Master bill",
    "references.booking": "Booking number",
    "references.external": "Other carrier references",
    "business.kicker": "BUSINESS REFERENCES",
    "business.edit": "Edit business references",
    "business.dialogTitle": "Edit shipment identifiers",
    "business.clientCode": "Client name code",
    "business.clientPo": "Client PO number",
    "business.forwarderJob": "Forwarder job number",
    "extraInformation.title": "Extra information from spreadsheet",
    "extraInformation.carrierPrefix": "Carrier prefix",
    "extraInformation.originalBillOfLading": "Original bill of lading",
    "extraInformation.forwarderJobNumber": "Job number",
    "extraInformation.vesselVoyage": "Vessel / voyage",
    "extraInformation.portOfLoading": "Port of loading (POL)",
    "extraInformation.portOfDischarge": "Port of discharge (POD)",
    "extraInformation.clientPoNumber": "PO number",
    "extraInformation.estimatedDeparture": "ETD",
    "extraInformation.estimatedArrival": "ETA",
    "extraInformation.volume": "Volume",
    "extraInformation.clientNameCode": "Client code",
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
    "containers.title": "Transport details",
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
    "supplemental.loading": "Loading transport details and booking references. This may take about 20 seconds…",
    "supplemental.complete": "Transport details and booking references are up to date.",
    "supplemental.partial": "Available transport details were loaded; some carrier fields are temporarily unavailable.",
    "supplemental.failed": "Transport details could not be loaded. Reopen the shipment to retry.",
    "documents.kicker": "SHIPMENT FILES",
    "documents.title": "Document details",
    "documents.open": "Documents",
    "documents.intro": "One primary file is retained for each topic. Add, edit or delete the file and its visibility metadata here.",
    "documents.uploadedTitle": "Uploaded shipment files",
    "documents.uploadedCount": "{count} files uploaded",
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
    "documents.visibility.internal": "Internal staff only",
    "documents.visibility.SHIPPER": "Shipper",
    "documents.visibility.CONSIGNEE": "Consignee",
    "documents.visibility.OVERSEA_AGENT": "Overseas agent",
    "raw.title": "Decoded source payload",
    "raw.cacheNotice": "The database stores the unified snapshot only, not the carrier's raw payload.",
    "common.notProvided": "Not provided",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "cache.live": "Live result",
    "cache.server": "Server cache",
    "cache.database": "Database snapshot",
    "cache.savedAt": "Updated {time}",
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
    "nav.home": "返回主页",
    "nav.back": "返回上一页",
    "nav.confirmReturn": "确定退出货物跟踪并返回吗？",
    "nav.overview": "总览",
    "nav.agentShipments": "票单管理",
    "nav.agentShipmentDetail": "票单详情",
    "nav.tracking": "货物跟踪",
    "nav.profile": "个人信息",
    "profile.kicker": "客户资料",
    "profile.title": "个人信息",
    "profile.description": "查看业务员为您分配的客户身份与货物访问范围。",
    "profile.account": "客户账号",
    "profile.active": "正常",
    "profile.username": "登录账号",
    "profile.code": "客户 CODE",
    "profile.verified": "已验证",
    "profile.role": "货运身份",
    "profile.help": "如需修改账号信息或重置登录凭证，请联系您的业务员。",
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
    "overview.agentKicker": "海外代理业务台",
    "overview.agentTitle": "客户票单动态，一页尽览。",
    "overview.agentDescription": "统一查看名下全部授权票单；需要更新时，先按客户码筛选，再更新该客户的运输进度。",
    "overview.agentStartTracking": "选择客户码",
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
    "history.subtitle": "数据库保存的最新货运快照",
    "history.agentTitle": "我的票单",
    "history.agentSubtitle": "汇总关联客户的授权票单；按客户码筛选后可更新对应客户业务",
    "history.accountTitle": "我的票单",
    "history.accountSubtitle": "绑定到当前账户的票单",
    "history.loadingTitle": "正在获取票单列表",
    "history.loadingDescription": "正在从数据库读取最新票单，请稍候…",
    "history.emptyTitle": "还没有查询记录",
    "history.emptyDescription": "成功查询的货物会显示在这里。",
    "history.accountEmptyTitle": "当前账户还没有绑定票单",
    "history.accountEmptyDescription": "绑定到当前账户的票单会显示在这里。",
    "history.previousPage": "上一页",
    "history.nextPage": "下一页",
    "history.pageSize": "每页",
    "history.pageInfo": "第 {page} / {pages} 页 · 共 {total} 张票单",
    "history.searchPlaceholder": "搜索单号、Job、港口或状态",
    "history.searchLabel": "搜索票单",
    "history.searchClear": "清除票单搜索",
    "history.searchEmptyTitle": "没有匹配的票单",
    "history.searchEmptyDescription": "请尝试其他运输单号、Job Number、客户、港口或状态。",
    "history.customerFilter": "客户筛选",
    "history.customerFilterLabel": "按客户筛选票单",
    "history.currentCustomer": "当前客户",
    "history.etaSort": "ETA 排序",
    "history.etaSortLabel": "按预计到达时间排序票单",
    "history.etaAscending": "ETA 正序",
    "history.etaDescending": "ETA 倒序",
    "history.allCustomers": "全部客户",
    "agent.followingOnly": "只看跟进",
    "agent.showAll": "查看全部",
    "agent.follow": "加入跟进",
    "agent.unfollow": "已跟进",
    "agent.update": "立即更新",
    "agent.updating": "更新中…",
    "agent.updateFailed": "票单更新失败：{message}",
    "agent.selectCustomerToUpdate": "请先选择客户码，再更新该客户名下的票单。",
    "agent.followFailed": "无法保存跟进选择：{message}",
    "agent.lastAgentUpdate": "代理更新于 {time}",
    "agent.emptyTitle": "业务员尚未分配票单",
    "agent.emptyDescription": "当前服务客户下授权给该海外代理的票单会显示在这里。",
    "agent.columnIndex": "序号",
    "agent.columnReference": "票单号",
    "agent.columnBusinessReference": "业务单号",
    "agent.columnCarrier": "船司",
    "agent.columnClient": "Client No./Name",
    "agent.columnBoundUsers": "已绑定用户",
    "agent.columnCustomers": "服务客户",
    "agent.columnStatus": "追踪状态",
    "agent.columnNote": "备注",
    "agent.columnUpdated": "最近更新",
    "agent.columnActions": "操作",
    "agent.view": "查看",
    "agent.noCustomer": "服务客户信息不可用",
    "agent.managementKicker": "票单管理",
    "agent.managementTitle": "已确认的追踪票单",
    "agent.managementDescription": "先选择客户码，再查看、勾选并批量更新该客户名下的授权票单。",
    "agent.managementEmptyTitle": "暂无已分配票单",
    "agent.managementEmptyDescription": "关联客户授权给你的票单会显示在这里。",
    "agent.columnSelectIndex": "选择 / 序号",
    "agent.selectAllPage": "全选当前页",
    "agent.selectedCount": "已选择 {count} 票",
    "agent.bulkUpdate": "批量更新（{count}）",
    "agent.bulkUpdating": "正在更新 {current}/{total}",
    "agent.bulkUpdateComplete": "已成功更新 {success} 票",
    "agent.bulkUpdatePartial": "成功 {success} 票，失败 {failed} 票",
    "agent.refreshList": "刷新",
    "history.carrier": "船司",
    "history.reference": "运输单号",
    "history.route": "路线",
    "history.latestStatus": "最新状态",
    "history.queriedAt": "查询时间",
    "history.open": "打开详情",
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
    "tracking.kicker": "货运信息",
    "tracking.title": "货物跟踪",
    "tracking.description": "查询船司数据源，并转换为统一的运输状态快照。",
    "account.menu": "打开账户菜单",
    "account.home": "返回平台首页",
    "account.workbench": "返回工作台",
    "account.signIn": "登录",
    "account.signOut": "退出登录",
    "account.customer": "客户身份",
    "account.roleAdmin": "系统管理员",
    "account.roleBusiness": "业务员",
    "account.roleUser": "内部用户",
    "welcome.greeting": "欢迎",
    "welcome.subtitle": "，欢迎使用追踪平台。",
    "files.trigger": "票单文件",
    "files.unavailable": "平台保存这票货物后即可管理票单文件。",
    "files.kicker": "货物文档",
    "files.title": "票单文件",
    "files.close": "关闭票单文件",
    "files.loginTitle": "登录后管理货物文件",
    "files.loginDescription": "货物明细、账单和寄运文件仅向已登录企业用户开放。",
    "files.loginAction": "登录平台",
    "files.customerSession": "客户身份",
    "files.customerLogout": "退出客户登录",
    "files.customerLoginAction": "使用用户码重新登录",
    "files.customerSignedOut": "已退出客户登录，仍可继续使用公开货物追踪。",
    "files.customerLoginExpired": "客户登录已过期，请重新使用用户码登录后查看已关联文件。",
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
    "files.visibilityShipper": "发货人可见",
    "files.visibilityConsignee": "收货人可见",
    "files.visibilityOverseaAgent": "海外代理可见",
    "files.visibilityAllRoles": "全部业务角色",
    "files.visibilityRequired": "请至少选择一个可见角色。",
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
    "files.preview": "预览",
    "files.previewing": "加载中…",
    "files.previewTitle": "文件预览",
    "files.previewFailed": "预览失败：{message}",
    "files.previewNotSupported": "此文件类型不支持预览，请下载后查看。",
    "files.previewDownloadTip": "如预览不完整，请下载文件查看原始内容。",
    "files.previewTextFallback": "正在以文本方式展示 {name} 的内容。",
    "files.previewTooLarge": "文件过大，无法在浏览器中以文本预览，请下载原文件查看。",
    "files.commentsTitle": "文件留言",
    "files.commentsDescription": "留言将对有权查看本票单文件的人员显示。",
    "files.commentsLoading": "正在获取留言…",
    "files.commentsEmpty": "还没有留言。",
    "files.commentLabel": "添加留言",
    "files.commentPlaceholder": "填写与票单文件有关的说明",
    "files.commentSend": "发送",
    "files.commentSending": "正在发送…",
    "files.commentSent": "留言已发送。",
    "files.commentFailed": "留言发送失败：{message}",
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
    "query.enterNumber": "请先输入运输单号。",
    "query.submit": "查询运输信息",
    "query.loading": "查询中…",
    "wait.history": "正在从数据库获取票单记录…",
    "wait.tracking": "正在获取最新货物信息…",
    "wait.channels": "正在检测船司查询通道…",
    "wait.home": "正在返回 DrewesLogistics 首页…",
    "wait.batch": "正在逐条处理导入的货物队列…",
    "wait.complete": "请求已完成",
    "batch.title": "批量导入查询",
    "batch.subtitle": "导入 Excel 或 CSV 清单后，以后台任务逐票处理",
    "batch.localBadge": "后台任务",
    "batch.selectFile": "选择 Excel / CSV",
    "batch.columns": "支持 M/B/L NO.、提单号和订舱号列；同时导入 Job Number、Vessel/Voy、POL、POD、PO No.、ETD、ETA、Volume 和 Client Code。",
    "batch.localNotice": "任务开始后在后台运行；如需停止后续查询，请点击下方“终止任务”。",
    "batch.resume": "继续查询待处理项目",
    "batch.stop": "终止任务",
    "batch.stopping": "正在停止当前批量查询…",
    "batch.stopped": "批量任务已停止，待处理项目可以继续查询。",
    "batch.clear": "清除导入队列",
    "batch.emptyTitle": "尚未导入查询队列",
    "batch.emptyDescription": "请选择表格文件开始批量货物查询。",
    "batch.workspaceOpen": "批量追踪",
    "batch.workspaceClose": "关闭批量追踪",
    "batch.file": "导入文件",
    "batch.success": "成功",
    "batch.core": "主票已完成",
    "batch.failed": "失败",
    "batch.manual": "待手工补录",
    "batch.pending": "待处理",
    "batch.parsing": "正在读取 {name}…",
    "batch.unsupportedFile": "请选择不超过 2 MB 的 .xlsx、.xls 或 .csv 文件。",
    "batch.noRecognizedColumns": "没有找到支持的列，请使用 Booking / Booking Ref / 订舱号或 Bill of Lading / B/L / MBL / M/B/L NO. / 提单号。",
    "batch.noRows": "识别到的列中没有有效运输单号。",
    "batch.workerUnsupported": "当前浏览器无法在后台线程中处理表格。",
    "batch.workerFailed": "后台表格解析器意外停止。",
    "batch.parseTimeout": "表格解析时间过长，请尝试更小的文件。",
    "batch.previewTitle": "确认批量追踪列",
    "batch.previewDescription": "请预览表格并人工选择唯一的追踪单号列，系统建议仅作为默认值。",
    "batch.previewSheet": "工作表",
    "batch.previewColumn": "追踪单号列",
    "batch.previewType": "单号类型",
    "batch.previewRecommended": "建议",
    "batch.previewRows": "这里只展示前几行供确认；您选择的列将作为最终解析来源。",
    "batch.previewConfirm": "使用此列并启动任务",
    "batch.previewRequired": "请先选择工作表和追踪单号列。",
    "batch.limit": "共识别 {found} 条唯一记录。为保持页面流畅，本次导入前 {limit} 条。",
    "batch.ready": "已导入 {count} 条唯一运输单号。",
    "batch.running": "正在查询第 {current}/{total} 条：{number}",
    "batch.completed": "批量任务完成：查询成功 {success} 条，已收录待手工补录 {manual} 条，失败 {failed} 条。",
    "batch.restored": "本设备保存的队列已恢复，可以继续处理。",
    "batch.importFailed": "无法读取表格：{message}",
    "batch.backgroundFailed": "无法刷新后台任务状态：{message}",
    "batch.requiresBusiness": "请使用业务员或管理员账号登录后再启动批量任务。",
    "batch.itemPending": "待处理",
    "batch.itemRunning": "查询中",
    "batch.itemSuccess": "成功",
    "batch.itemDatabase": "已复用数据库快照",
    "batch.itemCached": "复用本设备缓存",
    "batch.itemFailed": "失败",
    "batch.itemCoreSaved": "主票已保存 · 等待箱级补全",
    "batch.itemPartial": "主票已保存 · 箱级信息部分完成",
    "batch.itemManual": "已收录 · 待手工补录",
    "batch.childProgress": "箱级任务 {done}/{total}",
    "batch.childContainerList": "获取箱号清单",
    "batch.childContainer": "箱号 {number}",
    "batch.childSkipped": "已有信息，无需补查",
    "batch.childRetry": "等待重试",
    "batch.childAttempts": "已尝试 {count} 次",
    "batch.childRetryAt": "预计重试：{time}",
    "batch.childError": "原因：{message}",
    "batch.listAria": "已导入的货物查询队列",
    "batch.openItem": "查看{type} {number}的已保存详情",
    "batch.detailUnavailable": "该任务暂时没有可查看的已保存结果。",
    "batch.confirmClear": "确定清除此设备上的导入队列和处理状态吗？已保存的货物快照会保留。",
    "query.helper": "自动模式优先调用网络接口，失败后才启用 Playwright 浏览器托底。",
    "query.cmaHelper": "CMA 查询固定使用 Playwright 浏览器和服务端加密保存的 DataDome 会话。",
    "cmaSession.kicker": "CMA 访问会话",
    "cmaSession.title": "DataDome 会话",
    "cmaSession.description": "业务员和管理员可在这里维护 CMA 浏览器会话。该值由后端加密保存且不会回传；仍需成功查询一次才能确认可用。",
    "cmaSession.permission": "只有已登录的业务员或管理员可以维护此会话。",
    "cmaSession.cookie": "DataDome 值或 Cookie 请求头",
    "cmaSession.cookieHelp": "可只粘贴 datadome 的值，也可粘贴 CMA 请求的完整 Cookie 头；保存后不会再次显示。",
    "cmaSession.userAgent": "浏览器 User-Agent",
    "cmaSession.userAgentHelp": "自动取当前浏览器值，因为 DataDome 可能会绑定浏览器指纹。",
    "cmaSession.save": "加密保存会话",
    "cmaSession.clear": "清除会话",
    "cmaSession.checking": "检查中…",
    "cmaSession.configured": "已保存 · 需查询验证 · {time}",
    "cmaSession.notConfigured": "尚未配置",
    "cmaSession.saved": "CMA 会话已加密保存；请立即查询一票，验证服务器能否使用。",
    "cmaSession.cleared": "CMA 会话已清除。",
    "cmaSession.required": "请输入 DataDome 值或 CMA Cookie 请求头。",
    "cmaSession.loadFailed": "无法读取 CMA 会话状态：{message}",
    "cmaSession.saveFailed": "无法保存 CMA 会话：{message}",
    "cmaSession.clearConfirm": "确定清除已保存的 CMA DataDome 会话吗？",
    "channel.auto": "自动 · 接口优先，DOM 托底",
    "channel.network": "通道一 · 网络接口",
    "channel.playwright": "通道二 · Playwright 浏览器",
    "channel.proxy": "代理通道 · 更换出口 IP",
    "source.auto": "COSCO · 接口优先 · DOM 托底",
    "source.network": "COSCO · 通道一 · 网络接口",
    "source.playwright": "COSCO · 通道二 · PLAYWRIGHT",
    "source.proxy": "COSCO · SOCKS5 代理通道",
    "type.bill": "提单号",
    "type.booking": "订舱号",
    "type.container": "箱号",
    "error.title": "查询失败",
    "error.generic": "查询失败，请稍后重试。",
    "error.customerFriendly": "查询失败，请稍后重试或联系客服。",
    "error.http": "查询失败（HTTP {status}）",
    "notice.cacheTitle": "实时刷新暂不可用",
    "empty.title": "等待查询",
    "empty.description": "输入提单号、订舱号或箱号即可开始。",
    "metrics.actualDeparture": "实际离港",
    "metrics.actualArrival": "实际到港",
    "metrics.estimatedDeparture": "预计离港",
    "metrics.estimatedArrival": "预计最终到港",
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
    "references.title": "订舱信息及参考号",
    "references.masterBill": "主提单号",
    "references.booking": "订舱号",
    "references.external": "其他船司参考号",
    "business.kicker": "业务参考号",
    "business.edit": "编辑业务参考号",
    "business.dialogTitle": "编辑票单识别信息",
    "business.clientCode": "客户名称代码",
    "business.clientPo": "客户订单号",
    "business.forwarderJob": "货代订单号",
    "extraInformation.title": "表格补充信息",
    "extraInformation.carrierPrefix": "船司前缀",
    "extraInformation.originalBillOfLading": "原始提单号",
    "extraInformation.forwarderJobNumber": "Job Number",
    "extraInformation.vesselVoyage": "船名 / 航次",
    "extraInformation.portOfLoading": "起运港（POL）",
    "extraInformation.portOfDischarge": "目的港（POD）",
    "extraInformation.clientPoNumber": "PO Number",
    "extraInformation.estimatedDeparture": "预计离港（ETD）",
    "extraInformation.estimatedArrival": "预计到港（ETA）",
    "extraInformation.volume": "箱量（Volume）",
    "extraInformation.clientNameCode": "客户代码",
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
    "containers.title": "运输详情",
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
    "supplemental.loading": "正在补查运输详情与订舱参考号，预计约需 20 秒…",
    "supplemental.complete": "运输详情与订舱参考号已更新。",
    "supplemental.partial": "已载入可用运输详情，部分船司字段暂不可用。",
    "supplemental.failed": "运输详情暂时无法载入，重新打开该票可重试。",
    "documents.kicker": "票单文件",
    "documents.title": "文件详情",
    "documents.open": "文件详情",
    "documents.intro": "每个主题保留一份主文件，可在这里新增、编辑或删除文件及可见权限信息。",
    "documents.uploadedTitle": "已上传的票单文件",
    "documents.uploadedCount": "已上传 {count} 份文件",
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
    "documents.visibility.all": "全部票单参与方可见",
    "documents.visibility.SHIPPER": "发货人可见",
    "documents.visibility.CONSIGNEE": "收货人可见",
    "documents.visibility.OVERSEA_AGENT": "海外代理可见",
    "documents.visibility.internal": "仅内部员工可见",
    "raw.title": "原始解码结果",
    "raw.cacheNotice": "数据库仅保存统一快照，不保存船司原始报文。",
    "common.notProvided": "上游未提供",
    "common.cancel": "取消",
    "common.save": "保存",
    "cache.live": "实时查询",
    "cache.server": "服务端缓存",
    "cache.database": "数据库快照",
    "cache.savedAt": "更新于 {time}",
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

Object.assign(MESSAGES.en, {
  "diagnostic.RATE_LIMITED": "Carrier rate limit / risk control",
  "diagnostic.UPSTREAM_EMPTY": "Carrier returned no operational data",
  "diagnostic.INVALID_REFERENCE": "Invalid number or reference type",
  "diagnostic.ADAPTER_FAILURE": "Carrier adapter failure"
});
Object.assign(MESSAGES.zh, {
  "diagnostic.RATE_LIMITED": "船司限流 / 风控拦截",
  "diagnostic.UPSTREAM_EMPTY": "船司返回空数据或暂无有效运输节点",
  "diagnostic.INVALID_REFERENCE": "单号格式或号型错误",
  "diagnostic.ADAPTER_FAILURE": "船司适配器调用失败"
});

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
    "summary-booking-reference",
    "summary-services",
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
    "departure-metric-card",
    "departure-metric-label",
    "actual-arrival",
    "actual-arrival-location",
    "arrival-metric-card",
    "arrival-metric-label",
    "estimated-delivery",
    "estimated-delivery-location",
    "delivery-metric-card",
    "latest-event",
    "latest-event-detail",
    "latest-metric-card",
    "metric-grid",
    "origin-flag",
    "origin-name",
    "origin-code",
    "destination-flag",
    "destination-name",
    "destination-code",
    "route-count",
    "route-flow",
    "route-panel",
    "route-summary-line",
    "route-summary-marker",
    "master-bill",
    "master-bill-reference",
    "booking-numbers",
    "booking-number-reference",
    "external-references",
    "external-reference",
    "reference-core",
    "client-name-code",
    "client-name-code-reference",
    "client-po-number",
    "client-po-number-reference",
    "forwarder-job-number",
    "forwarder-job-number-reference",
    "business-reference-grid",
    "reference-information",
    "routing-count",
    "routing-table-body",
    "routing-panel",
    "container-count",
    "container-table-body",
    "container-panel",
    "secondary-grid",
    "supplemental-details-status",
    "supplemental-details-message",
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
let batchAbortController = null;
let batchTaskId = null;
let batchStopRequested = false;
let batchRunPromise = null;
let batchImportNotice = null;
let pendingBatchFile = null;
let batchPreviewSheets = [];
let lastBatchRequestAt = 0;
let historySearchTerm = "";
let historyCustomerFilter = "";
let historyEtaSort = "asc";
let historyFollowingOnly = false;
let historyLoadingState = false;
let historyPage = 1;
let historyPageSize = 20;
let historyTotal = 0;
let historyTotalPages = 0;
let historyScopeCustomer = null;
let historyAvailableCustomers = [];
let agentShipmentDetailOpen = false;
const agentManagementSelectedKeys = new Set();
let agentBulkUpdating = false;
let agentBulkUpdateProgress = { current: 0, total: 0 };
let agentBulkUpdateResult = null;
const supplementalDetailRequests = new Map();
let supplementalStatusTimer = null;
const expandedHistoryKeys = new Set();
let relatedFilesShipmentId = null;
let relatedFilesShipmentNumber = "";
let relatedFilesItems = [];
let relatedFileCommentItems = [];
let relatedFileCommentsLoadingState = false;
let relatedFileCommentsSending = false;
let relatedFileCommentsErrorText = "";
let relatedFileCommentsRequestSequence = 0;
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
let customerAssignedHistory = [];
let internalTrackedHistory = [];
let relatedFilesExpiredSessionKind = "";
let platformPrincipalAwaitingRefresh = false;
let customerPrincipalAwaitingRefresh = false;
let cmaSessionStatus = null;
let cmaSessionStatusLoaded = false;
let cmaSessionLoading = false;
let relatedFilesSessionFingerprint = fileSessionFingerprint();
const trackingPayloadSessionFingerprints = new WeakMap();

function resetHistoryPagination() {
  historyPage = 1;
  historyTotal = 0;
  historyTotalPages = 0;
  historyScopeCustomer = null;
}

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

function trackingDiagnosticMessage(payload, response) {
  const technical = trackingResponseMessage(payload, response)
    || t("error.http", { status: response?.status ?? "-" });
  if (!canManageFileVisibility(readFileSession())) return customerFacingTrackingError();
  const code = String(payload?.code || "").trim();
  const known = ["RATE_LIMITED", "UPSTREAM_EMPTY", "INVALID_REFERENCE", "ADAPTER_FAILURE"];
  const normalized = known.includes(code)
    ? code
    : response?.status === 429 || response?.status === 403
      ? "RATE_LIMITED"
      : response?.status === 400
        ? "INVALID_REFERENCE"
        : response?.status >= 500
          ? "ADAPTER_FAILURE"
          : "UPSTREAM_EMPTY";
  return `${t(`diagnostic.${normalized}`)}: ${technical}`;
}

function customerFacingTrackingError() {
  return t("error.customerFriendly");
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

function isRestorableBatchNumber(value) {
  return /^(?=.{4,64}$)[A-Z0-9](?:[A-Z0-9./-]*[A-Z0-9])$/.test(
    String(value ?? "").trim().toUpperCase()
  );
}
/* TRACKING_CONTRACT_HELPERS_END */

function clearSensitiveRelatedFilesDom() {
  relatedFilesList.replaceChildren();
  relatedFileCommentsList.replaceChildren();
  relatedFileCommentsCount.textContent = "0";
  relatedFileComments.hidden = true;
  relatedFileCommentInput.value = "";
  relatedFileCommentMessage.hidden = true;
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
  relatedFileCommentsRequestSequence += 1;
  relatedFilesItems = [];
  relatedFileCommentItems = [];
  relatedFileCommentsLoadingState = false;
  relatedFileCommentsSending = false;
  relatedFileCommentsErrorText = "";
  relatedFilesPermissions = {};
  relatedFilesAssignableCustomers = [];
  relatedFilesSelectedTargetCustomerId = "";
  relatedFilesCustomerAccess = null;
  relatedFilesLoadingState = false;
  relatedFilesErrorText = "";
  relatedFilesUploading = false;
  relatedFilesExpiredSessionKind = expiredKind;
  relatedFilesUploadInput.value = "";
  setRelatedFilesCategory("EXPORT_CIV_PL");
  setRelatedFilesCategoryOpen(false);
  setTrackingAccountMenuOpen(false);
  relatedFilesUploadVisibility.value = "SHIPPER";
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

function shipmentFileCommentsPath(session, shipmentId) {
  const encodedShipmentId = encodeURIComponent(shipmentId);
  return session.kind === "CUSTOMER"
    ? `/api/customer/shipments/${encodedShipmentId}/file-comments`
    : `/api/shipments/${encodedShipmentId}/file-comments`;
}

function shipmentFilePath(session, fileId, suffix = "") {
  const encodedFileId = encodeURIComponent(fileId);
  const base = session.kind === "CUSTOMER"
    ? `/api/customer/shipment-files/${encodedFileId}`
    : `/api/shipment-files/${encodedFileId}`;
  return `${base}${suffix}`;
}

function fileSessionDisplayName(session = readFileSession()) {
  const principal = session?.principal ?? session?.user ?? session?.storedSession ?? {};
  const candidates = [
    principal.displayName,
    principal.customerName,
    principal.name,
    principal.username,
    principal.loginName,
    principal.account,
    principal.customerCode,
    principal.code,
    principal.codePrefix,
    session?.storedSession?.displayName,
    session?.storedSession?.customerName,
    session?.storedSession?.name,
    session?.storedSession?.username,
    session?.storedSession?.loginName,
    session?.storedSession?.account
  ];
  for (const candidate of candidates) {
    if (candidate && String(candidate).trim()) return String(candidate).trim();
  }
  return "";
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
  const portalReturnLink = document.querySelector("#portal-return-link");
  const portalReturnLabel = document.querySelector("#portal-return-label");
  const signInButton = document.querySelector("#sign-in-button");
  const workbenchLink = document.querySelector("#account-workbench-link");
  const welcomeMessage = document.querySelector("#welcome-message");
  const welcomeUsername = document.querySelector("#welcome-username");
  if (!portalReturnLink || !trackingAccount || !trackingAccountName || !trackingAccountRole || !trackingAccountMark) {
    return;
  }
  const internalRole = String(session.user?.role ?? "").trim().toUpperCase();
  const returnsToWorkbenches =
    session.kind === "INTERNAL" && ["ADMIN", "BUSINESS"].includes(internalRole);
  portalReturnLink.href = returnsToWorkbenches ? "/workbenches" : "/";
  portalReturnLink.setAttribute("aria-label", t("nav.back"));
  if (portalReturnLabel) portalReturnLabel.textContent = t("nav.back");

  const authenticated = Boolean(session.token);
  const isCustomer = session.kind === "CUSTOMER";
  document.body.classList.toggle("is-customer-session", isCustomer);
  document.body.classList.toggle("is-internal-session", session.kind === "INTERNAL");
  renderOverseaAgentWorkspace(session);
  trackingAccount.hidden = !authenticated;
  if (signInButton) {
    signInButton.hidden = authenticated;
  }
  if (workbenchLink) {
    workbenchLink.hidden = !returnsToWorkbenches;
  }
  if (welcomeMessage) {
    welcomeMessage.hidden = !authenticated;
  }
  if (!authenticated) {
    trackingAccountName.textContent = "";
    trackingAccountRole.textContent = "";
    trackingAccountMark.textContent = "U";
    if (welcomeUsername) {
      welcomeUsername.textContent = "";
    }
    setTrackingAccountMenuOpen(false);
    return;
  }
  const name = fileSessionDisplayName(session) || t("account.roleUser");
  trackingAccountName.textContent = name;
  trackingAccountRole.textContent = fileSessionRoleLabel(session);
  trackingAccountMark.textContent = Array.from(name.trim())[0]?.toUpperCase() || "U";
  if (welcomeUsername) {
    welcomeUsername.textContent = name;
  }

  if (isCustomer) {
    const principal = session.principal ?? {};
    const username = principal.username ?? principal.loginName ?? "—";
    const code = principal.customerCodePrefix ?? principal.codePrefix ?? principal.customerCode ?? t("profile.verified");
    const customerProfileName = document.querySelector("#customer-profile-name");
    if (customerProfileName) customerProfileName.textContent = name;
    const customerProfileUsername = document.querySelector("#customer-profile-username");
    if (customerProfileUsername) customerProfileUsername.textContent = username;
    const customerProfileCode = document.querySelector("#customer-profile-code");
    if (customerProfileCode) customerProfileCode.textContent = code;
    const customerProfileRole = document.querySelector("#customer-profile-role");
    if (customerProfileRole) customerProfileRole.textContent = fileSessionRoleLabel(session);
    const customerProfileAvatar = document.querySelector("#customer-profile-avatar");
    if (customerProfileAvatar) customerProfileAvatar.textContent = Array.from(name.trim())[0]?.toUpperCase() || "C";
  }
}

function customerLogisticsRoleLabel(session = readFileSession()) {
  if (session.kind !== "CUSTOMER") return "";
  return logisticsPartyRoleLabel(customerPartyRole(session));
}

function customerPartyRole(session = readFileSession()) {
  if (session.kind !== "CUSTOMER") return "";
  return String(
    session.principal?.partyRole ??
    session.principal?.logisticsRole ??
    session.storedSession?.customer?.partyRole ??
    session.storedSession?.customer?.logisticsRole ??
    session.storedSession?.partyRole ??
    session.storedSession?.logisticsRole ??
    ""
  ).trim().toUpperCase();
}

function isOverseaAgentSession(session = readFileSession()) {
  return session.kind === "CUSTOMER" && customerPartyRole(session) === "OVERSEA_AGENT";
}

function setLocalizedElement(id, key) {
  const element = document.querySelector(`#${id}`);
  if (!element) return;
  element.dataset.i18n = key;
  element.textContent = t(key);
}

function activeViewTranslationKey(view = activeView, session = readFileSession()) {
  if (isOverseaAgentSession(session)) {
    if (view === "overview") return "nav.overview";
    if (view === "shipments") return "nav.agentShipments";
    if (view === "tracking") return "nav.agentShipmentDetail";
  }
  return `nav.${view}`;
}

function renderOverseaAgentWorkspace(session = readFileSession()) {
  const managed = isOverseaAgentSession(session);
  document.body.classList.toggle("is-oversea-agent-session", managed);
  if (trackingNavItem) trackingNavItem.hidden = managed;
  if (agentShipmentsNavItem) agentShipmentsNavItem.hidden = !managed;
  setLocalizedElement(
      "overview-nav-label",
      "nav.overview"
  );
  setLocalizedElement(
      "overview-kicker",
      managed ? "overview.agentKicker" : "overview.kicker"
  );
  setLocalizedElement(
      "overview-title",
      managed ? "overview.agentTitle" : "overview.title"
  );
  setLocalizedElement(
      "overview-description",
      managed ? "overview.agentDescription" : "overview.description"
  );
  setLocalizedElement(
      "start-tracking-label",
      managed ? "overview.agentStartTracking" : "overview.startTracking"
  );
  if (!managed) {
    historyFollowingOnly = false;
    agentManagementSelectedKeys.clear();
    agentBulkUpdateResult = null;
  }
  if (historyFollowingFilter) historyFollowingFilter.hidden = !managed;
  activeViewTitle.textContent = t(activeViewTranslationKey(activeView, session));
}

function logisticsPartyRoleLabel(value) {
  const key = {
    AGENT: "files.logisticsRoleAgent",
    OVERSEA_AGENT: "files.logisticsRoleAgent",
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
    relatedFileCommentsRequestSequence += 1;
    relatedFilesItems = [];
    relatedFileCommentItems = [];
    relatedFileCommentsLoadingState = false;
    relatedFileCommentsSending = false;
    relatedFileCommentsErrorText = "";
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
  const documentType = documentDefinition(String(value ?? "").toUpperCase());
  if (documentType) return t(documentType.labelKey);
  const key = {
    CARGO_DETAIL: "files.categoryCargo",
    INVOICE: "files.categoryInvoice",
    SHIPPING: "files.categoryShipping",
    OTHER: "files.categoryOther"
  }[String(value ?? "").toUpperCase()];
  return t(key ?? "files.categoryOther");
}

const RELATED_FILE_CATEGORY_KEYS = Object.freeze({
  EXPORT_CIV_PL: "documents.type.exportCivPl",
  HOUSE_BILL: "documents.type.houseBill",
  MASTER_BILL: "documents.type.masterBill",
  ARRIVAL_NOTICE: "documents.type.arrivalNotice",
  DELIVERY_ORDER: "documents.type.deliveryOrder",
  POD: "documents.type.pod",
  DUTY_SUMMARY: "documents.type.dutySummary",
  IMPORT_CIV_PL: "documents.type.importCivPl"
});

function setRelatedFilesCategory(value) {
  const category = Object.hasOwn(RELATED_FILE_CATEGORY_KEYS, value) ? value : "EXPORT_CIV_PL";
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
  const key = {
    SHIPPER: "files.visibilityShipper",
    CONSIGNEE: "files.visibilityConsignee",
    OVERSEA_AGENT: "files.visibilityOverseaAgent",
    INTERNAL: "files.visibilityInternal",
    PARTIES: "files.visibilityParties"
  }[String(value ?? "").toUpperCase()];
  return t(key || "files.visibilityShipper");
}

function normalizeFileVisibilityRoles(value, legacyVisibility = "") {
  let candidates = value;
  if (typeof candidates === "string") {
    const trimmed = candidates.trim();
    if (trimmed.startsWith("[")) {
      try {
        candidates = JSON.parse(trimmed);
      } catch {
        candidates = trimmed.split(",");
      }
    } else {
      candidates = trimmed.split(",");
    }
  }
  if (!Array.isArray(candidates)) candidates = [];

  const normalized = new Set(
    candidates
      .map((role) => String(role ?? "").trim().toUpperCase())
      .filter((role) => FILE_VISIBILITY_ROLES.includes(role))
  );
  const legacy = String(legacyVisibility ?? "").trim().toUpperCase();
  if (normalized.size === 0 && FILE_VISIBILITY_ROLES.includes(legacy)) {
    normalized.add(legacy);
  } else if (normalized.size === 0 && legacy === "INTERNAL") {
    normalized.add("OVERSEA_AGENT");
  } else if (normalized.size === 0 && legacy === "PARTIES") {
    normalized.add("SHIPPER");
    normalized.add("CONSIGNEE");
  }
  return FILE_VISIBILITY_ROLES.filter((role) => normalized.has(role));
}

function legacyVisibilityForRoles(roles) {
  const normalized = normalizeFileVisibilityRoles(roles);
  return normalized.length === 1 && normalized[0] === "OVERSEA_AGENT"
    ? "INTERNAL"
    : "PARTIES";
}

function fileVisibilityRolesLabel(roles) {
  const normalized = normalizeFileVisibilityRoles(roles);
  if (normalized.length === FILE_VISIBILITY_ROLES.length) {
    return t("files.visibilityAllRoles");
  }
  return normalized.map(fileVisibilityLabel).join(", ") || t("files.visibilityRequired");
}

function allowedRelatedFileVisibilityRoles() {
  const configured = normalizeFileVisibilityRoles(
    relatedFilesPermissions?.allowedVisibilityRoles ??
      relatedFilesPermissions?.visibleToRoles
  );
  return configured.length > 0 ? configured : [...FILE_VISIBILITY_ROLES];
}

function selectedRelatedFilesUploadRoles() {
  return FILE_VISIBILITY_ROLES.filter((role) =>
    relatedFilesUploadRoleInputs.some((input) => input.value === role && input.checked)
  );
}

function setRelatedFilesUploadRoles(roles) {
  const selected = new Set(normalizeFileVisibilityRoles(roles));
  for (const input of relatedFilesUploadRoleInputs) {
    input.checked = selected.has(input.value);
  }
}

function updateRelatedFilesUploadVisibility({ disabled = false } = {}) {
  const allowed = new Set(allowedRelatedFileVisibilityRoles());
  let selected = selectedRelatedFilesUploadRoles().filter((role) => allowed.has(role));
  if (selected.length === 0 && allowed.size > 0) {
    selected = [...allowed];
    setRelatedFilesUploadRoles(selected);
  }
  for (const input of relatedFilesUploadRoleInputs) {
    input.disabled = disabled || !allowed.has(input.value);
    input.closest("label")?.toggleAttribute("hidden", !allowed.has(input.value));
  }
  relatedFilesUploadVisibilitySummary.textContent = fileVisibilityRolesLabel(selected);
  relatedFilesUploadVisibilityHint.hidden = selected.length > 0;
  relatedFilesUploadVisibility.classList.toggle("is-disabled", disabled);
  relatedFilesUploadVisibility.setAttribute("aria-disabled", String(disabled));
  if (disabled) relatedFilesUploadVisibility.open = false;
}

for (const input of relatedFilesUploadRoleInputs) {
  input.addEventListener("change", () => {
    if (selectedRelatedFilesUploadRoles().length === 0) input.checked = true;
    updateRelatedFilesUploadVisibility({ disabled: relatedFilesUploading });
    updateRelatedFilesSelection();
  });
}

function normalizeRelatedFileItem(item) {
  const rawVisibility = String(item?.visibility ?? "SHIPPER").toUpperCase();
  const visibilityRoles = normalizeFileVisibilityRoles(
    item?.visibilityRoles ?? item?.visibleToRoles ?? item?.visibleTo,
    rawVisibility
  );
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
    visibilityRoles,
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
    contentType: String(item?.contentType ?? item?.mimeType ?? "").trim(),
    previewUrl: String(item?.previewUrl ?? "").trim(),
    previewMode: String(item?.previewMode ?? "").trim().toUpperCase(),
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
  return false;
}

function updateRelatedFilesSelection() {
  const session = readFileSession();
  const files = Array.from(relatedFilesUploadInput.files ?? []);
  const totalSize = files.reduce((total, file) => total + Number(file.size ?? 0), 0);
  const visibilityReady =
    !canManageFileVisibility(session) || selectedRelatedFilesUploadRoles().length > 0;
  relatedFilesTargetCustomerField.hidden = true;
  relatedFilesTargetCustomerHint.hidden = true;
  relatedFilesUploadVisibilityHint.hidden = visibilityReady;
  relatedFilesSelection.textContent =
    files.length > 0
      ? t("files.selection", { count: files.length, size: formatFileSize(totalSize) })
      : t("files.noSelection");
  relatedFilesSelection.dataset.state = files.length > 0 ? "ready" : "empty";
  relatedFilesUploadButton.disabled =
    relatedFilesUploading ||
    files.length === 0 ||
    !relatedFilesShipmentId ||
    !visibilityReady;
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
  if (session.kind === "CUSTOMER") return t("files.sharedWithSelf");
  return fileVisibilityRolesLabel(file.visibilityRoles);
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
  sharing.className = "related-file-sharing is-role-set";
  sharing.textContent = relatedFileSharingLabel(file, session);
  badges.append(sharing);

  if (
    session.kind === "INTERNAL" &&
    file.canChangeVisibility &&
    (canManageFileVisibility(session) || relatedFilesPermissions?.canChangeVisibility === true)
  ) {
    const editor = document.createElement("div");
    editor.className = "related-file-sharing-editor";
    const picker = document.createElement("details");
    picker.className = "visibility-role-picker related-file-visibility-picker";
    const summary = document.createElement("summary");
    summary.setAttribute("aria-label", t("files.visibility"));
    const menu = document.createElement("div");
    menu.className = "visibility-role-menu";
    const allowedRoles = allowedRelatedFileVisibilityRoles();
    let committedRoles = normalizeFileVisibilityRoles(file.visibilityRoles, file.visibility);
    if (committedRoles.length === 0) committedRoles = [allowedRoles[0] ?? "OVERSEA_AGENT"];
    const controls = [];
    const updatePicker = (roles) => {
      const selected = new Set(normalizeFileVisibilityRoles(roles));
      for (const control of controls) control.checked = selected.has(control.value);
      summary.textContent = fileVisibilityRolesLabel([...selected]);
    };

    const persistVisibility = async (nextRoles) => {
      if (!isCurrentRelatedFilesSession(sessionFingerprint)) return;
      const previousRoles = [...committedRoles];
      picker.classList.add("is-disabled", "is-saving");
      controls.forEach((control) => { control.disabled = true; });
      try {
        await requestRelatedFilesApi(
          shipmentFilePath(session, file.id, "/visibility"),
          {
            method: "PATCH",
            body: {
              visibilityRoles: nextRoles,
              visibility: legacyVisibilityForRoles(nextRoles)
            },
            session
          }
        );
        if (!isCurrentRelatedFilesSession(sessionFingerprint)) return;
        committedRoles = [...nextRoles];
        file.visibilityRoles = [...nextRoles];
        file.visibility = legacyVisibilityForRoles(nextRoles);
        sharing.textContent = relatedFileSharingLabel(file, session);
        setRelatedFilesUploadMessage();
      } catch (error) {
        if (!isCurrentRelatedFilesSession(sessionFingerprint)) return;
        committedRoles = previousRoles;
        file.visibilityRoles = [...previousRoles];
        updatePicker(previousRoles);
        setRelatedFilesUploadMessage(
          t("files.visibilityUpdateFailed", { message: error?.message || t("error.generic") }),
          "error"
        );
      } finally {
        if (isCurrentRelatedFilesSession(sessionFingerprint)) {
          picker.classList.remove("is-disabled", "is-saving");
          controls.forEach((control) => { control.disabled = false; });
        }
      }
    };

    for (const role of allowedRoles) {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      const copy = document.createElement("span");
      checkbox.type = "checkbox";
      checkbox.value = role;
      copy.textContent = fileVisibilityLabel(role);
      checkbox.addEventListener("change", () => {
        const nextRoles = controls.filter((control) => control.checked).map((control) => control.value);
        if (nextRoles.length === 0) {
          checkbox.checked = true;
          setRelatedFilesUploadMessage(t("files.visibilityRequired"), "error");
          return;
        }
        updatePicker(nextRoles);
        void persistVisibility(nextRoles);
      });
      controls.push(checkbox);
      label.append(checkbox, copy);
      menu.append(label);
    }
    updatePicker(committedRoles);
    picker.append(summary, menu);
    editor.append(picker);
    badges.append(editor);
  }
  content.append(name, metadata, badges);

  const actions = document.createElement("div");
  actions.className = "related-file-actions";
  actions.append(
    relatedFileActionButton("files.preview", "related-file-preview", (event) => {
      void previewRelatedFile(file, event.currentTarget);
    }),
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

function normalizeRelatedFileComment(item) {
  return {
    id: String(item?.id ?? ""),
    body: String(item?.body ?? "").trim(),
    authorDisplayName: String(item?.authorDisplayName ?? item?.authorName ?? "").trim(),
    authorType: String(item?.authorType ?? "").trim().toUpperCase(),
    authorRole: String(item?.authorRole ?? "").trim().toUpperCase(),
    createdAt: item?.createdAt ?? null
  };
}

function setRelatedFileCommentMessage(message = "", variant = "") {
  relatedFileCommentMessage.hidden = !message;
  relatedFileCommentMessage.textContent = message;
  relatedFileCommentMessage.dataset.variant = variant;
}

function createRelatedFileCommentItem(comment) {
  const item = document.createElement("li");
  item.className = "related-file-comment-item";

  const mark = document.createElement("span");
  mark.className = "related-file-comment-mark";
  mark.textContent = (comment.authorDisplayName || "U").slice(0, 1).toUpperCase();

  const content = document.createElement("div");
  const header = document.createElement("p");
  const author = document.createElement("strong");
  author.textContent = comment.authorDisplayName || t("files.unknownUploader");
  const time = document.createElement("time");
  time.dateTime = comment.createdAt || "";
  time.textContent = formatLocalDateTime(comment.createdAt);
  header.append(author, time);

  const body = document.createElement("p");
  body.textContent = comment.body;
  content.append(header, body);
  item.append(mark, content);
  return item;
}

function renderRelatedFileComments() {
  const session = readFileSession();
  const available = Boolean(
    session.token &&
    relatedFilesShipmentId &&
    !(session.kind === "CUSTOMER" && relatedFilesCustomerAccess === false)
  );
  relatedFileComments.hidden = !available;
  if (!available) return;

  const hasItems = relatedFileCommentItems.length > 0;
  relatedFileCommentsCount.textContent = String(relatedFileCommentItems.length);
  relatedFileCommentsLoading.hidden = !relatedFileCommentsLoadingState;
  relatedFileCommentsEmpty.hidden =
    relatedFileCommentsLoadingState || Boolean(relatedFileCommentsErrorText) || hasItems;
  relatedFileCommentsList.hidden =
    relatedFileCommentsLoadingState || Boolean(relatedFileCommentsErrorText) || !hasItems;
  relatedFileCommentsList.replaceChildren(
    ...relatedFileCommentItems.map(createRelatedFileCommentItem)
  );
  relatedFileCommentInput.disabled = relatedFileCommentsSending;
  relatedFileCommentSend.disabled =
    relatedFileCommentsSending || !relatedFileCommentInput.value.trim();
  relatedFileCommentSend.textContent = t(
    relatedFileCommentsSending ? "files.commentSending" : "files.commentSend"
  );
  if (relatedFileCommentsErrorText) {
    setRelatedFileCommentMessage(relatedFileCommentsErrorText, "error");
  }
}

async function loadRelatedFileComments() {
  const session = readFileSession();
  synchronizeRelatedFilesSession(session);
  if (!relatedFilesShipmentId || !session.token) {
    renderRelatedFileComments();
    return;
  }
  const sessionFingerprint = relatedFilesSessionFingerprint;
  const requestSequence = ++relatedFileCommentsRequestSequence;
  relatedFileCommentsLoadingState = true;
  relatedFileCommentsErrorText = "";
  if (relatedFileCommentMessage.dataset.variant === "error") {
    setRelatedFileCommentMessage();
  }
  renderRelatedFileComments();
  try {
    const payload = await requestRelatedFilesApi(
      shipmentFileCommentsPath(session, relatedFilesShipmentId),
      { session }
    );
    if (
      requestSequence !== relatedFileCommentsRequestSequence ||
      !isCurrentRelatedFilesSession(sessionFingerprint)
    ) return;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    relatedFileCommentItems = items.map(normalizeRelatedFileComment).filter((item) => item.body);
    if (session.kind === "CUSTOMER") relatedFilesCustomerAccess = true;
  } catch (error) {
    if (
      requestSequence !== relatedFileCommentsRequestSequence ||
      !isCurrentRelatedFilesSession(sessionFingerprint)
    ) return;
    if (session.kind === "CUSTOMER" && error?.status === 403) {
      relatedFilesCustomerAccess = false;
    }
    if (error?.status !== 401) {
      relatedFileCommentsErrorText = error?.message || t("error.generic");
    }
  } finally {
    if (
      requestSequence === relatedFileCommentsRequestSequence &&
      isCurrentRelatedFilesSession(sessionFingerprint)
    ) {
      relatedFileCommentsLoadingState = false;
      renderRelatedFileComments();
    }
  }
}

async function sendRelatedFileComment() {
  const body = relatedFileCommentInput.value.trim();
  const session = readFileSession();
  if (!body || !relatedFilesShipmentId || !session.token || relatedFileCommentsSending) return;
  const sessionFingerprint = relatedFilesSessionFingerprint;
  relatedFileCommentsSending = true;
  relatedFileCommentsErrorText = "";
  setRelatedFileCommentMessage();
  renderRelatedFileComments();
  try {
    await requestRelatedFilesApi(
      shipmentFileCommentsPath(session, relatedFilesShipmentId),
      { method: "POST", body: { body }, session }
    );
    if (!isCurrentRelatedFilesSession(sessionFingerprint)) return;
    relatedFileCommentInput.value = "";
    setRelatedFileCommentMessage(t("files.commentSent"), "success");
    await loadRelatedFileComments();
  } catch (error) {
    if (!isCurrentRelatedFilesSession(sessionFingerprint)) return;
    setRelatedFileCommentMessage(
      t("files.commentFailed", { message: error?.message || t("error.generic") }),
      "error"
    );
  } finally {
    if (isCurrentRelatedFilesSession(sessionFingerprint)) {
      relatedFileCommentsSending = false;
      renderRelatedFileComments();
    }
  }
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

  if (session.kind !== "INTERNAL" && session.kind !== "CUSTOMER") {
    setRelatedFilesUploadRoles(["SHIPPER"]);
    relatedFilesSelectedTargetCustomerId = "";
  }
  renderRelatedFilesTargetOptions();

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
  relatedFilesUploadVisibilityField.hidden =
    !authenticated || relatedFilesPermissions?.canUpload === false || !canManageVisibility;

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
  renderRelatedFileComments();

  relatedFilesSelectButton.disabled = relatedFilesUploading;
  relatedFilesUploadInput.disabled = relatedFilesUploading;
  relatedFilesUploadButton.classList.toggle("is-uploading", relatedFilesUploading);
  relatedFilesUploadButton.setAttribute("aria-busy", String(relatedFilesUploading));
  relatedFilesCategory.disabled = relatedFilesUploading;
  relatedFilesCategoryTrigger.disabled = relatedFilesUploading;
  if (relatedFilesUploading) setRelatedFilesCategoryOpen(false);
  updateRelatedFilesUploadVisibility({ disabled: relatedFilesUploading });
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
  setRelatedFileCommentMessage();
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
    void Promise.all([loadRelatedFiles(), loadRelatedFileComments()]);
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

  const customerUpload = session.kind === "CUSTOMER";
  const visibilityRoles = customerUpload ? [] : selectedRelatedFilesUploadRoles();
  if (!customerUpload && visibilityRoles.length === 0) {
    setRelatedFilesUploadMessage(t("files.visibilityRequired"), "error");
    renderRelatedFilesDrawer();
    return;
  }
  const internalVisibility = legacyVisibilityForRoles(visibilityRoles);
  const targetCustomerId = relatedFilesSelectedTargetCustomerId;

  const sessionFingerprint = relatedFilesSessionFingerprint;
  relatedFilesUploading = true;
  setRelatedFilesUploadMessage(t("files.uploading"), "progress");
  renderRelatedFilesDrawer();
  const formData = new FormData();
  for (const file of files) formData.append("files", file);
  formData.append("category", relatedFilesCategory.value || "EXPORT_CIV_PL");
  if (!customerUpload) {
    for (const role of visibilityRoles) formData.append("visibilityRoles", role);
  }
  if (session.kind === "INTERNAL") {
    formData.append("visibility", internalVisibility);
    if (targetCustomerId) formData.append("targetCustomerId", targetCustomerId);
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

const PREVIEW_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico"]);
const PREVIEW_PDF_EXTENSIONS = new Set(["pdf"]);
const PREVIEW_TEXT_EXTENSIONS = new Set([
  "txt", "csv", "log", "json", "xml", "md", "markdown", "html", "htm",
  "js", "ts", "jsx", "tsx", "css", "scss", "less", "yml", "yaml",
  "ini", "conf", "properties", "sh", "bash", "bat", "ps1", "sql",
  "java", "py", "rb", "go", "rs", "c", "cc", "cpp", "h", "hpp",
  "php", "swift", "kt", "dart", "toml", "env", "gitignore"
]);
const PREVIEW_OFFICE_EXTENSIONS = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"]);
const PREVIEW_TEXT_BYTE_LIMIT = 2 * 1024 * 1024;

const filePreviewDialog = document.querySelector("#file-preview-dialog");
const filePreviewName = document.querySelector("#file-preview-name");
const filePreviewBody = document.querySelector("#file-preview-body");
const filePreviewMessage = document.querySelector("#file-preview-message");
const filePreviewContent = document.querySelector("#file-preview-content");
const filePreviewClose = document.querySelector("#file-preview-close");
const filePreviewCancel = document.querySelector("#file-preview-cancel");
const filePreviewDownload = document.querySelector("#file-preview-download");
let filePreviewObjectUrls = [];
let currentPreviewFile = null;

function getFileExtension(fileName) {
  const name = String(fileName || "").trim().toLowerCase();
  if (!name) return "";
  const idx = name.lastIndexOf(".");
  if (idx < 0 || idx === name.length - 1) return "";
  return name.slice(idx + 1);
}

function clearFilePreviewContent() {
  filePreviewContent.replaceChildren();
  filePreviewMessage.hidden = true;
  filePreviewMessage.textContent = "";
  filePreviewMessage.classList.remove("error");
  for (const url of filePreviewObjectUrls) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }
  filePreviewObjectUrls = [];
}

function setFilePreviewMessage(text, isError = false) {
  if (!text) {
    filePreviewMessage.hidden = true;
    filePreviewMessage.textContent = "";
    filePreviewMessage.classList.remove("error");
    return;
  }
  filePreviewMessage.textContent = text;
  filePreviewMessage.classList.toggle("error", isError);
  filePreviewMessage.hidden = false;
}

function closeFilePreviewDialog() {
  if (typeof filePreviewDialog?.close === "function") {
    filePreviewDialog.close();
  }
  currentPreviewFile = null;
  clearFilePreviewContent();
}

function renderFilePreviewFallback(messageKey, messageParams) {
  const fallback = document.createElement("p");
  fallback.className = "file-preview-fallback";
  fallback.textContent = t(messageKey, messageParams);
  filePreviewContent.replaceChildren(fallback);
}

function renderFilePreviewText(text, { asTextarea = false } = {}) {
  if (asTextarea) {
    const textarea = document.createElement("textarea");
    textarea.className = "file-preview-textarea";
    textarea.value = text;
    textarea.readOnly = true;
    filePreviewContent.replaceChildren(textarea);
    return;
  }
  const pre = document.createElement("pre");
  pre.className = "file-preview-text";
  pre.textContent = text;
  filePreviewContent.replaceChildren(pre);
}

function renderFilePreviewTable(rows, { caption = "" } = {}) {
  const normalizedRows = rows
    .slice(0, 500)
    .map((row) => row.slice(0, 80).map((cell) => String(cell ?? "")));
  if (normalizedRows.length === 0) {
    renderFilePreviewFallback("files.previewNotSupported");
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "file-preview-table-wrap";
  const table = document.createElement("table");
  table.className = "file-preview-table";
  if (caption) {
    const captionNode = document.createElement("caption");
    captionNode.textContent = caption;
    table.append(captionNode);
  }
  const body = document.createElement("tbody");
  normalizedRows.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    row.forEach((cell) => {
      const element = document.createElement(rowIndex === 0 ? "th" : "td");
      element.textContent = cell;
      tr.append(element);
    });
    body.append(tr);
  });
  table.append(body);
  wrap.append(table);
  filePreviewContent.replaceChildren(wrap);
}

function parseCsvPreview(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length && rows.length < 500; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value !== "")) rows.push(row);
  }
  return rows;
}

function renderFilePreviewSpreadsheet(text) {
  const sheets = [];
  let current = { name: "Sheet", rows: [] };
  for (const line of String(text).split(/\r?\n/)) {
    if (line.startsWith("# ")) {
      if (current.rows.length > 0) sheets.push(current);
      current = { name: line.slice(2).trim() || "Sheet", rows: [] };
    } else if (line.trim() || current.rows.length > 0) {
      current.rows.push(line.split("\t"));
    }
  }
  if (current.rows.length > 0) sheets.push(current);
  const workbook = document.createElement("div");
  workbook.className = "file-preview-workbook";
  for (const sheet of sheets.slice(0, 20)) {
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    heading.textContent = sheet.name;
    const wrap = document.createElement("div");
    wrap.className = "file-preview-table-wrap";
    const table = document.createElement("table");
    table.className = "file-preview-table";
    const body = document.createElement("tbody");
    sheet.rows.slice(0, 500).forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      row.slice(0, 80).forEach((cell) => {
        const element = document.createElement(rowIndex === 0 ? "th" : "td");
        element.textContent = cell;
        tr.append(element);
      });
      body.append(tr);
    });
    table.append(body);
    wrap.append(table);
    section.append(heading, wrap);
    workbook.append(section);
  }
  if (workbook.childElementCount === 0) {
    renderFilePreviewText(text);
  } else {
    filePreviewContent.replaceChildren(workbook);
  }
}

function renderFilePreviewMarkdown(text) {
  const article = document.createElement("article");
  article.className = "file-preview-markdown";
  let codeBlock = null;
  for (const rawLine of String(text).split(/\r?\n/)) {
    if (rawLine.trim().startsWith("```")) {
      if (codeBlock) {
        codeBlock = null;
      } else {
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        pre.append(code);
        article.append(pre);
        codeBlock = code;
      }
      continue;
    }
    if (codeBlock) {
      codeBlock.textContent += `${rawLine}\n`;
      continue;
    }
    const heading = rawLine.match(/^(#{1,6})\s+(.+)$/);
    const bullet = rawLine.match(/^\s*[-*+]\s+(.+)$/);
    const quote = rawLine.match(/^>\s?(.*)$/);
    let element;
    if (heading) {
      element = document.createElement(`h${heading[1].length}`);
      element.textContent = heading[2];
    } else if (bullet) {
      element = document.createElement("p");
      element.className = "file-preview-markdown-bullet";
      element.textContent = bullet[1];
    } else if (quote) {
      element = document.createElement("blockquote");
      element.textContent = quote[1];
    } else if (rawLine.trim()) {
      element = document.createElement("p");
      element.textContent = rawLine;
    } else {
      element = document.createElement("br");
    }
    article.append(element);
  }
  filePreviewContent.replaceChildren(article);
}

function renderFilePreviewWord(text) {
  const article = document.createElement("article");
  article.className = "file-preview-word";
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (line.includes("\t")) {
      const row = document.createElement("div");
      row.className = "file-preview-word-row";
      line.split("\t").forEach((value) => {
        const cell = document.createElement("span");
        cell.textContent = value;
        row.append(cell);
      });
      article.append(row);
    } else {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      article.append(paragraph);
    }
  }
  filePreviewContent.replaceChildren(article);
}

function renderFilePreviewBlob(blob, extension, contentType = "") {
  const url = URL.createObjectURL(blob);
  filePreviewObjectUrls.push(url);
  if (PREVIEW_PDF_EXTENSIONS.has(extension) || contentType === "application/pdf") {
    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.title = filePreviewName.textContent || t("files.previewTitle");
    iframe.setAttribute("sandbox", "");
    iframe.referrerPolicy = "no-referrer";
    filePreviewContent.replaceChildren(iframe);
    return;
  }
  if (
    PREVIEW_IMAGE_EXTENSIONS.has(extension) &&
    contentType !== "image/svg+xml"
  ) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = filePreviewName.textContent || t("files.previewTitle");
    img.referrerPolicy = "no-referrer";
    img.decoding = "async";
    filePreviewContent.replaceChildren(img);
    return;
  }
  renderFilePreviewFallback("files.previewNotSupported");
}

async function readBlobAsText(blob, { force = false } = {}) {
  if (blob.size > PREVIEW_TEXT_BYTE_LIMIT) return { text: null, tooLarge: true };
  try {
    const text = await blob.text();
    if (!force) {
      const sample = text.slice(0, 4_096);
      const controlCharacters = Array.from(sample).filter((character) => {
        const code = character.charCodeAt(0);
        return code === 0 || (code < 9 || (code > 13 && code < 32));
      }).length;
      if (sample.length > 0 && controlCharacters / sample.length > 0.02) {
        return { text: null, tooLarge: false };
      }
    }
    return { text, tooLarge: false };
  } catch {
    return { text: null, tooLarge: false };
  }
}

function safeSameOriginFileUrl(candidate, fallback) {
  const fallbackUrl = new URL(fallback, window.location.origin);
  try {
    const resolved = new URL(candidate || fallbackUrl, window.location.origin);
    if (
      resolved.origin !== window.location.origin ||
      !resolved.pathname.startsWith("/api/")
    ) {
      return fallbackUrl.toString();
    }
    return resolved.toString();
  } catch {
    return fallbackUrl.toString();
  }
}

async function fetchRelatedFilePreview(file, session) {
  const previewPath = safeSameOriginFileUrl(
    file.previewUrl,
    shipmentFilePath(session, file.id, "/preview")
  );
  let response = await fetch(previewPath, {
    headers: { ...fileAuthHeaders(session) },
    credentials: "same-origin",
    redirect: "error"
  });
  if ([404, 405].includes(response.status)) {
    response = await fetch(
      safeSameOriginFileUrl("", shipmentFilePath(session, file.id, "/download")),
      {
        headers: { ...fileAuthHeaders(session) },
        credentials: "same-origin",
        redirect: "error"
      }
    );
  }
  return response;
}

async function previewRelatedFile(file, button) {
  const session = readFileSession();
  synchronizeRelatedFilesSession(session);
  if (!file?.id || !session.token) return;
  const sessionFingerprint = relatedFilesSessionFingerprint;
  const previousLabel = button.textContent;
  button.disabled = true;
  button.textContent = t("files.previewing");
  clearFilePreviewContent();
  currentPreviewFile = file;
  filePreviewName.textContent = file.originalFileName || t("files.previewTitle");
  if (typeof filePreviewDialog?.showModal === "function") {
    filePreviewDialog.showModal();
  }
  setFilePreviewMessage(t("files.previewing"));
  try {
    const response = await fetchRelatedFilePreview(file, session);
    if (response.status === 401) {
      clearFileSession(session, { expired: true });
      closeFilePreviewDialog();
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
    const extension = getFileExtension(file.originalFileName);
    const contentType = String(
      response.headers.get("Content-Type") || file.contentType || ""
    ).split(";", 1)[0].trim().toLowerCase();
    const previewMode = String(file.previewMode || "").toUpperCase();
    const blob = await response.blob();
    if (!isCurrentRelatedFilesSession(sessionFingerprint)) return;

    clearFilePreviewContent();

    if (
      previewMode === "PDF" ||
      previewMode === "IMAGE" ||
      contentType === "application/pdf" ||
      (contentType.startsWith("image/") && contentType !== "image/svg+xml") ||
      PREVIEW_PDF_EXTENSIONS.has(extension) ||
      PREVIEW_IMAGE_EXTENSIONS.has(extension)
    ) {
      renderFilePreviewBlob(blob, extension, contentType);
      setFilePreviewMessage(t("files.previewDownloadTip"));
      return;
    }

    if (previewMode === "MARKDOWN" || ["md", "markdown"].includes(extension)) {
      const { text, tooLarge } = await readBlobAsText(blob, { force: true });
      if (tooLarge || text == null) {
        renderFilePreviewFallback(tooLarge ? "files.previewTooLarge" : "files.previewNotSupported");
      } else {
        renderFilePreviewMarkdown(text);
      }
      setFilePreviewMessage(t("files.previewDownloadTip"));
      return;
    }

    if (previewMode === "CSV" || extension === "csv") {
      const { text, tooLarge } = await readBlobAsText(blob, { force: true });
      if (tooLarge || text == null) {
        renderFilePreviewFallback(tooLarge ? "files.previewTooLarge" : "files.previewNotSupported");
      } else {
        renderFilePreviewTable(parseCsvPreview(text), { caption: file.originalFileName || "CSV" });
      }
      setFilePreviewMessage(t("files.previewDownloadTip"));
      return;
    }

    if (previewMode === "SPREADSHEET" || ["xlsx", "xls"].includes(extension)) {
      const { text, tooLarge } = await readBlobAsText(blob, { force: true });
      if (tooLarge || text == null) {
        renderFilePreviewFallback(tooLarge ? "files.previewTooLarge" : "files.previewNotSupported");
      } else {
        renderFilePreviewSpreadsheet(text);
      }
      setFilePreviewMessage(t("files.previewTextFallback", { name: file.originalFileName || "" }));
      return;
    }

    if (previewMode === "WORD" || ["doc", "docx"].includes(extension)) {
      const { text, tooLarge } = await readBlobAsText(blob, { force: true });
      if (tooLarge || text == null) {
        renderFilePreviewFallback(tooLarge ? "files.previewTooLarge" : "files.previewNotSupported");
      } else {
        renderFilePreviewWord(text);
      }
      setFilePreviewMessage(t("files.previewTextFallback", { name: file.originalFileName || "" }));
      return;
    }

    const responseIsText =
      previewMode === "TEXT" ||
      contentType.startsWith("text/") ||
      /(?:json|xml|javascript|yaml|csv)/i.test(contentType);
    if (responseIsText || PREVIEW_TEXT_EXTENSIONS.has(extension)) {
      const { text, tooLarge } = await readBlobAsText(blob, { force: responseIsText });
      if (tooLarge) {
        renderFilePreviewFallback("files.previewTooLarge");
        setFilePreviewMessage(t("files.previewDownloadTip"));
      } else if (text != null) {
        renderFilePreviewText(text, { asTextarea: false });
        setFilePreviewMessage(t("files.previewTextFallback", { name: file.originalFileName || "" }));
      } else {
        renderFilePreviewFallback("files.previewNotSupported");
      }
      return;
    }

    if (PREVIEW_OFFICE_EXTENSIONS.has(extension)) {
      renderFilePreviewFallback("files.previewNotSupported");
      setFilePreviewMessage(t("files.previewDownloadTip"));
      return;
    }

    const { text, tooLarge } = await readBlobAsText(blob);
    if (tooLarge) {
      renderFilePreviewFallback("files.previewTooLarge");
      setFilePreviewMessage(t("files.previewDownloadTip"));
    } else if (text != null && text.length > 0) {
      renderFilePreviewText(text, { asTextarea: true });
      setFilePreviewMessage(t("files.previewTextFallback", { name: file.originalFileName || "" }));
    } else {
      renderFilePreviewFallback("files.previewNotSupported");
      setFilePreviewMessage(t("files.previewDownloadTip"));
    }
  } catch (error) {
    if (!isCurrentRelatedFilesSession(sessionFingerprint)) return;
    clearFilePreviewContent();
    renderFilePreviewFallback("files.previewNotSupported");
    setFilePreviewMessage(
      t("files.previewFailed", { message: error?.message || t("error.generic") }),
      true
    );
  } finally {
    if (isCurrentRelatedFilesSession(sessionFingerprint)) {
      button.disabled = false;
      button.textContent = previousLabel;
    }
  }
}

if (filePreviewClose) {
  filePreviewClose.addEventListener("click", closeFilePreviewDialog);
}
if (filePreviewCancel) {
  filePreviewCancel.addEventListener("click", closeFilePreviewDialog);
}
if (filePreviewDownload) {
  filePreviewDownload.addEventListener("click", () => {
    if (currentPreviewFile) void downloadRelatedFile(currentPreviewFile, filePreviewDownload);
  });
}
if (filePreviewDialog) {
  filePreviewDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeFilePreviewDialog();
  });
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

const IMPORT_DETAIL_LIMITS = Object.freeze({
  carrierPrefix: 8,
  originalBillOfLading: 64,
  forwarderJobNumber: 160,
  vesselVoyage: 240,
  portOfLoading: 160,
  portOfDischarge: 160,
  clientPoNumber: 160,
  estimatedDeparture: 80,
  estimatedArrival: 80,
  volume: 80,
  clientNameCode: 160
});

function normalizeImportedDetails(details) {
  if (!details || typeof details !== "object") return null;
  const normalized = {};
  for (const [key, limit] of Object.entries(IMPORT_DETAIL_LIMITS)) {
    const value = String(details[key] ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
    if (value) normalized[key] = value;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function normalizeQuery(query) {
  const normalized = {
    carrier: String(query.carrier ?? "COSCO").trim().toUpperCase(),
    channel: String(query.channel ?? "AUTO").trim().toUpperCase(),
    type: String(query.type ?? "BILLOFLADING").trim().toUpperCase(),
    number: String(query.number ?? "")
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase()
  };
  const importedDetails = normalizeImportedDetails(query.importedDetails);
  if (importedDetails) normalized.importedDetails = importedDetails;
  return normalized;
}

function trackingQueryKey(query) {
  const normalized = normalizeQuery(query);
  return `${normalized.carrier}:${normalized.type}:${normalized.number}`;
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
    clientNameCode: hasText(stored.clientNameCode)
      ? stored.clientNameCode
      : upstream.clientNameCode ?? "",
    clientPoNumber: hasText(stored.clientPoNumber)
      ? stored.clientPoNumber
      : upstream.clientPoNumber ?? "",
    forwarderJobNumber: hasText(stored.forwarderJobNumber)
      ? stored.forwarderJobNumber
      : upstream.forwarderJobNumber ?? ""
  };
}

function renderBusinessReferences(snapshot) {
  const references = businessReferencesForSnapshot(snapshot);
  const rows = [
    ["client-name-code", "client-name-code-reference", references.clientNameCode],
    ["client-po-number", "client-po-number-reference", references.clientPoNumber],
    ["forwarder-job-number", "forwarder-job-number-reference", references.forwarderJobNumber]
  ];
  let visibleCount = 0;
  for (const [valueId, rowId, value] of rows) {
    const visible = hasText(value);
    elements[valueId].textContent = visible ? String(value).trim() : "—";
    elements[rowId].hidden = !visible;
    if (visible) visibleCount += 1;
  }
  elements["business-reference-grid"].hidden = visibleCount === 0;
}

function hasText(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function hasArrayField(snapshot, collections, fields) {
  return collections.some((collection) =>
    (snapshot?.[collection] ?? []).some((item) => fields.some((field) => hasText(item?.[field])))
  );
}

function canonicalExtraInformationKeys(snapshot) {
  const keys = new Set();
  const business = businessReferencesForSnapshot(snapshot);
  const references = snapshot?.references ?? {};
  const keyTimes = snapshot?.keyTimes ?? {};
  const addWhen = (key, value) => {
    if (hasText(value)) keys.add(key.toLowerCase());
  };

  addWhen("carrierPrefix", snapshot?.tracking?.carrierPrefix ?? references.carrierPrefix);
  addWhen(
    "originalBillOfLading",
    snapshot?.tracking?.originalNumber ??
      references.originalBillOfLading ??
      snapshot?.summary?.billOfLading ??
      references.masterBill
  );
  addWhen("clientNameCode", business.clientNameCode);
  addWhen("clientPoNumber", business.clientPoNumber);
  addWhen("forwarderJobNumber", business.forwarderJobNumber);
  addWhen("portOfLoading", snapshot?.summary?.origin?.name);
  addWhen("portOfDischarge", snapshot?.summary?.destination?.name);

  if (
    hasText(keyTimes.actualDeparture?.time ?? keyTimes.actualDeparture?.actualTime) ||
    hasText(keyTimes.estimatedDeparture?.time ?? keyTimes.estimatedDeparture?.actualTime) ||
    hasArrayField(snapshot, ["routingLegs"], ["estimatedDeparture", "actualDeparture"])
  ) {
    keys.add("estimateddeparture");
  }
  if (
    hasText(keyTimes.actualArrival?.time ?? keyTimes.actualArrival?.actualTime) ||
    hasText(keyTimes.estimatedFinalArrival?.time ?? keyTimes.estimatedFinalArrival?.actualTime) ||
    hasText(keyTimes.estimatedArrival?.time ?? keyTimes.estimatedArrival?.actualTime) ||
    hasText(keyTimes.estimatedDelivery?.time ?? keyTimes.estimatedDelivery?.actualTime) ||
    hasArrayField(snapshot, ["routingLegs"], ["estimatedArrival", "actualArrival"])
  ) {
    keys.add("estimatedarrival");
  }
  if (hasArrayField(snapshot, ["routingLegs", "sailingSchedule"], ["vesselName", "voyage"])) {
    keys.add("vesselvoyage");
  }
  addWhen("volume", containerTypeSummary(snapshot));
  return keys;
}

function deduplicatedExtraInformation(snapshot) {
  const canonicalKeys = canonicalExtraInformationKeys(snapshot);
  const groups = new Map();
  for (const item of snapshot?.extraInformation ?? []) {
    if (!hasText(item?.key) || !hasText(item?.value)) continue;
    const key = String(item.key).trim();
    const normalizedKey = key.toLowerCase();
    if (canonicalKeys.has(normalizedKey)) continue;
    const value = String(item.value).trim();
    const normalizedValue = value.replace(/\s+/g, " ").toLocaleLowerCase();
    const group = groups.get(normalizedKey) ?? { key, values: [], seen: new Set() };
    if (!group.seen.has(normalizedValue)) {
      group.seen.add(normalizedValue);
      group.values.push(value);
    }
    groups.set(normalizedKey, group);
  }
  return [...groups.values()].map((group) => ({
    key: group.key,
    value: group.values.join(" · ")
  }));
}

function extraInformationLabel(key) {
  const messageKey = `extraInformation.${key}`;
  const translated = t(messageKey);
  if (translated !== messageKey) return translated;
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function mergeImportedDetailsIntoPayload(payload, importedDetails) {
  const details = normalizeImportedDetails(importedDetails);
  if (!payload?.snapshot || !details) return payload;
  const merged = JSON.parse(JSON.stringify(payload));
  const snapshot = merged.snapshot;
  snapshot.tracking = snapshot.tracking && typeof snapshot.tracking === "object"
    ? snapshot.tracking
    : {};
  snapshot.summary = snapshot.summary && typeof snapshot.summary === "object"
    ? snapshot.summary
    : {};
  snapshot.references = snapshot.references && typeof snapshot.references === "object"
    ? snapshot.references
    : {};
  snapshot.references.business =
    snapshot.references.business && typeof snapshot.references.business === "object"
      ? snapshot.references.business
      : {};
  snapshot.extraInformation = Array.isArray(snapshot.extraInformation)
    ? snapshot.extraInformation
    : [];

  const putIfMissing = (target, key, value) => {
    if (hasText(value) && !hasText(target[key])) target[key] = value;
  };
  const addExtra = (key, value) => {
    if (!hasText(value) || snapshot.extraInformation.some((item) => item?.key === key)) return;
    snapshot.extraInformation.push({ key, value, source: "SPREADSHEET" });
  };

  putIfMissing(snapshot.tracking, "carrierPrefix", details.carrierPrefix);
  putIfMissing(snapshot.tracking, "originalNumber", details.originalBillOfLading);
  putIfMissing(snapshot.references, "carrierPrefix", details.carrierPrefix);
  putIfMissing(snapshot.references, "originalBillOfLading", details.originalBillOfLading);
  putIfMissing(snapshot.references, "masterBill", details.originalBillOfLading);
  putIfMissing(snapshot.summary, "billOfLading", details.originalBillOfLading);
  addExtra("carrierPrefix", details.carrierPrefix);
  addExtra("originalBillOfLading", details.originalBillOfLading);

  for (const [key, value] of [
    ["forwarderJobNumber", details.forwarderJobNumber],
    ["clientPoNumber", details.clientPoNumber],
    ["clientNameCode", details.clientNameCode]
  ]) {
    if (!hasText(snapshot.references.business[key])) {
      putIfMissing(snapshot.references.business, key, value);
      addExtra(key, value);
    }
  }
  if (!hasArrayField(snapshot, ["routingLegs", "sailingSchedule"], ["vesselName", "voyage"])) {
    addExtra("vesselVoyage", details.vesselVoyage);
  }
  if (!hasText(snapshot.summary.origin?.name)) addExtra("portOfLoading", details.portOfLoading);
  if (!hasText(snapshot.summary.destination?.name)) {
    addExtra("portOfDischarge", details.portOfDischarge);
  }
  if (
    !hasText(snapshot.keyTimes?.actualDeparture?.time) &&
    !hasArrayField(snapshot, ["routingLegs"], ["estimatedDeparture", "actualDeparture"])
  ) {
    addExtra("estimatedDeparture", details.estimatedDeparture);
  }
  if (
    !hasText(snapshot.keyTimes?.estimatedDelivery?.time) &&
    !hasText(snapshot.keyTimes?.actualArrival?.time) &&
    !hasArrayField(snapshot, ["routingLegs"], ["estimatedArrival", "actualArrival"])
  ) {
    addExtra("estimatedArrival", details.estimatedArrival);
  }
  if (!containerTypeSummary(snapshot)) addExtra("volume", details.volume);
  return merged;
}

function renderExtraInformation(snapshot) {
  const entries = deduplicatedExtraInformation(snapshot);
  extraInformationSection.hidden = entries.length === 0;
  const fragment = document.createDocumentFragment();
  for (const entry of entries) {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = extraInformationLabel(entry.key);
    description.textContent = String(entry.value);
    row.append(term, description);
    fragment.append(row);
  }
  extraInformationList.replaceChildren(fragment);
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

function documentRecord(code, metadata = documentMetadataForSnapshot(currentPayload?.snapshot)) {
  const uploaded = relatedFilesItems.find((file) => file.category === code);
  if (!uploaded) return metadata?.[code] ?? null;
  const definition = documentDefinition(code);
  return {
    fileName: uploaded.originalFileName,
    fileSize: uploaded.sizeBytes,
    uploader: definition?.uploaders?.[0] ?? "forwarder",
    visibility: uploaded.visibility,
    updatedAt: uploaded.uploadedAt,
    relatedFile: uploaded
  };
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
  const existing = documentRecord(code, metadata);
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
  const session = readFileSession();
  const visibilityOptions = session.kind === "CUSTOMER"
    ? ["SHIPPER"]
    : ["SHIPPER", "CONSIGNEE", "OVERSEA_AGENT"];
  populateSelect(
    document.querySelector("#document-visibility-input"),
    visibilityOptions,
    documentVisibilityLabel,
    visibilityOptions.includes(existing?.visibility) ? existing.visibility : visibilityOptions[0]
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
  elements["document-drawer-shipment"].textContent = snapshot.tracking.number;
  documentList.replaceChildren();

  if (relatedFilesItems.length > 0) {
    const uploadedSection = document.createElement("section");
    uploadedSection.className = "document-uploaded-section";
    const uploadedHeading = document.createElement("div");
    uploadedHeading.className = "document-uploaded-heading";
    const uploadedTitle = document.createElement("strong");
    uploadedTitle.textContent = t("documents.uploadedTitle");
    const uploadedCount = document.createElement("span");
    uploadedCount.textContent = t("documents.uploadedCount", { count: relatedFilesItems.length });
    uploadedHeading.append(uploadedTitle, uploadedCount);
    const uploadedList = document.createElement("ul");
    uploadedList.className = "related-files-list document-uploaded-files";
    uploadedList.append(...relatedFilesItems.map((file) => createRelatedFileItem(file)));
    uploadedSection.append(uploadedHeading, uploadedList);
    documentList.append(uploadedSection);
  }

  for (const definition of DOCUMENT_TYPES) {
    const item = document.createElement("article");
    item.className = "document-item";
    const existing = documentRecord(definition.code, metadata);

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
      deleteButton.addEventListener("click", async () => {
        if (existing.relatedFile) {
          await deleteRelatedFile(existing.relatedFile);
          const nextMetadata = { ...documentMetadataForSnapshot(snapshot) };
          delete nextMetadata[definition.code];
          writeSupplementaryRecord(DOCUMENT_METADATA_PREFIX, snapshot, nextMetadata);
          renderDocumentDrawer(snapshot);
          return;
        }
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
  if (readFileSession().token && relatedFilesShipmentId) {
    void loadRelatedFiles().then(() => renderDocumentDrawer(currentPayload?.snapshot));
  }
  documentDrawerLayer.hidden = false;
  requestAnimationFrame(() => {
    documentDrawerLayer.classList.add("is-open");
    documentDrawer.setAttribute("aria-hidden", "false");
  });
}

function clearLegacyBrowserSnapshots() {
  try {
    for (const indexKey of ["shipment-track:v3:index", "shipment-track:v2:index"]) {
      const keys = JSON.parse(localStorage.getItem(indexKey) ?? "[]");
      if (Array.isArray(keys)) {
        for (const key of keys) {
          if (typeof key === "string" && key.startsWith("shipment-track:")) {
            localStorage.removeItem(key);
          }
        }
      }
      localStorage.removeItem(indexKey);
    }
    localStorage.removeItem("shipment-track:v3:migrated");
  } catch {
    // Browser snapshot cleanup is best-effort; database reads do not depend on it.
  }
}

function readHistory() {
  if (readFileSession().kind === "CUSTOMER") return uniqueHistoryEntries(customerAssignedHistory);
  if (readFileSession().kind === "INTERNAL") return uniqueHistoryEntries(internalTrackedHistory);
  return [];
}

async function loadCustomerAssignedHistory() {
  const session = readFileSession();
  if (session.kind !== "CUSTOMER" || !session.token) {
    customerAssignedHistory = [];
    historyScopeCustomer = null;
    historyAvailableCustomers = [];
    return;
  }
  historyLoadingState = true;
  renderHistory();
  try {
    const query = new URLSearchParams({
      page: String(historyPage),
      pageSize: String(historyPageSize),
      followingOnly: String(historyFollowingOnly && isOverseaAgentSession(session))
    });
    if (isOverseaAgentSession(session) && historyCustomerFilter) {
      query.set("customerId", historyCustomerFilter);
    }
    const response = await fetch(`/api/customer/shipments?${query}`, {
      headers: { "X-Customer-Token": session.token }
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      clearFileSession(session, { expired: true });
      customerAssignedHistory = [];
      resetHistoryPagination();
      renderHistory();
      return;
    }
    if (!response.ok) throw new Error(trackingResponseMessage(payload, response));
    const items = Array.isArray(payload?.items) ? payload.items : [];
    historyPage = Number(payload?.page || historyPage);
    historyPageSize = Number(payload?.pageSize || historyPageSize);
    historyTotal = Number(payload?.total || 0);
    historyTotalPages = Number(payload?.totalPages || 0);
    const agentManagement = payload?.overseaAgentManagement === true;
    historyScopeCustomer = agentManagement
      ? normalizeHistoryBoundCustomers([payload?.scopeCustomer])[0] || null
      : null;
    historyAvailableCustomers = agentManagement
      ? normalizeHistoryBoundCustomers(payload?.availableCustomers)
      : [];
    customerAssignedHistory = items
      .filter((item) => agentManagement
        ? Boolean(item?.referenceNo || item?.shipmentId)
        : Boolean(item?.dataAvailable && item?.snapshot))
      .map((item) => {
        const serverSnapshot = item?.snapshot && typeof item.snapshot === "object"
          ? item.snapshot
          : null;
        const carrier = String(
          item.carrier || serverSnapshot?.tracking?.carrier || "COSCO"
        ).toUpperCase();
        const referenceType = String(
          item.referenceType || serverSnapshot?.tracking?.type || "BILLOFLADING"
        ).toUpperCase();
        const referenceNo = String(
          item.referenceNo || serverSnapshot?.tracking?.number || ""
        ).trim();
        const lastTrackedAt = item.lastTrackedAt
          || serverSnapshot?.fetchedAt
          || new Date().toISOString();
        const trackingStatus = String(item.trackingStatus || "PENDING_UPDATE").trim();
        const snapshot = serverSnapshot || {
          tracking: {
            number: referenceNo,
            type: referenceType,
            carrier,
            status: trackingStatus
          },
          summary: {
            latestEvent: { name: trackingStatus, occurredAt: lastTrackedAt, location: "" },
            origin: {},
            destination: {}
          },
          route: [],
          keyTimes: {},
          routingLegs: [],
          containers: [],
          references: {
            business: {
              forwarderJobNumber: item.forwarderJobNumber || "",
              clientPoNumber: item.clientPoNumber || "",
              clientNameCode: item.clientNameCode || ""
            }
          }
        };
        snapshot.references ??= {};
        snapshot.references.business ??= {};
        snapshot.references.business.forwarderJobNumber =
          item.forwarderJobNumber ?? snapshot.references.business.forwarderJobNumber ?? "";
        snapshot.references.business.clientPoNumber =
          item.clientPoNumber ?? snapshot.references.business.clientPoNumber ?? "";
        snapshot.references.business.clientNameCode =
          item.clientNameCode ?? snapshot.references.business.clientNameCode ?? "";
        return {
          query: normalizeQuery({
            carrier,
            channel: "AUTO",
            type: referenceType,
            number: referenceNo
          }),
          snapshot,
          savedAt: lastTrackedAt,
          shipmentId: item.shipmentId,
          customerReadOnly: payload?.customerReadOnly !== false,
          trackingStatus,
          note: item.note || "",
          assignedAt: item.assignedAt || null,
          publicationStatus: item.publicationStatus || "",
          followed: item.followed === true,
          agentLastRefreshedAt: item.agentLastRefreshedAt || null,
          boundCustomers: normalizeHistoryBoundCustomers(item.boundCustomers)
        };
      });
    renderHistory();
    if (!agentManagement && items.some((item) => !item?.dataAvailable)) {
      showError(customerFacingTrackingError(), "warning");
    }
  } catch {
    customerAssignedHistory = [];
    historyAvailableCustomers = [];
    resetHistoryPagination();
    showError(customerFacingTrackingError(), "error");
  } finally {
    historyLoadingState = false;
    renderHistory();
  }
}

async function loadInternalTrackedHistory() {
  const session = readFileSession();
  historyScopeCustomer = null;
  if (session.kind !== "INTERNAL" || !session.token) {
    internalTrackedHistory = [];
    return;
  }
  historyLoadingState = true;
  renderHistory();
  try {
    const query = new URLSearchParams({
      page: String(historyPage),
      pageSize: String(historyPageSize)
    });
    const response = await fetch(`/api/business/shipments?${query}`, {
      headers: { "X-Auth-Token": session.token }
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      clearFileSession(session, { expired: true });
      internalTrackedHistory = [];
      resetHistoryPagination();
      renderHistory();
      return;
    }
    if (!response.ok) throw new Error(trackingResponseMessage(payload, response));
    const items = Array.isArray(payload?.items) ? payload.items : [];
    historyPage = Number(payload?.page || historyPage);
    historyPageSize = Number(payload?.pageSize || historyPageSize);
    historyTotal = Number(payload?.total || 0);
    historyTotalPages = Number(payload?.totalPages || 0);
    internalTrackedHistory = items
      .filter((item) => item?.referenceNo || item?.shipmentId)
      .map((item) => {
        const serverSnapshot = item?.snapshot && typeof item.snapshot === "object"
          ? item.snapshot
          : null;
        const carrier = String(
          item.carrier || serverSnapshot?.tracking?.carrier || serverSnapshot?.provider?.code || "COSCO"
        ).toUpperCase();
        const referenceType = String(
          item.referenceType || serverSnapshot?.tracking?.type || "BILLOFLADING"
        ).toUpperCase();
        const referenceNo = String(
          item.referenceNo || item.trackingNumber || serverSnapshot?.tracking?.number || ""
        ).trim();
        const trackingStatus = String(item.trackingStatus || "").trim();
        const lastTrackedAt = item.lastTrackedAt
          || item.updatedAt
          || serverSnapshot?.fetchedAt
          || item.createdAt
          || new Date().toISOString();
        const pendingStatus = trackingStatus || "PENDING_MANUAL";
        const snapshot = serverSnapshot
          ? {
              ...serverSnapshot,
              tracking: {
                ...serverSnapshot.tracking,
                number: serverSnapshot.tracking?.number || referenceNo,
                type: serverSnapshot.tracking?.type || referenceType,
                carrier: serverSnapshot.tracking?.carrier || carrier
              },
              summary: serverSnapshot.summary || {
                latestEvent: { name: pendingStatus, occurredAt: lastTrackedAt, location: "" },
                origin: {},
                destination: {}
              }
            }
          : {
              tracking: {
                number: referenceNo,
                type: referenceType,
                carrier,
                status: "PENDING_MANUAL"
              },
              summary: {
                latestEvent: { name: "PENDING_MANUAL", occurredAt: lastTrackedAt, location: "" },
                origin: {},
                destination: {}
              },
              route: [],
              keyTimes: {},
              routingLegs: [],
              containers: []
            };
        return {
          query: normalizeQuery({
            carrier,
            channel: "AUTO",
            type: referenceType,
            number: referenceNo
          }),
          snapshot,
          savedAt: lastTrackedAt,
          shipmentId: item.shipmentId,
          boundShipment: true,
          boundCustomers: normalizeHistoryBoundCustomers(item.boundCustomers)
        };
      });
    renderHistory();
  } catch {
    internalTrackedHistory = [];
    resetHistoryPagination();
  } finally {
    historyLoadingState = false;
    renderHistory();
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
      else if (item.status === "core") counts.core += 1;
      else if (item.status === "failed" || item.status === "partial") counts.failed += 1;
      else if (item.status === "manual") counts.manual += 1;
      else counts.pending += 1;
      return counts;
    },
    { success: 0, core: 0, failed: 0, manual: 0, pending: 0 }
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
        const carrier = ["COSCO", "CMA"].includes(item?.carrier) ? item.carrier : null;
        const number = String(item?.number ?? "")
          .trim()
          .replace(/\s+/g, "")
          .toUpperCase();
        if (!isRestorableBatchNumber(number)) return null;
        const manualOnly = item?.manualOnly === true || item?.status === "manual";
        const status = ["success", "failed", "manual"].includes(item?.status)
          ? item.status
          : manualOnly
            ? "manual"
            : "pending";
        return {
          id: `${carrier ?? "UNKNOWN"}:${type}:${number}:${index}`,
          carrier,
          type,
          number,
          displayNumber: String(item?.displayNumber ?? number).trim().slice(0, 64),
          importedDetails: normalizeImportedDetails(item?.importedDetails),
          status,
          source: status === "success"
            ? String(item?.source ?? "live")
            : status === "manual"
              ? "manual"
              : null,
          error: status === "failed" ? String(item?.error ?? "") : null,
          manualOnly,
          submitted: item?.submitted === true,
          shipmentId: item?.shipmentId ?? null,
          attempts: Number.isFinite(item?.attempts) ? item.attempts : 0,
          subtasks: normalizeBatchSubtasks(item?.subtasks),
          updatedAt: item?.updatedAt ?? null
        };
      })
      .filter(Boolean);

    if (items.length === 0) return null;
    const storedStatus = String(stored.status ?? "").toLowerCase();
    const hasActiveTask =
      Boolean(stored.taskId) && ["running", "stopping", "cooldown", "paused"].includes(storedStatus);
    return {
      version: BATCH_VERSION,
      fileName: String(stored.fileName ?? "Imported queue"),
      createdAt: stored.createdAt ?? new Date().toISOString(),
      updatedAt: stored.updatedAt ?? null,
      taskId: String(stored.taskId ?? "").trim() || null,
      status: hasActiveTask
        ? storedStatus
        : items.some((item) => item.status === "pending")
          ? storedStatus === "stopped" ? "stopped" : "paused"
          : "complete",
      items
    };
  } catch {
    return null;
  }
}

function setBatchImportNotice(key = null, variables = {}, variant = "info") {
  batchImportNotice = key ? { key, variables, variant } : null;
  if (!batchImportMessage) return;
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
    if (String(item.source ?? "").toUpperCase().startsWith("MYSQL")) {
      return "batch.itemDatabase";
    }
    return item.source === "device-cache" ? "batch.itemCached" : "batch.itemSuccess";
  }
  if (item.status === "failed") return "batch.itemFailed";
  if (item.status === "core") return "batch.itemCoreSaved";
  if (item.status === "partial") return "batch.itemPartial";
  if (item.status === "manual" || item.manualOnly) return "batch.itemManual";
  if (item.status === "running") return "batch.itemRunning";
  return "batch.itemPending";
}

function normalizeBatchSubtaskStatus(value) {
  const status = String(value ?? "").trim().toUpperCase();
  if (status === "SUCCEEDED" || status === "SUCCESS") return "success";
  if (status === "FAILED") return "failed";
  if (status === "RUNNING") return "running";
  if (status === "RETRY_WAIT") return "retry";
  return "pending";
}

function normalizeBatchSubtasks(values) {
  return (Array.isArray(values) ? values : []).map((subtask, index) => ({
    id: String(subtask?.id ?? `subtask-${index}`),
    type: String(subtask?.type ?? "CONTAINER"),
    number: String(subtask?.number ?? ""),
    status: normalizeBatchSubtaskStatus(subtask?.status),
    source: subtask?.source ? String(subtask.source) : null,
    error: subtask?.error ? String(subtask.error) : null,
    errorCode: subtask?.errorCode ? String(subtask.errorCode) : null,
    attempts: Number.isFinite(subtask?.attempts) ? subtask.attempts : 0,
    nextRetryAt: subtask?.nextRetryAt ?? null,
    updatedAt: subtask?.updatedAt ?? null
  }));
}

function batchSubtaskStatusLabel(subtask) {
  if (subtask.status === "success" && subtask.source === "CONTAINER_LIST"
      && subtask.attempts === 0) return t("batch.childSkipped");
  if (subtask.status === "retry") return t("batch.childRetry");
  if (subtask.status === "failed") return t("batch.itemFailed");
  if (subtask.status === "running") return t("batch.itemRunning");
  if (subtask.status === "success") return t("batch.itemSuccess");
  return t("batch.itemPending");
}

function renderBatchState() {
  if (!batchImportEmpty || !batchImportSummary) return;
  const items = batchState?.items ?? [];
  const hasQueue = items.length > 0;
  batchImportEmpty.hidden = hasQueue;
  batchImportSummary.hidden = !hasQueue;
  batchResumeButton.hidden =
    !hasQueue || batchRunning || Boolean(batchRunPromise) || !items.some(
      (item) => item.status === "pending" || (item.status === "manual" && !item.submitted)
    );
  batchStopButton.hidden = !hasQueue || !batchRunning;
  batchStopButton.disabled = batchStopRequested;
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
  const processed = counts.success + counts.failed + counts.manual;
  const progress = Math.round((processed / items.length) * 100);
  const runningIndex = items.findIndex((item) => item.status === "running");
  batchFileName.textContent = batchState.fileName;
  batchProgressLabel.textContent = `${processed} / ${items.length}`;
  batchProgressTrack.setAttribute("aria-valuemax", String(items.length));
  batchProgressTrack.setAttribute("aria-valuenow", String(processed));
  batchProgressTrack.style.setProperty("--batch-progress", `${progress}%`);
  batchSuccessCount.textContent = String(counts.success);
  if (batchCoreCount) batchCoreCount.textContent = String(counts.core);
  batchFailedCount.textContent = String(counts.failed);
  if (batchManualCount) batchManualCount.textContent = String(counts.manual);
  batchPendingCount.textContent = String(counts.pending);

  if (batchStopRequested) {
    batchStatusText.textContent = t("batch.stopping");
  } else if (runningIndex >= 0) {
    batchStatusText.textContent = t("batch.running", {
      current: runningIndex + 1,
      total: items.length,
      number: items[runningIndex].displayNumber ?? items[runningIndex].number
    });
  } else if (counts.pending === 0) {
    batchStatusText.textContent = t("batch.completed", counts);
  } else if (batchState.status === "ready") {
    batchStatusText.textContent = t("batch.ready", { count: items.length });
  } else if (batchState.status === "stopped") {
    batchStatusText.textContent = t("batch.stopped");
  } else {
    batchStatusText.textContent = t("batch.restored");
  }

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const group = document.createElement("article");
    group.className = `batch-result-group is-${item.status}`;
    const row = document.createElement("button");
    row.type = "button";
    row.className = `batch-result-item is-${item.status}`;
    row.disabled =
      !item.carrier ||
      item.manualOnly ||
      !["success", "core", "partial"].includes(item.status);
    row.setAttribute(
      "aria-label",
      t("batch.openItem", {
        type: trackingTypeLabel(item.type),
        number: item.displayNumber ?? item.number
      })
    );
    const identity = document.createElement("span");
    const type = document.createElement("small");
    type.textContent = trackingTypeLabel(item.type);
    const number = document.createElement("strong");
    number.textContent = item.displayNumber ?? item.number;
    identity.append(type, number);
    const subtasks = normalizeBatchSubtasks(item.subtasks);
    if (subtasks.length > 0) {
      const childProgress = document.createElement("em");
      const done = subtasks.filter((subtask) =>
        ["success", "failed"].includes(subtask.status)
      ).length;
      childProgress.textContent = t("batch.childProgress", {
        done,
        total: subtasks.length
      });
      identity.append(childProgress);
    }
    const status = document.createElement("span");
    const statusDot = document.createElement("i");
    statusDot.setAttribute("aria-hidden", "true");
    const statusCopy = document.createElement("b");
    statusCopy.textContent = t(batchStatusKey(item));
    status.append(statusDot, statusCopy);
    if (item.error) {
      status.title = canManageFileVisibility(readFileSession())
        ? item.error
        : customerFacingTrackingError();
    }
    row.append(identity, status);
    row.addEventListener("click", () => void openBatchItem(item));
    group.append(row);
    if (item.error) {
      const issue = document.createElement("p");
      issue.className = "batch-result-error";
      issue.textContent = t("batch.childError", {
        message: canManageFileVisibility(readFileSession())
          ? item.error
          : customerFacingTrackingError()
      });
      group.append(issue);
    }
    if (subtasks.length > 0) {
      const childDetails = document.createElement("details");
      childDetails.className = "batch-subtask-details";
      childDetails.open = subtasks.some((subtask) =>
        ["running", "retry", "failed"].includes(subtask.status)
      );
      const childSummary = document.createElement("summary");
      const done = subtasks.filter((subtask) =>
        ["success", "failed"].includes(subtask.status)
      ).length;
      childSummary.textContent = t("batch.childProgress", {
        done,
        total: subtasks.length
      });
      const childList = document.createElement("div");
      childList.className = "batch-subtask-list";
      childList.setAttribute("role", "list");
      for (const subtask of subtasks) {
        const child = document.createElement("div");
        child.className = `batch-subtask-item is-${subtask.status}`;
        child.setAttribute("role", "listitem");
        const childCopy = document.createElement("span");
        const childName = document.createElement("strong");
        childName.textContent = subtask.type === "CONTAINER_LIST"
          ? t("batch.childContainerList")
          : t("batch.childContainer", { number: subtask.number });
        const childMeta = document.createElement("small");
        childMeta.textContent = [
          subtask.error
            ? t("batch.childError", { message: subtask.error })
            : null,
          subtask.attempts > 0
            ? t("batch.childAttempts", { count: subtask.attempts })
            : null,
          subtask.nextRetryAt
            ? t("batch.childRetryAt", { time: formatLocalDateTime(subtask.nextRetryAt) })
            : null
        ].filter(Boolean).join(" · ");
        childMeta.hidden = !childMeta.textContent;
        childCopy.append(childName, childMeta);
        const childStatus = document.createElement("b");
        childStatus.textContent = batchSubtaskStatusLabel(subtask);
        if (subtask.error) childStatus.title = subtask.error;
        child.append(childCopy, childStatus);
        childList.append(child);
      }
      childDetails.append(childSummary, childList);
      group.append(childDetails);
    }
    fragment.append(group);
  }
  batchResultList.replaceChildren(fragment);
}

async function parseBatchFile(file, selection = null) {
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
          resolve(event.data);
          return;
        }
        const code = event.data?.error?.code;
        const message =
          code === "no_columns"
            ? t("batch.noRecognizedColumns")
            : code === "no_rows"
              ? t("batch.noRows")
              : code === "invalid_selection"
                ? t("batch.previewRequired")
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
    worker.postMessage({
      file,
      limit: BATCH_IMPORT_LIMIT,
      ...(selection ? { selection } : {})
    });
  });
}

function spreadsheetColumnName(index) {
  let value = Number(index) + 1;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name || "?";
}

function activeBatchPreviewSheet() {
  return batchPreviewSheets.find((sheet) => sheet.name === batchPreviewSheet.value)
    ?? batchPreviewSheets[0]
    ?? null;
}

function renderBatchPreviewTable(sheet = activeBatchPreviewSheet()) {
  if (!sheet) {
    batchPreviewTableHead.replaceChildren();
    batchPreviewTableBody.replaceChildren();
    return;
  }
  const selectedColumnIndex = Number(batchPreviewColumn.value);
  const heading = document.createElement("tr");
  const rowNumberHeading = document.createElement("th");
  rowNumberHeading.textContent = "#";
  heading.append(rowNumberHeading);
  for (const column of sheet.columns ?? []) {
    const cell = document.createElement("th");
    cell.textContent = `${spreadsheetColumnName(column.index)} · ${column.label}`;
    cell.classList.toggle("is-selected", column.index === selectedColumnIndex);
    heading.append(cell);
  }
  batchPreviewTableHead.replaceChildren(heading);

  const rows = (sheet.previewRows ?? []).map((previewRow) => {
    const row = document.createElement("tr");
    const rowNumber = document.createElement("th");
    rowNumber.scope = "row";
    rowNumber.textContent = String(Number(previewRow.rowIndex) + 1);
    row.append(rowNumber);
    for (const column of sheet.columns ?? []) {
      const cell = document.createElement("td");
      cell.textContent = String(previewRow.values?.[column.index] ?? "");
      cell.classList.toggle("is-selected", column.index === selectedColumnIndex);
      row.append(cell);
    }
    return row;
  });
  batchPreviewTableBody.replaceChildren(...rows);
}

function renderBatchPreviewColumns(sheet = activeBatchPreviewSheet()) {
  if (!sheet) return;
  const options = (sheet.columns ?? []).map((column) => {
    const option = document.createElement("option");
    option.value = String(column.index);
    const recommended = column.index === sheet.suggestedColumnIndex
      ? ` · ${t("batch.previewRecommended")}`
      : "";
    option.textContent = `${spreadsheetColumnName(column.index)} · ${column.label}${recommended}`;
    option.dataset.suggestedType = column.suggestedType ?? column.type ?? "BILLOFLADING";
    return option;
  });
  batchPreviewColumn.replaceChildren(...options);
  const suggested = Number(sheet.suggestedColumnIndex);
  batchPreviewColumn.value = Number.isInteger(suggested) && suggested >= 0
    ? String(suggested)
    : options[0]?.value ?? "";
  const selectedOption = batchPreviewColumn.selectedOptions[0];
  batchPreviewType.value = selectedOption?.dataset.suggestedType === "BOOKING"
    ? "BOOKING"
    : "BILLOFLADING";
  batchPreviewConfirm.disabled = !batchPreviewColumn.value;
  renderBatchPreviewTable(sheet);
}

function openBatchWorkspace() {
  if (!batchWorkspaceDialog || batchWorkspaceDialog.open) return;
  renderBatchState();
  batchWorkspaceDialog.showModal();
  requestAnimationFrame(() => {
    const focusTarget = batchState?.items?.length
      ? batchResultList?.querySelector("button:not(:disabled), summary") ?? batchWorkspaceClose
      : batchSelectButton;
    focusTarget?.focus({ preventScroll: true });
  });
}

function closeBatchWorkspace() {
  if (batchWorkspaceDialog?.open) batchWorkspaceDialog.close();
}

function showBatchColumnPreview(file, preview) {
  openBatchWorkspace();
  pendingBatchFile = file;
  batchPreviewSheets = Array.isArray(preview?.sheets) ? preview.sheets : [];
  batchPreviewFileName.textContent = file.name;
  const sheetOptions = batchPreviewSheets.map((sheet) => {
    const option = document.createElement("option");
    option.value = sheet.name;
    option.textContent = sheet.name;
    return option;
  });
  batchPreviewSheet.replaceChildren(...sheetOptions);
  batchPreviewSheet.value = batchPreviewSheets.some(
    (sheet) => sheet.name === preview?.suggestedSheetName
  )
    ? preview.suggestedSheetName
    : sheetOptions[0]?.value ?? "";
  renderBatchPreviewColumns();
  batchWorkspaceDialog?.classList.add("is-previewing");
  batchColumnPreview.hidden = false;
}

function hideBatchColumnPreview({ clearFile = true } = {}) {
  batchColumnPreview.hidden = true;
  batchWorkspaceDialog?.classList.remove("is-previewing");
  batchPreviewSheets = [];
  batchPreviewSheet.replaceChildren();
  batchPreviewColumn.replaceChildren();
  batchPreviewTableHead.replaceChildren();
  batchPreviewTableBody.replaceChildren();
  if (clearFile) pendingBatchFile = null;
}

function startImportedBatch(fileName, imported) {
  const items = Array.isArray(imported?.items) ? imported.items : [];
  batchState = {
    version: BATCH_VERSION,
    fileName,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    status: "ready",
    taskId: null,
    items
  };
  if (Number(imported?.found) > BATCH_IMPORT_LIMIT) {
    setBatchImportNotice(
      "batch.limit",
      { found: Number(imported.found), limit: BATCH_IMPORT_LIMIT },
      "warning"
    );
  } else {
    setBatchImportNotice();
  }
  persistBatchState();
  renderBatchState();
  void runBatchQueue();
}

function batchAbortError() {
  return new DOMException("Batch tracking task was cancelled", "AbortError");
}

function throwIfBatchAborted(signal) {
  if (signal?.aborted) throw batchAbortError();
}

function yieldToBrowser(delay = 80, signal) {
  throwIfBatchAborted(signal);
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delay);
    const onAbort = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(batchAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
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

async function waitForBatchRequestWindow(signal) {
  const elapsed = Date.now() - lastBatchRequestAt;
  const remaining = BATCH_REQUEST_INTERVAL_MS - elapsed;
  if (lastBatchRequestAt > 0 && remaining > 0) await yieldToBrowser(remaining, signal);
  throwIfBatchAborted(signal);
  lastBatchRequestAt = Date.now();
}

async function requestBatchTracking(query, { signal, taskId } = {}) {
  let result = null;
  for (let attempt = 0; attempt <= BATCH_RETRY_LIMIT; attempt += 1) {
    await waitForBatchRequestWindow(signal);
    result = await requestTracking(query, { signal, batchTaskId: taskId });
    if (
      !BATCH_RETRYABLE_STATUSES.has(result.response.status) ||
      attempt >= BATCH_RETRY_LIMIT
    ) {
      return result;
    }

    const retryDelay =
      retryAfterDelay(result.response) ?? BATCH_RETRY_BASE_MS * 2 ** attempt;
    await yieldToBrowser(retryDelay, signal);
  }
  return result;
}

function createBatchTaskId() {
  const random = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
  return `batch_${random}`;
}

async function cancelBatchTask(taskId) {
  if (!taskId) return null;
  const encodedTaskId = encodeURIComponent(taskId);
  const session = readFileSession();
  const response = await fetch(`/api/business/shipment-batch-tasks/${encodedTaskId}/cancel`, {
    method: "POST",
    headers: fileAuthHeaders(session)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(relatedFilesApiMessage(payload, response));
  }
  return payload;
}

async function requestBusinessBatchTask(path, options = {}) {
  const session = readFileSession();
  if (session.kind !== "INTERNAL" || !session.token) {
    throw new Error(t("batch.requiresBusiness"));
  }
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...fileAuthHeaders(session)
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) clearFileSession(session, { expired: true });
  if (!response.ok) {
    const error = new Error(relatedFilesApiMessage(payload, response));
    error.status = response.status;
    throw error;
  }
  return payload;
}

function batchItemStatusFromServer(value) {
  const status = String(value ?? "").trim().toUpperCase();
  if (status === "SUCCEEDED") return "success";
  if (status === "FAILED") return "failed";
  if (status === "PARTIAL") return "partial";
  if (status === "MANUAL") return "manual";
  if (status === "CORE_SUCCEEDED") return "core";
  if (["RUNNING", "ENRICHING"].includes(status)) return "running";
  return "pending";
}

function applyBusinessBatchTask(snapshot) {
  if (!batchState || !snapshot || typeof snapshot !== "object") return false;
  const remoteItems = new Map(
    (Array.isArray(snapshot.items) ? snapshot.items : [])
      .map((item) => [String(item?.id ?? ""), item])
      .filter(([id]) => id)
  );
  batchState.items = batchState.items.map((item) => {
    const remote = remoteItems.get(String(item.id));
    if (!remote) return item;
    const manualOnly = remote.manualOnly === true || item.manualOnly === true;
    const status = batchItemStatusFromServer(remote.status);
    return {
      ...item,
      carrier: remote.carrier ?? item.carrier,
      number: String(remote.number ?? item.number),
      displayNumber: String(remote.displayNumber ?? item.displayNumber ?? item.number),
      importedDetails: normalizeImportedDetails(remote.importedDetails ?? item.importedDetails),
      manualOnly,
      submitted: true,
      status,
      source: status === "manual" ? "manual" : remote.source ?? item.source ?? null,
      error: status === "failed" ? String(remote.error ?? t("error.generic")) : null,
      attempts: Number.isFinite(remote.attempts) ? remote.attempts : item.attempts,
      shipmentId: remote.shipmentId ?? item.shipmentId ?? null,
      subtasks: normalizeBatchSubtasks(remote.subtasks ?? item.subtasks),
      updatedAt: remote.updatedAt ?? item.updatedAt ?? null
    };
  });

  const taskStatus = String(snapshot.status ?? "").trim().toUpperCase();
  const active = ["QUEUED", "RUNNING", "COOLDOWN", "STOPPING"].includes(taskStatus);
  batchState.taskId = String(snapshot.taskId ?? batchState.taskId ?? "").trim() || null;
  batchState.status = taskStatus === "COMPLETED"
    ? "complete"
    : taskStatus === "STOPPED"
      ? "stopped"
      : taskStatus === "STOPPING"
        ? "stopping"
        : active
          ? "running"
          : "paused";
  batchTaskId = batchState.taskId;
  batchRunning = active;
  batchStopRequested = taskStatus === "STOPPING";
  persistBatchState();
  renderBatchState();
  return active;
}

function recoverMissingBusinessBatchTask() {
  if (!batchState) return;
  batchState.taskId = null;
  batchTaskId = null;
  batchState.items = batchState.items.map((item) =>
    ["pending", "running"].includes(item.status)
      ? {
          ...item,
          status: "pending",
          submitted: false,
          source: null,
          error: null
        }
      : item
  );
}

function batchItemForQuery(query) {
  if (!batchState?.items?.length) return null;
  const normalized = normalizeQuery(query);
  return batchState.items.find(
    (item) =>
      item.carrier === normalized.carrier &&
      item.type === normalized.type &&
      item.number === normalized.number
  ) ?? null;
}

function queryForBatchItem(item) {
  return normalizeQuery({
    carrier: item.carrier,
    channel: "AUTO",
    type: item.type,
    number: item.number,
    importedDetails: canManageFileVisibility(readFileSession())
      ? item.importedDetails
      : null
  });
}

function runBatchQueue() {
  if (batchRunPromise) return batchRunPromise;
  const currentRun = executeBatchQueue();
  batchRunPromise = currentRun;
  void currentRun.finally(() => {
    if (batchRunPromise !== currentRun) return;
    batchRunPromise = null;
    renderBatchState();
  });
  return currentRun;
}

async function executeBatchQueue() {
  const hasUnsubmittedWork = batchState?.items?.some(
    (item) => item.status === "pending" || (item.status === "manual" && !item.submitted)
  );
  const canReconnectTask = Boolean(batchState?.taskId) &&
    ["running", "stopping", "cooldown", "paused"].includes(batchState?.status);
  if (batchRunning || (!hasUnsubmittedWork && !canReconnectTask)) return;

  const previousBatchStatus = batchState.status;
  batchRunning = true;
  batchAbortController = new AbortController();
  batchStopRequested = false;
  const signal = batchAbortController.signal;
  batchState.status = "running";
  persistBatchState();
  renderBatchState();

  try {
    const reconnectExistingTask =
      Boolean(batchState.taskId) &&
      ["running", "stopping", "cooldown", "paused"].includes(previousBatchStatus);
    let snapshot;
    if (reconnectExistingTask) {
      snapshot = await requestBusinessBatchTask(
        `/api/business/shipment-batch-tasks/${encodeURIComponent(batchState.taskId)}`,
        { signal }
      );
    } else {
      const submittedItems = batchState.items.filter(
        (item) => item.status === "pending" || (item.status === "manual" && !item.submitted)
      );
      snapshot = await requestBusinessBatchTask("/api/business/shipment-batch-tasks", {
        method: "POST",
        body: {
          sourceFileName: batchState.fileName,
          items: submittedItems.map((item) => ({
            id: item.id,
            carrier: item.carrier,
            type: item.type,
            number: item.number,
            displayNumber: item.displayNumber ?? item.number,
            manualOnly: item.manualOnly === true || item.status === "manual",
            importedDetails: item.importedDetails ?? null
          }))
        },
        signal
      });
      const submittedIds = new Set(submittedItems.map((item) => String(item.id)));
      for (const item of batchState.items) {
        if (submittedIds.has(String(item.id))) item.submitted = true;
      }
    }

    if (batchStopRequested) {
      const submittedTaskId = String(snapshot?.taskId ?? "").trim();
      if (submittedTaskId) snapshot = await cancelBatchTask(submittedTaskId);
    }

    while (applyBusinessBatchTask(snapshot)) {
      await yieldToBrowser(BATCH_TASK_POLL_INTERVAL_MS, signal);
      snapshot = await requestBusinessBatchTask(
        `/api/business/shipment-batch-tasks/${encodeURIComponent(batchTaskId)}`,
        { signal }
      );
    }
    if (batchState?.status === "complete") {
      await loadInternalTrackedHistory();
    }
  } catch (error) {
    if (batchState) {
      if (error?.status === 404 && batchState.taskId) {
        recoverMissingBusinessBatchTask();
      }
      batchState.status = signal.aborted && batchStopRequested ? "stopped" : "paused";
      setBatchImportNotice(
        "batch.backgroundFailed",
        { message: error?.message || t("error.generic") },
        "error"
      );
    }
  } finally {
    batchRunning = false;
    batchAbortController = null;
    batchTaskId = batchState?.taskId ?? null;
    batchStopRequested = false;
    if (batchState) {
      persistBatchState();
      renderBatchState();
    }
    renderHistory();
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

function uniqueTextValues(...sources) {
  const values = [];
  const seen = new Set();
  for (const source of sources) {
    const items = Array.isArray(source) ? source : hasText(source) ? [source] : [];
    for (const item of items) {
      if (!hasText(item)) continue;
      const value = String(item).trim();
      const identity = value.replace(/[^a-z0-9]/gi, "").toUpperCase();
      if (!identity || seen.has(identity)) continue;
      seen.add(identity);
      values.push(value);
    }
  }
  return values;
}

function bookingNumbersForSnapshot(snapshot) {
  return uniqueTextValues(
    snapshot?.summary?.bookingNumbers,
    snapshot?.references?.bookingNumbers
  );
}

function renderReferences(snapshot) {
  const references = snapshot?.references ?? {};
  const masterBill = hasText(references.masterBill) ? String(references.masterBill).trim() : "";
  const identityValues = uniqueTextValues(
    snapshot?.tracking?.originalNumber,
    snapshot?.summary?.billOfLading,
    references.originalBillOfLading,
    snapshot?.tracking?.number
  ).map((value) => value.replace(/[^a-z0-9]/gi, "").toUpperCase());
  const masterIdentity = masterBill.replace(/[^a-z0-9]/gi, "").toUpperCase();
  const showMasterBill = Boolean(masterBill) && !identityValues.includes(masterIdentity);
  elements["master-bill"].textContent = masterBill || "—";
  elements["master-bill-reference"].hidden = !showMasterBill;

  const bookingNumbers = bookingNumbersForSnapshot(snapshot);
  elements["booking-numbers"].textContent = bookingNumbers.join(", ") || "—";
  elements["booking-number-reference"].hidden = true;

  const externalReferences = uniqueTextValues(references.external);
  const showExternalReferences = externalReferences.length > 0;
  elements["external-references"].className = "";
  elements["external-references"].textContent = externalReferences.join(", ") || "—";
  elements["external-reference"].hidden = !showExternalReferences;
  elements["reference-core"].hidden = !showMasterBill && !showExternalReferences;

  const list = elements["reference-information"];
  list.replaceChildren();
  const internalReferencePattern = /(?:b\/?l\s*type|bill\s*of\s*lading\s*type|surrender(?:ed)?\s*status)/i;
  const safeInformation = (references.information ?? []).filter((item) =>
    item?.name && item?.value && !internalReferencePattern.test(String(item.name))
  );
  const visibleByName = new Map();
  for (const item of safeInformation) {
    const key = String(item.name).trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
    if (key) visibleByName.set(key, item);
  }
  const visible = [...visibleByName.values()].sort(
    (left, right) => Number(left.sequence ?? 999) - Number(right.sequence ?? 999)
  );

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
  list.hidden = visible.length === 0;
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
    const showMilestoneDetails = readFileSession().kind !== "CUSTOMER" || (container.milestones ?? []).length > 0;
    if (showMilestoneDetails) actionCell.append(detailsButton);
    else actionCell.textContent = "—";
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
    if (showMilestoneDetails) body.append(row, detailRow);
    else body.append(row);
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

function metricTimeValue(record) {
  if (!record) return "";
  if (typeof record === "object") return record.actualTime ?? record.time ?? "";
  return record;
}

function firstTimedRecord(...records) {
  return records.find((record) => hasText(metricTimeValue(record))) ?? null;
}

function renderTimeMetric({ cardId, labelId, valueId, locationId, record, labelKey }) {
  const time = metricTimeValue(record);
  const visible = hasText(time);
  elements[cardId].hidden = !visible;
  if (labelId) {
    elements[labelId].dataset.i18n = labelKey;
    elements[labelId].textContent = t(labelKey);
  }
  elements[valueId].textContent = visible
    ? formatDateTime(time, record?.timezone)
    : "—";
  const location = typeof record === "object" ? record?.location : "";
  elements[locationId].textContent = hasText(location) ? String(location).trim() : "";
  elements[locationId].hidden = !hasText(location);
  return visible;
}

function metricRecordsMatch(left, right) {
  const leftTime = String(metricTimeValue(left) ?? "").trim().toUpperCase();
  const rightTime = String(metricTimeValue(right) ?? "").trim().toUpperCase();
  if (!leftTime || leftTime !== rightTime) return false;
  const leftLocation = String(left?.location ?? "").trim().toUpperCase();
  const rightLocation = String(right?.location ?? "").trim().toUpperCase();
  return !leftLocation || !rightLocation || leftLocation === rightLocation;
}

function shouldLoadSupplementalDetails(payload) {
  const snapshot = payload?.snapshot;
  const session = readFileSession();
  if (!snapshot || session.kind !== "INTERNAL" || !session.token || !payload.shipmentId) {
    return false;
  }
  const carrier = String(snapshot.provider?.code ?? snapshot.tracking?.carrier ?? "").toUpperCase();
  const type = String(snapshot.tracking?.type ?? "").toUpperCase();
  if (carrier !== "COSCO" || type === "CONTAINER" || snapshot.viewMode === "CONTAINER") {
    return false;
  }
  if (snapshot.supplementalDetails?.updatedAt && !snapshot.supplementalDetails.partial) {
    return false;
  }
  const containersMissing = !Array.isArray(snapshot.containers) || snapshot.containers.length === 0;
  const referencesMissing = !Array.isArray(snapshot.references?.information)
    || snapshot.references.information.length === 0;
  return containersMissing || referencesMissing;
}

function setSupplementalDetailsStatus(state = "idle") {
  window.clearTimeout(supplementalStatusTimer);
  elements["supplemental-details-status"].dataset.state = state;
  elements["supplemental-details-status"].hidden = state === "idle";
  if (state !== "idle") {
    elements["supplemental-details-message"].textContent = t(`supplemental.${state}`);
  }
  if (["complete", "partial"].includes(state)) {
    supplementalStatusTimer = window.setTimeout(
      () => setSupplementalDetailsStatus("idle"),
      3_200
    );
  }
}

async function loadSupplementalDetails(payload) {
  if (!shouldLoadSupplementalDetails(payload)) return;
  const shipmentId = String(payload.shipmentId);
  const key = `${shipmentId}:${trackingQueryKey(normalizeQuery({
    carrier: payload.snapshot.provider?.code ?? "COSCO",
    channel: "NETWORK",
    type: payload.snapshot.tracking?.type,
    number: payload.snapshot.tracking?.number
  }))}`;
  if (supplementalDetailRequests.has(key)) return supplementalDetailRequests.get(key);

  const requestPayload = payload;
  const session = readFileSession();
  setSupplementalDetailsStatus("loading");
  elements["container-panel"].hidden = false;
  elements["secondary-grid"].hidden = false;
  const promise = (async () => {
    try {
      const response = await fetch(
        `/api/public/shipments/${encodeURIComponent(shipmentId)}/supplemental-details`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...fileAuthHeaders(session)
          },
          body: JSON.stringify({
            carrier: "COSCO",
            channel: "NETWORK",
            type: requestPayload.snapshot.tracking?.type,
            number: requestPayload.snapshot.tracking?.number
          })
        }
      );
      const details = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(trackingResponseMessage(details, response));
      }
      if (!details?.snapshot) throw new Error("Supplemental snapshot is missing");
      if (String(currentPayload?.shipmentId ?? "") !== shipmentId) return;

      currentPayload = {
        ...requestPayload,
        ...details,
        snapshot: details.snapshot,
        raw: requestPayload.raw ?? null
      };
      renderResult(currentPayload);
      setSupplementalDetailsStatus(details.partial ? "partial" : "complete");
      await loadInternalTrackedHistory();
    } catch {
      if (String(currentPayload?.shipmentId ?? "") !== shipmentId) return;
      setSupplementalDetailsStatus("failed");
      // Empty container details are still a meaningful result. Keep the
      // transport table and its fixed columns visible when the optional child
      // query fails so the page can render its explicit empty-state row.
      elements["container-panel"].hidden = false;
      elements["secondary-grid"].hidden = false;
      elements["secondary-grid"].classList.add("is-single-panel");
    } finally {
      supplementalDetailRequests.delete(key);
    }
  })();
  supplementalDetailRequests.set(key, promise);
  return promise;
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
  elements["result-number"].textContent = valueOrDash(
    snapshot.tracking.originalNumber ?? summary.billOfLading ?? snapshot.tracking.number
  );
  renderPrimaryFacts(snapshot);

  const bookingNumbers = bookingNumbersForSnapshot(snapshot);
  elements["summary-booking-number"].textContent =
    bookingNumbers.length > 0 ? bookingNumbers.join(", ") : "—";
  elements["summary-booking-reference"].hidden = bookingNumbers.length === 0;
  elements["summary-origin-name"].textContent = valueOrDash(
    [summary.origin?.name, summary.origin?.countryCode].filter(Boolean).join(", ")
  );
  elements["summary-destination-name"].textContent = valueOrDash(
    [summary.destination?.name, summary.destination?.countryCode].filter(Boolean).join(", ")
  );
  const summaryLatestDetail = [
    latest?.location,
    formatDateTime(latest?.occurredAt)
  ]
    .filter((value) => value && value !== "—")
    .join(" · ");
  elements["summary-latest-detail"].textContent = summaryLatestDetail;
  elements["summary-latest-detail"].hidden = !summaryLatestDetail;

  const transportModes = new Set(
    (snapshot.routingLegs ?? [])
      .map((leg) => String(leg?.mode ?? "").trim().toUpperCase())
      .filter(Boolean)
  );
  const serviceScopes = (summary.serviceScopes ?? []).map((scope) =>
    String(scope).trim().toLowerCase()
  );
  const enabledServices = {
    sea: transportModes.has("SEA") || serviceScopes.some((scope) => scope.includes("ocean")),
    inland:
      ["TRUCK", "RAIL", "ROAD", "INLAND"].some((mode) => transportModes.has(mode)) ||
      serviceScopes.some((scope) => scope.includes("truck") || scope.includes("inland")),
    customs: serviceScopes.some((scope) => scope.includes("custom")),
    warehouse: serviceScopes.some((scope) => scope.includes("warehouse") || scope.includes("storage"))
  };
  setSummaryService(elements["summary-service-sea"], enabledServices.sea);
  setSummaryService(elements["summary-service-inland"], enabledServices.inland);
  setSummaryService(elements["summary-service-customs"], enabledServices.customs);
  setSummaryService(elements["summary-service-warehouse"], enabledServices.warehouse);
  elements["summary-services"].hidden = !Object.values(enabledServices).some(Boolean);

  const source = payload.databaseStored ? "database" : payload.cached ? "server" : "live";
  elements["cache-status"].dataset.source = source;
  elements["cache-status"].textContent = t(`cache.${source}`);
  elements["cache-status"].title = payload.databaseStoredAt
    ? t("cache.savedAt", { time: formatLocalDateTime(payload.databaseStoredAt) })
    : "";
  elements["fetched-at"].textContent = formatLocalDateTime(snapshot.fetchedAt);

  const departureRecord = firstTimedRecord(
    keyTimes.actualDeparture,
    keyTimes.estimatedDeparture
  );
  const arrivalRecord = firstTimedRecord(
    keyTimes.actualArrival,
    keyTimes.estimatedFinalArrival,
    keyTimes.estimatedArrival
  );
  const deliveryRecord = firstTimedRecord(keyTimes.estimatedDelivery);
  const visibleMetrics = [];
  visibleMetrics.push(renderTimeMetric({
    cardId: "departure-metric-card",
    labelId: "departure-metric-label",
    valueId: "actual-departure",
    locationId: "actual-departure-location",
    record: departureRecord,
    labelKey: departureRecord === keyTimes.actualDeparture
      ? "metrics.actualDeparture"
      : "metrics.estimatedDeparture"
  }));
  visibleMetrics.push(renderTimeMetric({
    cardId: "arrival-metric-card",
    labelId: "arrival-metric-label",
    valueId: "actual-arrival",
    locationId: "actual-arrival-location",
    record: arrivalRecord,
    labelKey: arrivalRecord === keyTimes.actualArrival
      ? "metrics.actualArrival"
      : "metrics.estimatedArrival"
  }));
  const showDelivery = Boolean(deliveryRecord) && !metricRecordsMatch(deliveryRecord, arrivalRecord);
  visibleMetrics.push(renderTimeMetric({
    cardId: "delivery-metric-card",
    labelId: null,
    valueId: "estimated-delivery",
    locationId: "estimated-delivery-location",
    record: showDelivery ? deliveryRecord : null,
    labelKey: "metrics.estimatedDelivery"
  }));
  const hasLatestEvent = [latest?.name, latest?.location, latest?.occurredAt, latest?.transportMode]
    .some(hasText);
  elements["latest-metric-card"].hidden = !hasLatestEvent;
  elements["latest-event"].textContent = hasText(latest?.name) ? String(latest.name) : "—";
  elements["latest-event-detail"].textContent = [
    latest?.location,
    formatDateTime(latest?.occurredAt),
    latest?.transportMode
  ]
    .filter((item) => item && item !== "—")
    .join(" · ");
  elements["latest-event-detail"].hidden = !elements["latest-event-detail"].textContent;
  visibleMetrics.push(hasLatestEvent);
  elements["metric-grid"].hidden = !visibleMetrics.some(Boolean);

  setCountryFlag(elements["origin-flag"], summary.origin?.countryCode);
  elements["origin-name"].textContent = valueOrDash(summary.origin?.name);
  elements["origin-code"].textContent = valueOrDash(summary.origin?.countryCode);
  setCountryFlag(elements["destination-flag"], summary.destination?.countryCode);
  elements["destination-name"].textContent = valueOrDash(summary.destination?.name);
  elements["destination-code"].textContent = valueOrDash(summary.destination?.countryCode);

  const route = selectDisplayRouteNodes(snapshot.route ?? []);
  const routingLegs = snapshot.routingLegs ?? [];
  const containers = snapshot.containers ?? [];
  elements["route-panel"].hidden = route.length === 0;
  elements["routing-panel"].hidden = routingLegs.length === 0;
  elements["container-panel"].hidden = false;
  elements["secondary-grid"].classList.toggle("is-single-panel", containers.length === 0);
  elements["secondary-grid"].hidden = false;

  renderRoute(route, snapshot);
  renderJourney(snapshot);
  renderRoutingLegs(routingLegs);
  renderReferences(snapshot);
  renderBusinessReferences(snapshot);
  renderExtraInformation(snapshot);
  renderContainers(containers);
  renderDocumentDrawer(snapshot);
  elements["raw-json"].textContent = payload.raw
    ? JSON.stringify(payload.raw, null, 2)
    : JSON.stringify({ notice: t("raw.cacheNotice"), snapshot }, null, 2);

  emptyState.hidden = true;
  results.hidden = false;
  results.classList.toggle("is-refreshing", loading);
  restartResultAnimation();
  void loadSupplementalDetails(payload);
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
    lastOceanLeg.estimatedArrival ??
    keyTimes.estimatedFinalArrival?.time ??
    keyTimes.estimatedArrival?.time ??
    keyTimes.estimatedDelivery?.time ??
    null;

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

function normalizeHistorySearch(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function historyShipmentKey(entry) {
  const shipmentId = String(entry?.shipmentId ?? "").trim();
  return shipmentId ? `shipment:${shipmentId}` : `query:${trackingQueryKey(entry?.query ?? {})}`;
}

function uniqueHistoryEntries(entries) {
  const unique = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const key = historyShipmentKey(entry);
    if (!unique.has(key)) unique.set(key, entry);
  }
  return [...unique.values()];
}

function normalizeHistoryBoundCustomers(customers) {
  const unique = new Map();
  for (const customer of Array.isArray(customers) ? customers : []) {
    const value = typeof customer === "string" ? { id: customer, displayName: customer } : customer ?? {};
    const id = String(value.id ?? value.publicId ?? "").trim();
    if (!id || unique.has(id)) continue;
    unique.set(id, {
      id,
      displayName: String(value.displayName ?? value.customerName ?? "").trim(),
      username: String(value.username ?? "").trim(),
      clientCode: String(value.clientCode ?? value.clientNo ?? "").trim(),
      partyRole: String(value.partyRole ?? value.relationshipRole ?? "").trim().toUpperCase(),
      shipmentCount: Number(value.shipmentCount ?? 0)
    });
  }
  return [...unique.values()];
}

function historyCustomerLabel(customer) {
  const name = customer.displayName || customer.clientCode || customer.id;
  const role = logisticsPartyRoleLabel(customer.partyRole);
  const details = [customer.clientCode, role]
    .filter((value, index, values) => value && value !== name && values.indexOf(value) === index);
  return details.length ? `${name} · ${details.join(" · ")}` : name;
}

function renderHistoryCustomerFilter(entries, session) {
  const overseaAgent = isOverseaAgentSession(session);
  const customers = new Map();
  if (overseaAgent) {
    for (const customer of historyAvailableCustomers) {
      customers.set(customer.id, { ...customer });
    }
  }
  for (const entry of entries) {
    for (const customer of normalizeHistoryBoundCustomers(entry.boundCustomers)) {
      if (overseaAgent && customer.partyRole === "OVERSEA_AGENT") continue;
      const current = customers.get(customer.id) || { ...customer, shipmentCount: 0 };
      if (!overseaAgent || !customers.has(customer.id)) current.shipmentCount += 1;
      customers.set(customer.id, current);
    }
  }
  const options = [...customers.values()].sort((left, right) =>
    historyCustomerLabel(left).localeCompare(historyCustomerLabel(right), currentLanguage)
  );
  if (historyCustomerFilter && !customers.has(historyCustomerFilter)) historyCustomerFilter = "";

  const renderFilter = (wrap, select, { hidden, disableWhenEmpty = false }) => {
    if (!wrap || !select) return;
    const filterLabel = wrap.querySelector("span");
    if (filterLabel) {
      const key = "history.customerFilter";
      filterLabel.dataset.i18n = key;
      filterLabel.textContent = t(key);
    }
    const allCustomers = document.createElement("option");
    allCustomers.value = "";
    allCustomers.textContent = t("history.allCustomers");
    const customerOptions = options.map((customer) => {
      const option = document.createElement("option");
      option.value = customer.id;
      option.textContent = `${historyCustomerLabel(customer)} (${customer.shipmentCount})`;
      return option;
    });
    select.replaceChildren(allCustomers, ...customerOptions);
    select.value = historyCustomerFilter;
    select.disabled = disableWhenEmpty && options.length === 0;
    wrap.hidden = hidden;
  };

  renderFilter(historyCustomerFilterWrap, historyCustomerFilterSelect, {
    hidden: !["INTERNAL", "CUSTOMER"].includes(session.kind) || options.length === 0
  });
  renderFilter(agentManagementCustomerFilterWrap, agentManagementCustomerFilterSelect, {
    hidden: !overseaAgent,
    disableWhenEmpty: true
  });
}

function historyMatchesCustomer(entry, customerId) {
  if (!customerId) return true;
  return normalizeHistoryBoundCustomers(entry?.boundCustomers)
    .some((customer) => customer.id === customerId);
}

function historySearchText(entry) {
  const snapshot = entry?.snapshot ?? {};
  const summary = snapshot.summary ?? {};
  const businessReferences = businessReferencesForSnapshot(snapshot);
  const extraInformation = Array.isArray(snapshot.extraInformation)
    ? snapshot.extraInformation.flatMap((item) => [item?.key, item?.value])
    : [];
  return normalizeHistorySearch([
    entry?.query?.number,
    entry?.query?.carrier,
    entry?.query?.type,
    snapshot.tracking?.originalNumber,
    summary.billOfLading,
    ...(Array.isArray(summary.bookingNumbers) ? summary.bookingNumbers : []),
    businessReferences.clientNameCode,
    businessReferences.clientPoNumber,
    businessReferences.forwarderJobNumber,
    summary.origin?.name,
    summary.origin?.countryCode,
    summary.destination?.name,
    summary.destination?.countryCode,
    summary.latestEvent?.name,
    summary.latestEvent?.location,
    ...normalizeHistoryBoundCustomers(entry?.boundCustomers).flatMap((customer) => [
      customer.displayName,
      customer.username,
      customer.clientCode
    ]),
    ...extraInformation
  ].filter(Boolean).join(" "));
}

function historyMatchesSearch(entry, searchTerm) {
  const tokens = normalizeHistorySearch(searchTerm).split(" ").filter(Boolean);
  if (tokens.length === 0) return true;
  const searchText = historySearchText(entry);
  return tokens.every((token) => searchText.includes(token));
}

async function setOverseaAgentShipmentFollowing(entry, following) {
  const session = readFileSession();
  if (!isOverseaAgentSession(session) || !entry?.shipmentId || entry.followBusy) return;
  entry.followBusy = true;
  let saved = false;
  clearError();
  renderHistory();
  try {
    const response = await fetch(
      `/api/customer/shipments/${encodeURIComponent(entry.shipmentId)}/follow`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Customer-Token": session.token
        },
        body: JSON.stringify({ following })
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      clearFileSession(session, { expired: true });
      return;
    }
    if (!response.ok) throw new Error(trackingResponseMessage(payload, response));
    entry.followed = payload?.following === true;
    saved = true;
  } catch (error) {
    showError(t("agent.followFailed", {
      message: error?.message || t("error.generic")
    }));
  } finally {
    entry.followBusy = false;
    if (saved && historyFollowingOnly) {
      await loadCustomerAssignedHistory();
    } else {
      renderHistory();
    }
  }
}

async function refreshOverseaAgentShipment(
  entry,
  { render = true, reportError = true } = {}
) {
  const session = readFileSession();
  if (!isOverseaAgentSession(session) || !entry?.shipmentId || entry.refreshing) return false;
  if (!historyCustomerFilter) {
    if (reportError) showError(t("agent.selectCustomerToUpdate"), "warning");
    (activeView === "shipments"
      ? agentManagementCustomerFilterSelect
      : historyCustomerFilterSelect)?.focus();
    return false;
  }
  entry.refreshing = true;
  clearError();
  if (render) renderHistory();
  let updated = false;
  try {
    const response = await fetch(
      `/api/customer/shipments/${encodeURIComponent(entry.shipmentId)}/refresh?customerId=${
        encodeURIComponent(historyCustomerFilter)
      }`,
      {
        method: "POST",
        headers: { "X-Customer-Token": session.token }
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      clearFileSession(session, { expired: true });
      return false;
    }
    if (!response.ok) throw new Error(trackingResponseMessage(payload, response));
    if (payload?.snapshot && typeof payload.snapshot === "object") {
      entry.snapshot = payload.snapshot;
      entry.savedAt = payload.fetchedAt
        || payload.snapshot?.fetchedAt
        || new Date().toISOString();
      entry.agentLastRefreshedAt = entry.savedAt;
    }
    updated = true;
  } catch (error) {
    if (reportError) {
      showError(t("agent.updateFailed", {
        message: error?.message || t("error.generic")
      }));
    }
  } finally {
    entry.refreshing = false;
    if (render) renderHistory();
  }
  return updated;
}

function agentShipmentCustomers(entry) {
  return normalizeHistoryBoundCustomers(entry?.boundCustomers)
    .filter((customer) => String(customer.partyRole || "").toUpperCase() !== "OVERSEA_AGENT");
}

function agentShipmentClientLabel(entry) {
  const businessReferences = businessReferencesForSnapshot(entry?.snapshot ?? {});
  if (businessReferences.clientNameCode) return businessReferences.clientNameCode;
  const labels = agentShipmentCustomers(entry)
    .map((customer) => customer.clientCode || customer.displayName)
    .filter(Boolean);
  return labels.join(" / ") || "—";
}

function renderAgentShipmentManagement(history) {
  if (!agentManagementTableBody) return;
  history.forEach((entry, index) => {
    const row = document.createElement("article");
    row.className = "agent-shipment-row";
    const entryKey = historyShipmentKey(entry);

    const selectionCell = document.createElement("span");
    selectionCell.className = "agent-shipment-selection";
    const selection = document.createElement("input");
    selection.type = "checkbox";
    selection.className = "agent-shipment-select";
    selection.checked = agentManagementSelectedKeys.has(entryKey);
    selection.disabled = !historyCustomerFilter || agentBulkUpdating || entry.refreshing === true;
    selection.setAttribute("aria-label", `${t("agent.view")} ${entry.query?.number || ""}`);
    selection.addEventListener("change", () => {
      if (selection.checked) agentManagementSelectedKeys.add(entryKey);
      else agentManagementSelectedKeys.delete(entryKey);
      renderHistory();
    });
    selectionCell.append(selection);

    const sequence = document.createElement("span");
    sequence.className = "agent-shipment-sequence";
    const sequenceNumber = document.createElement("b");
    sequenceNumber.textContent = String((historyPage - 1) * historyPageSize + index + 1);
    sequence.append(sequenceNumber);

    const follow = document.createElement("button");
    follow.type = "button";
    follow.className = "agent-shipment-follow agent-row-follow";
    follow.classList.toggle("is-following", entry.followed === true);
    follow.disabled = entry.followBusy === true || agentBulkUpdating;
    follow.title = t(entry.followed ? "agent.unfollow" : "agent.follow");
    follow.setAttribute("aria-label", follow.title);
    follow.textContent = entry.followed ? "★" : "☆";

    const identity = document.createElement("span");
    identity.className = "agent-shipment-identity";
    const reference = document.createElement("b");
    reference.textContent = entry.query?.number || "—";
    const referenceMeta = document.createElement("small");
    referenceMeta.textContent = [
      entry.query?.carrier,
      trackingTypeLabel(entry.query?.type)
    ].filter(Boolean).join(" · ");
    identity.append(reference, referenceMeta);

    const carrier = document.createElement("span");
    carrier.className = "agent-shipment-carrier";
    carrier.textContent = entry.query?.carrier || "—";

    const client = document.createElement("span");
    client.className = "agent-shipment-client";
    client.textContent = agentShipmentClientLabel(entry);
    client.title = client.textContent;

    const customers = document.createElement("span");
    customers.className = "agent-shipment-customers";
    const assignedCustomers = agentShipmentCustomers(entry);
    if (assignedCustomers.length) {
      assignedCustomers.slice(0, 2).forEach((customer) => {
        const tag = document.createElement("small");
        tag.textContent = historyCustomerLabel(customer);
        tag.title = tag.textContent;
        customers.append(tag);
      });
      if (assignedCustomers.length > 2) {
        const overflow = document.createElement("small");
        overflow.className = "is-overflow";
        overflow.textContent = `+${assignedCustomers.length - 2}`;
        overflow.title = assignedCustomers.slice(2).map(historyCustomerLabel).join(", ");
        customers.append(overflow);
      }
    } else {
      customers.textContent = t("agent.noCustomer");
    }

    const status = document.createElement("span");
    status.className = "agent-shipment-status";
    const statusDot = document.createElement("i");
    const statusName = document.createElement("b");
    statusName.textContent = entry.snapshot?.summary?.latestEvent?.name
      || entry.trackingStatus
      || "—";
    status.append(statusDot, statusName);

    const note = document.createElement("span");
    note.className = "agent-shipment-note";
    note.textContent = entry.note || "—";
    note.title = entry.note || "";

    const updated = document.createElement("time");
    updated.className = "agent-shipment-updated";
    updated.textContent = formatLocalDateTime(
      entry.agentLastRefreshedAt || entry.updatedAt || entry.savedAt || entry.assignedAt
    );

    const actions = document.createElement("span");
    actions.className = "agent-shipment-actions";
    const view = document.createElement("button");
    view.type = "button";
    view.className = "agent-row-view";
    view.textContent = t("agent.view");
    view.addEventListener("click", () => openHistoryEntry(entry));
    const update = document.createElement("button");
    update.type = "button";
    update.className = "agent-row-update";
    update.disabled = !historyCustomerFilter || entry.refreshing === true || agentBulkUpdating;
    update.textContent = t(entry.refreshing ? "agent.updating" : "agent.update");
    if (!historyCustomerFilter) update.title = t("agent.selectCustomerToUpdate");
    update.addEventListener("click", () => void refreshOverseaAgentShipment(entry));
    actions.append(view, update, follow);

    follow.addEventListener("click", () => {
      void setOverseaAgentShipmentFollowing(entry, !entry.followed);
    });
    row.append(
      selectionCell,
      sequence,
      identity,
      carrier,
      client,
      customers,
      status,
      note,
      updated,
      actions
    );
    agentManagementTableBody.append(row);
  });
}

function filteredAgentManagementHistory(entries) {
  const followed = historyFollowingOnly
    ? entries.filter((entry) => entry.followed === true)
    : entries;
  const byCustomer = historyCustomerFilter
    ? followed.filter((entry) => historyMatchesCustomer(entry, historyCustomerFilter))
    : followed;
  const normalizedSearch = normalizeHistorySearch(historySearchTerm);
  return normalizedSearch
    ? byCustomer.filter((entry) => historyMatchesSearch(entry, normalizedSearch))
    : byCustomer;
}

function renderAgentShipmentManagementView(history, session) {
  if (!agentManagementTableBody) return;
  const managed = isOverseaAgentSession(session);
  const visibleKeys = new Set(history.map((entry) => historyShipmentKey(entry)));
  for (const selectedKey of agentManagementSelectedKeys) {
    if (!visibleKeys.has(selectedKey)) agentManagementSelectedKeys.delete(selectedKey);
  }

  agentManagementTableBody.replaceChildren();
  if (managed && !historyLoadingState) renderAgentShipmentManagement(history);

  const hasRows = managed && history.length > 0;
  if (agentManagementLoading) agentManagementLoading.hidden = !managed || !historyLoadingState;
  if (agentManagementEmpty) {
    agentManagementEmpty.hidden = !managed || historyLoadingState || hasRows;
  }
  if (agentManagementTableWrap) {
    agentManagementTableWrap.hidden = !managed || historyLoadingState || !hasRows;
  }
  if (agentShipmentTableHead) agentShipmentTableHead.hidden = !hasRows;

  const canUpdate = managed && Boolean(historyCustomerFilter) && !agentBulkUpdating;
  const selectedCount = agentManagementSelectedKeys.size;
  const allVisibleSelected = hasRows
    && history.every((entry) => agentManagementSelectedKeys.has(historyShipmentKey(entry)));
  if (agentManagementSelectAll) {
    agentManagementSelectAll.disabled = !canUpdate || !hasRows;
    agentManagementSelectAll.checked = allVisibleSelected;
    agentManagementSelectAll.indeterminate = selectedCount > 0 && !allVisibleSelected;
  }
  if (agentManagementSelectedCount) {
    agentManagementSelectedCount.textContent = t("agent.selectedCount", { count: selectedCount });
    agentManagementSelectedCount.parentElement.hidden =
      selectedCount === 0 && !agentBulkUpdateResult;
  }
  if (agentManagementBulkUpdate) {
    agentManagementBulkUpdate.disabled = !canUpdate || selectedCount === 0;
    agentManagementBulkUpdate.title = historyCustomerFilter
      ? ""
      : t("agent.selectCustomerToUpdate");
  }
  if (agentManagementBulkUpdateLabel) {
    agentManagementBulkUpdateLabel.textContent = agentBulkUpdating
      ? t("agent.bulkUpdating", agentBulkUpdateProgress)
      : t("agent.bulkUpdate", { count: selectedCount });
  }
  if (agentManagementBulkStatus) {
    agentManagementBulkStatus.hidden = !agentBulkUpdateResult;
    agentManagementBulkStatus.classList.toggle(
      "is-warning",
      Number(agentBulkUpdateResult?.failed || 0) > 0
    );
    if (agentBulkUpdateResult) {
      const key = agentBulkUpdateResult.failed > 0
        ? "agent.bulkUpdatePartial"
        : "agent.bulkUpdateComplete";
      agentManagementBulkStatus.textContent = t(key, agentBulkUpdateResult);
    } else {
      agentManagementBulkStatus.textContent = "";
    }
  }

  if (agentManagementSearchInput) {
    agentManagementSearchInput.disabled = historyLoadingState;
    if (agentManagementSearchInput.value !== historySearchTerm) {
      agentManagementSearchInput.value = historySearchTerm;
    }
  }
  if (agentManagementSearchClear) {
    agentManagementSearchClear.hidden = !normalizeHistorySearch(historySearchTerm);
  }
  if (agentManagementFollowingFilter) {
    agentManagementFollowingFilter.classList.toggle("is-active", historyFollowingOnly);
    agentManagementFollowingFilter.setAttribute("aria-pressed", String(historyFollowingOnly));
    agentManagementFollowingFilter.disabled = agentBulkUpdating;
    const label = agentManagementFollowingFilter.querySelector("b");
    if (label) {
      const key = historyFollowingOnly ? "agent.showAll" : "agent.followingOnly";
      label.dataset.i18n = key;
      label.textContent = t(key);
    }
  }
  if (agentManagementCustomerFilterSelect) {
    agentManagementCustomerFilterSelect.value = historyCustomerFilter;
    agentManagementCustomerFilterSelect.disabled =
      agentBulkUpdating || historyAvailableCustomers.length === 0;
  }
  if (agentManagementRefresh) {
    agentManagementRefresh.disabled = historyLoadingState || agentBulkUpdating;
  }

  if (agentManagementPagination) {
    agentManagementPagination.hidden =
      !managed || historyLoadingState || historyTotalPages <= 1;
    agentManagementPagePrevious.disabled =
      historyLoadingState || agentBulkUpdating || historyPage <= 1;
    agentManagementPageNext.disabled =
      historyLoadingState || agentBulkUpdating || historyPage >= historyTotalPages;
    agentManagementPageInfo.textContent = t("history.pageInfo", {
      page: historyPage,
      pages: historyTotalPages,
      total: historyTotal
    });
    agentManagementPageSizeSelect.value = String(historyPageSize);
    agentManagementPageSizeSelect.disabled = agentBulkUpdating;
  }
}

async function refreshSelectedOverseaAgentShipments() {
  if (agentBulkUpdating) return;
  if (!historyCustomerFilter) {
    showError(t("agent.selectCustomerToUpdate"), "warning");
    agentManagementCustomerFilterSelect?.focus();
    return;
  }
  const selectedEntries = filteredAgentManagementHistory(readHistory())
    .filter((entry) => agentManagementSelectedKeys.has(historyShipmentKey(entry)));
  if (selectedEntries.length === 0) return;

  agentBulkUpdating = true;
  agentBulkUpdateResult = null;
  agentBulkUpdateProgress = { current: 0, total: selectedEntries.length };
  clearError();
  renderHistory();
  let success = 0;
  let failed = 0;
  for (const entry of selectedEntries) {
    if (!isOverseaAgentSession()) break;
    agentBulkUpdateProgress.current += 1;
    renderHistory();
    const updated = await refreshOverseaAgentShipment(entry, {
      render: false,
      reportError: false
    });
    if (updated) success += 1;
    else failed += 1;
  }
  agentBulkUpdating = false;
  agentBulkUpdateResult = { success, failed };
  agentManagementSelectedKeys.clear();
  await loadCustomerAssignedHistory();
}

function historyEtaTimestamp(entry) {
  const timing = historyTiming(entry?.snapshot ?? {});
  const parsed = Date.parse(timing.estimatedArrival ?? timing.arrivalTime ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function sortHistoryByEta(entries) {
  const direction = historyEtaSort === "desc" ? -1 : 1;
  return [...entries].sort((left, right) => {
    const leftEta = historyEtaTimestamp(left);
    const rightEta = historyEtaTimestamp(right);
    if (leftEta == null && rightEta == null) {
      return String(left?.query?.number || "").localeCompare(
        String(right?.query?.number || ""),
        currentLanguage
      );
    }
    if (leftEta == null) return 1;
    if (rightEta == null) return -1;
    if (leftEta !== rightEta) return (leftEta - rightEta) * direction;
    return String(left?.query?.number || "").localeCompare(
      String(right?.query?.number || ""),
      currentLanguage
    );
  });
}

function renderHistory() {
  const allHistory = readHistory();
  const session = readFileSession();
  const agentManagement = isOverseaAgentSession(session);
  renderHistoryCustomerFilter(allHistory, session);
  const followedHistory = historyFollowingOnly && agentManagement
    ? allHistory.filter((entry) => entry.followed === true)
    : allHistory;
  const customerHistory = historyCustomerFilter
    ? followedHistory.filter((entry) => historyMatchesCustomer(entry, historyCustomerFilter))
    : followedHistory;
  const normalizedSearch = normalizeHistorySearch(historySearchTerm);
  const filteredHistory = normalizedSearch
    ? customerHistory.filter((entry) => historyMatchesSearch(entry, normalizedSearch))
    : customerHistory;
  const history = sortHistoryByEta(filteredHistory);
  const accountBound = Boolean(session.token && ["INTERNAL", "CUSTOMER"].includes(session.kind));
  const searchHasNoResults = Boolean(normalizedSearch && allHistory.length > 0 && history.length === 0);

  historyTitle.textContent = t(
    agentManagement
      ? "history.agentTitle"
      : accountBound
        ? "history.accountTitle"
        : "history.title"
  );
  historySubtitle.textContent = t(
    agentManagement
      ? "history.agentSubtitle"
      : accountBound
        ? "history.accountSubtitle"
        : "history.subtitle"
  );
  if (historyFollowingFilter) {
    historyFollowingFilter.hidden = !agentManagement;
    historyFollowingFilter.classList.toggle("is-active", historyFollowingOnly);
    historyFollowingFilter.setAttribute("aria-pressed", String(historyFollowingOnly));
    const label = historyFollowingFilter.querySelector("b");
    if (label) {
      const key = historyFollowingOnly ? "agent.showAll" : "agent.followingOnly";
      label.dataset.i18n = key;
      label.textContent = t(key);
    }
  }
  historyEmptyTitle.textContent = t(
    searchHasNoResults
      ? "history.searchEmptyTitle"
      : agentManagement
        ? "agent.emptyTitle"
      : accountBound
        ? "history.accountEmptyTitle"
        : "history.emptyTitle"
  );
  historyEmptyDescription.textContent = t(
    searchHasNoResults
      ? "history.searchEmptyDescription"
      : agentManagement
        ? "agent.emptyDescription"
      : accountBound
        ? "history.accountEmptyDescription"
        : "history.emptyDescription"
  );
  historyLoading.hidden = !historyLoadingState;
  historyEmpty.hidden = historyLoadingState || history.length > 0;
  historyTableWrap.hidden = historyLoadingState || history.length === 0;
  if (historySearchInput) {
    historySearchInput.disabled = historyLoadingState || allHistory.length === 0;
    if (historySearchInput.value !== historySearchTerm) {
      historySearchInput.value = historySearchTerm;
    }
  }
  if (historySearchClear) historySearchClear.hidden = !normalizedSearch;
  if (historyEtaSortSelect) historyEtaSortSelect.value = historyEtaSort;
  if (historyPagination) {
    historyPagination.hidden = historyLoadingState || !accountBound || historyTotalPages <= 1;
    historyPagePrevious.disabled = historyLoadingState || historyPage <= 1;
    historyPageNext.disabled = historyLoadingState || historyPage >= historyTotalPages;
    historyPageInfo.textContent = t("history.pageInfo", {
      page: historyPage,
      pages: historyTotalPages,
      total: historyTotal
    });
    historyPageSizeSelect.value = String(historyPageSize);
  }
  historyTableBody.replaceChildren();
  historyTableWrap.classList.remove("is-agent-management");
  historyTableBody.classList.remove("agent-shipment-table");
  renderAgentShipmentManagementView(filteredHistory, session);

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
    const entryKey = trackingQueryKey(entry.query);
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
      normalizeHistoryBoundCustomers(entry.boundCustomers)
        .map(historyCustomerLabel)
        .join(" / "),
      trackingTypeLabel(entry.query.type),
      entry.query.carrier
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
      [t("history.currentLocation"), summary.latestEvent?.location]
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

    const timelineItems = historyTimeline(snapshot);
    let timelineSection = null;
    if (timelineItems.length > 0) {
      timelineSection = document.createElement("section");
      timelineSection.className = "shipment-timeline-section";
      const timelineTitle = document.createElement("strong");
      timelineTitle.className = "shipment-detail-title";
      timelineTitle.textContent = t("history.recentMovement");
      const timeline = document.createElement("div");
      timeline.className = "shipment-mini-timeline";
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
      timelineSection.append(timelineTitle, timeline);
    }

    const detailActions = document.createElement("div");
    detailActions.className = "shipment-detail-actions";
    if (agentManagement) {
      const followButton = document.createElement("button");
      followButton.type = "button";
      followButton.className = "agent-follow-button";
      followButton.classList.toggle("is-following", entry.followed === true);
      followButton.disabled = entry.followBusy === true;
      followButton.innerHTML = `<span aria-hidden="true">★</span><b>${
        t(entry.followed ? "agent.unfollow" : "agent.follow")
      }</b>`;
      followButton.addEventListener("click", (event) => {
        event.stopPropagation();
        void setOverseaAgentShipmentFollowing(entry, !entry.followed);
      });

      const updateButton = document.createElement("button");
      updateButton.type = "button";
      updateButton.className = "agent-update-button";
      updateButton.disabled = entry.refreshing === true || !historyCustomerFilter;
      updateButton.textContent = t(entry.refreshing ? "agent.updating" : "agent.update");
      if (!historyCustomerFilter) {
        updateButton.title = t("agent.selectCustomerToUpdate");
      }
      updateButton.addEventListener("click", (event) => {
        event.stopPropagation();
        void refreshOverseaAgentShipment(entry);
      });
      detailActions.append(followButton, updateButton);

      if (entry.agentLastRefreshedAt) {
        const lastAgentUpdate = document.createElement("small");
        lastAgentUpdate.className = "agent-last-update";
        lastAgentUpdate.textContent = t("agent.lastAgentUpdate", {
          time: formatLocalDateTime(entry.agentLastRefreshedAt)
        });
        detailActions.append(lastAgentUpdate);
      }
    }
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "open-history-button";
    openButton.innerHTML = `<span>${t("history.open")}</span><b aria-hidden="true">↗</b>`;
    openButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openHistoryEntry(entry);
    });
    detailActions.append(openButton);
    details.append(facts);
    if (timelineSection) details.append(timelineSection);
    details.append(detailActions);

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

    item.append(toggle, details);
    historyTableBody.append(item);
  }
}

function cmaSessionErrorMessage(payload, response) {
  return String(payload?.message ?? payload?.error ?? `${response.status} ${response.statusText}`).trim();
}

function setCmaSessionMessage(message = "", variant = "info") {
  cmaSessionMessage.textContent = message;
  cmaSessionMessage.dataset.variant = variant;
  cmaSessionMessage.hidden = !message;
}

function renderCmaSessionPanel() {
  const selected = carrierSelect.value === "CMA";
  cmaSessionPanel.hidden = !selected;
  if (!selected) return;

  const session = readFileSession();
  const canManage = canManageFileVisibility(session);
  cmaSessionPermission.hidden = canManage;
  cmaSessionForm.hidden = !canManage;
  if (!canManage) {
    cmaSessionStatusElement.dataset.state = "restricted";
    cmaSessionStatusElement.textContent = t("cmaSession.notConfigured");
    return;
  }

  if (!cmaSessionUserAgent.value) cmaSessionUserAgent.value = navigator.userAgent;
  const configured = cmaSessionStatus?.configured === true;
  cmaSessionStatusElement.dataset.state = configured ? "configured" : "empty";
  if (cmaSessionLoading || !cmaSessionStatusLoaded) {
    cmaSessionStatusElement.textContent = t("cmaSession.checking");
  } else if (configured) {
    const time = cmaSessionStatus.updatedAt
      ? new Date(cmaSessionStatus.updatedAt).toLocaleString(locale())
      : "—";
    cmaSessionStatusElement.textContent = t("cmaSession.configured", { time });
  } else {
    cmaSessionStatusElement.textContent = t("cmaSession.notConfigured");
  }
  cmaSessionSave.disabled = cmaSessionLoading;
  cmaSessionClear.disabled = cmaSessionLoading || !configured;
  if (!cmaSessionStatusLoaded && !cmaSessionLoading) void refreshCmaSessionStatus();
}

async function refreshCmaSessionStatus() {
  const session = readFileSession();
  if (!canManageFileVisibility(session) || cmaSessionLoading) return;
  cmaSessionLoading = true;
  renderCmaSessionPanel();
  try {
    const response = requireAuthorizedResponse(await fetch("/api/tracking/cma-session", {
      headers: { ...fileAuthHeaders(session) }
    }));
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(cmaSessionErrorMessage(payload, response));
    cmaSessionStatus = payload;
    cmaSessionStatusLoaded = true;
    setCmaSessionMessage();
  } catch (error) {
    cmaSessionStatusLoaded = true;
    cmaSessionStatus = null;
    setCmaSessionMessage(t("cmaSession.loadFailed", {
      message: error?.message || t("error.generic")
    }), "error");
  } finally {
    cmaSessionLoading = false;
    renderCmaSessionPanel();
  }
}

async function saveCmaSession() {
  const session = readFileSession();
  if (!canManageFileVisibility(session) || cmaSessionLoading) return;
  const sessionCookie = cmaSessionCookie.value.trim();
  if (!sessionCookie) {
    setCmaSessionMessage(t("cmaSession.required"), "error");
    cmaSessionCookie.focus();
    return;
  }
  cmaSessionLoading = true;
  renderCmaSessionPanel();
  try {
    const response = requireAuthorizedResponse(await fetch("/api/tracking/cma-session", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...fileAuthHeaders(session)
      },
      body: JSON.stringify({
        sessionCookie,
        userAgent: cmaSessionUserAgent.value.trim()
      })
    }));
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(cmaSessionErrorMessage(payload, response));
    cmaSessionStatus = payload;
    cmaSessionStatusLoaded = true;
    cmaSessionCookie.value = "";
    setCmaSessionMessage(t("cmaSession.saved"), "success");
  } catch (error) {
    setCmaSessionMessage(t("cmaSession.saveFailed", {
      message: error?.message || t("error.generic")
    }), "error");
  } finally {
    cmaSessionLoading = false;
    renderCmaSessionPanel();
  }
}

async function clearCmaSession() {
  const session = readFileSession();
  if (!canManageFileVisibility(session) || cmaSessionLoading) return;
  if (!window.confirm(t("cmaSession.clearConfirm"))) return;
  cmaSessionLoading = true;
  renderCmaSessionPanel();
  try {
    const response = requireAuthorizedResponse(await fetch("/api/tracking/cma-session", {
      method: "DELETE",
      headers: { ...fileAuthHeaders(session) }
    }));
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(cmaSessionErrorMessage(payload, response));
    cmaSessionStatus = payload;
    cmaSessionStatusLoaded = true;
    cmaSessionCookie.value = "";
    setCmaSessionMessage(t("cmaSession.cleared"), "success");
  } catch (error) {
    setCmaSessionMessage(t("cmaSession.saveFailed", {
      message: error?.message || t("error.generic")
    }), "error");
  } finally {
    cmaSessionLoading = false;
    renderCmaSessionPanel();
  }
}

function updateCarrierUI({ resetResult = false } = {}) {
  const carrier = CARRIERS[carrierSelect.value] ?? CARRIERS.COSCO;
  const cmaSelected = carrier.code === "CMA";
  if (channelSelect) {
    if (cmaSelected) channelSelect.value = "PLAYWRIGHT";
    else if (channelSelect.disabled) channelSelect.value = "AUTO";
    channelSelect.disabled = cmaSelected;
  }
  const channel = CHANNELS[channelSelect?.value] ?? CHANNELS.NETWORK;
  sourceTag.textContent = carrier.code === "COSCO" ? t(channel.sourceKey) : carrier.source;
  queryHelper.textContent = t(cmaSelected ? "query.cmaHelper" : "query.helper");
  if (carrierNotice) {
    carrierNotice.hidden = carrier.enabled;
    carrierNotice.textContent = carrier.enabled ? "" : t("carrier.cmaNotice");
  }
  carrierNavItems.forEach((item) => {
    item.classList.toggle("is-current", item.dataset.carrierSelect === carrier.code);
  });
  renderCmaSessionPanel();
  if (checkChannelsButton) {
    checkChannelsButton.disabled = channelCheckLoading || carrier.code !== "COSCO";
  }
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
  if (!target.card || !target.status || !target.latency) return;
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
  if (channelCheckSummary) {
    channelCheckSummary.textContent = t("workbench.checkedAt", {
      time: formatLocalDateTime(result.checkedAt)
    });
  }
}

function setChannelCheckLoading(value) {
  channelCheckLoading = value;
  if (checkChannelsButton) {
    checkChannelsButton.disabled = value || carrierSelect.value !== "COSCO";
    checkChannelsButton.classList.toggle("is-loading", value);
    const label = checkChannelsButton.querySelector("[data-i18n]");
    if (label) label.textContent = t(value ? "workbench.checking" : "workbench.check");
  }
  if (value) {
    renderProbe("NETWORK", { status: "checking" });
    renderProbe("PLAYWRIGHT", { status: "checking" });
    if (channelCheckSummary) channelCheckSummary.textContent = t("workbench.helper");
  }
}

function renderChannelStatus(status) {
  lastChannelStatus = status ?? { status: "unknown" };
  const state = lastChannelStatus.status ?? "unknown";
  channelState.dataset.status = state;
  channelStatusText.textContent = t(`status.${state}`);
  if (overviewMonitorStatus) {
    overviewMonitorStatus.textContent = t(`status.short${state[0].toUpperCase()}${state.slice(1)}`);
  }
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

function showView(name, { updateLocation = true, pushLocation = false } = {}) {
  let nextView = ["overview", "shipments", "tracking", "profile"].includes(name)
    ? name
    : "overview";
  if (nextView === "shipments" && !isOverseaAgentSession()) {
    nextView = "overview";
  }
  if (isOverseaAgentSession() && nextView === "tracking" && !agentShipmentDetailOpen) {
    nextView = "overview";
  }
  if (isOverseaAgentSession() && ["overview", "shipments"].includes(nextView)) {
    agentShipmentDetailOpen = false;
  }
  if (nextView === "profile" && readFileSession().kind !== "CUSTOMER") {
    return showView("overview", { updateLocation, pushLocation });
  }
  const incoming = document.querySelector(`[data-view="${nextView}"]`);
  if (!incoming) return Promise.resolve();
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
  activeViewTitle.textContent = t(activeViewTranslationKey(activeView));

  if (updateLocation) {
    const url = new URL(window.location.href);
    url.hash = activeView;
    if (activeView !== "tracking") {
      url.searchParams.delete("carrier");
      url.searchParams.delete("channel");
      url.searchParams.delete("type");
      url.searchParams.delete("number");
    } else if (currentPayload?.snapshot?.tracking?.number) {
      const query = normalizeQuery({
        carrier: carrierSelect.value,
        channel: channelSelect?.value ?? "AUTO",
        type: trackingType.value,
        number: trackingNumber.value
      });
      url.searchParams.set("carrier", query.carrier);
      url.searchParams.set("channel", query.channel);
      url.searchParams.set("type", query.type);
      url.searchParams.set("number", query.number);
    }
    window.history[pushLocation ? "pushState" : "replaceState"]({}, "", url);
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
    if (["overview", "shipments"].includes(activeView)) renderHistory();
    renderTrackingAccount();
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

function historyEntryForQuery(query, shipmentId = null) {
  const normalized = normalizeQuery(query);
  return readHistory().find((entry) => {
    if (shipmentId && String(entry.shipmentId ?? "") === String(shipmentId)) return true;
    return trackingQueryKey(entry.query) === trackingQueryKey(normalized);
  }) ?? null;
}

function showStoredTrackingQuery(
  query,
  { entry = null, importedDetails = null, clearWhenMissing = false } = {}
) {
  const normalized = normalizeQuery(query);
  carrierSelect.value = normalized.carrier;
  if (channelSelect) channelSelect.value = normalized.channel ?? "AUTO";
  trackingType.value = normalized.type;
  trackingNumber.value = normalized.number;
  updateCarrierUI();
  const storedEntry = entry ?? historyEntryForQuery(normalized);
  const payload = storedEntry?.snapshot
    ? {
        snapshot: storedEntry.snapshot,
        raw: null,
        cached: false,
        databaseStored: true,
        databaseStoredAt: storedEntry.savedAt,
        shipmentId: storedEntry.shipmentId ?? storedEntry.shipmentRecord?.publicId ?? null,
        shipmentRecord: storedEntry.shipmentRecord ?? null
      }
    : null;
  if (!payload) {
    if (clearWhenMissing) {
      currentPayload = null;
      setRelatedFilesContext(null);
      results.hidden = true;
      emptyState.hidden = false;
      clearError();
    }
    return false;
  }
  currentPayload = mergeImportedDetailsIntoPayload(payload, importedDetails);
  renderResult(currentPayload);
  return true;
}

function openHistoryEntry(entry) {
  if (isOverseaAgentSession()) agentShipmentDetailOpen = true;
  showStoredTrackingQuery(entry.query, { entry });
  updateUrl(entry.query, { push: true });
  void showView("tracking", { updateLocation: false });
}

function markBatchItemResult(query, { status, source = null, error = null }) {
  if (!batchState?.items?.length) return;
  const normalized = normalizeQuery(query);
  const item = batchState.items.find(
    (candidate) =>
      candidate.carrier === normalized.carrier &&
      candidate.type === normalized.type &&
      candidate.number === normalized.number
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

async function openBatchItem(item) {
  const query = queryForBatchItem(item);
  let entry = historyEntryForQuery(query, item.shipmentId);
  if (!entry && readFileSession().kind === "INTERNAL") {
    await loadInternalTrackedHistory();
    entry = historyEntryForQuery(query, item.shipmentId);
  }
  const available = showStoredTrackingQuery(query, {
    entry,
    importedDetails: item.importedDetails
  });
  if (!available) {
    setBatchImportNotice("batch.detailUnavailable", {}, "warning");
    renderBatchState();
    return;
  }
  setBatchImportNotice();
  closeBatchWorkspace();
  updateUrl(query, { push: true });
  await showView("tracking", { updateLocation: false });
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
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
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
  renderOverseaAgentWorkspace();
  activeViewTitle.textContent = t(activeViewTranslationKey(activeView));
  updateCarrierUI();
  renderChannelStatus(lastChannelStatus);
  if (lastChannelCheck) renderChannelCheck(lastChannelCheck);
  renderHistory();
  renderBatchState();
  if (currentPayload) renderResult(currentPayload);
  renderRelatedFilesDrawer();
}

async function postTrackingRequest(path, query, { signal, batchTaskId } = {}) {
  const response = requireAuthorizedResponse(
    await fetch(appUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...query, ...(batchTaskId ? { batchTaskId } : {}) }),
      signal
    })
  );
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function postPublicShipmentTrackingRequest(
  query,
  { includeAuth = true, signal, batchTaskId } = {}
) {
  const session = readFileSession();
  const sessionFingerprint = fileSessionFingerprint(session);
  const response = await fetch("/api/public/shipments/track", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(includeAuth ? fileAuthHeaders(session) : {})
    },
    body: JSON.stringify({ ...query, ...(batchTaskId ? { batchTaskId } : {}) }),
    signal
  });
  const payload = await response.json().catch(() => ({}));
  if (payload && typeof payload === "object") {
    trackingPayloadSessionFingerprints.set(payload, sessionFingerprint);
  }

  if (response.status === 401 && includeAuth && session.token) {
    const cleared = clearFileSession(session, { expired: true });
    if (cleared && session.kind !== "CUSTOMER") {
      return postPublicShipmentTrackingRequest(query, { includeAuth: false, signal, batchTaskId });
    }
  }
  return { response, payload };
}

async function requestTracking(query, options = {}) {
  const customerReadOnly = readFileSession().kind === "CUSTOMER";
  const platform = await postPublicShipmentTrackingRequest(query, options);
  if (customerReadOnly) return platform;
  if (!isPublicTrackingRouteUnavailable(platform)) return platform;

  const primary = await postTrackingRequest("/api/track", query, options);
  if (
    query.carrier === "COSCO" &&
    [404, 405].includes(primary.response.status)
  ) {
    const compatibilityPath =
      query.channel === "PLAYWRIGHT"
        ? "/api/track/cosco/playwright"
        : "/api/track/cosco";
    return postTrackingRequest(compatibilityPath, query, options);
  }
  return primary;
}

checkChannelsButton?.addEventListener("click", async () => {
  const carrier = CARRIERS[carrierSelect.value];
  if (!carrier?.enabled || channelCheckLoading) return;
  const shipmentNumber = trackingNumber.value.trim();
  if (!shipmentNumber) {
    channelCheckSummary.textContent = t("query.enterNumber");
    trackingNumber.focus();
    return;
  }

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
          number: shipmentNumber
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
    channelCheckSummary.textContent = customerFacingTrackingError();
  } finally {
    setChannelCheckLoading(false);
    endSystemWait(waitToken, { complete: completed });
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const baseQuery = normalizeQuery({
    carrier: carrierSelect.value,
    channel: channelSelect?.value ?? "AUTO",
    type: trackingType.value,
    number: trackingNumber.value
  });
  const importedItem = batchItemForQuery(baseQuery);
  const query = normalizeQuery({
    ...baseQuery,
    importedDetails: canManageFileVisibility(readFileSession())
      ? importedItem?.importedDetails
      : null
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
  try {
    const { response, payload: upstreamPayload } = await requestTracking(query);

    if (!response.ok) {
      throw new Error(trackingDiagnosticMessage(upstreamPayload, response));
    }

    const payload = mergeImportedDetailsIntoPayload(
      upstreamPayload,
      importedItem?.importedDetails
    );
    markBatchItemResult(query, {
      status: "success",
      source: payload?.cached ? "server-cache" : "live"
    });
    if (readFileSession().kind === "INTERNAL") await loadInternalTrackedHistory();
    else if (readFileSession().kind === "CUSTOMER") await loadCustomerAssignedHistory();
    else renderHistory();
    if (requestSequence !== trackingRequestSequence) return;
    renderResult(payload);
    completed = true;
  } catch (error) {
    if (requestSequence !== trackingRequestSequence) return;
    const technicalMessage = error?.message || t("error.generic");
    const message = canManageFileVisibility(readFileSession())
      ? technicalMessage
      : customerFacingTrackingError();
    markBatchItemResult(query, {
      status: "failed",
      source: null,
      error: technicalMessage
    });
    showError(message, "error");
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
carrierNavItems.forEach((item) => {
  const selectCarrier = () => {
    carrierSelect.value = item.dataset.carrierSelect;
    carrierSelect.dispatchEvent(new Event("change"));
    void showView("tracking", { pushLocation: activeView !== "tracking" });
  };
  item.addEventListener("click", selectCarrier);
  item.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectCarrier();
  });
});
cmaSessionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveCmaSession();
});
cmaSessionClear.addEventListener("click", () => void clearCmaSession());
channelSelect?.addEventListener("change", () => updateCarrierUI({ resetResult: true }));

batchWorkspaceClose?.addEventListener("click", closeBatchWorkspace);
batchWorkspaceDialog?.addEventListener("click", (event) => {
  if (event.target === batchWorkspaceDialog) closeBatchWorkspace();
});

batchSelectButton?.addEventListener("click", () => {
  if (!batchRunning) batchFileInput?.click();
});

batchFileInput?.addEventListener("change", async () => {
  const file = batchFileInput.files?.[0];
  if (!file || batchRunning) return;

  batchSelectButton.disabled = true;
  batchSelectButton.setAttribute("aria-busy", "true");
  setBatchImportNotice("batch.parsing", { name: file.name });

  try {
    const preview = await parseBatchFile(file);
    if (preview?.phase === "preview") {
      setBatchImportNotice();
      showBatchColumnPreview(file, preview);
    } else {
      hideBatchColumnPreview();
      startImportedBatch(file.name, preview);
    }
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

batchPreviewSheet?.addEventListener("change", () => {
  renderBatchPreviewColumns();
});

batchPreviewColumn?.addEventListener("change", () => {
  const selectedOption = batchPreviewColumn.selectedOptions[0];
  batchPreviewType.value = selectedOption?.dataset.suggestedType === "BOOKING"
    ? "BOOKING"
    : "BILLOFLADING";
  renderBatchPreviewTable();
});

batchPreviewCancel?.addEventListener("click", () => {
  hideBatchColumnPreview();
  setBatchImportNotice();
});

batchPreviewConfirm?.addEventListener("click", async () => {
  const file = pendingBatchFile;
  const sheet = activeBatchPreviewSheet();
  const columnIndex = Number(batchPreviewColumn.value);
  if (!file || !sheet || !Number.isInteger(columnIndex)) {
    setBatchImportNotice("batch.previewRequired", {}, "error");
    return;
  }

  batchPreviewConfirm.disabled = true;
  batchSelectButton.disabled = true;
  setBatchImportNotice("batch.parsing", { name: file.name });
  try {
    const imported = await parseBatchFile(file, {
      sheetName: sheet.name,
      headerRowIndex: sheet.headerRowIndex,
      columnIndex,
      type: batchPreviewType.value
    });
    if (imported?.phase !== "items" || !Array.isArray(imported.items)) {
      throw new Error(t("batch.noRows"));
    }
    const fileName = file.name;
    hideBatchColumnPreview();
    startImportedBatch(fileName, imported);
  } catch (error) {
    setBatchImportNotice(
      "batch.importFailed",
      { message: error?.message || t("error.generic") },
      "error"
    );
  } finally {
    batchPreviewConfirm.disabled = false;
    batchSelectButton.disabled = false;
  }
});

batchResumeButton?.addEventListener("click", () => {
  void runBatchQueue();
});

batchStopButton?.addEventListener("click", async () => {
  if (!batchRunning || batchStopRequested) return;
  batchStopRequested = true;
  const taskId = batchTaskId;
  renderBatchState();
  // A stop can arrive while the create request is still pending. runBatchQueue observes the
  // flag and cancels immediately after the backend returns the newly allocated task id.
  if (!taskId) return;
  try {
    const snapshot = await cancelBatchTask(taskId);
    applyBusinessBatchTask(snapshot);
  } catch (error) {
    batchStopRequested = false;
    setBatchImportNotice(
      "batch.backgroundFailed",
      { message: error?.message || t("error.generic") },
      "error"
    );
    renderBatchState();
  }
});

batchClearButton?.addEventListener("click", () => {
  if (batchRunning || !window.confirm(t("batch.confirmClear"))) return;
  batchState = null;
  batchImportNotice = null;
  hideBatchColumnPreview();
  persistBatchState();
  renderBatchState();
  setBatchImportNotice();
});

relatedFilesButton.addEventListener("click", openRelatedFilesDrawer);
relatedFilesCloseButton.addEventListener("click", closeRelatedFilesDrawer);
relatedFilesBackdrop.addEventListener("click", closeRelatedFilesDrawer);
relatedFilesRetryButton.addEventListener("click", () => {
  void Promise.all([loadRelatedFiles(), loadRelatedFileComments()]);
});
relatedFileCommentInput.addEventListener("input", renderRelatedFileComments);
relatedFileCommentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void sendRelatedFileComment();
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

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    renderTrackingAccount();
  }
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
      void loadInternalTrackedHistory();
    } else if (event.key === PLATFORM_AUTH_USER_KEY) {
      platformPrincipalAwaitingRefresh = false;
    } else if (event.key === CUSTOMER_AUTH_TOKEN_KEY) {
      customerPrincipalAwaitingRefresh = Boolean(
        event.newValue && event.newValue !== event.oldValue
      );
      historyCustomerFilter = "";
      historyAvailableCustomers = [];
      agentManagementSelectedKeys.clear();
      agentBulkUpdateResult = null;
      resetHistoryPagination();
      void loadCustomerAssignedHistory();
    } else if (event.key === CUSTOMER_AUTH_SESSION_KEY) {
      customerPrincipalAwaitingRefresh = false;
    }
    synchronizeRelatedFilesSession(readFileSession(), { expiredKind: "" });
    renderRelatedFilesDrawer();
    renderTrackingAccount();
  }
});

document.querySelectorAll("[data-language]").forEach((button) => {
  button.addEventListener("click", () => applyLanguage(button.dataset.language));
});

document.querySelectorAll("[data-view-target]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    if (link.dataset.viewTarget === activeView) return;
    showView(link.dataset.viewTarget, { pushLocation: true });
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

document.querySelector("#portal-return-link")?.addEventListener("click", (event) => {
  if (
    event.defaultPrevented
    || event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
  ) return;
  event.preventDefault();
  const requestedReturn = new URLSearchParams(window.location.search).get("returnTo") ?? "";
  const safeReturn = requestedReturn.startsWith("/") && !requestedReturn.startsWith("//")
    ? requestedReturn
    : "";
  if (safeReturn) {
    showPlatformRouteWait();
    window.location.assign(safeReturn);
    return;
  }
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  showPlatformRouteWait();
  window.location.assign(event.currentTarget.href);
});

document.querySelector("#start-tracking-button").addEventListener("click", () => {
  if (isOverseaAgentSession()) {
    historyCustomerFilterSelect?.focus();
    historyCustomerFilterWrap?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  showView("tracking", { pushLocation: activeView !== "tracking" }).then(() => {
    if (trackingNumber && !trackingNumber.hidden) {
      trackingNumber.focus();
      trackingNumber.select();
    }
  });
});

historySearchInput?.addEventListener("input", () => {
  historySearchTerm = historySearchInput.value;
  agentManagementSelectedKeys.clear();
  agentBulkUpdateResult = null;
  renderHistory();
});

historySearchClear?.addEventListener("click", () => {
  historySearchTerm = "";
  agentManagementSelectedKeys.clear();
  agentBulkUpdateResult = null;
  historySearchInput.value = "";
  renderHistory();
  historySearchInput.focus();
});

historyCustomerFilterSelect?.addEventListener("change", async () => {
  historyCustomerFilter = historyCustomerFilterSelect.value;
  agentManagementSelectedKeys.clear();
  agentBulkUpdateResult = null;
  historyPage = 1;
  if (isOverseaAgentSession()) {
    await loadCustomerAssignedHistory();
  } else {
    renderHistory();
  }
});

historyEtaSortSelect?.addEventListener("change", () => {
  historyEtaSort = historyEtaSortSelect.value === "desc" ? "desc" : "asc";
  renderHistory();
});

historyFollowingFilter?.addEventListener("click", async () => {
  if (!isOverseaAgentSession()) return;
  historyFollowingOnly = !historyFollowingOnly;
  agentManagementSelectedKeys.clear();
  agentBulkUpdateResult = null;
  historyPage = 1;
  await loadCustomerAssignedHistory();
});

async function loadCurrentHistoryPage() {
  if (readFileSession().kind === "INTERNAL") await loadInternalTrackedHistory();
  else if (readFileSession().kind === "CUSTOMER") await loadCustomerAssignedHistory();
}

historyPagePrevious?.addEventListener("click", () => {
  if (historyLoadingState || historyPage <= 1) return;
  agentManagementSelectedKeys.clear();
  historyPage -= 1;
  void loadCurrentHistoryPage();
});

historyPageNext?.addEventListener("click", () => {
  if (historyLoadingState || historyPage >= historyTotalPages) return;
  agentManagementSelectedKeys.clear();
  historyPage += 1;
  void loadCurrentHistoryPage();
});

historyPageSizeSelect?.addEventListener("change", () => {
  agentManagementSelectedKeys.clear();
  historyPageSize = Number(historyPageSizeSelect.value || 20);
  historyPage = 1;
  void loadCurrentHistoryPage();
});

agentManagementSearchInput?.addEventListener("input", () => {
  historySearchTerm = agentManagementSearchInput.value;
  agentManagementSelectedKeys.clear();
  agentBulkUpdateResult = null;
  renderHistory();
});

agentManagementSearchClear?.addEventListener("click", () => {
  historySearchTerm = "";
  agentManagementSelectedKeys.clear();
  agentBulkUpdateResult = null;
  agentManagementSearchInput.value = "";
  renderHistory();
  agentManagementSearchInput.focus();
});

agentManagementCustomerFilterSelect?.addEventListener("change", async () => {
  historyCustomerFilter = agentManagementCustomerFilterSelect.value;
  agentManagementSelectedKeys.clear();
  agentBulkUpdateResult = null;
  historyPage = 1;
  await loadCustomerAssignedHistory();
});

agentManagementFollowingFilter?.addEventListener("click", async () => {
  if (!isOverseaAgentSession() || agentBulkUpdating) return;
  historyFollowingOnly = !historyFollowingOnly;
  agentManagementSelectedKeys.clear();
  agentBulkUpdateResult = null;
  historyPage = 1;
  await loadCustomerAssignedHistory();
});

agentManagementSelectAll?.addEventListener("change", () => {
  if (!historyCustomerFilter || agentBulkUpdating) return;
  const visibleEntries = filteredAgentManagementHistory(readHistory());
  for (const entry of visibleEntries) {
    const key = historyShipmentKey(entry);
    if (agentManagementSelectAll.checked) agentManagementSelectedKeys.add(key);
    else agentManagementSelectedKeys.delete(key);
  }
  agentBulkUpdateResult = null;
  renderHistory();
});

agentManagementBulkUpdate?.addEventListener("click", () => {
  void refreshSelectedOverseaAgentShipments();
});

agentManagementRefresh?.addEventListener("click", () => {
  if (historyLoadingState || agentBulkUpdating || !isOverseaAgentSession()) return;
  agentManagementSelectedKeys.clear();
  agentBulkUpdateResult = null;
  void loadCustomerAssignedHistory();
});

agentManagementPagePrevious?.addEventListener("click", () => {
  if (historyLoadingState || agentBulkUpdating || historyPage <= 1) return;
  agentManagementSelectedKeys.clear();
  historyPage -= 1;
  void loadCurrentHistoryPage();
});

agentManagementPageNext?.addEventListener("click", () => {
  if (historyLoadingState || agentBulkUpdating || historyPage >= historyTotalPages) return;
  agentManagementSelectedKeys.clear();
  historyPage += 1;
  void loadCurrentHistoryPage();
});

agentManagementPageSizeSelect?.addEventListener("change", () => {
  if (agentBulkUpdating) return;
  agentManagementSelectedKeys.clear();
  historyPageSize = Number(agentManagementPageSizeSelect.value || 20);
  historyPage = 1;
  void loadCurrentHistoryPage();
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

document.querySelector("#open-document-drawer")?.addEventListener("click", openRelatedFilesDrawer);
document.querySelector("#close-document-drawer").addEventListener("click", closeDocumentDrawer);
document.querySelector("#document-drawer-backdrop").addEventListener("click", closeDocumentDrawer);

documentEditorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentPayload?.snapshot) return;
  const code = document.querySelector("#document-type-input").value;
  const definition = documentDefinition(code);
  if (!definition) return;
  const metadata = documentMetadataForSnapshot(currentPayload.snapshot);
  const existing = documentRecord(code, metadata);
  const file = document.querySelector("#document-file-input").files?.[0] ?? null;

  if (!file && !existing) {
    window.alert(t("documents.chooseFile"));
    return;
  }

  const session = readFileSession();
  if (file && session.token && relatedFilesShipmentId) {
    const formData = new FormData();
    formData.append("files", file);
    formData.append("category", code);
    if (session.kind === "INTERNAL") {
      const selectedVisibility = document.querySelector("#document-visibility-input").value;
      formData.append("visibility", selectedVisibility);
    }
    try {
      await requestRelatedFilesApi(
        shipmentFilesPath(session, relatedFilesShipmentId),
        { method: "POST", body: formData, session }
      );
      await loadRelatedFiles();
    } catch (error) {
      window.alert(t("files.uploadFailed", { message: error?.message || t("error.generic") }));
      return;
    }
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

function trackingQueryFromLocation() {
  const search = new URLSearchParams(window.location.search);
  const number = search.get("number");
  if (!number) return null;
  return normalizeQuery({
    carrier: search.get("carrier") || "COSCO",
    channel: search.get("channel") || "AUTO",
    type: search.get("type") || "BILLOFLADING",
    number
  });
}

function syncViewFromLocation() {
  const requestedView = window.location.hash.replace(/^#/, "");
  const nextView = ["overview", "shipments", "tracking", "profile"].includes(requestedView)
    ? requestedView
    : "overview";
  if (nextView === "tracking") {
    const query = trackingQueryFromLocation();
    if (query) {
      showStoredTrackingQuery(query, { clearWhenMissing: true });
    } else {
      currentPayload = null;
      trackingNumber.value = "";
      setRelatedFilesContext(null);
      results.hidden = true;
      emptyState.hidden = false;
      clearError();
    }
  }
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
  renderTrackingAccount();
});

clearLegacyBrowserSnapshots();
batchState = restoreBatchState();
if (batchState) persistBatchState();
historyLoadingState = ["INTERNAL", "CUSTOMER"].includes(readFileSession().kind);
applyLanguage(currentLanguage, { persist: false });
if (
  batchState?.taskId &&
  ["running", "stopping", "paused"].includes(batchState.status)
) {
  window.setTimeout(() => void runBatchQueue(), 0);
}

async function initializeTrackingPage() {
  const initialQuery = trackingQueryFromLocation();
  if (initialQuery) {
    showStoredTrackingQuery(initialQuery, { clearWhenMissing: true });
    await showView("tracking", { updateLocation: false });
    const waitToken = beginSystemWait("history", "wait.history");
    try {
      await Promise.all([loadCustomerAssignedHistory(), loadInternalTrackedHistory()]);
      const restored = showStoredTrackingQuery(initialQuery);
      if (!restored) form.requestSubmit();
    } finally {
      endSystemWait(waitToken);
    }
    return;
  }
  showView(["overview", "shipments", "tracking", "profile"].includes(window.location.hash.slice(1))
    ? window.location.hash.slice(1)
    : "overview", {
    updateLocation: false
  });
  await Promise.all([loadCustomerAssignedHistory(), loadInternalTrackedHistory()]);
}

void initializeTrackingPage();

renderTrackingAccount();
// Re-render account after a short delay to catch any late session writes
// when the user is redirected from the workbench login flow.
window.setTimeout(() => renderTrackingAccount(readFileSession()), 500);

// If another tab/window writes the session, update the header immediately.
window.addEventListener("storage", (event) => {
  if (
    event.key === PLATFORM_AUTH_TOKEN_KEY ||
    event.key === PLATFORM_AUTH_USER_KEY ||
    event.key === CUSTOMER_AUTH_TOKEN_KEY ||
    event.key === CUSTOMER_AUTH_SESSION_KEY
  ) {
    renderTrackingAccount(readFileSession());
  }
});
void refreshChannelStatus();
setInterval(() => {
  void refreshChannelStatus();
}, 60_000);
