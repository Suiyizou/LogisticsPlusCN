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
const serializedTemplate = XLSX.write(template, { bookType: "xlsx", type: "buffer" });
const roundTrip = parseCustomerImportWorkbook(
  XLSX.read(serializedTemplate, { type: "buffer" }),
  XLSX
);
assert.deepEqual(roundTrip.items, parsedTemplate.items);

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
  },
  {
    rowNumber: 5,
    username: "short-code",
    clientCode: "ABCDE"
  },
  {
    rowNumber: 6,
    username: "long-code",
    clientCode: "ABCDEFGHIJK"
  }
]);
assert.equal(invalid.valid, 1);
assert.equal(invalid.invalid, 4);
assert(invalid.rows[0].errors.some((item) => item.code === "USERNAME_FORMAT"));
assert(invalid.rows[0].errors.some((item) => item.code === "PASSWORD_COMPLEXITY"));
assert(invalid.rows[2].errors.some((item) => item.code === "DUPLICATE_USERNAME"));
assert(invalid.rows[2].errors.some((item) => item.code === "DUPLICATE_CLIENT_CODE"));
assert(invalid.rows[3].errors.some((item) => item.code === "CLIENT_CODE_FORMAT"));
assert(invalid.rows[4].errors.some((item) => item.code === "CLIENT_CODE_FORMAT"));

const shipmentWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  shipmentWorkbook,
  XLSX.utils.aoa_to_sheet([
    ["IMPORT KEY", "REFERENCE NO"],
    ["SHIP-001", "6508205930"]
  ]),
  "\u7968\u5355\u4e3b\u8868"
);
const wrongTemplate = parseCustomerImportWorkbook(shipmentWorkbook, XLSX);
assert.equal(wrongTemplate.total, 0);
assert.equal(wrongTemplate.globalErrors[0]?.code, "WRONG_TEMPLATE");

const component = await readFile(
  new URL("../src/components/BusinessCustomerPage.vue", import.meta.url),
  "utf8"
);
const importDialog = await readFile(
  new URL("../src/modules/customers/components/CustomerImportDialog.vue", import.meta.url),
  "utf8"
);
assert(component.includes("CustomerDialogs"));
assert(importDialog.includes("activeCustomerBatchPreview.rows"));
assert(importDialog.includes("customer-import-rules"));
assert(importDialog.includes("customer-import-preview"));
// Page commands execute the production workflows in customer-module-pages.test.mjs.
// Quick-entry parsing and session races execute the production composable in customer-operations.test.mjs.

console.log("customer batch import checks passed");
