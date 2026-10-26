import assert from "node:assert/strict";

// Raw inspect fingerprints stay exact. Only three reviewed assignment-table names are aliases.
const legacyNames = new Map([
  ["fk_cp_customer_employee_assignment_actor", "fk_cp_customer_employee_assigned_by"],
  ["fk_cp_customer_employee_assignment_customer", "fk_cp_customer_employee_customer"],
  ["fk_cp_customer_employee_assignment_employee", "fk_cp_customer_employee_user"]
]);
export function canonicalSchema(schema) {
  const engines = new Map(schema.tables.map((table) => [table.TABLE_NAME, table.ENGINE]));
  return Object.fromEntries(
    Object.entries(schema).map(([section, rows]) => [
      section,
      rows
        .map((original) => {
          const row = { ...original };
          if (
            section === "indexes" &&
            row.TABLE_NAME === "cp_customer_employee_assignments" &&
            legacyNames.has(row.INDEX_NAME)
          )
            row.INDEX_NAME = legacyNames.get(row.INDEX_NAME);
          if (section === "foreignKeys") {
            if (
              row.TABLE_NAME === "cp_customer_employee_assignments" &&
              legacyNames.has(row.CONSTRAINT_NAME)
            )
              row.CONSTRAINT_NAME = legacyNames.get(row.CONSTRAINT_NAME);
            // InnoDB rejects immediately for both forms; NDB deferred NO ACTION must not be normalized.
            // https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html
            if (engines.get(row.TABLE_NAME)?.toUpperCase() === "INNODB") {
              for (const rule of ["UPDATE_RULE", "DELETE_RULE"])
                if (row[rule] === "NO ACTION") row[rule] = "RESTRICT";
            }
          }
          return JSON.stringify(
            Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b)))
          );
        })
        .sort()
    ])
  );
}
export function assertSchemaEquivalent(actual, expected) {
  assert.deepStrictEqual(canonicalSchema(actual), canonicalSchema(expected));
}
