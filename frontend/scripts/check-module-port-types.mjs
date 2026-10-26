import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = fileURLToPath(new URL("../", import.meta.url));
const source = resolve(frontend, "src").replaceAll("\\", "/");
const factories = [
  "customers/createCustomerModulePages",
  "shipments/createShipmentModulePages",
  "agents/createAgentModulePages",
  "handover/createHandoverModulePages"
];
for (const factory of factories) {
  const code = readFileSync(resolve(frontend, `src/modules/${factory}.js`), "utf8");
  assert.match(code, /\/\/ @ts-check/, `${factory} must check its real implementation`);
  assert.match(code, /@param \{import\("\.\.\/\.\.\/types\/businessModulePorts"\)\./);
  assert.doesNotMatch(code, /@ts-nocheck|@ts-ignore|@ts-expect-error/);
}
for (const workflow of [
  "useAdminAccounts",
  "useAdminLlmSettings",
  "useAdminSessionGuard",
  "useAdminDevices",
  "useAdminAnnouncements",
  "useAnnouncementEditor",
  "useAdminFiles",
  "useAdminFilePreview",
  "adminLlmPresentation"
]) {
  const code = readFileSync(resolve(frontend, `src/features/admin/${workflow}.js`), "utf8");
  assert.match(code, /\/\/ @ts-check/, `${workflow} must check its implementation`);
  assert.match(code, /types\/admin(?:Workflows|Files)/);
  assert.doesNotMatch(code, /@ts-nocheck|@ts-ignore|@ts-expect-error/);
}

for (const [workflow, contract] of [
  ["useAdminConsole", "adminConsole"],
  ["useAdminBusinessLists", "adminBusinessLists"]
]) {
  const code = readFileSync(resolve(frontend, `src/features/admin/${workflow}.js`), "utf8");
  assert.match(code, /\/\/ @ts-check/);
  assert.ok(code.includes(`types/${contract}`));
  assert.doesNotMatch(code, /@ts-nocheck|@ts-ignore|@ts-expect-error/);
}

// Actual producers supply the fixture's operations/bindings/UI. The inputs are
// not duplicate hand-written page interfaces: output contracts come from the JS factories.
const fixture = `
import { useAdminConsole } from "${source}/features/admin/useAdminConsole.js";
import { useAdminBusinessLists } from "${source}/features/admin/useAdminBusinessLists.js";
import { createAdminBusinessCopy } from "${source}/features/admin/adminBusinessCopy.js";
import { createAdminBusinessPresentation } from "${source}/features/admin/adminBusinessPresentation.js";
import type { AdminConsolePorts } from "${source}/types/adminConsole";
import type { AdminBusinessListPorts } from "${source}/types/adminBusinessLists";
declare const consolePorts: AdminConsolePorts;
declare const businessListPorts: AdminBusinessListPorts;
const adminConsole = useAdminConsole(consolePorts);
const adminBusiness = useAdminBusinessLists(businessListPorts);
const adminBusinessCopy = createAdminBusinessCopy({ locale: () => "en-US", t: key => key, ui: key => key });
const adminBusinessPresentation = createAdminBusinessPresentation({ copy: adminBusinessCopy, formatDate: value => value || "-" });
useAdminBusinessLists({ ...businessListPorts, copy: adminBusinessCopy });

import { createAdminLlmPresentation } from "${source}/features/admin/adminLlmPresentation.js";
import { ref } from "vue";
import { createCustomerModulePages } from "${source}/modules/customers/createCustomerModulePages.js";
import { createShipmentModulePages } from "${source}/modules/shipments/createShipmentModulePages.js";
import { createAgentModulePages } from "${source}/modules/agents/createAgentModulePages.js";
import { createHandoverModulePages } from "${source}/modules/handover/createHandoverModulePages.js";
import { useCustomerOperations } from "${source}/modules/workspace/useCustomerOperations.js";
import { useShipmentOperations } from "${source}/modules/workspace/useShipmentOperations.js";
import { useCustomerShipmentAccess } from "${source}/modules/customers/useCustomerShipmentAccess.js";
import { useShipmentCustomerBindings } from "${source}/modules/shipments/useShipmentCustomerBindings.js";
import { useTablePageTransition } from "${source}/features/tables/useTablePageTransition.js";
import { useBusinessCommands } from "${source}/modules/businessCommands.js";
import { createWorkspacePresentation } from "${source}/features/presentation/createWorkspacePresentation.js";
import { shipmentClientLabel, hasRefreshIssue, needsManualSupplement } from "${source}/features/shipments/shipmentPresentation.js";
import { provideModulePages, useModulePages } from "${source}/modules/moduleContext.js";
import { provideBusinessCommands } from "${source}/modules/businessCommandContext.js";
import { createBusinessModuleCatalog, composeApplicationViews } from "${source}/modules/moduleCatalog.js";
import { useAdminFiles } from "${source}/features/admin/useAdminFiles.js";
import { useAdminFilePreview } from "${source}/features/admin/useAdminFilePreview.js";
import { createAdminFilePresentation } from "${source}/features/admin/adminFilePresentation.js";
import type { AdminFilePorts, AdminFilePreviewPorts } from "${source}/types/adminFiles";
import { useAdminAccounts } from "${source}/features/admin/useAdminAccounts.js";
import { useAdminLlmSettings } from "${source}/features/admin/useAdminLlmSettings.js";
import { useAdminDevices } from "${source}/features/admin/useAdminDevices.js";
import { useAdminAnnouncements } from "${source}/features/admin/useAdminAnnouncements.js";
import { useAnnouncementEditor } from "${source}/features/admin/useAnnouncementEditor.js";
import { createAnnouncementPresentation } from "${source}/features/admin/announcementPresentation.js";
import { createAnnouncementLabels } from "${source}/features/admin/announcementLabels.js";
import { ANNOUNCEMENT_COPY } from "${source}/features/admin/announcementCopy.js";
import type { AnnouncementEditorPorts, AdminAccountPorts, AdminLlmPorts, AdminDevicePorts, AdminAnnouncementPorts } from "${source}/types/adminWorkflows";
import type { BusinessModuleRegistration } from "${source}/types/moduleRegistry";
import type { CustomerModulePorts, ShipmentModulePorts, AgentModulePorts, HandoverModulePorts, CustomerFormattersPort, ShipmentFormattersPort, CommonFormattersPort } from "${source}/types/businessModulePorts";
declare const customers: ReturnType<typeof useCustomerOperations>;
declare const shipments: ReturnType<typeof useShipmentOperations>;
declare const customerBindings: ReturnType<typeof useCustomerShipmentAccess>;
declare const shipmentBindings: ReturnType<typeof useShipmentCustomerBindings>;
declare const ui: ReturnType<typeof useTablePageTransition>;
declare const commands: ReturnType<typeof useBusinessCommands>;
const presentation = createWorkspacePresentation({
 t: key => key, getLocale: () => "en-US", readDirectory: () => ({ customers: customers.workspace.directory.customers.value, assignableCustomers: customers.workspace.directory.assignableCustomers.value }), getBoundCustomerIds: () => shipmentBindings.boundCustomersForSelectedShipment.value
});
const actualCommonFormatters: CommonFormattersPort = presentation;
const actualCustomerFormatters: CustomerFormattersPort = { ...presentation, needsManualSupplement };
const actualShipmentFormatters: ShipmentFormattersPort = { ...presentation, shipmentClientLabel, hasRefreshIssue };
const view = ref("");
const bool = ref(true);
const customerFormatters: CustomerFormattersPort = {
 customerInitial: customer => customer.username.slice(0, 1),
 formatDateTime: value => String(value ?? ""), formatDate: value => String(value ?? ""),
 statusLabel: value => value ?? "", partyRoleLabel: value => value ?? "", referenceTypeLabel: value => value ?? "",
 boundRoleSummary: shipment => shipment?.shipmentId ?? "", needsManualSupplement: shipment => Boolean(shipment?.manualSupplementRequired)
};
const shipmentFormatters: ShipmentFormattersPort = {
 formatDateTime: value => String(value ?? ""), customerFilterOptionLabel: customer => customer?.username ?? "",
 referenceTypeLabel: value => value ?? "", partyRoleLabel: value => value ?? "",
 shipmentClientLabel: shipment => shipment?.clientName ?? "", shipmentBoundUsers: () => [], boundUserLabel: user => String(user.name),
 hasRefreshIssue: shipment => Boolean(shipment?.lastRefreshError), refreshOutcomeTooltip: shipment => shipment?.lastRefreshResult ?? "",
 shipmentBusinessStateTagType: () => "info", shipmentBusinessStateLabel: shipment => shipment?.businessState ?? "",
 selectedCustomerOptionLabel: id => String(id ?? ""), getCustomerName: id => String(id), getCustomerUsername: id => String(id), isCustomerBoundToSelectedShipment: () => false
};
const customerPorts = {
 operations: customers, shipmentOperations: shipments, bindings: customerBindings, view, permissions: { isManager: bool }, ui,
 actions: { selectCustomerFromList: () => {}, navigateTo: () => {}, openShipmentDetail: () => {}, openShipmentSupplement: () => {} }, formatters: customerFormatters
} satisfies CustomerModulePorts;
const shipmentPorts = {
 operations: shipments, directory: customers.workspace.directory, bindings: shipmentBindings, view, permissions: { isManager: bool, isOverseaAgent: bool }, ui,
 actions: { trackShipmentInWorkspace: () => {}, editShipment: () => {}, navigateTo: () => {}, openTrackingWorkspace: () => {} }, formatters: shipmentFormatters
} satisfies ShipmentModulePorts;
const agentPorts = { operations: customers, ui, formatters: { statusLabel: customerFormatters.statusLabel } } satisfies AgentModulePorts;
const handoverPorts = { operations: customers, permissions: { canRequestBusinessHandover: bool, isOverseaAgent: bool }, formatters: { customerFilterOptionLabel: shipmentFormatters.customerFilterOptionLabel, formatDateTime: customerFormatters.formatDateTime, statusLabel: customerFormatters.statusLabel } } satisfies HandoverModulePorts;
const customerPages = createCustomerModulePages(customerPorts);
const shipmentPages = createShipmentModulePages(shipmentPorts);
const agentPages = createAgentModulePages(agentPorts);
const handoverPages = createHandoverModulePages(handoverPorts);
createCustomerModulePages({ ...customerPorts, formatters: actualCustomerFormatters });
createShipmentModulePages({ ...shipmentPorts, formatters: actualShipmentFormatters });
createAgentModulePages({ ...agentPorts, formatters: actualCommonFormatters });
createHandoverModulePages({ ...handoverPorts, formatters: actualCommonFormatters });
provideModulePages({ customers: customerPages, shipments: shipmentPages, agents: agentPages, handover: handoverPages });
provideBusinessCommands(commands);
useModulePages("customers").directory.formatters.customerInitial({ id: 1, username: "customer" });
shipmentPages.list.actions.editShipment({ shipmentId: "SHIP-1" });
customerPages.detail.actions.toggleCandidateShipment("SHIP-1", true);
customerPages.importDialog.actions.setFileInput(document.createElement("input"));
shipmentPages.list.actions.setTableRef(null);
declare const announcementPorts: AdminAnnouncementPorts;
const announcements = useAdminAnnouncements(announcementPorts);
announcements.openAnnouncementEditor({ id: 0, title: "Title", contentMarkdown: "Body", displayDate: "2026-10-11", status: "PUBLISHED" });
announcements.uploadAnnouncementImageFile(new File(["image"], "test.png"));
declare const editorPorts: AnnouncementEditorPorts;
const editor = useAnnouncementEditor(editorPorts);
editor.handleAnnouncementEditorPaste(new ClipboardEvent("paste"));
editor.applyAnnouncementFormat("bold");
createAnnouncementPresentation({ getOrigin: () => "https://console.example" });
declare const filePorts: AdminFilePorts;
declare const filePreviewPorts: AdminFilePreviewPorts;
const files = useAdminFiles(filePorts);
const filePreview = useAdminFilePreview(filePreviewPorts);
const filePresentation = createAdminFilePresentation({ t: filePorts.t, roleText: role => role, formatDate: date => date || "-" });
files.handleDownloadShipmentFile({ id: 0, fileName: "invoice.pdf" });
filePreview.handlePreviewShipmentFile({ publicId: "F-1" });
declare const devicePorts: AdminDevicePorts;
const devices = useAdminDevices(devicePorts);
devices.handleKickDevice({ id: 1, username: "employee", online: true });
declare const accountPorts: AdminAccountPorts;
declare const llmPorts: AdminLlmPorts;
const accounts = useAdminAccounts(accountPorts);
const llm = useAdminLlmSettings(llmPorts);
accounts.openEmployeeDialog({ id: 1, username: "employee", role: "BUSINESS" });
llm.llmForm.apiKey = "new-key";
const registration: BusinessModuleRegistration = {
 module: { id: "documents", mount: "documents", roles: ["BUSINESS"], labelKey: "documents.title", pages: [{ name: "business-documents", path: "", view: "documents" }] },
 views: { documents: async () => ({ default: { render: () => null } }) }
};
const catalog = createBusinessModuleCatalog([registration]);
const hostViews = { operations: async () => ({ default: { render: () => null } }) };
const views = composeApplicationViews(hostViews, catalog.views);
views.documents().then(page => { const component: import("vue").Component = page.default; });
`;
const probes = [
  [
    "console-login-response",
    "useAdminConsole({ ...consolePorts, services: { ...consolePorts.services, login: async () => ({ user: { id: true } }) } });"
  ],
  [
    "console-audit-argument",
    "useAdminConsole({ ...consolePorts, services: { ...consolePorts.services, fetchAudit: async (options: { page: string }) => ({ items: [] }) } });"
  ],
  [
    "console-overview-response",
    'useAdminConsole({ ...consolePorts, services: { ...consolePorts.services, fetchOverview: async () => ({ totalUsers: "many" }) } });'
  ],
  [
    "console-commit-response",
    "useAdminConsole({ ...consolePorts, commitLogin: (response: number) => {} });"
  ],
  ["console-audit-page", 'adminConsole.changeAuditPage("two");'],
  ["console-audit-row", "adminConsole.apiAuditRows.value[0].__missingAuditRecord;"],
  [
    "console-copy-contract",
    'useAdminConsole({ ...consolePorts, copy: () => ({ refreshed: "ok" }) });'
  ],
  ["console-load-arguments", 'adminConsole.loadMonitoring("unused");'],
  [
    "business-query-contract",
    "useAdminBusinessLists({ ...businessListPorts, services: { ...businessListPorts.services, fetchPlatformInfo: async (options: { page: string }) => ({ items: [] }) } });"
  ],
  [
    "business-delete-id",
    "useAdminBusinessLists({ ...businessListPorts, services: { ...businessListPorts.services, deletePlatformCustomer: async (id: boolean) => {} } });"
  ],
  [
    "business-confirm-result",
    'useAdminBusinessLists({ ...businessListPorts, confirmDelete: async () => "yes" });'
  ],
  [
    "business-handover-response",
    "useAdminBusinessLists({ ...businessListPorts, services: { ...businessListPorts.services, fetchCustomerHandovers: async () => ({ items: [{ requestId: true }] }) } });"
  ],
  ["business-status-event", "adminBusiness.changeCustomerHandoverStatus(true);"],
  ["business-page-event", 'adminBusiness.changeAdminTicketPage("two");'],
  ["business-customer-row", "adminBusiness.platformCustomers.value[0].__missingPlatformCustomer;"],
  ["business-presentation-id", "adminBusinessPresentation.platformRowKey({ customerId: true });"],
  [
    "business-formatter-date",
    "createAdminBusinessPresentation({ copy: adminBusinessCopy, formatDate: (value: number) => value });"
  ],
  ["accounts-page-payload", 'accounts.changeEmployeePage("two");'],

  ["file-presentation-date-input", "filePresentation.fileDate(42);"],
  [
    "file-presentation-record-input",
    "filePresentation.shipmentFileReference({ shipmentReference: { referenceNo: true } });"
  ],
  [
    "file-presentation-role-result",
    "createAdminFilePresentation({ t: filePorts.t, roleText: () => 42, formatDate: () => 'date' });"
  ],
  ["file-presentation-size-input", "filePresentation.formatFileSize('1024');"],
  [
    "file-service-query",
    "useAdminFiles({ ...filePorts, services: { ...filePorts.services, fetchWorkspaceFiles: async (query: { includeExpired: string }) => ({ items: [] }) } });"
  ],
  [
    "file-service-result",
    "useAdminFiles({ ...filePorts, services: { ...filePorts.services, fetchShipmentFiles: async () => ({ items: [{ id: true }] }) } });"
  ],
  ["file-download-parameter", "files.handleDownloadWorkspaceFile({ id: true });"],
  ["file-confirm-result", 'useAdminFiles({ ...filePorts, confirmDelete: async () => "yes" });'],
  ["file-page-parameter", 'files.changeAdminShipmentFilePage("2");'],
  [
    "preview-blob-result",
    'useAdminFilePreview({ ...filePreviewPorts, fetchBlob: async () => "blob" });'
  ],
  [
    "preview-url-result",
    "useAdminFilePreview({ ...filePreviewPorts, createObjectUrl: () => 42 });"
  ],
  ["preview-state-kind", 'filePreview.filePreviewDialog.kind = "video";'],
  ["preview-delete-parameter", "filePreview.closeDeletedFile(true);"],
  ["announcement-label-copy", `createAnnouncementLabels(() => ({ draft: 42 }));`],
  [
    "announcement-label-status",
    `createAnnouncementLabels(() => ANNOUNCEMENT_COPY["en-US"]).announcementStatusLabel(true);`
  ],
  ["editor-document-port", `useAnnouncementEditor({ ...editorPorts, getDocument: () => ({}) });`],
  ["editor-prompt-result", `useAnnouncementEditor({ ...editorPorts, prompt: () => 42 });`],
  ["editor-format-parameter", `editor.applyAnnouncementFormat(42);`],
  ["editor-paste-event", `editor.handleAnnouncementEditorPaste("paste");`],
  [
    "editor-input-reference",
    `editor.announcementImageInputRef.value = document.createElement("div");`
  ],
  ["presentation-origin-result", `createAnnouncementPresentation({ getOrigin: () => 42 });`],
  [
    "announcement-service-payload",
    `useAdminAnnouncements({ ...announcementPorts, services: { ...announcementPorts.services, createAnnouncement: async (payload: { title: number }) => ({ id: 1, ...payload }) } });`
  ],
  [
    "announcement-record-output",
    `useAdminAnnouncements({ ...announcementPorts, services: { ...announcementPorts.services, fetchAnnouncements: async () => ({ items: [{ id: 1, title: "No body" }] }) } });`
  ],
  [
    "announcement-confirmation",
    `useAdminAnnouncements({ ...announcementPorts, confirmDelete: async () => "yes" });`
  ],
  ["announcement-upload-input", `announcements.uploadAnnouncementImageFile("file.png");`],
  [
    "announcement-upload-output",
    `useAdminAnnouncements({ ...announcementPorts, services: { ...announcementPorts.services, uploadImage: async () => ({ url: 42 }) } });`
  ],
  [
    "announcement-editor-callback",
    `useAdminAnnouncements({ ...announcementPorts, editor: { ...announcementPorts.editor, insertImage: (url: number) => {} } });`
  ],
  ["announcement-state-contract", `announcements.announcementForm.displayDate = 42;`],
  [
    "device-service-id",
    "useAdminDevices({ ...devicePorts, services: { ...devicePorts.services, kickDevice: (id: boolean) => Promise.resolve(id) } });"
  ],
  [
    "device-list-response",
    'useAdminDevices({ ...devicePorts, services: { ...devicePorts.services, fetchDevices: async () => ({ items: [{ id: 1, username: "employee", online: "invalid" }], total: 1 }) } });'
  ],
  [
    "device-confirm-result",
    'useAdminDevices({ ...devicePorts, confirmDelete: async () => "invalid" });'
  ],
  ["device-action-record", "devices.handleDeleteDevice({ id: 1, online: true });"],
  ["device-pagination-parameter", 'devices.changeDevicePage("invalid");'],
  [
    "admin-service-payload",
    `useAdminAccounts({ ...accountPorts, services: { ...accountPorts.services, createEmployee: async (payload: number) => ({ id: 1, username: "employee", role: "BUSINESS" }) } });`
  ],
  [
    "admin-service-result",
    `useAdminAccounts({ ...accountPorts, services: { ...accountPorts.services, resetEmployeePassword: async () => ({ temporaryPassword: 42 }) } });`
  ],
  ["admin-identity", `useAdminAccounts({ ...accountPorts, currentUser: ref(true) });`],
  [
    "admin-confirmation",
    `useAdminAccounts({ ...accountPorts, confirmDelete: async () => "yes" });`
  ],
  ["admin-row-consumer", `accounts.toggleEmployee("employee");`],
  ["admin-form-consumer", `accounts.employeeForm.password = 123;`],
  [
    "llm-service-result",
    `useAdminLlmSettings({ ...llmPorts, services: { ...llmPorts.services, updateLlmSettings: async () => ({ enabled: "yes" }) } });`
  ],
  [
    "llm-presentation-input",
    `createAdminLlmPresentation({ t: () => "text" }).status({ enabled: "yes" });`
  ],
  ["llm-presentation-translation", `createAdminLlmPresentation({ t: () => 42 });`],
  [
    "llm-presentation-result",
    `const llmStatusNumber: number = createAdminLlmPresentation({ t: () => "text" }).status(null);`
  ],
  ["llm-presentation-key", `createAdminLlmPresentation({ t: () => "text" }).keyStatus(true);`],
  ["llm-form-consumer", `llm.llmForm.clearApiKey = "yes";`],
  [
    "formatter-parameter",
    `createCustomerModulePages({ ...customerPorts, formatters: { ...customerFormatters, customerInitial: (value: number) => String(value) } });`
  ],
  [
    "formatter-return",
    `createAgentModulePages({ ...agentPorts, formatters: { statusLabel: () => 42 } });`
  ],
  [
    "shipment-formatter-return",
    `createShipmentModulePages({ ...shipmentPorts, formatters: { ...shipmentFormatters, shipmentBusinessStateTagType: () => "unknown-tone" } });`
  ],
  [
    "handover-formatter-parameter",
    `createHandoverModulePages({ ...handoverPorts, formatters: { ...handoverPorts.formatters, customerFilterOptionLabel: (id: string) => id } });`
  ],
  [
    "injected-action-parameter",
    `createShipmentModulePages({ ...shipmentPorts, actions: { ...shipmentPorts.actions, editShipment: (id: number) => {} } });`
  ],
  [
    "missing-port",
    `const { ui: omittedUI, ...incompletePorts } = customerPorts; createCustomerModulePages(incompletePorts);`
  ],
  [
    "wrong-permission",
    `createCustomerModulePages({ ...customerPorts, permissions: { isManager: ref("yes") } });`
  ],
  ["wrong-view", `createShipmentModulePages({ ...shipmentPorts, view: ref(123) });`],
  [
    "wrong-ui",
    `createAgentModulePages({ ...agentPorts, ui: { tablePageTransitioning: ref("busy") } });`
  ],
  [
    "wrong-shipment-operations",
    `createCustomerModulePages({ ...customerPorts, shipmentOperations: { entry: shipments.entry, list: {} } });`
  ],
  ["consumer-formatter-parameter", `customerPages.directory.formatters.customerInitial(123);`],
  [
    "consumer-formatter-return",
    `customerPages.directory.formatters.customerInitial({ id: 1, username: "customer" }).toFixed(2);`
  ],
  ["consumer-action-parameter", `shipmentPages.list.actions.editShipment("SHIP-1");`],
  [
    "consumer-binding-parameter",
    `customerPages.detail.actions.toggleCandidateShipment("SHIP-1", "yes");`
  ],
  ["consumer-binding-state", `shipmentPages.detail.state.selectedCustomerIds.push(true);`],
  ["consumer-file-ref", `agentPages.importDialog.actions.setFileInput("input");`],
  ["consumer-table-ref", `shipmentPages.list.actions.setTableRef(123);`],
  ["consumer-id-parameter", `shipmentPages.detail.actions.unbindCustomerFromShipment(true);`],
  ["provider-module-shape", `provideModulePages({ customers: { directory: {} } });`],
  ["provider-missing-command", `provideBusinessCommands({ openCustomer: commands.openCustomer });`],
  [
    "injected-consumer-action",
    `useModulePages("customers").detail.actions.openShipmentDetail("SHIP-1");`
  ],
  [
    "consumer-row-contract",
    `customerPages.directory.state.paginatedCustomers[0].__missingRowField;`
  ],
  [
    "catalog-missing-registration-views",
    `createBusinessModuleCatalog([{ module: registration.module }]);`
  ],
  [
    "catalog-missing-roles",
    `const { roles: omittedRoles, ...missingRoles } = registration.module; createBusinessModuleCatalog([{ ...registration, module: missingRoles }]);`
  ],
  [
    "catalog-role-type",
    `createBusinessModuleCatalog([{ ...registration, module: { ...registration.module, roles: [true] } }]);`
  ],
  [
    "catalog-page-path",
    `createBusinessModuleCatalog([{ ...registration, module: { ...registration.module, pages: [{ name: "bad", path: 42, view: "documents" }] } }]);`
  ],
  [
    "catalog-page-missing-view",
    `createBusinessModuleCatalog([{ ...registration, module: { ...registration.module, pages: [{ name: "bad", path: "" }] } }]);`
  ],
  [
    "catalog-loader-return",
    `createBusinessModuleCatalog([{ ...registration, views: { documents: async () => ({ default: 42 }) } }]);`
  ],
  [
    "catalog-loader-async",
    `createBusinessModuleCatalog([{ ...registration, views: { documents: () => ({ default: {} }) } }]);`
  ],
  ["host-loader-type", `composeApplicationViews({ operations: "page" }, catalog.views);`],
  [
    "catalog-output-component",
    `catalog.views.documents().then(page => { const invalid: number = page.default; });`
  ]
];

const temporaryRoot = resolve(frontend, ".tmp");
mkdirSync(temporaryRoot, { recursive: true });
const directory = mkdtempSync(resolve(temporaryRoot, "module-port-types-"));
const fixturePath = resolve(directory, "fixture.ts");
const configPath = resolve(directory, "tsconfig.json");
function compile(content) {
  writeFileSync(fixturePath, content);
  writeFileSync(
    configPath,
    JSON.stringify({ extends: resolve(frontend, "tsconfig.json"), include: [fixturePath] })
  );
  return spawnSync(
    process.execPath,
    [resolve(frontend, "node_modules/typescript/bin/tsc"), "-p", configPath, "--pretty", "false"],
    { cwd: frontend, encoding: "utf8", timeout: 60000 }
  );
}
try {
  const valid = compile(fixture);
  assert.equal(valid.error, undefined, String(valid.error));
  assert.equal(valid.status, 0, valid.stdout + valid.stderr);
  const lines = fixture.split("\n").length;
  const invalid = compile(fixture + probes.map(([, code]) => code).join("\n"));
  assert.equal(invalid.error, undefined, String(invalid.error));
  assert.notEqual(invalid.status, 0, "Defective real module ports must fail compilation");
  const diagnosticLines = new Set(
    [...invalid.stdout.matchAll(/fixture\.ts\((\d+),\d+\): error TS\d+/g)].map((match) =>
      Number(match[1])
    )
  );
  probes.forEach(([name], index) =>
    assert.ok(
      diagnosticLines.has(lines + index),
      `Missing diagnostic for ${name}:\n${invalid.stdout}`
    )
  );
  console.log(
    `[module-port-types] Real producer/factory/catalog wiring passes; ${probes.length} invalid input, output-consumer, DOM-ref, provider and registration contracts rejected.`
  );
} finally {
  // Unique ignored child directory only: never delete the shared temp root.
  assert.equal(dirname(directory), temporaryRoot);
  rmSync(directory, { recursive: true, force: true });
}
