import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const javaRoot = resolve(root, "backend/src/main/java/com/cargoplanner/backend");
const files = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(resolve(directory, entry.name)) : [resolve(directory, entry.name)]
  );
test("generated module API and application layers cannot bypass controlled persistence", () => {
  const specs = readdirSync(resolve(root, "module-specs"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(resolve(root, "module-specs", name), "utf8")));
  for (const spec of specs) {
    const moduleRoot = resolve(javaRoot, spec.id.replaceAll("-", ""));
    for (const layer of ["api", "application"])
      for (const file of files(resolve(moduleRoot, layer)).filter((file) =>
        file.endsWith(".java")
      )) {
        const source = readFileSync(file, "utf8");
        assert.doesNotMatch(
          source,
          /import\s+(?:org\.springframework\.jdbc|java\.sql|javax\.sql|com\.baomidou|org\.apache\.ibatis)/,
          file
        );
        assert.doesNotMatch(
          source,
          /\b(?:SELECT|INSERT INTO|UPDATE|DELETE FROM|ALTER TABLE|CREATE TABLE)\s+[a-z_]+/i,
          file
        );
        if (file.endsWith("Controller.java"))
          assert.doesNotMatch(source, /import\s+.*\.infrastructure\./, file);
      }
  }
});
test("module registry remains data plus lazy loaders and does not import private workflow state", () => {
  const specs = readdirSync(resolve(root, "module-specs")).filter((name) => name.endsWith(".json"));
  for (const name of specs) {
    const spec = JSON.parse(readFileSync(resolve(root, "module-specs", name), "utf8"));
    const source = readFileSync(resolve(root, `frontend/src/modules/${spec.id}/module.js`), "utf8");
    assert.doesNotMatch(
      source,
      /^import\s+(?!type).*from\s*["'].*(?:pages|services|use[A-Z]|features)/m
    );
    assert.match(source, /\(\)\s*=>\s*import\(/);
  }
});
