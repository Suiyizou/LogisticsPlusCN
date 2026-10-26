import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = fileURLToPath(new URL("../", import.meta.url));
const compiler = resolve(frontend, "node_modules/vue-tsc/bin/vue-tsc.js");
const moduleRoot = resolve(frontend, "src/modules");
const filesBelow = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(file) : [file];
  });
const modules = filesBelow(moduleRoot).filter((file) => file.endsWith(".vue"));
const featurePaths = [
  "src/features/shipments/ManualShipmentCreateDialog.vue",
  "src/features/shipments/ManualShipmentImportDialog.vue",
  "src/features/account/PersonalProfileDialog.vue",
  "src/features/overview/BusinessOverviewCharts.vue",
  "src/features/admin/AdminDevicesPage.vue",
  "src/features/admin/AdminAnnouncementDialogs.vue",
  "src/features/admin/AdminAnnouncementsPage.vue",
  "src/features/admin/AdminFilePreviewDialog.vue",
  "src/features/admin/AdminFilesPage.vue",
  "src/features/admin/AdminEmployeesPage.vue",
  "src/features/admin/AdminEmployeeDialogs.vue",
  "src/features/admin/AdminLlmSettingsPanel.vue",
  "src/features/admin/AdminSystemSettingsPage.vue",
  "src/features/admin/AdminOverviewPage.vue",
  "src/features/admin/AdminAuditPage.vue",
  "src/features/admin/AdminLoginPage.vue",
  "src/features/admin/AdminConsoleShell.vue",
  "src/features/admin/AdminPlatformPage.vue",
  "src/features/admin/AdminTicketsPage.vue",
  "src/features/admin/AdminHandoversPage.vue"
];
const features = featurePaths.map((file) => resolve(frontend, file));
const coverage = JSON.parse(readFileSync(resolve(frontend, "tsconfig.vue.json"), "utf8"));
for (const contract of ["src/modules/**/module.js", "src/modules/moduleCatalog.js"])
  assert.ok(
    coverage.include.includes(contract),
    `${contract} must retain real registration checking`
  );
for (const file of filesBelow(moduleRoot).filter(
  (file) => file.endsWith("/module.js") || file.endsWith("\\module.js")
)) {
  const source = readFileSync(file, "utf8");
  assert.match(source, /\/\/ @ts-check/, `${file} must check its actual registration`);
  assert.doesNotMatch(source, /@ts-nocheck|@ts-ignore|@ts-expect-error/);
}
for (const feature of featurePaths)
  assert.ok(
    coverage.include.includes(feature),
    `${feature} must remain in strict template coverage`
  );
for (const file of [...modules, ...features]) {
  const source = readFileSync(file, "utf8");
  const scripts = [...source.matchAll(/<script\b([^>]*)>/g)];
  for (const [, attributes] of scripts) {
    assert.match(
      attributes,
      /\blang=["']ts["']/,
      `${relative(frontend, file)} must retain TS SFC checking`
    );
    assert.doesNotMatch(
      attributes,
      /\bsrc=/,
      "External script blocks need an explicit coverage decision"
    );
  }
  assert.doesNotMatch(
    source,
    /@ts-nocheck|@vue-ignore|@vue-skip/,
    `${file} must not suppress template checking`
  );
}

const temporaryRoot = resolve(frontend, ".tmp");
mkdirSync(temporaryRoot, { recursive: true });
const directory = mkdtempSync(resolve(temporaryRoot, "sfc-typecheck-"));
function copyPage(name, originalPath, probes = "") {
  const originalFile = resolve(frontend, originalPath);
  let source = readFileSync(originalFile, "utf8");
  // Preserve real script/template wiring; only imports move to compensate for the isolated copy.
  source = source.replace(/\bfrom\s+(["'])(\.[^"']+)\1/g, (_, quote, imported) => {
    const target = resolve(dirname(originalFile), imported).replaceAll("\\", "/");
    return `from ${quote}${target}${quote}`;
  });
  source = source.replace(/\bimport\((["'])(\.[^"']+)\1\)/g, (_, quote, imported) => {
    const target = resolve(dirname(originalFile), imported).replaceAll("\\", "/");
    return `import(${quote}${target}${quote})`;
  });
  source = source.replace("<template>", `<template>\n${probes}`);
  if (name === "devices-invalid.vue")
    source = source.replace("device.displayName", "device.__missingDeviceSlotField");
  if (name === "announcement-list-invalid.vue")
    source = source.replace("row.contentMarkdown", "row.__missingAnnouncementSlotField");
  if (name === "file-list-invalid.vue")
    source = source
      .replace("file.ownerDisplayName", "file.__missingWorkspaceFileSlotField")
      .replace("file.documentCategory", "file.__missingShipmentFileSlotField");
  if (name === "employee-list-invalid.vue")
    source = source.replace("user.lastLoginAt", "user.__missingEmployeeSlotField");
  const slotProbes = {
    "audit-invalid.vue": ["row.username", "row.__missingAuditSlotField"],
    "platform-invalid.vue": ["row.customerDisplayName", "row.__missingPlatformSlotField"],
    "ticket-invalid.vue": ["row.referenceNo", "row.__missingTicketSlotField"],
    "handover-invalid.vue": ["row.reason", "row.__missingHandoverSlotField"]
  };
  if (slotProbes[name]) source = source.replace(...slotProbes[name]);
  const file = resolve(directory, name);
  writeFileSync(file, source);
  return file;
}
function check(files) {
  const config = resolve(directory, "tsconfig.json");
  writeFileSync(
    config,
    JSON.stringify({
      extends: resolve(frontend, "tsconfig.vue.json"),
      include: [...files, ...filesBelow(resolve(frontend, "src/types"))].map((file) =>
        file.replaceAll("\\", "/")
      )
    })
  );
  return spawnSync(process.execPath, [compiler, "-p", config, "--pretty", "false"], {
    cwd: frontend,
    encoding: "utf8",
    timeout: 60000
  });
}
try {
  const customer = "src/modules/customers/pages/CustomerDirectoryPage.vue";
  const shipment = "src/modules/shipments/pages/ShipmentListWorkspacePage.vue";
  const valid = check([
    copyPage("customer-valid.vue", customer),
    copyPage("shipment-valid.vue", shipment),
    ...featurePaths.map((file, index) => copyPage(`feature-${index}-valid.vue`, file))
  ]);
  assert.equal(valid.error, undefined, String(valid.error));
  assert.equal(valid.status, 0, valid.stdout + valid.stderr);
  const invalidProps = resolve(directory, "feature-props-invalid.vue");
  writeFileSync(
    invalidProps,
    `<script setup lang="ts">
import ManualCreate from "${features[0].replaceAll("\\", "/")}";
import ManualImport from "${features[1].replaceAll("\\", "/")}";
import Profile from "${features[2].replaceAll("\\", "/")}";
import Charts from "${features[3].replaceAll("\\", "/")}";
import Devices from "${features[4].replaceAll("\\", "/")}";
import Announcements from "${features[5].replaceAll("\\", "/")}";
import AnnouncementList from "${features[6].replaceAll("\\", "/")}";
import FilePreview from "${features[7].replaceAll("\\", "/")}";
import FileList from "${features[8].replaceAll("\\", "/")}";
import EmployeeList from "${features[9].replaceAll("\\", "/")}";
import EmployeeDialogs from "${features[10].replaceAll("\\", "/")}";
import LlmSettings from "${features[11].replaceAll("\\", "/")}";
import SystemSettings from "${features[12].replaceAll("\\", "/")}";
import AdminOverview from "${features[13].replaceAll("\\", "/")}";
import AdminAudit from "${features[14].replaceAll("\\", "/")}";
import AdminLogin from "${features[15].replaceAll("\\", "/")}";
import AdminShell from "${features[16].replaceAll("\\", "/")}";
import AdminPlatform from "${features[17].replaceAll("\\", "/")}";
import AdminTickets from "${features[18].replaceAll("\\", "/")}";
import AdminHandovers from "${features[19].replaceAll("\\", "/")}";
</script>
<template>
<ManualCreate :workflow="{ entryBusy: 'invalid-entry-busy' }"/>
<ManualImport :workflow="{ shipmentExcelImportProgress: { done: 'invalid-progress' } }"/>
<Profile :workflow="{}" :current-user="{ username: 'invalid-user', role: true }" :t="() => 7"/>
<Charts :loading="'invalid-chart-loading'" :trend="[{ label: 'probe', created: 'invalid-chart-count', updated: 1 }]"/>
<Devices :rows="[{ id: 1, online: 'invalid-online' }]" :busy="'invalid-device-busy'"/>
<Announcements :workflow="{}" :presentation="{}" :copy="{}" :busy="'invalid-announcement-busy'" :today="() => 7"/>
<AnnouncementList :rows="[{ id: true }]" :busy="'invalid-list-busy'" :page="'invalid-page'" :copy="{}" :presentation="{}" :format-date="() => 42"/>
<FilePreview :workflow="{}" :t="() => 42"/>
<FileList :workspace-rows="[{ id: true }]" :shipment-rows="[{ uploaderUserId: true }]" :section="'invalid-section'" :busy="'invalid-busy'" :presentation="{}"/>
<EmployeeList :rows="[{ id: true }]" :total="'invalid-total'" :busy="'invalid-busy'"/>
<EmployeeDialogs :workflow="{}" :busy="'invalid-busy'" :t="() => 42" :status-text="() => 42"/>
<LlmSettings :workflow="{}" :busy="'invalid-busy'" :t="() => 42"/>
<SystemSettings :workflow="{}" :monitoring="{ deviceLimit: 'invalid-limit', runtime: { totalRequests: true } }" :format-date="() => 42"/>
<AdminOverview :overview="{ totalUsers: 'invalid-count' }" :locale="42" :busy="'invalid-busy'"/>
<AdminAudit :rows="[{ id: true }]" :page="'invalid-page'" :busy="'invalid-busy'"/>
<AdminLogin :form="{username:42,password:true}" :busy="'invalid-busy'" :copy="{}"/>
<AdminShell :current-user="{id:true,username:42,role:true}" :nav-groups="[{children:[{key:true}]}]" :meta="{title:42}" :copy="{}"/>
<AdminPlatform :rows="[{customerId:true}]" :info="{customerCount:true}" :copy="{}" :presentation="{}"/>
<AdminTickets :rows="[{shipmentId:true}]" :total="'invalid-total'" :copy="{}" :presentation="{}"/>
<AdminHandovers :rows="[{requestId:true}]" :status="42" :busy="'invalid-busy'" :copy="{}" :presentation="{}"/>
</template>`
  );
  const invalid = check([
    invalidProps,
    copyPage(
      "manual-create-invalid.vue",
      featurePaths[0],
      `<div>{{ workflow.shipmentCreateForm.__missingManualField }}{{ workflow.shipmentCreateForm.routingLegs[0].__missingLegField }}{{ workflow.addManualRoutingLeg('invalid-action-payload') }}</div><button @click="onDialogKeydown('invalid-keyboard-event')"/>`
    ),
    copyPage(
      "manual-import-invalid.vue",
      featurePaths[1],
      `<div>{{ workflow.shipmentExcelImportPreview.rows[0].__missingImportColumn }}{{ workflow.shipmentExcelImportProgress.done.toUpperCase() }}{{ onFileDrop('invalid-drop-event') }}</div>`
    ),
    copyPage(
      "profile-invalid.vue",
      featurePaths[2],
      `<div>{{ personalProfileForm.__missingProfileField }}{{ updateOpen('invalid-dialog-open') }}</div>`
    ),
    copyPage(
      "charts-invalid.vue",
      featurePaths[3],
      `<div>{{ props.trend[0].__missingTrendField }}{{ props.today[0].value.toUpperCase() }}{{ props.loading.toUpperCase() }}</div>`
    ),
    copyPage(
      "devices-invalid.vue",
      featurePaths[4],
      '<div>{{ rows[0].__missingDeviceField }}{{ emit("kick", "invalid-device") }}{{ total.toUpperCase() }}</div>'
    ),
    copyPage(
      "announcements-invalid.vue",
      featurePaths[5],
      '<div>{{ announcementForm.__missingAnnouncementField }}{{ props.copy.__missingAnnouncementLabel }}{{ applyAnnouncementFormat(42) }}{{ handleAnnouncementEditorPaste("invalid-clipboard-event") }}{{ handleSaveAnnouncement("invalid-save-event") }}</div>'
    ),
    copyPage(
      "announcement-list-invalid.vue",
      featurePaths[6],
      '<div>{{ props.rows[0].__missingAnnouncementListField }}{{ emit("publish", "invalid-announcement-record") }}{{ emit("page", "invalid-announcement-page") }}{{ props.formatDate(42) }}</div>'
    ),
    copyPage(
      "file-preview-invalid.vue",
      featurePaths[7],
      '<div>{{ filePreviewDialog.__missingPreviewField }}{{ props.workflow.handlePreviewShipmentFile({ id: true }) }}{{ closeFilePreviewDialog("invalid-close-argument") }}</div>'
    ),
    copyPage(
      "file-list-invalid.vue",
      featurePaths[8],
      '<div>{{ props.workspaceRows[0].__missingWorkspaceFileField }}{{ emit("preview", { id: true }) }}{{ emit("workspacePage", "invalid-page") }}{{ emit("expired", "invalid-filter") }}{{ onExpiredChange("invalid-event") }}{{ props.presentation.fileDate(42) }}</div>'
    ),
    copyPage(
      "employee-list-invalid.vue",
      featurePaths[9],
      '<div>{{ props.rows[0].__missingEmployeeField }}{{ emit("reset", props.rows[0], "invalid-mouse-event") }}{{ emit("page", "invalid-page") }}{{ lastLogin(42) }}</div>'
    ),
    copyPage(
      "employee-dialogs-invalid.vue",
      featurePaths[10],
      '<div>{{ employeeForm.__missingEmployeeFormField }}{{ handleSaveEmployee("invalid-save-event") }}{{ props.workflow.openEmployeeDialog({ id: true }) }}{{ resetPasswordConfirmButtonRef?.__missingButtonField }}</div>'
    ),
    copyPage(
      "llm-settings-invalid.vue",
      featurePaths[11],
      '<div>{{ llmForm.__missingLlmFormField }}{{ llmSettings?.__missingLlmSettingField }}{{ handleUpdateLlmSettings("invalid-save-event") }}</div>'
    ),
    copyPage(
      "system-settings-invalid.vue",
      featurePaths[12],
      "<div>{{ props.monitoring?.runtime?.__missingRuntimeField }}{{ formatSafeDate(42) }}</div>"
    ),
    copyPage(
      "overview-invalid.vue",
      featurePaths[13],
      '<div>{{ props.overview?.__missingOverviewField }}</div>\n<div>{{ charts.render("invalid-overview-key", null) }}</div>'
    ),
    copyPage(
      "audit-invalid.vue",
      featurePaths[14],
      '<div>{{ props.rows[0].__missingAuditField }}</div>\n<div>{{ emit("page", "invalid-audit-page") }}</div>'
    ),
    copyPage(
      "login-invalid.vue",
      featurePaths[15],
      '<div>{{ props.form.__missingLoginField }}</div>\n<div>{{ emit("update-password", 42) }}</div>\n<div>{{ updateUsername("invalid-input-event") }}</div>'
    ),
    copyPage(
      "shell-invalid.vue",
      featurePaths[16],
      '<div>{{ props.navGroups[0].children[0].__missingShellNavField }}</div>\n<div>{{ emit("select", 42) }}</div>'
    ),
    copyPage(
      "platform-invalid.vue",
      featurePaths[17],
      '<div>{{ props.rows[0].__missingPlatformField }}</div>\n<div>{{ emit("delete", "invalid-customer-record") }}</div>'
    ),
    copyPage(
      "ticket-invalid.vue",
      featurePaths[18],
      '<div>{{ props.rows[0].__missingTicketField }}</div>\n<div>{{ emit("page", "invalid-ticket-page") }}</div>'
    ),
    copyPage(
      "handover-invalid.vue",
      featurePaths[19],
      '<div>{{ props.rows[0].__missingHandoverField }}</div>\n<div>{{ emit("status", 42) }}</div>'
    ),
    copyPage(
      "customer-invalid.vue",
      customer,
      `<div>{{ workspace.state.__missingCustomerState }} {{ workspace.actions.__missingCustomerAction() }} {{ workspace.state.customerPage.toUpperCase() }}</div>\n<el-button :loading="'invalid-loading-type'" />`
    ),
    copyPage(
      "shipment-invalid.vue",
      shipment,
      `<div>{{ workspace.state.__missingShipmentState }} {{ workspace.actions.__missingShipmentAction() }} {{ workspace.state.batchTrackProblemsOnly.toUpperCase() }}</div>`
    )
  ]);
  assert.equal(invalid.error, undefined, String(invalid.error));
  assert.notEqual(invalid.status, 0, "Intentional template defects must fail vue-tsc");
  // Each consumer's wrong props must fail independently; an unrelated form error
  // must not accidentally make this negative compilation appear successful.
  const invalidPropsLines = readFileSync(invalidProps, "utf8").split("\n");
  for (const component of [
    "ManualCreate",
    "ManualImport",
    "Profile",
    "Charts",
    "Devices",
    "Announcements",
    "AnnouncementList",
    "FilePreview",
    "FileList",
    "EmployeeList",
    "EmployeeDialogs",
    "LlmSettings",
    "SystemSettings",
    "AdminOverview",
    "AdminAudit",
    "AdminLogin",
    "AdminShell",
    "AdminPlatform",
    "AdminTickets",
    "AdminHandovers"
  ]) {
    const line = invalidPropsLines.findIndex((text) => text.startsWith(`<${component} `)) + 1;
    assert.ok(
      line > 0 && invalid.stdout.includes(`feature-props-invalid.vue(${line},`),
      `Missing independent prop diagnostic for ${component}:\n${invalid.stdout}`
    );
  }
  // Scope each new page's field and action diagnostic to its own copied file.
  // A failure from another page or another probe cannot satisfy these checks.
  const newPageChecks = [
    ["overview-invalid.vue", ["__missingOverviewField"], 'charts.render("invalid-overview-key"'],
    [
      "audit-invalid.vue",
      ["__missingAuditField", "__missingAuditSlotField"],
      'emit("page", "invalid-audit-page")'
    ],
    ["login-invalid.vue", ["__missingLoginField"], 'emit("update-password", 42)'],
    ["shell-invalid.vue", ["__missingShellNavField"], 'emit("select", 42)'],
    [
      "platform-invalid.vue",
      ["__missingPlatformField", "__missingPlatformSlotField"],
      'emit("delete", "invalid-customer-record")'
    ],
    [
      "ticket-invalid.vue",
      ["__missingTicketField", "__missingTicketSlotField"],
      'emit("page", "invalid-ticket-page")'
    ],
    [
      "handover-invalid.vue",
      ["__missingHandoverField", "__missingHandoverSlotField"],
      'emit("status", 42)'
    ]
  ];
  const diagnostics = invalid.stdout.split("\n");
  for (const [file, markers, action] of newPageChecks) {
    for (const marker of markers)
      assert.ok(
        diagnostics.some((line) => line.includes(`${file}(`) && line.includes(marker)),
        `Missing independent ${file} field diagnostic for ${marker}:\n${invalid.stdout}`
      );
    const source = readFileSync(resolve(directory, file), "utf8").split("\n");
    const line = source.findIndex((text) => text.includes(action)) + 1;
    assert.ok(
      line > 0 && diagnostics.some((text) => text.includes(`${file}(${line},`)),
      `Missing independent ${file} action diagnostic at line ${line}:\n${invalid.stdout}`
    );
  }
  for (const marker of [
    "__missingCustomerState",
    "__missingCustomerAction",
    "__missingShipmentState",
    "__missingShipmentAction",
    "type 'number'",
    "type 'boolean'",
    "not assignable to type 'boolean",
    "__missingManualField",
    "__missingLegField",
    "Expected 0 arguments",
    "KeyboardEvent",
    "__missingImportColumn",
    "DragEvent",
    "__missingProfileField",
    "__missingTrendField",
    "__missingDeviceField",
    "__missingDeviceSlotField",
    "__missingAnnouncementField",
    "__missingAnnouncementLabel",
    "ClipboardEvent",
    "__missingAnnouncementListField",
    "__missingAnnouncementSlotField",
    "__missingPreviewField",
    "__missingWorkspaceFileField",
    "__missingWorkspaceFileSlotField",
    "__missingShipmentFileSlotField",
    "type 'Event'",
    "__missingEmployeeField",
    "__missingEmployeeSlotField",
    "__missingEmployeeFormField",
    "__missingButtonField",
    "MouseEvent",
    "__missingLlmFormField",
    "__missingLlmSettingField",
    "__missingRuntimeField",
    "feature-props-invalid.vue"
  ])
    assert.ok(
      invalid.stdout.includes(marker),
      `Missing diagnostic for ${marker}:\n${invalid.stdout}`
    );
  console.log(
    `[sfc-typecheck] ${modules.length} modular SFCs and ${features.length} feature SFCs retain TS checking; page/feature state, action payload, DOM event, form field, chart data and component-prop regressions rejected.`
  );
} finally {
  // Remove only the unique directory created by this run inside the frontend's ignored temp root.
  assert.equal(dirname(directory), temporaryRoot);
  rmSync(directory, { recursive: true, force: true });
}
