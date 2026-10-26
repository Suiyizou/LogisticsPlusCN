import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";
import { format, resolveConfig } from "prettier";
import { moduleOpenApi } from "./module-kit.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
export function customerDirectoryContract() {
  // Public DTO contract, not a database entity. CI checks it against the Java record.
  const names = [
    "id",
    "username",
    "displayName",
    "clientCode",
    "partyRole",
    "customerCodePrefix",
    "customerCodeMode",
    "provisioningSource",
    "status",
    "remark",
    "contactEmail",
    "createdBy",
    "createdByDisplayName",
    "responsibleAgentId",
    "responsibleAgentDisplayName",
    "createdAt",
    "updatedAt",
    "shipmentCount",
    "overseaAgentUserId",
    "overseaAgentUsername",
    "overseaAgentDisplayName"
  ];
  const numbers = new Set([
    "createdBy",
    "responsibleAgentId",
    "shipmentCount",
    "overseaAgentUserId"
  ]);
  const nullable = new Set([
    "clientCode",
    "responsibleAgentDisplayName",
    "remark",
    "contactEmail",
    "createdBy",
    "createdByDisplayName",
    "overseaAgentUserId",
    "overseaAgentUsername",
    "overseaAgentDisplayName"
  ]);
  const mutationResponses = {
    200: {
      description: "Authorized customer profile",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/CustomerProfileResponse" }
        }
      }
    },
    400: { description: "Invalid customer profile" },
    401: { description: "Unauthenticated" },
    403: { description: "Forbidden" },
    404: { description: "Customer outside the permitted scope or absent" },
    409: { description: "Username or customer code already exists" }
  };
  const writeProperties = {
    username: { type: "string", minLength: 2, maxLength: 64 },
    displayName: { type: "string", minLength: 2, maxLength: 80 },
    partyRole: { type: "string", enum: ["SHIPPER", "CONSIGNEE"] },
    clientCode: { type: "string", nullable: true },
    remark: { type: "string", nullable: true, maxLength: 500 },
    contactEmail: {
      type: "string",
      nullable: true,
      maxLength: 254,
      description: "Optional contact address. PATCH omission/null preserves; empty string clears."
    }
  };
  return {
    paths: {
      "/business/customers": {
        post: {
          operationId: "createCustomerProfile",
          security: [{ employeeToken: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CustomerProfileCreate" }
              }
            }
          },
          responses: mutationResponses
        },
        get: {
          operationId: "listCustomerDirectory",
          security: [{ employeeToken: [] }],
          responses: {
            200: {
              description: "Authorized customer directory",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CustomerDirectoryResponse" }
                }
              }
            },
            401: { description: "Unauthenticated" },
            403: { description: "Forbidden" }
          }
        }
      },
      "/business/customers/{customerId}": {
        parameters: [
          { name: "customerId", in: "path", required: true, schema: { type: "string" } }
        ],
        get: {
          operationId: "readCustomerProfile",
          security: [{ employeeToken: [] }],
          responses: mutationResponses
        },
        patch: {
          operationId: "updateCustomerProfile",
          security: [{ employeeToken: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CustomerProfileUpdate" }
              }
            }
          },
          responses: mutationResponses
        }
      }
    },
    schemas: {
      CustomerProfileCreate: {
        type: "object",
        required: ["username", "password"],
        properties: {
          ...writeProperties,
          password: { type: "string", minLength: 8, maxLength: 128 }
        }
      },
      CustomerProfileUpdate: {
        type: "object",
        properties: {
          ...writeProperties,
          status: { type: "string", enum: ["ACTIVE", "DISABLED"] }
        }
      },
      CustomerProfileResponse: {
        type: "object",
        required: [...names, "customerCode"],
        properties: {
          ...Object.fromEntries(
            names.map((name) => [
              name,
              {
                type: numbers.has(name) ? "integer" : "string",
                ...(nullable.has(name) || ["createdAt", "updatedAt"].includes(name)
                  ? { nullable: true }
                  : {})
              }
            ])
          ),
          customerCode: {
            type: "string",
            nullable: true,
            description:
              "Only returned for the explicit create operation; null on ordinary reads/updates."
          }
        }
      },
      CustomerDirectoryItem: {
        type: "object",
        required: names,
        properties: Object.fromEntries(
          names.map((name) => [
            name,
            {
              type: numbers.has(name) ? "integer" : "string",
              ...(nullable.has(name) ? { nullable: true } : {})
            }
          ])
        )
      },
      CustomerDirectoryResponse: {
        type: "object",
        required: ["items", "total"],
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/CustomerDirectoryItem" } },
          total: { type: "integer", minimum: 0 }
        }
      }
    }
  };
}
export function buildContract(specs) {
  const document = {
    openapi: "3.0.3",
    info: { title: "Shipment platform module contracts", version: "1.0.0" },
    servers: [{ url: "/api" }],
    paths: {},
    components: {
      securitySchemes: {
        employeeToken: { type: "apiKey", in: "header", name: "X-Auth-Token" },
        customerToken: { type: "apiKey", in: "header", name: "X-Customer-Token" }
      },
      schemas: {
        ApiError: {
          type: "object",
          properties: {
            status: { type: "integer" },
            message: { type: "string" },
            code: { type: "string" },
            errorId: { type: "string" },
            retryAfterMs: { type: "integer" }
          }
        }
      }
    }
  };
  for (const fragment of [customerDirectoryContract(), ...specs.map(moduleOpenApi)]) {
    for (const [key, value] of Object.entries(fragment.paths)) {
      if (key in document.paths) throw Error(`Duplicate API path ${key}`);
      document.paths[key] = value;
    }
    for (const [key, value] of Object.entries(fragment.schemas)) {
      if (key in document.components.schemas) throw Error(`Duplicate schema ${key}`);
      document.components.schemas[key] = value;
    }
  }
  return document;
}
export async function generateContracts({ check = false } = {}) {
  const directory = resolve(root, "module-specs");
  const specs = readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(resolve(directory, name), "utf8")));
  const document = buildContract(specs);
  const config = (await resolveConfig(root)) || {};
  const outputs = {
    "contracts/platform.openapi.json": await format(JSON.stringify(document), {
      ...config,
      parser: "json"
    }),
    "frontend/src/generated/platform-api.d.ts": await format(
      "// Generated by npm run api:generate. Do not edit.\n" +
        astToString(await openapiTS(document, { defaultNonNullable: false })),
      { ...config, parser: "typescript" }
    )
  };
  const changed = [];
  for (const [name, content] of Object.entries(outputs)) {
    const path = resolve(root, name);
    if (existsSync(path) && readFileSync(path, "utf8") === content) continue;
    changed.push(name);
    if (!check) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
  }
  if (check && changed.length)
    throw Error(`API contract output is stale: ${changed.join(", ")}. Run npm run api:generate.`);
  return changed;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some((arg) => arg !== "--check"))
      throw Error("Only --check is supported");
    console.log(
      JSON.stringify({
        changes: await generateContracts({ check: process.argv.includes("--check") })
      })
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
