import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import postcss from "postcss";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const read = (path) => readFileSync(path, "utf8");

// Follow real SFC imports, including App's lazy import(), rather than relying on
// main.js to have selected the standalone entry before the component can render.
function collectStyles(entry, readSource = read) {
  const seen = new Set();
  const styles = [];
  function visit(path) {
    if (seen.has(path)) return;
    seen.add(path);
    const source = readSource(path);
    if (path.endsWith(".css")) {
      styles.push(source);
      return;
    }
    const { descriptor, errors } = parse(source, { filename: path });
    assert.deepEqual(errors, []);
    for (const style of descriptor.styles) {
      if (style.src) visit(resolve(dirname(path), style.src));
      else styles.push(style.content);
    }
    for (const script of [descriptor.script, descriptor.scriptSetup].filter(Boolean)) {
      const syntax = ts.createSourceFile(
        path + ".ts",
        script.content,
        ts.ScriptTarget.Latest,
        true
      );
      function imports(node) {
        let specifier;
        if (ts.isImportDeclaration(node)) specifier = node.moduleSpecifier;
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          specifier = node.arguments[0];
        }
        if (specifier && ts.isStringLiteral(specifier) && /^\.\.?\//.test(specifier.text)) {
          const dependency = resolve(dirname(path), specifier.text);
          if (/\.(vue|css)$/.test(dependency)) visit(dependency);
        }
        ts.forEachChild(node, imports);
      }
      imports(syntax);
    }
  }
  visit(resolve(sourceRoot, entry));
  return styles;
}

function landingLayout(styles) {
  const layouts = new Map();
  for (const source of styles) {
    postcss.parse(source).walkRules((rule) => {
      if (!rule.parent || rule.parent.type !== "root") return;
      for (const selector of rule.selectors) {
        const declarations = layouts.get(selector) || {};
        rule.walkDecls((decl) => {
          declarations[decl.prop] = decl.value;
        });
        layouts.set(selector, declarations);
      }
    });
  }
  return layouts;
}

function assertLandingLayout(styles) {
  const layouts = landingLayout(styles);
  assert.equal(
    layouts.get(".landing-page .maritime-header")?.display,
    "flex",
    "Public header layout is reachable"
  );
  assert.equal(
    layouts.get(".landing-page .maritime-hero")?.display,
    "flex",
    "Harbor hero layout is reachable"
  );
  assert.equal(
    layouts.get(".landing-page .maritime-query")?.display,
    "grid",
    "Public query form layout is reachable"
  );
}

for (const entry of ["LandingEntry.vue", "App.vue"]) {
  test(entry + " includes the complete public landing layout through its component graph", () => {
    assertLandingLayout(collectStyles(entry));
  });
}

test("legacy entry regression guard fails when public landing loses its stylesheet dependency", () => {
  const styles = collectStyles("App.vue", (path) => {
    const source = read(path);
    return source.replace(/import\s+["'](?:\.\.\/)+maritime-public\.css["'];?/g, "");
  });
  assert.throws(() => assertLandingLayout(styles), /Public header layout is reachable/);
});
