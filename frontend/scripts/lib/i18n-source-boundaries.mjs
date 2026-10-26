import ts from "typescript";

const moduleMessagePath = /^src\/modules\/[a-z][a-z0-9-]*\/messages\.js$/;

export function isModuleMessageFile(relativePath) {
  return moduleMessagePath.test(relativePath);
}

function propertyKey(name) {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
    ? name.text
    : null;
}

function isDataObject(node) {
  if (!ts.isObjectLiteralExpression(node)) return false;
  const keys = new Set();
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) return false;
    const key = propertyKey(property.name);
    if (key === null || key === "__proto__" || keys.has(key)) return false;
    keys.add(key);
    if (!isDataValue(property.initializer)) return false;
  }
  return true;
}

function isDataValue(node) {
  if (ts.isObjectLiteralExpression(node)) return isDataObject(node);
  if (ts.isArrayLiteralExpression(node)) return node.elements.every(isDataValue);
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isNumericLiteral(node) ||
    [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(
      node.kind
    )
  )
    return true;
  return (
    ts.isPrefixUnaryExpression(node) &&
    [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(node.operator) &&
    ts.isNumericLiteral(node.operand)
  );
}

export function assertModuleMessageData(relativePath, source) {
  const file = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
  const statement = file.statements[0];
  const validExport =
    file.parseDiagnostics.length === 0 &&
    file.statements.length === 1 &&
    ts.isExportAssignment(statement) &&
    !statement.isExportEquals &&
    isDataObject(statement.expression);
  if (!validExport)
    throw Error(
      `${relativePath}: module messages must contain one data-only default object export`
    );
  for (const locale of ["zh-CN", "en-US"]) {
    const values = statement.expression.properties.find(
      (property) => propertyKey(property.name) === locale
    );
    if (!values || !ts.isObjectLiteralExpression(values.initializer))
      throw Error(`${relativePath}: missing module message locale ${locale}`);
  }
}

export function collectFileChineseLines(relativePath, source) {
  if (isModuleMessageFile(relativePath)) {
    assertModuleMessageData(relativePath, source);
    return [];
  }
  const items = [];
  source.split(/\r?\n/).forEach((line, index) => {
    if (!/[\u3400-\u9fff]/.test(line)) return;
    const text = line.trim().replace(/\s+/g, " ");
    if (!text || text.startsWith("// i18n-ignore")) return;
    items.push({ file: relativePath, line: index + 1, text });
  });
  return items;
}
