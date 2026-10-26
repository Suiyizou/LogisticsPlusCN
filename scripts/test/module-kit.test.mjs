import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  rmSync,
  symlinkSync
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, sep } from "node:path";
import prettier from "prettier";
import { fileURLToPath } from "node:url";
import {
  validateSpec,
  generateModule,
  planModule,
  moduleOpenApi,
  createMigration,
  additiveMigration
} from "../module-kit.mjs";

const roots = [];
const baseSpec = () => ({
  id: "sample-catalog",
  scope: "internal-reference",
  table: "cp_sample_catalog",
  migrationVersion: 4,
  roles: ["ADMIN", "BUSINESS"],
  title: { "zh-CN": "样例目录", "en-US": "Sample catalog" },
  fields: [
    {
      name: "code",
      type: "string",
      required: true,
      maxLength: 64,
      search: true,
      unique: true,
      label: { "zh-CN": "代码", "en-US": "Code" }
    },
    {
      name: "notes",
      type: "text",
      required: false,
      maxLength: 4000,
      label: { "zh-CN": "备注", "en-US": "Notes" }
    },
    {
      name: "enabled",
      type: "boolean",
      required: true,
      default: true,
      label: { "zh-CN": "启用", "en-US": "Enabled" }
    }
  ]
});
const field = (name = "extraNote") => ({
  name,
  type: "string",
  required: false,
  maxLength: 100,
  label: { "zh-CN": "补充", "en-US": "Extra" }
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "module-kit-test-"));
  roots.push(root);
  return root;
}
function source(root, spec) {
  mkdirSync(join(root, "module-specs"), { recursive: true });
  writeFileSync(join(root, "module-specs", `${spec.id}.json`), JSON.stringify(spec));
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    const absolute = resolve(root);
    assert.ok(absolute.startsWith(resolve(tmpdir()) + sep));
    assert.ok(absolute.includes("module-kit-test-"));
    rmSync(absolute, { recursive: true, force: true });
  }
});

test("ordinary backend module needs no handwritten CRUD SQL and rerun is idempotent", () => {
  const root = fixture(),
    spec = baseSpec();
  source(root, spec);
  const paths = generateModule(root, spec, { target: "backend" });
  assert.ok(paths.some((p) => p.endsWith("SampleCatalogMapping.java")));
  assert.deepEqual(generateModule(root, spec, { target: "backend", check: true }), []);
  const repository = readFileSync(
    join(
      root,
      "backend/src/main/java/com/cargoplanner/backend/samplecatalog/infrastructure/SampleCatalogRepository.java"
    ),
    "utf8"
  );
  assert.doesNotMatch(repository, /SELECT |INSERT INTO |UPDATE [a-z]|DELETE FROM /);
  assert.match(repository, /Policy.requireAccess/);
  assert.match(repository, /eq\("version", version\)/);
  assert.equal(existsSync(join(root, "frontend")), false);
});

test("full generation is Prettier-stable including ownership manifests", async () => {
  const root = fixture(),
    spec = baseSpec();
  source(root, spec);
  generateModule(root, spec);
  const target = join(root, "module-specs/.generated", `${spec.id}.json`);
  const config = await prettier.resolveConfig(
    fileURLToPath(new URL("../../package.json", import.meta.url))
  );
  writeFileSync(
    target,
    await prettier.format(readFileSync(target, "utf8"), { ...config, parser: "json" })
  );
  assert.deepEqual(generateModule(root, spec, { check: true }), []);
});

test("adding nullable field updates generated mapping and preserves handwritten use cases", () => {
  const root = fixture(),
    spec = baseSpec();
  source(root, spec);
  generateModule(root, spec, { target: "backend" });
  const app = join(
    root,
    "backend/src/main/java/com/cargoplanner/backend/samplecatalog/application/SampleCatalogApplicationService.java"
  );
  const handwritten = readFileSync(app, "utf8") + "\n// Custom domain behavior remains.\n";
  writeFileSync(app, handwritten);
  const next = { ...spec, migrationVersion: 5, fields: [...spec.fields, field()] };
  source(root, next);
  generateModule(root, next, { target: "backend" });
  assert.equal(readFileSync(app, "utf8"), handwritten);
  const mapping = readFileSync(
    join(
      root,
      "backend/src/main/java/com/cargoplanner/backend/samplecatalog/infrastructure/SampleCatalogMapping.java"
    ),
    "utf8"
  );
  assert.match(mapping, /values.hasExtraNote\(\)/);
  assert.match(mapping, /row.setExtraNote/);
  assert.match(mapping, /row.getExtraNote/);
  assert.match(
    readFileSync(
      join(root, "backend/src/main/resources/db/migration/V5__sample_catalog.sql"),
      "utf8"
    ),
    /ADD COLUMN `extra_note` VARCHAR\(100\) NULL/
  );
  assert.deepEqual(generateModule(root, next, { target: "backend", check: true }), []);
});

test("generated file edits are rejected without overwriting any work", () => {
  const root = fixture(),
    spec = baseSpec();
  generateModule(root, spec, { target: "backend" });
  const target = join(
    root,
    "backend/src/main/java/com/cargoplanner/backend/samplecatalog/infrastructure/SampleCatalogEntity.java"
  );
  const edited = readFileSync(target, "utf8") + "// Deliberate manual edit\n";
  writeFileSync(target, edited);
  assert.throws(() => generateModule(root, spec, { target: "backend" }), /Generated-file conflict/);
  assert.equal(readFileSync(target, "utf8"), edited);
});

test("applied migration is immutable", () => {
  const root = fixture(),
    spec = baseSpec();
  generateModule(root, spec, { target: "backend" });
  const target = join(root, "backend/src/main/resources/db/migration/V4__sample_catalog.sql");
  writeFileSync(target, readFileSync(target, "utf8") + "-- edited\n");
  assert.throws(
    () => generateModule(root, spec, { target: "backend" }),
    /Applied migration changed/
  );
});

test("migration version conflicts across names and padded versions are rejected", () => {
  const root = fixture(),
    spec = baseSpec(),
    dir = join(root, "backend/src/main/resources/db/migration");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "V04__another.sql"), "SELECT 1;\n");
  assert.throws(
    () => generateModule(root, spec, { target: "backend" }),
    /Migration version already exists/
  );
  assert.equal(existsSync(join(root, "backend/src/main/java")), false);
});

test("destructive, required, default and unique schema changes need explicit review", () => {
  const spec = baseSpec();
  for (const fields of [
    spec.fields.filter((field) => field.name !== "notes"),
    [{ ...spec.fields[0], maxLength: 65 }, ...spec.fields.slice(1)],
    [...spec.fields, { ...field(), required: true }],
    [...spec.fields, { ...field(), unique: true }],
    [...spec.fields, { ...field(), default: "value" }]
  ]) {
    assert.throws(
      () => additiveMigration(spec, { ...spec, migrationVersion: 5, fields }),
      /explicit reviewed|backfill plan/
    );
  }
  assert.throws(
    () => additiveMigration(spec, { ...spec, fields: [...spec.fields, field()] }),
    /new migrationVersion/
  );
});

test("OpenAPI distinguishes required create values from presence-aware PATCH", () => {
  const spec = baseSpec(),
    api = moduleOpenApi(spec);
  assert.deepEqual(api.schemas.SampleCatalogWrite.required, ["code", "enabled"]);
  assert.equal(api.schemas.SampleCatalogPatch.required, undefined);
  assert.equal(api.schemas.SampleCatalogPatch.properties.enabled.default, undefined);
  assert.equal(api.schemas.SampleCatalogWrite.properties.enabled.default, true);
  assert.equal(api.schemas.SampleCatalogPatch.properties.notes.nullable, true);
  assert.ok(api.paths["/business/sample-catalog/{id}"].patch);
  assert.equal(api.paths["/business/sample-catalog/{id}"].put, undefined);
  assert.equal(
    api.schemas.SampleCatalogUpdate.properties.values.$ref,
    "#/components/schemas/SampleCatalogPatch"
  );
});

test("rejects injection, secrets, reserved identifiers and method collisions", () => {
  for (const id of ["../escape", "class", "sample;drop"]) {
    assert.throws(() => validateSpec({ ...baseSpec(), id }));
  }
  for (const name of ["order", "class", "passwordHash", "getClass", "toString", "publicId"]) {
    const spec = baseSpec();
    spec.fields.push(field(name));
    assert.throws(() => validateSpec(spec));
  }
  const spec = baseSpec();
  spec.fields.push(field("hasCode"));
  assert.throws(() => validateSpec(spec), /accessor collision/);
  assert.throws(() => validateSpec({ ...baseSpec(), scope: "customer" }), /domain data policy/);
});

test("enforces utf8mb4 unique limits, int bounds, flag types and safe SQL defaults", () => {
  for (const change of [{ maxLength: 769 }, { type: "text" }]) {
    const spec = baseSpec();
    spec.fields[0] = { ...spec.fields[0], ...change };
    assert.throws(() => validateSpec(spec), /Unique fields/);
  }
  for (const change of [
    { unique: "yes" },
    { default: "bad\\value" },
    { default: "x".repeat(65) }
  ]) {
    const spec = baseSpec();
    spec.fields[0] = { ...spec.fields[0], ...change };
    assert.throws(() => validateSpec(spec));
  }
  const spec = baseSpec();
  spec.fields.push({
    ...field("quantity"),
    maxLength: undefined,
    type: "integer",
    default: 2147483648
  });
  assert.throws(() => validateSpec(spec), /Integer default/);
  const good = baseSpec();
  good.fields[0].default = "O'Reilly";
  assert.match(createMigration(good), /O''Reilly/);
});

test("long module and field names retain MySQL index length limit", () => {
  const spec = baseSpec();
  spec.id = "a".repeat(48);
  spec.fields[0].name = "b".repeat(48);
  const sql = createMigration(spec);
  const keys = [...sql.matchAll(/(?:UNIQUE KEY|INDEX) `([^`]+)`/g)].map((match) => match[1]);
  assert.ok(keys.every((key) => key.length <= 64));
});

test("output junction escaping workspace is rejected before writing outside", () => {
  const root = fixture(),
    outside = fixture();
  symlinkSync(outside, join(root, "backend"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => planModule(root, baseSpec(), { target: "backend" }), /escapes workspace/);
  assert.deepEqual(readdirSync(outside), []);
});

test("aggregate registry includes new modules without editing host registry", () => {
  const root = fixture(),
    first = baseSpec();
  source(root, first);
  generateModule(root, first);
  const second = {
    ...baseSpec(),
    id: "second-catalog",
    table: "cp_second_catalog",
    migrationVersion: 5
  };
  source(root, second);
  generateModule(root, second);
  const registry = readFileSync(
    join(root, "frontend/src/modules/generatedRegistrations.js"),
    "utf8"
  );
  assert.match(registry, /sampleCatalogRegistration/);
  assert.match(registry, /secondCatalogRegistration/);
  assert.deepEqual(generateModule(root, first, { check: true }), []);
});

test("module relocation updates protected metadata without touching routes or business logic", () => {
  const root = fixture(),
    spec = baseSpec();
  source(root, spec);
  generateModule(root, spec);
  const next = {
    ...spec,
    surface: "admin",
    navigation: { group: "system", order: 42 },
    roles: ["ADMIN"]
  };
  source(root, next);
  generateModule(root, next);
  const registration = readFileSync(
    join(root, "frontend/src/modules/sample-catalog/module.js"),
    "utf8"
  );
  assert.match(registration, /surface: "admin"/);
  assert.match(registration, /group: "system"/);
  assert.match(registration, /roles: \["ADMIN"\]/);
  assert.equal(readdirSync(join(root, "backend/src/main/resources/db/migration")).length, 1);
  assert.deepEqual(generateModule(root, next, { check: true }), []);
});

test("first generation refuses adopting existing backend or frontend business modules", () => {
  for (const target of [
    "backend/src/main/java/com/cargoplanner/backend/samplecatalog",
    "frontend/src/modules/sample-catalog"
  ]) {
    const root = fixture(),
      spec = baseSpec(),
      directory = join(root, target);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "handwritten.txt"), "Keep me");
    assert.throws(
      () => generateModule(root, spec, { target: "backend" }),
      /requires explicit adoption/
    );
    assert.equal(readFileSync(join(directory, "handwritten.txt"), "utf8"), "Keep me");
  }
});

test("historical SQL and frozen Java table owners cannot be reused", () => {
  for (const [directory, file, content] of [
    [
      "backend/src/main/resources/db/migration",
      "V1__baseline.sql",
      "CREATE TABLE IF NOT EXISTS cp_sample_catalog (id BIGINT);"
    ],
    [
      "backend/src/main/java/db/migration",
      "V3__legacy.java",
      'String value = "CREATE TABLE IF NOT EXISTS cp_sample_catalog (id BIGINT)";'
    ]
  ]) {
    const root = fixture(),
      dir = join(root, directory);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, file), content);
    assert.throws(
      () => generateModule(root, baseSpec(), { target: "backend" }),
      /Owned table already declared/
    );
  }
});

test("unknown keys and unsupported constraints fail before generating files", () => {
  assert.throws(() => validateSpec({ ...baseSpec(), migratonVersion: 4 }), /Unknown spec keys/);
  const spec = baseSpec();
  spec.fields[0].uniqe = true;
  assert.throws(() => validateSpec(spec), /Unknown field keys/);
  const numeric = baseSpec();
  numeric.fields.push({ ...field("quantity"), type: "integer" });
  assert.throws(() => validateSpec(numeric), /maxLength/);
});

test("migration proposal cannot silently go behind deployed history", () => {
  const root = fixture(),
    directory = join(root, "backend/src/main/resources/db/migration");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "V10__later.sql"), "SELECT 1;\n");
  assert.throws(
    () => generateModule(root, baseSpec(), { target: "backend" }),
    /newer than all existing migrations/
  );
});

test("DTO imports only validators actually used by optional and string-only specifications", () => {
  for (const required of [true, false]) {
    const root = fixture(),
      spec = baseSpec();
    spec.fields = [{ ...spec.fields[0], required }];
    const output = planModule(root, spec, { target: "backend" }).find((file) =>
      file.path.endsWith("SampleCatalogWrite.java")
    ).content;
    assert.doesNotMatch(output, /import jakarta.validation.constraints.NotNull/);
    assert.equal(output.includes("import jakarta.validation.constraints.NotBlank"), required);
    assert.match(output, /import jakarta.validation.constraints.Size/);
  }
});
