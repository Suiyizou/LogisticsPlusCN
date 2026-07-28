const MAX_IMPORT_ROWS = 300;
const MAIN_SHEET_NAMES = ["\u7968\u5355\u4e3b\u8868", "SHIPMENTS", "SHIPMENT"];
const TRANSSHIPMENT_SHEET_NAMES = ["\u4e2d\u8f6c\u6e2f", "TRANSSHIPMENTS", "TRANSSHIPMENT"];
const ROUTING_SHEET_NAMES = ["\u5206\u6bb5\u8fd0\u8f93", "ROUTING LEGS", "ROUTINGLEGS"];
const CONTAINER_TYPE_SHEET_NAMES = ["\u7bb1\u578b\u6570\u91cf", "CONTAINER TYPES", "CONTAINERTYPES"];
const CONTAINER_SHEET_NAMES = ["\u7bb1\u7ea7\u8be6\u60c5", "CONTAINERS", "CONTAINER DETAILS"];

const MAIN_COLUMNS = [
  column("importKey", "\u5bfc\u5165\u7f16\u53f7*", "IMPORT KEY", true),
  column("carrier", "\u627f\u8fd0\u4eba*", "CARRIER", true),
  column("referenceNo", "\u8ba2\u8231\u53f7*", "BOOKING NUMBER", true),
  column("latestEventName", "\u6700\u65b0\u52a8\u6001*", "LATEST EVENT", true),
  column("latestEventLocation", "\u6700\u65b0\u52a8\u6001\u5730\u70b9", "LATEST EVENT LOCATION"),
  column("latestEventTime", "\u6700\u65b0\u52a8\u6001\u65f6\u95f4", "LATEST EVENT TIME"),
  column("estimatedDeparture", "\u9884\u8ba1\u79bb\u6e2f ETD*", "ESTIMATED DEPARTURE", true),
  column("estimatedArrival", "\u9884\u8ba1\u5230\u6e2f ETA*", "ESTIMATED ARRIVAL", true),
  column("estimatedDelivery", "\u9884\u8ba1\u5230\u8fbe\u6700\u7ec8\u76ee\u7684\u5730", "ESTIMATED DELIVERY"),
  column("actualDeparture", "\u5b9e\u9645\u79bb\u6e2f", "ACTUAL DEPARTURE"),
  column("actualArrival", "\u5b9e\u9645\u5230\u6e2f", "ACTUAL ARRIVAL"),
  column("actualDelivery", "\u5b9e\u9645\u9001\u8fbe", "ACTUAL DELIVERY"),
  ...routeColumns("por", "POR"),
  ...routeColumns("fpol", "FPOL"),
  ...routeColumns("lpod", "LPOD"),
  ...routeColumns("fnd", "FND"),
  column("forwarderJobNumber", "\u4e1a\u52a1 JOB NUMBER", "FORWARDER JOB NUMBER"),
  column("clientNameCode", "\u5ba2\u6237\u540d\u79f0\u4ee3\u7801", "CLIENT NAME CODE"),
  column("clientPoNumber", "\u5ba2\u6237 PO NO.", "CLIENT PO NUMBER"),
  column("billOfLading", "\u63d0\u5355\u53f7 / Master B/L", "BILL OF LADING"),
  column("vesselVoyage", "\u8239\u540d / \u822a\u6b21", "VESSEL / VOYAGE"),
  column("trafficTerm", "\u8fd0\u8f93\u6761\u6b3e", "TRAFFIC TERM"),
  column("serviceScopes", "\u670d\u52a1\u7c7b\u522b", "SERVICE CATEGORIES"),
  column("note", "\u4e1a\u52a1\u5458\u5907\u6ce8", "NOTE")
];

const TRANSSHIPMENT_COLUMNS = [
  column("importKey", "\u5bfc\u5165\u7f16\u53f7*", "IMPORT KEY", true),
  column("sequence", "\u5e8f\u53f7", "SEQUENCE"),
  column("city", "\u5730\u70b9\u540d\u79f0*", "LOCATION", true),
  column("countryCode", "\u56fd\u5bb6 / \u5730\u533a\u4ee3\u7801", "COUNTRY CODE"),
  column("facilityCode", "\u7801\u5934 / \u573a\u7ad9", "TERMINAL / FACILITY"),
  column("event", "\u8282\u70b9\u4e8b\u4ef6", "EVENT"),
  column("estimatedTime", "\u8282\u70b9\u9884\u8ba1\u65f6\u95f4", "ESTIMATED TIME"),
  column("actualTime", "\u8282\u70b9\u5b9e\u9645\u65f6\u95f4", "ACTUAL TIME"),
  column("timezone", "\u65f6\u533a", "TIMEZONE")
];

const ROUTING_COLUMNS = [
  column("importKey", "\u5bfc\u5165\u7f16\u53f7*", "IMPORT KEY", true),
  column("sequence", "\u6bb5\u5e8f\u53f7", "SEQUENCE"),
  column("mode", "\u8fd0\u8f93\u65b9\u5f0f", "TRANSPORT MODE"),
  column("vesselName", "\u8239\u540d / \u8fd0\u8f93\u5de5\u5177", "VESSEL / VEHICLE"),
  column("service", "\u822a\u7ebf / \u670d\u52a1", "SERVICE / ROUTE"),
  column("voyage", "\u822a\u6b21", "VOYAGE"),
  column("loadPort", "\u88c5\u8f7d\u5730 / \u88c5\u8d27\u6e2f", "LOAD PORT"),
  column("loadCountryCode", "\u88c5\u8f7d\u56fd\u5bb6\u4ee3\u7801", "LOAD COUNTRY CODE"),
  column("dischargePort", "\u5378\u8f7d\u5730 / \u5378\u8d27\u6e2f", "DISCHARGE PORT"),
  column("dischargeCountryCode", "\u5378\u8f7d\u56fd\u5bb6\u4ee3\u7801", "DISCHARGE COUNTRY CODE"),
  column("estimatedDeparture", "\u9884\u8ba1\u79bb\u6e2f ETD", "ESTIMATED DEPARTURE"),
  column("actualDeparture", "\u5b9e\u9645\u79bb\u6e2f", "ACTUAL DEPARTURE"),
  column("estimatedArrival", "\u9884\u8ba1\u5230\u6e2f ETA", "ESTIMATED ARRIVAL"),
  column("actualArrival", "\u5b9e\u9645\u5230\u6e2f", "ACTUAL ARRIVAL"),
  column("masterBill", "\u4e3b\u63d0\u5355\u53f7", "MASTER BILL")
];

const CONTAINER_TYPE_COLUMNS = [
  column("importKey", "\u5bfc\u5165\u7f16\u53f7*", "IMPORT KEY", true),
  column("type", "\u7bb1\u578b*", "CONTAINER TYPE", true),
  column("quantity", "\u6570\u91cf*", "QUANTITY", true)
];

const CONTAINER_COLUMNS = [
  column("importKey", "\u5bfc\u5165\u7f16\u53f7*", "IMPORT KEY", true),
  column("number", "\u7bb1\u53f7", "CONTAINER NUMBER"),
  column("type", "\u7bb1\u578b", "CONTAINER TYPE"),
  column("transportMode", "\u8fd0\u8f93\u65b9\u5f0f", "TRANSPORT MODE"),
  column("trafficTerm", "\u8fd0\u8f93\u6761\u6b3e", "TRAFFIC TERM"),
  column("currentLocation", "\u5f53\u524d\u4f4d\u7f6e", "CURRENT LOCATION"),
  column("latestEvent", "\u6700\u65b0\u52a8\u6001 / \u5f53\u524d\u72b6\u6001", "LATEST EVENT"),
  column("latestEventTime", "\u6700\u65b0\u52a8\u6001\u65f6\u95f4", "LATEST EVENT TIME")
];

export function buildManualShipmentImportTemplate(xlsx) {
  const workbook = xlsx.utils.book_new();
  appendTemplateSheet(xlsx, workbook, "\u586b\u5199\u8bf4\u660e", [
    ["\u5b8c\u6574\u7968\u5355 Excel \u6279\u91cf\u5bfc\u5165\u6a21\u677f / Complete Shipment Import Template"],
    ["1. \u201c\u7968\u5355\u4e3b\u8868\u201d\u6bcf\u884c\u4e00\u5f20\u7968\u5355\uff1b\u5e26 * \u7684\u5b57\u6bb5\u5fc5\u987b\u586b\u5199\u3002"],
    ["2. \u5bfc\u5165\u7f16\u53f7\u7528\u4e8e\u5173\u8054\u5176\u4ed6\u5de5\u4f5c\u8868\uff0c\u540c\u4e00\u5f20\u7968\u5355\u5728\u6240\u6709\u5de5\u4f5c\u8868\u4e2d\u5fc5\u987b\u4fdd\u6301\u4e00\u81f4\u3002"],
    ["3. POR\u3001FPOL\u3001LPOD\u3001FND \u56db\u4e2a\u57fa\u7840\u8def\u7ebf\u8282\u70b9\u5fc5\u987b\u586b\u5199\uff1b\u4e2d\u8f6c\u6e2f\u5728\u201c\u4e2d\u8f6c\u6e2f\u201d\u5de5\u4f5c\u8868\u9009\u586b\u3002"],
    ["4. \u6bcf\u5f20\u7968\u5355\u81f3\u5c11\u5728\u201c\u7bb1\u578b\u6570\u91cf\u201d\u5de5\u4f5c\u8868\u586b\u5199\u4e00\u79cd\u7bb1\u578b\u548c\u6570\u91cf\u3002"],
    ["5. \u5206\u6bb5\u8fd0\u8f93\u3001\u7bb1\u53f7\u548c\u7bb1\u7ea7\u8be6\u60c5\u5747\u4e3a\u9009\u586b\uff1b\u670d\u52a1\u7c7b\u522b\u4f7f\u7528 OCEAN|INLAND|CUSTOMS|WAREHOUSE\u3002"],
    ["6. \u65f6\u95f4\u5efa\u8bae\u4f7f\u7528 yyyy-mm-dd hh:mm\uff1b\u56fd\u5bb6\u4ee3\u7801\u4f7f\u7528 CN\u3001US \u7b49\u4e24\u4f4d\u4ee3\u7801\u3002"],
    ["7. \u627f\u8fd0\u4eba\u652f\u6301 COSCO\u3001CMA\uff1b\u7968\u5355\u5fc5\u987b\u4f7f\u7528\u8ba2\u8231\u53f7\u5efa\u7acb\uff0c\u63d0\u5355\u53f7\u4ec5\u4f5c\u4e3a\u9644\u5c5e\u4fe1\u606f\u3002"]
  ], [90]);
  appendTemplateSheet(
    xlsx,
    workbook,
    "\u7968\u5355\u4e3b\u8868",
    [MAIN_COLUMNS.map((item) => item.header), mainExampleRow()],
    MAIN_COLUMNS.map(() => 20)
  );
  appendTemplateSheet(
    xlsx,
    workbook,
    "\u4e2d\u8f6c\u6e2f",
    [TRANSSHIPMENT_COLUMNS.map((item) => item.header), transshipmentExampleRow()],
    TRANSSHIPMENT_COLUMNS.map(() => 20)
  );
  appendTemplateSheet(
    xlsx,
    workbook,
    "\u5206\u6bb5\u8fd0\u8f93",
    [ROUTING_COLUMNS.map((item) => item.header), routingExampleRow()],
    ROUTING_COLUMNS.map(() => 20)
  );
  appendTemplateSheet(
    xlsx,
    workbook,
    "\u7bb1\u578b\u6570\u91cf",
    [CONTAINER_TYPE_COLUMNS.map((item) => item.header), ["SHIP-001", "40HQ", 2]],
    CONTAINER_TYPE_COLUMNS.map(() => 22)
  );
  appendTemplateSheet(
    xlsx,
    workbook,
    "\u7bb1\u7ea7\u8be6\u60c5",
    [
      CONTAINER_COLUMNS.map((item) => item.header),
      ["SHIP-001", "TEMU6003424", "40HQ", "SEA", "CY | CY", "Shanghai", "Gate in", "2026-08-01 09:00"]
    ],
    CONTAINER_COLUMNS.map(() => 22)
  );
  return workbook;
}

export function parseManualShipmentImportWorkbook(workbook, xlsx) {
  const sheets = workbook?.SheetNames || [];
  const mainSheetName = findSheetName(sheets, MAIN_SHEET_NAMES) || sheets[0];
  const globalErrors = [];
  if (!mainSheetName) {
    return emptyImportResult(["Excel \u4e2d\u6ca1\u6709\u53ef\u8bfb\u53d6\u7684\u5de5\u4f5c\u8868\u3002"]);
  }
  const mainRows = readSheet(workbook, mainSheetName, MAIN_COLUMNS, xlsx);
  if (!mainRows.length) {
    return emptyImportResult(["\u7968\u5355\u4e3b\u8868\u6ca1\u6709\u6570\u636e\u3002"]);
  }
  if (mainRows.length > MAX_IMPORT_ROWS) {
    return emptyImportResult([`\u5355\u6b21\u6700\u591a\u5bfc\u5165 ${MAX_IMPORT_ROWS} \u5f20\u7968\u5355\u3002`]);
  }

  const transshipmentRows = readOptionalSheet(
    workbook, sheets, TRANSSHIPMENT_SHEET_NAMES, TRANSSHIPMENT_COLUMNS, xlsx
  );
  const routingRows = readOptionalSheet(
    workbook, sheets, ROUTING_SHEET_NAMES, ROUTING_COLUMNS, xlsx
  );
  const containerTypeRows = readOptionalSheet(
    workbook, sheets, CONTAINER_TYPE_SHEET_NAMES, CONTAINER_TYPE_COLUMNS, xlsx
  );
  const containerRows = readOptionalSheet(
    workbook, sheets, CONTAINER_SHEET_NAMES, CONTAINER_COLUMNS, xlsx
  );

  const children = {
    transshipments: groupChildRows(transshipmentRows, "\u4e2d\u8f6c\u6e2f", globalErrors),
    routingLegs: groupChildRows(routingRows, "\u5206\u6bb5\u8fd0\u8f93", globalErrors),
    containerTypes: groupChildRows(containerTypeRows, "\u7bb1\u578b\u6570\u91cf", globalErrors),
    containers: groupChildRows(containerRows, "\u7bb1\u7ea7\u8be6\u60c5", globalErrors)
  };
  const seenKeys = new Set();
  const seenReferences = new Set();
  const rows = mainRows.map((source) => {
    const errors = [];
    const warnings = [];
    const importKey = text(source.importKey) || text(source.referenceNo);
    requireValue(errors, source, "importKey", "\u5bfc\u5165\u7f16\u53f7");
    requireValue(errors, source, "carrier", "\u627f\u8fd0\u4eba");
    requireValue(errors, source, "referenceNo", "\u8ba2\u8231\u53f7");
    requireValue(errors, source, "latestEventName", "\u6700\u65b0\u52a8\u6001");
    requireValue(errors, source, "estimatedDeparture", "\u9884\u8ba1\u79bb\u6e2f ETD");
    requireValue(errors, source, "estimatedArrival", "\u9884\u8ba1\u5230\u6e2f ETA");
    for (const prefix of ["por", "fpol", "lpod", "fnd"]) {
      requireValue(errors, source, `${prefix}City`, `${prefix.toUpperCase()} \u5730\u70b9`);
    }

    const carrier = normalizeCarrier(source.carrier);
    const referenceType = "BOOKING";
    if (source.carrier && !carrier) errors.push("\u627f\u8fd0\u4eba\u4ec5\u652f\u6301 COSCO \u6216 CMA");
    if (importKey) {
      const normalizedKey = normalizeKey(importKey);
      if (seenKeys.has(normalizedKey)) errors.push(`\u5bfc\u5165\u7f16\u53f7\u91cd\u590d\uff1a${importKey}`);
      seenKeys.add(normalizedKey);
    }
    const identity = `${carrier}|${referenceType}|${normalizeKey(source.referenceNo)}`;
    if (carrier && referenceType && source.referenceNo) {
      if (seenReferences.has(identity)) errors.push(`\u627f\u8fd0\u4eba\u3001\u5355\u53f7\u7c7b\u578b\u548c\u4e1a\u52a1\u5355\u53f7\u91cd\u590d\uff1a${source.referenceNo}`);
      seenReferences.add(identity);
    }

    const routeNodes = buildBaseRouteNodes(source);
    const transshipments = sortedChildren(children.transshipments.get(normalizeKey(importKey)))
      .filter((item) => {
        if (!text(item.city)) {
          errors.push(`\u4e2d\u8f6c\u6e2f\u5de5\u4f5c\u8868\u7b2c ${item.__rowNumber} \u884c\u7f3a\u5c11\u5730\u70b9\u540d\u79f0`);
          return false;
        }
        return true;
      })
      .map((item) => ({
        locationType: "TSP",
        city: text(item.city),
        countryCode: countryCode(item.countryCode),
        facilityCode: text(item.facilityCode),
        event: text(item.event),
        estimatedTime: text(item.estimatedTime),
        actualTime: text(item.actualTime),
        timezone: text(item.timezone)
      }));
    routeNodes.splice(2, 0, ...transshipments);

    const routingLegs = sortedChildren(children.routingLegs.get(normalizeKey(importKey)))
      .map((item) => compactObject({
        mode: normalizeTransportMode(item.mode),
        vesselName: text(item.vesselName),
        service: text(item.service),
        voyage: text(item.voyage),
        loadPort: text(item.loadPort),
        loadCountryCode: countryCode(item.loadCountryCode),
        dischargePort: text(item.dischargePort),
        dischargeCountryCode: countryCode(item.dischargeCountryCode),
        estimatedDeparture: text(item.estimatedDeparture),
        actualDeparture: text(item.actualDeparture),
        estimatedArrival: text(item.estimatedArrival),
        actualArrival: text(item.actualArrival),
        masterBill: text(item.masterBill)
      }));

    const containerTypes = sortedChildren(children.containerTypes.get(normalizeKey(importKey)))
      .map((item) => {
        const type = text(item.type).toUpperCase();
        const quantity = Number(text(item.quantity));
        if (!type) errors.push(`\u7bb1\u578b\u6570\u91cf\u5de5\u4f5c\u8868\u7b2c ${item.__rowNumber} \u884c\u7f3a\u5c11\u7bb1\u578b`);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
          errors.push(`\u7bb1\u578b\u6570\u91cf\u5de5\u4f5c\u8868\u7b2c ${item.__rowNumber} \u884c\u6570\u91cf\u5fc5\u987b\u4e3a 1-999 \u7684\u6574\u6570`);
        }
        return { type, quantity };
      })
      .filter((item) => item.type && Number.isInteger(item.quantity) && item.quantity > 0);
    if (!containerTypes.length) errors.push("\u81f3\u5c11\u9700\u8981\u4e00\u79cd\u7bb1\u578b\u548c\u6570\u91cf");

    const containers = sortedChildren(children.containers.get(normalizeKey(importKey)))
      .map((item) => compactObject({
        number: text(item.number).toUpperCase(),
        type: text(item.type).toUpperCase(),
        transportMode: normalizeTransportMode(item.transportMode),
        trafficTerm: text(item.trafficTerm),
        currentLocation: text(item.currentLocation),
        latestEvent: text(item.latestEvent),
        latestEventTime: text(item.latestEventTime)
      }))
      .filter((item) => Object.values(item).some(Boolean));
    if (containers.some((item) => !item.number)) {
      warnings.push("\u5b58\u5728\u672a\u586b\u5199\u7bb1\u53f7\u7684\u7bb1\u7ea7\u8be6\u60c5\uff1b\u4ecd\u4f1a\u4f5c\u4e3a\u53ef\u9009\u8fd0\u8f93\u8be6\u60c5\u5bfc\u5165");
    }
    const serviceScopes = parseServiceScopes(source.serviceScopes, warnings);
    const volume = containerTypes.map((item) => `${item.type} \u00d7 ${item.quantity}`).join(" \u00b7 ");
    const payload = {
      carrier,
      referenceType,
      referenceNo: text(source.referenceNo),
      trackingStatus: text(source.latestEventName),
      latestEventName: text(source.latestEventName),
      latestEventLocation: text(source.latestEventLocation),
      latestEventTime: text(source.latestEventTime),
      estimatedDeparture: text(source.estimatedDeparture),
      estimatedArrival: text(source.estimatedArrival),
      estimatedDelivery: text(source.estimatedDelivery),
      actualDeparture: text(source.actualDeparture),
      actualArrival: text(source.actualArrival),
      actualDelivery: text(source.actualDelivery),
      currentLocation: text(source.latestEventLocation),
      forwarderJobNumber: text(source.forwarderJobNumber),
      clientNameCode: text(source.clientNameCode),
      clientPoNumber: text(source.clientPoNumber),
      bookingNumber: text(source.referenceNo),
      billOfLading: text(source.billOfLading),
      vesselVoyage: text(source.vesselVoyage),
      trafficTerm: text(source.trafficTerm),
      serviceScopes,
      note: text(source.note),
      portOfLoading: text(source.fpolCity),
      portOfDischarge: text(source.lpodCity),
      volume,
      routeNodes,
      routingLegs,
      containerTypes,
      containers
    };
    return {
      importKey,
      rowNumber: source.__rowNumber,
      referenceNo: text(source.referenceNo),
      carrier: carrier || text(source.carrier),
      referenceType,
      errors: unique(errors),
      warnings: unique(warnings),
      payload
    };
  });

  const knownKeys = new Set(rows.map((row) => normalizeKey(row.importKey)).filter(Boolean));
  for (const [sheetLabel, grouped] of [
    ["\u4e2d\u8f6c\u6e2f", children.transshipments],
    ["\u5206\u6bb5\u8fd0\u8f93", children.routingLegs],
    ["\u7bb1\u578b\u6570\u91cf", children.containerTypes],
    ["\u7bb1\u7ea7\u8be6\u60c5", children.containers]
  ]) {
    for (const key of grouped.keys()) {
      if (key && !knownKeys.has(key)) globalErrors.push(`${sheetLabel}\u5b58\u5728\u4e3b\u8868\u4e2d\u672a\u5b9a\u4e49\u7684\u5bfc\u5165\u7f16\u53f7\uff1a${key}`);
    }
  }
  return {
    rows,
    items: rows.filter((row) => row.errors.length === 0),
    globalErrors: unique(globalErrors),
    total: rows.length,
    valid: rows.filter((row) => row.errors.length === 0).length,
    invalid: rows.filter((row) => row.errors.length > 0).length,
    warningCount: rows.reduce((count, row) => count + row.warnings.length, 0)
  };
}

export function buildManualShipmentImportResultWorkbook(results, xlsx) {
  const workbook = xlsx.utils.book_new();
  const rows = [
    ["\u5bfc\u5165\u7f16\u53f7", "\u627f\u8fd0\u4eba", "\u5355\u53f7\u7c7b\u578b", "\u4e1a\u52a1\u5355\u53f7", "\u5bfc\u5165\u72b6\u6001", "\u7ed3\u679c\u8bf4\u660e"],
    ...(results || []).map((item) => [
      item.importKey,
      item.carrier,
      item.referenceType,
      item.referenceNo,
      item.status,
      item.message || ""
    ])
  ];
  appendTemplateSheet(xlsx, workbook, "\u5bfc\u5165\u7ed3\u679c", rows, [18, 14, 18, 24, 14, 54]);
  return workbook;
}

function routeColumns(prefix, code) {
  return [
    column(`${prefix}City`, `${code} \u5730\u70b9*`, `${code} LOCATION`, true),
    column(`${prefix}CountryCode`, `${code} \u56fd\u5bb6\u4ee3\u7801`, `${code} COUNTRY CODE`),
    column(`${prefix}FacilityCode`, `${code} \u7801\u5934 / \u573a\u7ad9`, `${code} TERMINAL / FACILITY`),
    column(`${prefix}Event`, `${code} \u8282\u70b9\u4e8b\u4ef6`, `${code} EVENT`),
    column(`${prefix}EstimatedTime`, `${code} \u9884\u8ba1\u65f6\u95f4`, `${code} ESTIMATED TIME`),
    column(`${prefix}ActualTime`, `${code} \u5b9e\u9645\u65f6\u95f4`, `${code} ACTUAL TIME`),
    column(`${prefix}Timezone`, `${code} \u65f6\u533a`, `${code} TIMEZONE`)
  ];
}

function column(field, header, english, required = false) {
  return {
    field,
    header,
    required,
    aliases: [header, header.replace(/\*/g, ""), english, field]
  };
}

function appendTemplateSheet(xlsx, workbook, name, rows, widths) {
  const worksheet = xlsx.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = widths.map((wch) => ({ wch }));
  if (rows.length > 1 && rows[0].length > 1) {
    worksheet["!autofilter"] = { ref: xlsx.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(0, rows.length - 1), c: rows[0].length - 1 }
    }) };
  }
  xlsx.utils.book_append_sheet(workbook, worksheet, name);
}

function mainExampleRow() {
  const values = Object.fromEntries(MAIN_COLUMNS.map((item) => [item.field, ""]));
  Object.assign(values, {
    importKey: "SHIP-001",
    carrier: "COSCO",
    referenceNo: "6508205930",
    latestEventName: "Booking confirmed",
    latestEventLocation: "Shanghai",
    latestEventTime: "2026-07-26 09:00",
    estimatedDeparture: "2026-08-01 16:00",
    estimatedArrival: "2026-08-14 16:00",
    estimatedDelivery: "2026-08-16 10:00",
    porCity: "Suzhou",
    porCountryCode: "CN",
    fpolCity: "Shanghai",
    fpolCountryCode: "CN",
    lpodCity: "Long Beach",
    lpodCountryCode: "US",
    fndCity: "Los Angeles",
    fndCountryCode: "US",
    forwarderJobNumber: "LJSH26070001",
    clientNameCode: "HAYDEN",
    clientPoNumber: "PO-2026-001",
    billOfLading: "COSU6508205930",
    vesselVoyage: "COSCO SHIPPING / 001E",
    trafficTerm: "CY | CY",
    serviceScopes: "OCEAN|INLAND",
    note: "\u6a21\u677f\u793a\u4f8b\u884c\uff0c\u6b63\u5f0f\u5bfc\u5165\u524d\u8bf7\u66ff\u6362\u6216\u5220\u9664"
  });
  return MAIN_COLUMNS.map((item) => values[item.field]);
}

function transshipmentExampleRow() {
  return [
    "SHIP-001", 1, "Busan", "KR", "Busan New Port", "Transshipment",
    "2026-08-06 10:00", "", "Asia/Seoul"
  ];
}

function routingExampleRow() {
  return [
    "SHIP-001", 1, "SEA", "COSCO SHIPPING", "TP1", "001E",
    "Shanghai", "CN", "Long Beach", "US",
    "2026-08-01 16:00", "", "2026-08-14 16:00", "", ""
  ];
}

function readOptionalSheet(workbook, sheetNames, candidates, columns, xlsx) {
  const name = findSheetName(sheetNames, candidates);
  return name ? readSheet(workbook, name, columns, xlsx) : [];
}

function readSheet(workbook, sheetName, columns, xlsx) {
  const worksheet = workbook?.Sheets?.[sheetName];
  if (!worksheet) return [];
  const sourceRows = xlsx.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: false,
    dateNF: "yyyy-mm-dd hh:mm"
  });
  const firstRow = sourceRows.findIndex((row) =>
    Array.isArray(row) && row.some((cell) => text(cell))
  );
  if (firstRow < 0) return [];
  const headers = sourceRows[firstRow].map(normalizeHeader);
  const indexes = Object.fromEntries(columns.map((definition) => [
    definition.field,
    findColumnIndex(headers, definition.aliases)
  ]));
  return sourceRows
    .slice(firstRow + 1)
    .map((row, index) => {
      const value = { __rowNumber: firstRow + index + 2 };
      for (const definition of columns) {
        const columnIndex = indexes[definition.field];
        value[definition.field] = columnIndex >= 0 ? text(row?.[columnIndex]) : "";
      }
      return value;
    })
    .filter((row) => columns.some((item) => text(row[item.field])));
}

function findSheetName(sheetNames, candidates) {
  const expected = new Set(candidates.map(normalizeHeader));
  return sheetNames.find((name) => expected.has(normalizeHeader(name))) || "";
}

function findColumnIndex(headers, aliases) {
  const expected = new Set(aliases.map(normalizeHeader));
  return headers.findIndex((header) => expected.has(header));
}

function groupChildRows(rows, label, globalErrors) {
  const grouped = new Map();
  for (const row of rows) {
    const key = normalizeKey(row.importKey);
    if (!key) {
      globalErrors.push(`${label}\u5de5\u4f5c\u8868\u7b2c ${row.__rowNumber} \u884c\u7f3a\u5c11\u5bfc\u5165\u7f16\u53f7`);
      continue;
    }
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return grouped;
}

function sortedChildren(rows = []) {
  return [...rows].sort((left, right) => {
    const leftSequence = Number(left.sequence || 0);
    const rightSequence = Number(right.sequence || 0);
    return leftSequence - rightSequence || left.__rowNumber - right.__rowNumber;
  });
}

function buildBaseRouteNodes(source) {
  return [
    routeNode(source, "por", "POR"),
    routeNode(source, "fpol", "FPOL"),
    routeNode(source, "lpod", "LPOD"),
    routeNode(source, "fnd", "FND")
  ];
}

function routeNode(source, prefix, locationType) {
  return {
    locationType,
    city: text(source[`${prefix}City`]),
    countryCode: countryCode(source[`${prefix}CountryCode`]),
    facilityCode: text(source[`${prefix}FacilityCode`]),
    event: text(source[`${prefix}Event`]),
    estimatedTime: text(source[`${prefix}EstimatedTime`]),
    actualTime: text(source[`${prefix}ActualTime`]),
    timezone: text(source[`${prefix}Timezone`])
  };
}

function normalizeCarrier(value) {
  const normalized = normalizeHeader(value);
  if (normalized.includes("COSCO") || normalized === "COSU") return "COSCO";
  if (normalized.includes("CMA")) return "CMA";
  return "";
}

function normalizeTransportMode(value) {
  const normalized = normalizeHeader(value);
  if (["SEA", "OCEAN", "\u6d77\u8fd0"].includes(normalized)) return "SEA";
  if (["TRUCK", "ROAD", "\u5361\u8f66", "\u516c\u8def"].includes(normalized)) return "TRUCK";
  if (["RAIL", "\u94c1\u8def"].includes(normalized)) return "RAIL";
  if (["BARGE", "\u9a73\u8239"].includes(normalized)) return "BARGE";
  return text(value).toUpperCase();
}

function parseServiceScopes(value, warnings) {
  const scopes = [];
  const mapping = new Map([
    ["OCEAN", "OCEAN"],
    ["SEA", "OCEAN"],
    ["\u6d77\u8fd0", "OCEAN"],
    ["INLAND", "INLAND"],
    ["TRUCK", "INLAND"],
    ["\u9646\u8fd0", "INLAND"],
    ["CUSTOMS", "CUSTOMS"],
    ["CUSTOM", "CUSTOMS"],
    ["\u5173\u52a1", "CUSTOMS"],
    ["\u62a5\u5173", "CUSTOMS"],
    ["WAREHOUSE", "WAREHOUSE"],
    ["STORAGE", "WAREHOUSE"],
    ["\u4ed3\u50a8", "WAREHOUSE"]
  ]);
  for (const part of text(value).split(/[|,\uff0c;\uff1b/]+/).map((item) => item.trim()).filter(Boolean)) {
    const mapped = mapping.get(part.toUpperCase()) || mapping.get(part);
    if (mapped) {
      if (!scopes.includes(mapped)) scopes.push(mapped);
    } else {
      warnings.push(`\u65e0\u6cd5\u8bc6\u522b\u7684\u670d\u52a1\u7c7b\u522b\uff1a${part}`);
    }
  }
  return scopes.length ? scopes : ["OCEAN"];
}

function requireValue(errors, source, field, label) {
  if (!text(source[field])) errors.push(`${label}\u4e3a\u5fc5\u586b\u5b57\u6bb5`);
}

function countryCode(value) {
  return text(value).toUpperCase().slice(0, 2);
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== "" && item !== null && item !== undefined)
  );
}

function emptyImportResult(globalErrors) {
  return {
    rows: [],
    items: [],
    globalErrors,
    total: 0,
    valid: 0,
    invalid: 0,
    warningCount: 0
  };
}

function normalizeHeader(value) {
  return text(value)
    .toUpperCase()
    .replace(/\*/g, "")
    .replace(/[\s/\\._()\uff08\uff09:\uff1a\-]+/g, "");
}

function normalizeKey(value) {
  return text(value).toUpperCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
