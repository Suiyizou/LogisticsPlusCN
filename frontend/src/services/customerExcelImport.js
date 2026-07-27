const MAX_CUSTOMER_IMPORT_ROWS = 500;

const CUSTOMER_SHEET_NAMES = [
  "\u5ba2\u6237\u5bfc\u5165",
  "CUSTOMER IMPORT",
  "CUSTOMERS",
  "CUSTOMER"
];

const SHIPMENT_SHEET_NAMES = new Set([
  "\u7968\u5355\u4e3b\u8868",
  "\u4e2d\u8f6c\u6e2f",
  "\u5206\u6bb5\u8fd0\u8f93",
  "\u7bb1\u578b\u6570\u91cf",
  "\u7bb1\u7ea7\u8be6\u60c5",
  "SHIPMENTS",
  "TRANSSHIPMENTS",
  "ROUTING LEGS",
  "CONTAINER TYPES",
  "CONTAINERS"
].map(normalizeHeader));

const CUSTOMER_COLUMNS = [
  column("username", "\u7528\u6237\u540d*", [
    "\u7528\u6237\u540d",
    "\u5ba2\u6237\u540d",
    "\u767b\u5f55\u540d",
    "CUSTOMER NAME",
    "USERNAME",
    "LOGIN NAME"
  ]),
  column("password", "\u521d\u59cb\u5bc6\u7801", [
    "\u5bc6\u7801",
    "\u521d\u59cb\u5bc6\u7801",
    "\u767b\u5f55\u5bc6\u7801",
    "PASSWORD",
    "INITIAL PASSWORD"
  ]),
  column("clientCode", "\u5ba2\u6237\u7801", [
    "\u5ba2\u6237\u7801",
    "\u5ba2\u6237\u4ee3\u7801",
    "CLIENT CODE",
    "CUSTOMER CODE"
  ]),
  column("displayName", "\u663e\u793a\u540d\u79f0", [
    "\u663e\u793a\u540d\u79f0",
    "\u5ba2\u6237\u5168\u79f0",
    "\u516c\u53f8\u540d\u79f0",
    "DISPLAY NAME",
    "COMPANY NAME"
  ]),
  column("partyRole", "\u5ba2\u6237\u89d2\u8272", [
    "\u5ba2\u6237\u89d2\u8272",
    "\u89d2\u8272",
    "CUSTOMER ROLE",
    "PARTY ROLE",
    "ROLE"
  ]),
  column("remark", "\u5907\u6ce8", [
    "\u5907\u6ce8",
    "\u8bf4\u660e",
    "REMARK",
    "NOTE"
  ])
];

export function buildCustomerImportTemplate(xlsx) {
  const workbook = xlsx.utils.book_new();
  appendSheet(xlsx, workbook, "\u586b\u5199\u8bf4\u660e", [
    ["\u5ba2\u6237 Excel \u6279\u91cf\u5bfc\u5165\u6a21\u677f / Customer Batch Import Template"],
    ["1. \u8bf7\u5728\u201c\u5ba2\u6237\u5bfc\u5165\u201d\u5de5\u4f5c\u8868\u586b\u5199\uff0c\u4e0d\u8981\u4fee\u6539\u8868\u5934\u3002"],
    ["2. \u7528\u6237\u540d\u5fc5\u586b\uff1a2-64 \u4f4d\u5b57\u6bcd\u3001\u6570\u5b57\u3001\u70b9\u3001\u4e0b\u5212\u7ebf\u6216\u8fde\u5b57\u7b26\uff0c\u5168\u5c40\u552f\u4e00\u3002"],
    ["3. \u521d\u59cb\u5bc6\u7801\u9009\u586b\uff1a8-128 \u4f4d\uff0c\u5fc5\u987b\u540c\u65f6\u5305\u542b\u5927\u5199\u5b57\u6bcd\u3001\u5c0f\u5199\u5b57\u6bcd\u548c\u6570\u5b57\uff1b\u7559\u7a7a\u7531\u7cfb\u7edf\u751f\u6210 18 \u4f4d\u5f3a\u5bc6\u7801\u3002"],
    ["4. \u5ba2\u6237\u7801\u9009\u586b\uff1a6-10 \u4f4d\u5b57\u6bcd\u3001\u6570\u5b57\u3001\u70b9\u3001\u4e0b\u5212\u7ebf\u6216\u8fde\u5b57\u7b26\uff0c\u5168\u5c40\u552f\u4e00\uff1b\u7559\u7a7a\u7531\u7cfb\u7edf\u751f\u6210 10 \u4f4d\u77ed\u7801\u3002"],
    ["5. \u663e\u793a\u540d\u79f0\u9009\u586b\uff1a2-80 \u4f4d\uff1b\u7559\u7a7a\u65f6\u4f7f\u7528\u7528\u6237\u540d\u3002"],
    ["6. \u5ba2\u6237\u89d2\u8272\u9009\u586b\uff1aSHIPPER\u3001CONSIGNEE \u6216 OVERSEA_AGENT\uff1b\u7559\u7a7a\u9ed8\u8ba4 CONSIGNEE\u3002"],
    ["7. \u5907\u6ce8\u9009\u586b\uff0c\u6700\u591a 500 \u4e2a\u5b57\u7b26\uff1b\u5355\u6b21\u6700\u591a\u5bfc\u5165 500 \u4e2a\u5ba2\u6237\u3002"]
  ], [104]);
  appendSheet(xlsx, workbook, "\u5ba2\u6237\u5bfc\u5165", [
    CUSTOMER_COLUMNS.map((item) => item.header),
    ["acme-shipper", "", "ACME-001", "ACME Shipper", "SHIPPER", "\u6a21\u677f\u793a\u4f8b\uff0c\u6b63\u5f0f\u5bfc\u5165\u524d\u8bf7\u66ff\u6362\u6216\u5220\u9664"]
  ], [24, 24, 20, 30, 22, 42]);
  return workbook;
}

export function parseCustomerImportWorkbook(workbook, xlsx) {
  const sheetNames = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
  if (!sheetNames.length) return emptyPreview([issue("EMPTY_WORKBOOK")]);

  const customerSheetName = findCustomerSheet(workbook, xlsx);
  if (!customerSheetName) {
    const wrongTemplate = sheetNames.some((name) => SHIPMENT_SHEET_NAMES.has(normalizeHeader(name)));
    return emptyPreview([issue(wrongTemplate ? "WRONG_TEMPLATE" : "MISSING_CUSTOMER_SHEET")]);
  }

  const parsed = readCustomerSheet(workbook.Sheets[customerSheetName], xlsx);
  if (!parsed.usernameColumnFound) {
    return emptyPreview([issue("MISSING_USERNAME_COLUMN")]);
  }
  if (!parsed.rows.length) return emptyPreview([issue("NO_ROWS")]);
  if (parsed.rows.length > MAX_CUSTOMER_IMPORT_ROWS) {
    return emptyPreview([issue("TOO_MANY_ROWS", { max: MAX_CUSTOMER_IMPORT_ROWS })]);
  }
  return validateCustomerImportRows(parsed.rows);
}

export function validateCustomerImportRows(sourceRows) {
  const seenUsernames = new Set();
  const seenClientCodes = new Set();
  const rows = (sourceRows || []).map((source, index) => {
    const rowNumber = Number(source?.rowNumber) || index + 1;
    const username = text(source?.username);
    const password = String(source?.password ?? "");
    const displayName = text(source?.displayName) || username;
    const clientCode = text(source?.clientCode).toUpperCase();
    const partyRole = normalizePartyRole(source?.partyRole);
    const remark = text(source?.remark);
    const errors = [];
    const warnings = [];

    if (!username) {
      errors.push(issue("USERNAME_REQUIRED", { field: "username" }));
    } else if (!/^[\p{L}\p{N}._-]{2,64}$/u.test(username)) {
      errors.push(issue("USERNAME_FORMAT", { field: "username" }));
    }
    const usernameKey = username.toLocaleLowerCase();
    if (usernameKey) {
      if (seenUsernames.has(usernameKey)) {
        errors.push(issue("DUPLICATE_USERNAME", { field: "username", value: username }));
      }
      seenUsernames.add(usernameKey);
    }

    if (password) {
      if (password.length < 8 || password.length > 128) {
        errors.push(issue("PASSWORD_LENGTH", { field: "password" }));
      } else if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
        errors.push(issue("PASSWORD_COMPLEXITY", { field: "password" }));
      }
    } else {
      warnings.push(issue("PASSWORD_WILL_GENERATE", { field: "password" }));
    }

    if (displayName.length < 2 || displayName.length > 80) {
      errors.push(issue("DISPLAY_NAME_LENGTH", { field: "displayName" }));
    }
    if (clientCode) {
      if (!/^[A-Z0-9._-]{6,10}$/.test(clientCode)) {
        errors.push(issue("CLIENT_CODE_FORMAT", { field: "clientCode" }));
      }
      if (seenClientCodes.has(clientCode)) {
        errors.push(issue("DUPLICATE_CLIENT_CODE", { field: "clientCode", value: clientCode }));
      }
      seenClientCodes.add(clientCode);
    } else {
      warnings.push(issue("CLIENT_CODE_WILL_GENERATE", { field: "clientCode" }));
    }
    if (!partyRole) {
      errors.push(issue("PARTY_ROLE_FORMAT", { field: "partyRole" }));
    }
    if (remark.length > 500) {
      errors.push(issue("REMARK_LENGTH", { field: "remark" }));
    }

    return {
      rowNumber,
      username,
      password,
      passwordProvided: Boolean(password),
      displayName,
      clientCode,
      partyRole: partyRole || text(source?.partyRole).toUpperCase(),
      remark,
      errors,
      warnings
    };
  });
  const items = rows.filter((row) => row.errors.length === 0).map(toRequestItem);
  return {
    rows,
    items,
    globalErrors: [],
    total: rows.length,
    valid: items.length,
    invalid: rows.length - items.length,
    warningCount: rows.reduce((count, row) => count + row.warnings.length, 0)
  };
}

function toRequestItem(row) {
  return {
    rowNumber: row.rowNumber,
    username: row.username,
    password: row.password,
    displayName: row.displayName,
    clientCode: row.clientCode,
    partyRole: row.partyRole,
    remark: row.remark
  };
}

function findCustomerSheet(workbook, xlsx) {
  const names = workbook?.SheetNames || [];
  const expected = new Set(CUSTOMER_SHEET_NAMES.map(normalizeHeader));
  const named = names.find((name) => expected.has(normalizeHeader(name)));
  if (named) return named;
  return names.find((name) => {
    const worksheet = workbook.Sheets?.[name];
    const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false });
    return rows.slice(0, 10).some((row) => findUsernameIndex(row) >= 0);
  }) || "";
}

function readCustomerSheet(worksheet, xlsx) {
  const sourceRows = xlsx.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: false,
    dateNF: "yyyy-mm-dd hh:mm"
  });
  const headerRowIndex = sourceRows.slice(0, 10).findIndex((row) => findUsernameIndex(row) >= 0);
  if (headerRowIndex < 0) return { usernameColumnFound: false, rows: [] };
  const headers = (sourceRows[headerRowIndex] || []).map(normalizeHeader);
  const indexes = Object.fromEntries(CUSTOMER_COLUMNS.map((definition) => [
    definition.field,
    findColumnIndex(headers, definition.aliases)
  ]));
  const rows = sourceRows
    .slice(headerRowIndex + 1)
    .map((row, index) => {
      const value = { rowNumber: headerRowIndex + index + 2 };
      for (const definition of CUSTOMER_COLUMNS) {
        const columnIndex = indexes[definition.field];
        value[definition.field] = columnIndex >= 0 ? String(row?.[columnIndex] ?? "") : "";
      }
      return value;
    })
    .filter((row) => CUSTOMER_COLUMNS.some((item) => text(row[item.field])));
  return { usernameColumnFound: indexes.username >= 0, rows };
}

function findUsernameIndex(row) {
  const headers = (Array.isArray(row) ? row : []).map(normalizeHeader);
  return findColumnIndex(headers, CUSTOMER_COLUMNS[0].aliases);
}

function findColumnIndex(headers, aliases) {
  const expected = new Set(aliases.map(normalizeHeader));
  return headers.findIndex((header) => expected.has(header));
}

function normalizePartyRole(value) {
  const normalized = text(value).toUpperCase();
  if (!normalized) return "CONSIGNEE";
  const mapping = new Map([
    ["SHIPPER", "SHIPPER"],
    ["\u53d1\u8d27\u4eba", "SHIPPER"],
    ["CONSIGNEE", "CONSIGNEE"],
    ["\u6536\u8d27\u4eba", "CONSIGNEE"],
    ["OVERSEA_AGENT", "OVERSEA_AGENT"],
    ["OVERSEA AGENT", "OVERSEA_AGENT"],
    ["\u6d77\u5916\u4ee3\u7406", "OVERSEA_AGENT"]
  ]);
  return mapping.get(normalized) || "";
}

function emptyPreview(globalErrors) {
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

function issue(code, details = {}) {
  return { code, ...details };
}

function column(field, header, aliases) {
  return { field, header, aliases: [header, header.replace(/\*/g, ""), field, ...aliases] };
}

function appendSheet(xlsx, workbook, name, rows, widths) {
  const worksheet = xlsx.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = widths.map((wch) => ({ wch }));
  if (rows.length > 1 && rows[0].length > 1) {
    worksheet["!autofilter"] = {
      ref: xlsx.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: Math.max(1, rows.length - 1), c: rows[0].length - 1 }
      })
    };
  }
  xlsx.utils.book_append_sheet(workbook, worksheet, name);
}

function normalizeHeader(value) {
  return text(value)
    .toUpperCase()
    .replace(/\*/g, "")
    .replace(/[\s/\\._()（）:：-]+/g, "");
}

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
