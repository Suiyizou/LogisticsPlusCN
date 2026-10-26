export function isValidAgentUsername(value) {
  return /^[\p{L}\p{N}._-]{2,64}$/u.test(String(value || "").trim());
}
export function isValidAgentDisplayName(value) {
  const length = String(value || "").trim().length;
  return length >= 2 && length <= 80;
}
export function isStrongAgentPassword(value) {
  const password = String(value || "");
  return (
    password.length >= 8 &&
    password.length <= 128 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password)
  );
}
function normalizeAgentHeader(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\*/g, "")
    .replace(/[\s/\\._()（）:：-]+/g, "");
}
function findAgentColumn(headers, aliases) {
  const normalizedAliases = new Set(aliases.map(normalizeAgentHeader));
  return headers.findIndex((header) => normalizedAliases.has(normalizeAgentHeader(header)));
}
export function validateAgentImportRows(sourceRows, t) {
  const usernames = new Set();
  return sourceRows.map((source, index) => {
    const username = String(source.username || "").trim();
    const displayName = String(source.displayName || "").trim();
    const password = String(source.password || "");
    const errors = [];
    if (!isValidAgentUsername(username)) errors.push(t("customers.agentUsernameRule"));
    if (!isValidAgentDisplayName(displayName)) errors.push(t("customers.agentDisplayNameRule"));
    if (!isStrongAgentPassword(password)) errors.push(t("customers.agentPasswordRule"));
    const key = username.toLocaleLowerCase();
    if (key && usernames.has(key)) errors.push(t("customers.agentDuplicateUsername", { username }));
    if (key) usernames.add(key);
    return {
      rowNumber: Number(source.rowNumber) || index + 2,
      username,
      displayName,
      password,
      errors,
      status: errors.length ? "INVALID" : "READY",
      resultMessage: ""
    };
  });
}
export function parseAgentImportWorkbook(workbook, XLSX, t) {
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) throw new Error(t("customers.agentWorkbookEmpty"));
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false
  });
  const aliases = {
    username: ["USERNAME", "\u7528\u6237\u540d", "\u767b\u5f55\u540d"],
    displayName: ["DISPLAY NAME", "DISPLAYNAME", "\u663e\u793a\u540d\u79f0", "\u59d3\u540d"],
    password: ["INITIAL PASSWORD", "PASSWORD", "\u521d\u59cb\u5bc6\u7801", "\u5bc6\u7801"]
  };
  const headerRowIndex = rows.slice(0, 10).findIndex((row) => {
    const headers = Array.isArray(row) ? row : [];
    return (
      findAgentColumn(headers, aliases.username) >= 0 &&
      findAgentColumn(headers, aliases.displayName) >= 0 &&
      findAgentColumn(headers, aliases.password) >= 0
    );
  });
  if (headerRowIndex < 0) throw new Error(t("customers.agentWorkbookHeaderMissing"));
  const headers = rows[headerRowIndex];
  const indexes = {
    username: findAgentColumn(headers, aliases.username),
    displayName: findAgentColumn(headers, aliases.displayName),
    password: findAgentColumn(headers, aliases.password)
  };
  const sourceRows = rows
    .slice(headerRowIndex + 1)
    .map((row, index) => ({
      rowNumber: headerRowIndex + index + 2,
      username: row?.[indexes.username],
      displayName: row?.[indexes.displayName],
      password: row?.[indexes.password]
    }))
    .filter((row) => row.username || row.displayName || row.password);
  if (!sourceRows.length) throw new Error(t("customers.agentWorkbookNoRows"));
  if (sourceRows.length > 200) throw new Error(t("customers.agentWorkbookTooManyRows"));
  return validateAgentImportRows(sourceRows, t);
}
