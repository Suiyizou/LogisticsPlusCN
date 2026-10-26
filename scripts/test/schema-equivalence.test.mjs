import test from "node:test";
import assert from "node:assert/strict";
import { assertSchemaEquivalent } from "../lib/schema-equivalence.mjs";

const schema = () => ({
  tables: [
    {
      TABLE_NAME: "cp_customer_employee_assignments",
      ENGINE: "InnoDB",
      TABLE_COLLATION: "utf8mb4_0900_ai_ci"
    }
  ],
  columns: [
    {
      TABLE_NAME: "cp_customer_employee_assignments",
      COLUMN_NAME: "assigned_by",
      COLUMN_TYPE: "bigint",
      IS_NULLABLE: "NO",
      COLUMN_DEFAULT: null
    }
  ],
  indexes: [
    {
      TABLE_NAME: "cp_customer_employee_assignments",
      INDEX_NAME: "fk_cp_customer_employee_assigned_by",
      NON_UNIQUE: 1,
      SEQ_IN_INDEX: 1,
      COLUMN_NAME: "assigned_by",
      SUB_PART: null
    }
  ],
  foreignKeys: [
    {
      TABLE_NAME: "cp_customer_employee_assignments",
      CONSTRAINT_NAME: "fk_cp_customer_employee_assigned_by",
      COLUMN_NAME: "assigned_by",
      REFERENCED_TABLE_NAME: "cp_users",
      REFERENCED_COLUMN_NAME: "id",
      ORDINAL_POSITION: 1,
      UPDATE_RULE: "NO ACTION",
      DELETE_RULE: "NO ACTION"
    }
  ],
  checks: []
});
test("InnoDB restrict/no-action and the single reviewed legacy constraint alias are equivalent", () => {
  const actual = schema();
  actual.indexes[0].INDEX_NAME = "fk_cp_customer_employee_assignment_actor";
  actual.foreignKeys[0].CONSTRAINT_NAME = "fk_cp_customer_employee_assignment_actor";
  actual.foreignKeys[0].UPDATE_RULE = "RESTRICT";
  actual.foreignKeys[0].DELETE_RULE = "RESTRICT";
  assertSchemaEquivalent(actual, schema());
});
for (const [label, change] of [
  [
    "nullability",
    (s) => {
      s.columns[0].IS_NULLABLE = "YES";
    }
  ],
  [
    "type width",
    (s) => {
      s.columns[0].COLUMN_TYPE = "int";
    }
  ],
  [
    "default",
    (s) => {
      s.columns[0].COLUMN_DEFAULT = "0";
    }
  ],
  [
    "unique index",
    (s) => {
      s.indexes[0].NON_UNIQUE = 0;
    }
  ],
  [
    "index column order",
    (s) => {
      s.indexes[0].SEQ_IN_INDEX = 2;
    }
  ],
  [
    "index prefix",
    (s) => {
      s.indexes[0].SUB_PART = 12;
    }
  ],
  [
    "cascade action",
    (s) => {
      s.foreignKeys[0].DELETE_RULE = "CASCADE";
    }
  ],
  [
    "referenced table",
    (s) => {
      s.foreignKeys[0].REFERENCED_TABLE_NAME = "other_users";
    }
  ],
  [
    "unexpected constraint alias",
    (s) => {
      s.foreignKeys[0].CONSTRAINT_NAME = "unreviewed_alias";
    }
  ]
])
  test(`schema equivalence still rejects a different ${label}`, () => {
    const actual = schema();
    change(actual);
    assert.throws(() => assertSchemaEquivalent(actual, schema()));
  });
test("NDB no-action remains distinct from restrict", () => {
  const actual = schema();
  const expected = schema();
  actual.tables[0].ENGINE = expected.tables[0].ENGINE = "NDB";
  actual.foreignKeys[0].DELETE_RULE = "RESTRICT";
  assert.throws(() => assertSchemaEquivalent(actual, expected));
});

for (const [legacyName, canonicalName, column, referenced] of [
  [
    "fk_cp_customer_employee_assignment_customer",
    "fk_cp_customer_employee_customer",
    "customer_id",
    "cp_customers"
  ],
  [
    "fk_cp_customer_employee_assignment_employee",
    "fk_cp_customer_employee_user",
    "employee_user_id",
    "cp_users"
  ]
])
  test(`reviewed assignment alias ${legacyName} preserves actual columns and references`, () => {
    const expected = schema();
    expected.columns[0].COLUMN_NAME = column;
    Object.assign(expected.indexes[0], { INDEX_NAME: canonicalName, COLUMN_NAME: column });
    Object.assign(expected.foreignKeys[0], {
      CONSTRAINT_NAME: canonicalName,
      COLUMN_NAME: column,
      REFERENCED_TABLE_NAME: referenced
    });
    const actual = structuredClone(expected);
    actual.indexes[0].INDEX_NAME = legacyName;
    actual.foreignKeys[0].CONSTRAINT_NAME = legacyName;
    assertSchemaEquivalent(actual, expected);
    actual.foreignKeys[0].REFERENCED_COLUMN_NAME = "wrong_id";
    assert.throws(() => assertSchemaEquivalent(actual, expected));
  });
test("reviewed names on another table are not normalized", () => {
  const actual = schema();
  const expected = schema();
  for (const item of [actual, expected]) {
    for (const records of Object.values(item))
      for (const row of records) row.TABLE_NAME = "other_table";
  }
  actual.foreignKeys[0].CONSTRAINT_NAME = "fk_cp_customer_employee_assignment_actor";
  assert.throws(() => assertSchemaEquivalent(actual, expected));
});
