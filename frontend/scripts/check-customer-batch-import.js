import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import {
  buildCustomerImportTemplate,
  parseCustomerImportWorkbook,
  validateCustomerImportRows
} from "../src/services/customerExcelImport.js";

const template = buildCustomerImportTemplate(XLSX);
assert.deepEqual(template.SheetNames, ["\u586b\u5199\u8bf4\u660e", "\u5ba2\u6237\u5bfc\u5165"]);

const parsedTemplate = parseCustomerImportWorkbook(template, XLSX);
assert.equal(parsedTemplate.total, 1);
assert.equal(parsedTemplate.valid, 1);
assert.equal(parsedTemplate.invalid, 0);
assert.equal(parsedTemplate.items[0].username, "acme-shipper");
assert.equal(parsedTemplate.items[0].clientCode, "ACME-001");
assert.equal(parsedTemplate.items[0].partyRole, "SHIPPER");

const invalid = validateCustomerImportRows([
  {
    rowNumber: 2,
    username: "bad name",
    password: "lowercase",
    clientCode: "bad code",
    displayName: "A",
    partyRole: "UNKNOWN"
  },
  {
    rowNumber: 3,
    username: "duplicate",
    clientCode: "CLIENT-001"
  },
  {
    rowNumber: 4,
    username: "duplicate",
    clientCode: "CLIENT-001"
  }
]);
assert.equal(invalid.valid, 1);
assert.equal(invalid.invalid, 2);
assert(invalid.rows[0].errors.some((item) => item.code === "USERNAME_FORMAT"));
assert(invalid.rows[0].errors.some((item) => item.code === "PASSWORD_COMPLEXITY"));
assert(invalid.rows[2].errors.some((item) => item.code === "DUPLICATE_USERNAME"));
assert(invalid.rows[2].errors.some((item) => item.code === "DUPLICATE_CLIENT_CODE"));

const shipmentWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  shipmentWorkbook,
  XLSX.utils.aoa_to_sheet([["IMPORT KEY", "REFERENCE NO"], ["SHIP-001", "6508205930"]]),
  "\u7968\u5355\u4e3b\u8868"
);
const wrongTemplate = parseCustomerImportWorkbook(shipmentWorkbook, XLSX);
assert.equal(wrongTemplate.total, 0);
assert.equal(wrongTemplate.globalErrors[0]?.code, "WRONG_TEMPLATE");

const component = await readFile(
  new URL("../src/components/BusinessCustomerPage.vue", import.meta.url),
  "utf8"
);
assert(component.includes("downloadCustomerImportTemplate"));
assert(component.includes("activeCustomerBatchPreview.rows"));
assert(component.includes("customer-import-rules"));
assert(component.includes("customer-import-preview"));
assert(component.includes("localizeCustomerImportResult"));
assert(component.includes("return { rowNumber: index + 1, username, clientCode };"));

console.log("customer batch import checks passed");
