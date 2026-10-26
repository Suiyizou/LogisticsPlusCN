import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { customerDirectoryContract, buildContract } from "../generate-api-contracts.mjs";
test("customer directory contract matches the existing public Java DTO, including numeric fields", () => {
  const source = readFileSync(
    new URL(
      "../../backend/src/main/java/com/cargoplanner/backend/customer/dto/CustomerDirectoryItem.java",
      import.meta.url
    ),
    "utf8"
  );
  const fields = [...source.matchAll(/\b(String|Long|long)\s+(\w+)\s*[,)]/g)];
  const contract = customerDirectoryContract().schemas.CustomerDirectoryItem;
  assert.deepEqual(
    contract.required,
    fields.map((match) => match[2])
  );
  for (const match of fields)
    assert.equal(contract.properties[match[2]].type, match[1] === "String" ? "string" : "integer");
  assert.equal(contract.properties.clientCode.nullable, true);
  assert.equal(contract.properties.responsibleAgentDisplayName.nullable, true);
  assert.equal(
    Object.keys(contract.properties).some((key) => /password|token|hash|secret/i.test(key)),
    false
  );
});
test("contracts reject duplicate module paths and keep auth identities explicit", () => {
  const spec = JSON.parse(
    readFileSync(new URL("../../module-specs/service-catalog.json", import.meta.url), "utf8")
  );
  assert.throws(() => buildContract([spec, spec]), /Duplicate API path/);
  const doc = buildContract([spec]);
  assert.equal(doc.components.securitySchemes.employeeToken.name, "X-Auth-Token");
  assert.deepEqual(doc.paths["/business/service-catalog"].get.security, [{ employeeToken: [] }]);
  assert.equal(doc.components.schemas.ServiceCatalogResponse.properties.password, undefined);
});

test("customer profile requests and response match the Java public records", () => {
  const contract = customerDirectoryContract();
  for (const [filename, schema] of [
    ["CreateCustomerRequest.java", "CustomerProfileCreate"],
    ["UpdateCustomerRequest.java", "CustomerProfileUpdate"],
    ["dto/CustomerProfileResponse.java", "CustomerProfileResponse"]
  ]) {
    const source = readFileSync(
      new URL(
        `../../backend/src/main/java/com/cargoplanner/backend/customer/${filename}`,
        import.meta.url
      ),
      "utf8"
    );
    const header = source.split(/\)\s*\{/)[0];
    const names = [...header.matchAll(/\b(?:String|Long|long)\s+(\w+)\s*[,)]/g)].map(
      (match) => match[1]
    );
    // Last record component precedes the split delimiter, so include it explicitly.
    const last = header.match(/\b(?:String|Long|long)\s+(\w+)\s*$/);
    if (last) names.push(last[1]);
    assert.deepEqual(Object.keys(contract.schemas[schema].properties).sort(), names.sort());
  }
  assert.deepEqual(contract.paths["/business/customers"].post.security, [{ employeeToken: [] }]);
  assert.equal(contract.schemas.CustomerProfileUpdate.properties.password, undefined);
  assert.equal(contract.schemas.CustomerDirectoryItem.properties.customerCode, undefined);
});
