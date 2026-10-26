import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  realpathSync,
  readdirSync,
  lstatSync
} from "node:fs";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const project = fileURLToPath(new URL("../", import.meta.url));
const templateRoot = new URL("./templates/module/", import.meta.url);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const upper = (name) => name[0].toUpperCase() + name.slice(1);
const column = (name) => name.replace(/[A-Z]/g, (s) => `_${s.toLowerCase()}`);
const quote = (value) => JSON.stringify(value);
const reserved = new Set(
  "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null record sealed permits yield var constructor prototype getClass wait notify notifyAll equals hashCode toString finalize clone select from where order group by limit offset insert update delete create drop alter table index key primary constraint references unique join having union values user version public_id created_at updated_at created_by updated_by".split(
    " "
  )
);
const require = createRequire(import.meta.url);
const migrationPattern = /^V([0-9]+)__/i;
const sqlId = (value) => `\`${value}\``;
const indexName = (value) =>
  value.length <= 64 ? value : `${value.slice(0, 47)}_${hash(value).slice(0, 16)}`;

const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
const javaTypes = { string: "String", text: "String", boolean: "Boolean", integer: "Integer" };
const internalFields = new Set([
  "id",
  "publicId",
  "version",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy"
]);

function rejectUnknown(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error(`Invalid ${label}`);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw Error(`Unknown ${label} keys: ${unknown.join(", ")}`);
}

export function validateSpec(spec) {
  rejectUnknown(
    spec,
    [
      "id",
      "scope",
      "table",
      "migrationVersion",
      "roles",
      "title",
      "fields",
      "surface",
      "navigation"
    ],
    "spec"
  );

  if (!spec || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(spec.id || "") || spec.id.length > 50)
    throw Error("Invalid module id");
  if (reserved.has(spec.id.replaceAll("-", ""))) throw Error("Reserved Java package name");
  if (spec.scope !== "internal-reference")
    throw Error(
      "A domain data policy is required: generator only supports internal-reference scope"
    );
  if (!/^cp_[a-z][a-z0-9_]*$/.test(spec.table || "") || spec.table.length > 54)
    throw Error("Invalid owned table");
  if (
    !/^[1-9][0-9]*$/.test(String(spec.migrationVersion || "")) ||
    !Number.isSafeInteger(Number(spec.migrationVersion)) ||
    Number(spec.migrationVersion) > Number.MAX_SAFE_INTEGER
  )
    throw Error("Explicit numeric migrationVersion required");
  if (
    !Array.isArray(spec.roles) ||
    !spec.roles.length ||
    new Set(spec.roles).size !== spec.roles.length ||
    spec.roles.some((role) => !["ADMIN", "BUSINESS"].includes(role))
  )
    throw Error("Unsupported role scope: only explicit ADMIN/BUSINESS reference data is generated");
  if (spec.surface !== undefined && !["business", "admin"].includes(spec.surface))
    throw Error("Reference module surface must be business or admin");
  if (
    spec.navigation !== undefined &&
    (!spec.navigation ||
      typeof spec.navigation !== "object" ||
      (spec.navigation.group !== undefined && !/^[a-z][a-z0-9-]*$/.test(spec.navigation.group)) ||
      (spec.navigation.order !== undefined &&
        (!Number.isInteger(spec.navigation.order) || Math.abs(spec.navigation.order) > 10000)) ||
      (spec.navigation.hidden !== undefined && typeof spec.navigation.hidden !== "boolean"))
  )
    throw Error("Invalid navigation descriptor");
  for (const locale of ["zh-CN", "en-US"])
    if (typeof spec.title?.[locale] !== "string" || !spec.title[locale].trim())
      throw Error(`Missing title ${locale}`);
  if (!Array.isArray(spec.fields) || spec.fields.length < 1 || spec.fields.length > 30)
    throw Error("Between 1 and 30 explicit public fields required");
  const names = new Set();
  const methods = new Set();
  rejectUnknown(spec.title, ["zh-CN", "en-US"], "title");
  if (spec.navigation !== undefined)
    rejectUnknown(spec.navigation, ["group", "order", "hidden"], "navigation");
  for (const field of spec.fields) {
    rejectUnknown(
      field,
      ["name", "type", "required", "maxLength", "unique", "search", "label", "default"],
      "field"
    );
    rejectUnknown(field.label, ["zh-CN", "en-US"], "field label");
    if (!["string", "text"].includes(field.type) && field.maxLength !== undefined)
      throw Error("maxLength is only supported for strings and text");
    if (
      !/^[a-z][a-zA-Z0-9]*$/.test(field.name || "") ||
      field.name.length > 48 ||
      names.has(column(field.name)) ||
      internalFields.has(field.name) ||
      column(field.name).length > 64 ||
      reserved.has(field.name) ||
      reserved.has(column(field.name))
    )
      throw Error("Invalid, reserved or duplicate field");
    names.add(column(field.name));
    for (const method of [
      field.name,
      `set${upper(field.name)}`,
      `has${upper(field.name)}`,
      `is${upper(field.name)}Valid`
    ]) {
      if (methods.has(method)) throw Error("Generated accessor collision");
      methods.add(method);
    }
    for (const flag of ["search", "unique"])
      if (field[flag] !== undefined && typeof field[flag] !== "boolean")
        throw Error(`Invalid ${flag} flag`);
    if (field.unique && (field.type !== "string" || field.maxLength > 768))
      throw Error("Unique fields must be VARCHAR of at most 768 utf8mb4 characters");
    if (field.type === "text" && field.default !== undefined)
      throw Error("TEXT defaults require an explicit reviewed migration");
    if (/password|token|secret|apiKey|salt|credential/i.test(field.name))
      throw Error("Secrets cannot be scaffolded as public form fields");
    if (!Object.hasOwn(javaTypes, field.type)) throw Error(`Unsupported field type: ${field.type}`);
    if (typeof field.required !== "boolean")
      throw Error("Every field must declare required true/false");
    if (
      ["string", "text"].includes(field.type) &&
      (!Number.isInteger(field.maxLength) || field.maxLength < 1 || field.maxLength > 10000)
    )
      throw Error("String maxLength must be between 1 and 10000");
    if (field.search && !["string", "text"].includes(field.type))
      throw Error("Only strings can be searched");
    for (const locale of ["zh-CN", "en-US"])
      if (typeof field.label?.[locale] !== "string" || !field.label[locale].trim())
        throw Error(`Missing field label ${locale}`);
    if (
      field.default !== undefined &&
      (field.default === null
        ? field.required
        : typeof field.default !==
          (field.type === "integer"
            ? "number"
            : ["string", "text"].includes(field.type)
              ? "string"
              : "boolean"))
    )
      throw Error("Default type mismatch");
    if (
      typeof field.default === "string" &&
      (field.default.length > field.maxLength ||
        Array.from(field.default).some(
          (character) => character === "\\" || character.codePointAt(0) < 32
        ) ||
        (field.required && !field.default.trim()))
    )
      throw Error("String default is invalid or requires an explicit reviewed migration");
    if (
      field.type === "integer" &&
      field.default !== undefined &&
      field.default !== null &&
      (!Number.isInteger(field.default) ||
        field.default < -2147483648 ||
        field.default > 2147483647)
    )
      throw Error("Integer default out of range");
  }
  if (
    spec.fields.reduce(
      (sum, field) => sum + (field.type === "string" ? field.maxLength * 4 + 2 : 24),
      0
    ) > 60000
  )
    throw Error("VARCHAR fields exceed a safe MySQL row-size budget; use TEXT");
  if (!spec.fields.some((field) => field.search))
    throw Error("At least one searchable string field is required");
  return spec;
}

export function modelNames(spec) {
  const name = spec.id.split("-").map(upper).join("");
  return {
    name,
    camel: name[0].toLowerCase() + name.slice(1),
    packageName: spec.id.replaceAll("-", "")
  };
}

function schemaField(field) {
  const type = ["string", "text"].includes(field.type) ? "string" : field.type;
  return {
    type,
    ...(field.maxLength ? { maxLength: field.maxLength } : {}),
    ...(field.required && type === "string" ? { minLength: 1 } : {}),
    ...(!field.required ? { nullable: true } : {}),
    ...(field.default !== undefined ? { default: field.default } : {})
  };
}

export function moduleOpenApi(spec) {
  validateSpec(spec);
  const { name } = modelNames(spec),
    ref = (key) => ({ $ref: `#/components/schemas/${key}` });
  const properties = Object.fromEntries(
    spec.fields.map((field) => [field.name, schemaField(field)])
  );
  const patchProperties = Object.fromEntries(
    spec.fields.map((field) => {
      const value = schemaField(field);
      delete value.default;
      return [field.name, value];
    })
  );
  const jsonResponse = (schema) => ({
    description: "Success",
    content: { "application/json": { schema } }
  });
  const errors = Object.fromEntries(
    [400, 401, 403, 404, 409, 500].map((status) => [
      status,
      {
        description: "Request rejected",
        content: { "application/json": { schema: ref("ApiError") } }
      }
    ])
  );
  const base = `/business/${spec.id}`;
  return {
    paths: {
      [base]: {
        get: {
          operationId: `list${name}`,
          security: [{ employeeToken: [] }],
          tags: [spec.id],
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
            {
              name: "pageSize",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 20 }
            },
            { name: "query", in: "query", schema: { type: "string", maxLength: 100 } }
          ],
          responses: { 200: jsonResponse(ref(`${name}Page`)), ...errors }
        },
        post: {
          operationId: `create${name}`,
          security: [{ employeeToken: [] }],
          tags: [spec.id],
          requestBody: {
            required: true,
            content: { "application/json": { schema: ref(`${name}Write`) } }
          },
          responses: { 201: jsonResponse(ref(`${name}Response`)), ...errors }
        }
      },
      [`${base}/{id}`]: {
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } }
        ],
        get: {
          operationId: `get${name}`,
          security: [{ employeeToken: [] }],
          tags: [spec.id],
          responses: { 200: jsonResponse(ref(`${name}Response`)), ...errors }
        },
        patch: {
          operationId: `update${name}`,
          security: [{ employeeToken: [] }],
          tags: [spec.id],
          requestBody: {
            required: true,
            content: { "application/json": { schema: ref(`${name}Update`) } }
          },
          responses: { 200: jsonResponse(ref(`${name}Response`)), ...errors }
        }
      }
    },
    schemas: {
      [`${name}Write`]: {
        type: "object",
        additionalProperties: false,
        required: spec.fields.filter((f) => f.required).map((f) => f.name),
        properties
      },
      [`${name}Patch`]: {
        type: "object",
        additionalProperties: false,
        properties: patchProperties
      },
      [`${name}Update`]: {
        type: "object",
        additionalProperties: false,
        required: ["version", "values"],
        properties: { version: { type: "integer", minimum: 0 }, values: ref(`${name}Patch`) }
      },
      [`${name}Response`]: {
        type: "object",
        required: ["id", "version", "createdAt", "updatedAt", ...spec.fields.map((f) => f.name)],
        properties: {
          id: { type: "string", format: "uuid" },
          version: { type: "integer", minimum: 0 },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          ...properties
        }
      },
      [`${name}Page`]: {
        type: "object",
        required: ["items", "page", "pageSize", "total", "totalPages"],
        properties: {
          items: { type: "array", items: ref(`${name}Response`) },
          page: { type: "integer", minimum: 0 },
          pageSize: { type: "integer", minimum: 1, maximum: 100 },
          total: { type: "integer", minimum: 0 },
          totalPages: { type: "integer", minimum: 0 }
        }
      }
    }
  };
}

function fieldDdl(field) {
  const type = {
    string: `VARCHAR(${field.maxLength})`,
    text: "TEXT",
    boolean: "BOOLEAN",
    integer: "INT"
  }[field.type];
  const fallback =
    field.default === undefined
      ? ""
      : ` DEFAULT ${field.default === null ? "NULL" : typeof field.default === "string" ? sqlText(field.default) : String(field.default).toUpperCase()}`;
  return `${sqlId(column(field.name))} ${type} ${field.required ? "NOT NULL" : "NULL"}${fallback}`;
}

export function createMigration(spec) {
  validateSpec(spec);
  return `-- Generated proposal; review constraints and data meaning before applying.\nCREATE TABLE ${sqlId(spec.table)} (\n  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,\n  public_id VARCHAR(36) NOT NULL UNIQUE,\n  version BIGINT NOT NULL DEFAULT 0,\n  created_by BIGINT NOT NULL,\n  updated_by BIGINT NOT NULL,\n  created_at DATETIME(6) NOT NULL,\n  updated_at DATETIME(6) NOT NULL,\n${spec.fields.map((field) => `  ${fieldDdl(field)},`).join("\n")}\n${spec.fields
    .filter((field) => field.unique)
    .map(
      (field) =>
        `  UNIQUE KEY ${sqlId(indexName(`uq_${spec.id.replaceAll("-", "_")}_${column(field.name)}`))} (${sqlId(column(field.name))}),`
    )
    .join(
      "\n"
    )}\n  INDEX ${sqlId(indexName(`idx_${spec.id.replaceAll("-", "_")}_updated`))} (updated_at, id)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;\n`;
}

export function additiveMigration(previous, current) {
  validateSpec(previous);
  validateSpec(current);
  if (previous.id !== current.id) throw Error("Module identity cannot change");
  if (previous.table !== current.table)
    throw Error("Table rename requires an explicit reviewed migration");
  const structure = (field) => ({
    name: field.name,
    type: field.type,
    required: field.required,
    maxLength: field.maxLength,
    unique: !!field.unique,
    default: field.default
  });
  for (const old of previous.fields) {
    const field = current.fields.find((item) => item.name === old.name);
    if (!field || JSON.stringify(structure(old)) !== JSON.stringify(structure(field)))
      throw Error(
        "Drop, rename, type, default, uniqueness or nullability change requires an explicit reviewed migration"
      );
  }
  const added = current.fields.filter(
    (field) => !previous.fields.some((old) => old.name === field.name)
  );
  if (!added.length) return null;
  if (added.some((field) => field.required || field.unique || field.default !== undefined))
    throw Error(
      "Only nullable additive fields are generated automatically; required/default/unique changes need a backfill plan"
    );
  if (Number(current.migrationVersion) <= Number(previous.migrationVersion))
    throw Error("Schema changes require a new migrationVersion");
  return `-- Additive proposal. Backfill/contract changes are a separate reviewed release.\nALTER TABLE ${sqlId(current.table)}\n${added.map((field) => `  ADD COLUMN ${fieldDdl(field)}`).join(",\n")};\n`;
}

function replacements(spec) {
  const { name, camel, packageName } = modelNames(spec);
  const all = [
    { name: "id", type: "Long" },
    { name: "publicId", type: "String" },
    { name: "version", type: "Long" },
    { name: "createdBy", type: "Long" },
    { name: "updatedBy", type: "Long" },
    { name: "createdAt", type: "Instant" },
    { name: "updatedAt", type: "Instant" },
    ...spec.fields.map((field) => ({ name: field.name, type: javaTypes[field.type] }))
  ];
  const propertyValue = (field) =>
    field.required && ["string", "text"].includes(field.type)
      ? `values.${field.name}().trim()`
      : `values.${field.name}()`;
  return {
    NAME: name,
    CAMEL: camel,
    PACKAGE: packageName,
    TABLE: spec.table,
    ID: spec.id,
    ACTION: spec.id.replaceAll("-", "_").toUpperCase(),
    ROLES: spec.roles.map(quote).join(", "),
    SURFACE: quote(spec.surface || "business"),
    NAVIGATION: JSON.stringify({
      group: spec.surface || "business",
      order: 100,
      ...spec.navigation
    }),
    ENTITY_FIELDS: spec.fields
      .map((field) => `  private ${javaTypes[field.type]} ${field.name};`)
      .join("\n"),
    ACCESSORS: all
      .map(
        (field) =>
          `  public ${field.type} get${upper(field.name)}() { return ${field.name}; }\n  public void set${upper(field.name)}(${field.type} value) { ${field.name} = value; }`
      )
      .join("\n"),
    WRITE_IMPORTS: [
      ...new Set(
        spec.fields.flatMap((field) => [
          ...(field.required
            ? [["string", "text"].includes(field.type) ? "NotBlank" : "NotNull"]
            : []),
          ...(["string", "text"].includes(field.type) ? ["Size"] : [])
        ])
      )
    ]
      .sort()
      .map((name) => `import jakarta.validation.constraints.${name};`)
      .join("\n"),
    WRITE_FIELDS: spec.fields
      .map(
        (field) =>
          `    ${field.required ? (["string", "text"].includes(field.type) ? "@NotBlank " : "@NotNull ") : ""}${field.maxLength ? `@Size(max = ${field.maxLength}) ` : ""}${javaTypes[field.type]} ${field.name}`
      )
      .join(",\n"),
    RESPONSE_FIELDS: spec.fields
      .map((field) => `    ${javaTypes[field.type]} ${field.name}`)
      .join(",\n"),
    SEARCH_FIELDS: spec.fields
      .filter((field) => field.search)
      .map((field, i) => `${i ? ".or()" : ""}.like(${quote(column(field.name))}, query)`)
      .join(""),
    UPDATE_SETS: spec.fields
      .map(
        (field) =>
          `    if (values.has${upper(field.name)}()) update.set(${quote(column(field.name))}, ${propertyValue(field)});`
      )
      .join("\n"),
    CREATE_SETS: spec.fields
      .map((field) => `    row.set${upper(field.name)}(${propertyValue(field)});`)
      .join("\n"),
    PATCH_FIELDS: spec.fields
      .map((field) => {
        const cap = upper(field.name),
          type = javaTypes[field.type];
        const valid =
          [
            field.required ? `(${field.name} != null)` : "true",
            ["string", "text"].includes(field.type)
              ? `(${field.name} == null || ${field.required ? `!${field.name}.isBlank() && ` : ""}${field.name}.length() <= ${field.maxLength})`
              : "true"
          ]
            .filter((part) => part !== "true")
            .join(" && ") || "true";
        return `  private ${type} ${field.name};\n  private boolean ${field.name}Present;\n  @JsonSetter(${quote(field.name)})\n  public void set${cap}(${type} value) { ${field.name} = value; ${field.name}Present = true; }\n  public ${type} ${field.name}() { return ${field.name}; }\n  @JsonIgnore\n  public boolean has${cap}() { return ${field.name}Present; }\n  @JsonIgnore\n  @AssertTrue(message = ${quote(`Invalid ${field.name}`)})\n  public boolean is${cap}Valid() { return !${field.name}Present || (${valid}); }`;
      })
      .join("\n\n"),
    RESPONSE_GETTERS: spec.fields
      .map((field) => `        row.get${upper(field.name)}()`)
      .join(",\n")
  };
}

export function renderTemplate(template, spec) {
  const values = replacements(spec);
  return template.replace(/__([A-Z][A-Z_]*?)__/g, (_, key) => {
    if (!(key in values)) throw Error(`Unknown template token ${key}`);
    return values[key];
  });
}

function formatOutputs(outputs) {
  const managed = outputs.filter((item) => /\.(js|ts|json|vue)$/.test(item.path));
  if (!managed.length) return;
  const formatter = require.resolve("prettier");
  const code = `import prettier from ${JSON.stringify(pathToFileURL(formatter).href)};let input='';for await(const chunk of process.stdin)input+=chunk;const rows=JSON.parse(input);for(const row of rows){const config=await prettier.resolveConfig(process.argv[1]);row.content=await prettier.format(row.content,{...config,filepath:row.path});}process.stdout.write(JSON.stringify(rows));`;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", code, resolve(project, "package.json")],
    { input: JSON.stringify(managed), encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
  );
  if (result.status !== 0) throw Error(`Cannot format generated files: ${result.stderr}`);
  const values = new Map(JSON.parse(result.stdout).map((item) => [item.path, item.content]));
  for (const item of managed) item.content = values.get(item.path);
}

function guardedPath(root, name) {
  const path = resolve(root, name),
    rel = relative(root, path);
  if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || resolve(path) === resolve(root))
    throw Error("Output must stay inside selected workspace");
  let parent = dirname(path);
  while (!existsSync(parent)) parent = dirname(parent);
  const realRoot = realpathSync(root),
    realParent = realpathSync(parent);
  const physical = relative(realRoot, realParent);
  if (physical === ".." || physical.startsWith(`..${sep}`))
    throw Error("Output ancestor escapes workspace through a symlink");
  if (existsSync(path) && lstatSync(path).isSymbolicLink())
    throw Error("Refusing to follow output symlink");
  return path;
}

export function planModule(root, input, { target = "all" } = {}) {
  if (!["all", "backend"].includes(target)) throw Error("Unknown generation target");
  const spec = validateSpec(input),
    { name, packageName } = modelNames(spec);
  const base = `backend/src/main/java/com/cargoplanner/backend/${packageName}`;
  const outputs = [];
  const add = (path, content, generated = true) => outputs.push({ path, content, generated });
  for (const [template, path, generated] of [
    ["entity.java.tpl", `${base}/infrastructure/${name}Entity.java`, true],
    ["mapper.java.tpl", `${base}/infrastructure/${name}Mapper.java`, true],
    ["write.java.tpl", `${base}/api/${name}Write.java`, true],
    ["update.java.tpl", `${base}/api/${name}Update.java`, true],
    ["patch.java.tpl", `${base}/api/${name}Patch.java`, true],
    ["mapping.java.tpl", `${base}/infrastructure/${name}Mapping.java`, true],
    ["response.java.tpl", `${base}/api/${name}Response.java`, true],
    ["policy.java.tpl", `${base}/domain/${name}Policy.java`, true],
    ["repository.java.tpl", `${base}/infrastructure/${name}Repository.java`, false],
    ["application.java.tpl", `${base}/application/${name}ApplicationService.java`, false],
    ["controller.java.tpl", `${base}/api/${name}Controller.java`, false],
    ["module.js.tpl", `frontend/src/modules/${spec.id}/module.js`, true],
    ["page.vue.tpl", `frontend/src/modules/${spec.id}/pages/${name}Page.vue`, false],
    ["runtime.ts.tpl", `frontend/src/modules/${spec.id}/use${name}.ts`, false]
  ]) {
    if (target === "backend" && path.startsWith("frontend/")) continue;
    add(
      path,
      renderTemplate(readFileSync(new URL(template, templateRoot), "utf8"), spec),
      generated
    );
  }
  if (target !== "backend") {
    add(
      `frontend/src/modules/${spec.id}/messages.js`,
      `export default ${JSON.stringify(moduleMessages(spec), null, 2)};\n`
    );
    add(
      `frontend/src/generated/${spec.id}-api.ts`,
      renderTemplate(readFileSync(new URL("api.ts.tpl", templateRoot), "utf8"), spec)
    );
    const defaults = Object.fromEntries(
      spec.fields.map((field) => [
        field.name,
        field.default !== undefined
          ? field.default
          : field.required
            ? { string: "", text: "", boolean: false, integer: 0 }[field.type]
            : null
      ])
    );
    add(
      `frontend/src/generated/${spec.id}-model.ts`,
      `import type { components } from "./platform-api";\nexport const fields = ${JSON.stringify(
        spec.fields.map(({ name, type, required, maxLength }) => ({
          name,
          type,
          required,
          ...(maxLength ? { maxLength } : {})
        })),
        null,
        2
      )} as const;\nexport const defaults = ${JSON.stringify(defaults, null, 2)} satisfies components["schemas"]["${name}Write"];\n`
    );
  }
  const specsDir = guardedPath(root, "module-specs");
  const others = existsSync(specsDir)
    ? readdirSync(specsDir)
        .filter((name) => name.endsWith(".json"))
        .map((name) =>
          validateSpec(JSON.parse(readFileSync(guardedPath(root, `module-specs/${name}`), "utf8")))
        )
        .filter((item) => item.id !== spec.id)
    : [];
  for (const other of others)
    if (other.table === spec.table || modelNames(other).packageName === packageName)
      throw Error("Module table or Java package collision");
  if (target !== "backend") {
    const specs = [...others, spec].sort((a, b) => a.id.localeCompare(b.id));
    const imports = specs
      .map(
        (item) => `import { ${modelNames(item).camel}Registration } from "./${item.id}/module.js";`
      )
      .join("\n");
    add(
      "frontend/src/modules/generatedRegistrations.js",
      `${imports}\nexport const generatedModuleRegistrations = [${specs.map((item) => `${modelNames(item).camel}Registration`).join(", ")}];\n`,
      true
    );
  }
  const statePath = `module-specs/.generated/${spec.id}.json`;
  const old = existsSync(guardedPath(root, statePath))
    ? JSON.parse(readFileSync(guardedPath(root, statePath), "utf8"))
    : null;
  if (!old) {
    for (const owned of [base, `frontend/src/modules/${spec.id}`]) {
      const targetPath = guardedPath(root, owned);
      if (existsSync(targetPath) && readdirSync(targetPath).length)
        throw Error(`Existing module/package requires explicit adoption: ${owned}`);
    }
    // Static ownership scan protects known historical schemas. Arbitrary dynamic DDL still needs review.
    for (const directory of [
      "backend/src/main/resources/db/migration",
      "backend/src/main/java/db/migration"
    ]) {
      const migrationPath = guardedPath(root, directory);
      if (!existsSync(migrationPath)) continue;
      for (const file of readdirSync(migrationPath).filter((file) => /\.(sql|java)$/.test(file))) {
        const body = readFileSync(guardedPath(root, `${directory}/${file}`), "utf8");
        const tables = [
          ...body.matchAll(
            /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-zA-Z_][a-zA-Z0-9_]*)`?/gi
          )
        ].map((match) => match[1].toLowerCase());
        if (tables.includes(spec.table))
          throw Error(
            `Owned table already declared in historical migration: ${spec.table} (${file})`
          );
      }
    }
  }
  const migration = old ? additiveMigration(old.spec, spec) : createMigration(spec);
  if (migration) {
    const migrationName = `V${spec.migrationVersion}__${spec.id.replaceAll("-", "_")}.sql`;
    const migrationDir = guardedPath(root, "backend/src/main/resources/db/migration");
    const collision =
      existsSync(migrationDir) &&
      readdirSync(migrationDir).find(
        (file) =>
          migrationPattern.test(file) &&
          Number(migrationPattern.exec(file)[1]) === Number(spec.migrationVersion)
      );
    if (collision) throw Error(`Migration version already exists: ${collision}`);
    const versions = [
      "backend/src/main/resources/db/migration",
      "backend/src/main/java/db/migration"
    ].flatMap((directory) => {
      const value = guardedPath(root, directory);
      return existsSync(value)
        ? readdirSync(value)
            .filter((file) => /\.(sql|java)$/.test(file) && migrationPattern.test(file))
            .map((file) => Number(migrationPattern.exec(file)[1]))
        : [];
    });
    if (versions.some((version) => version >= Number(spec.migrationVersion)))
      throw Error("Migration version must be newer than all existing migrations");
    add(`backend/src/main/resources/db/migration/${migrationName}`, migration);
  }
  formatOutputs(outputs);
  const registryPath = "frontend/src/modules/generatedRegistrations.js";
  const registryState = "module-specs/.generated/registry-state.json";
  const registryOwned = existsSync(guardedPath(root, registryState))
    ? JSON.parse(readFileSync(guardedPath(root, registryState), "utf8")).digest
    : null;

  const owned = {};
  for (const output of outputs) {
    const path = guardedPath(root, output.path);
    if (existsSync(path)) {
      const content = readFileSync(path, "utf8");
      if (!output.generated) {
        output.content = content;
        output.skip = true;
      } else if (
        content !== output.content &&
        (!(output.path === registryPath ? registryOwned : old?.owned[output.path]) ||
          hash(content) !== (output.path === registryPath ? registryOwned : old.owned[output.path]))
      )
        throw Error(`Generated-file conflict; preserve/edit deliberately: ${output.path}`);
    }
    if (output.generated && output.path !== registryPath) owned[output.path] = hash(output.content);
  }
  // Preserve hashes of already released migration files; regeneration never rewrites them.
  for (const [path, digest] of Object.entries(old?.owned || {}))
    if (path.includes("/db/migration/")) {
      if (
        !existsSync(guardedPath(root, path)) ||
        hash(readFileSync(guardedPath(root, path), "utf8")) !== digest
      )
        throw Error(`Applied migration changed or missing: ${path}`);
      owned[path] = digest;
    }
  for (const [path, digest] of Object.entries(old?.owned || {}))
    if (!Object.hasOwn(owned, path)) owned[path] = digest;
  if (target !== "backend")
    add(
      registryState,
      JSON.stringify(
        { digest: hash(outputs.find((item) => item.path === registryPath).content) },
        null,
        2
      ) + "\n"
    );
  add(statePath, JSON.stringify({ spec, owned }, null, 2) + "\n");
  formatOutputs(outputs);
  return outputs;
}

function moduleMessages(spec) {
  const { camel } = modelNames(spec);
  const shared = {
    "zh-CN": {
      description: "维护内部服务目录；客户申请与服务履约由各业务模块处理。",
      search: "搜索",
      create: "新增",
      edit: "编辑",
      save: "保存",
      cancel: "取消",
      refresh: "刷新",
      actions: "操作",
      enabled: "启用",
      disabled: "停用",
      error: "操作失败，请重试",
      stale: "记录已被修改，请刷新后重新编辑",
      changed: "有未保存的更改",
      updatedAt: "更新时间",
      total: "共 {total} 条"
    },
    "en-US": {
      description:
        "Manage internal reference data. Customer requests and fulfillment use domain workflows.",
      search: "Search",
      create: "Create",
      edit: "Edit",
      save: "Save",
      cancel: "Cancel",
      refresh: "Refresh",
      actions: "Actions",
      enabled: "Enabled",
      disabled: "Disabled",
      error: "Operation failed. Please retry.",
      stale: "Record changed. Reload before editing.",
      changed: "Unsaved changes",
      updatedAt: "Updated",
      total: "{total} records"
    }
  };
  return Object.fromEntries(
    ["zh-CN", "en-US"].map((locale) => [
      locale,
      {
        [camel]: {
          ...shared[locale],
          title: spec.title[locale],
          fields: Object.fromEntries(spec.fields.map((field) => [field.name, field.label[locale]]))
        }
      }
    ])
  );
}

export function generateModule(root, spec, { check = false, dryRun = false, target = "all" } = {}) {
  const plan = planModule(root, spec, { target });
  const changed = plan.filter(
    (entry) =>
      !entry.skip &&
      (!existsSync(guardedPath(root, entry.path)) ||
        readFileSync(guardedPath(root, entry.path), "utf8") !== entry.content)
  );
  if (check && changed.length)
    throw Error(`Generated module is stale: ${changed.map((entry) => entry.path).join(", ")}`);
  if (!check && !dryRun)
    for (const entry of changed) {
      const path = guardedPath(root, entry.path);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, entry.content);
    }
  return changed.map((entry) => entry.path);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2),
      source = args.find((arg) => !arg.startsWith("--"));
    if (
      !source ||
      args.some(
        (arg) => arg.startsWith("--") && !["--check", "--dry-run", "--backend-only"].includes(arg)
      )
    )
      throw Error(
        "Usage: node scripts/module-kit.mjs module-specs/name.json [--dry-run | --check]"
      );
    const spec = JSON.parse(readFileSync(resolve(project, source), "utf8"));
    console.log(
      JSON.stringify(
        {
          module: spec.id,
          changes: generateModule(project, spec, {
            check: args.includes("--check"),
            dryRun: args.includes("--dry-run"),
            target: args.includes("--backend-only") ? "backend" : "all"
          })
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
