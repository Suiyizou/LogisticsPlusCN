import assert from "node:assert/strict";

import {
  cloneDefaultContainers,
  defaultContainers,
  effectiveContainerHeight,
  mergeDefaultContainers,
  referenceOnlyContainers
} from "../src/services/localData.js";

const REQUIRED_TEXT_FIELDS = [
  "id",
  "name",
  "dimensionSource",
  "dimensionBasis",
  "usagePriority",
  "visualKind"
];

assert.ok(defaultContainers.length > 0, "箱型资料库不能为空");

const expectedAlgorithmContainers = {
  "20gp": [[590, 235.2, 239.5], 18_000],
  "20hq": [[589.8, 235.2, 268.9], 28_340],
  "20fr": [[563.8, 243.8, 300], 22_000],
  "40gp": [[1203.2, 235.2, 239.5], 26_000],
  "40hq": [[1203.2, 235, 270], 26_000],
  "40fr": [[1165.2, 234.7, 300], 36_000],
  "20rf": [[545, 228, 215.9], 17_000],
  "40rf": [[1159.9, 229, 242.5], 22_000],
  "45hq": [[1355.6, 235.2, 269.8], 29_000],
  "20ot": [[589.8, 235.2, 234.2], 20_000],
  "40ot": [[1203.4, 235.2, 233], 30_500]
};

assert.equal(
  defaultContainers.length,
  Object.keys(expectedAlgorithmContainers).length,
  "参与算法的默认箱型数量必须与客户资料一致"
);

const ids = new Set();
for (const container of defaultContainers) {
  for (const field of REQUIRED_TEXT_FIELDS) {
    assert.ok(String(container[field] || "").trim(), `${container.id || "未知箱型"} 缺少 ${field}`);
  }

  assert.match(container.id, /^[a-z0-9-]+$/, `${container.id} 的 ID 必须是稳定的小写代码`);
  assert.ok(!ids.has(container.id), `箱型 ID 重复：${container.id}`);
  ids.add(container.id);

  assertMeasurement(container, "lengthCm", 100, 2_000, "cm");
  assertMeasurement(container, "widthCm", 100, 500, "cm");
  assertMeasurement(container, "heightCm", 100, 1_000, "cm");
  assertMeasurement(container, "payloadKg", 1_000, 100_000, "kg");

  assert.equal(
    Number(container.heightLimitCm),
    effectiveContainerHeight(container),
    `${container.id} 的 heightLimitCm 必须与实际计算高度一致`
  );

  const expected = expectedAlgorithmContainers[container.id];
  assert.ok(expected, `出现未经客户资料确认的算法箱型：${container.id}`);
  assert.deepEqual(
    [container.lengthCm, container.widthCm, container.heightCm],
    expected[0],
    `${container.id} 的算法内尺寸与客户文件不一致`
  );
  assert.equal(container.payloadKg, expected[1], `${container.id} 的配货载重参考不一致`);
}

assert.equal(referenceOnlyContainers.length, 2, "应保留两个只读特殊设备资料项");
for (const container of referenceOnlyContainers) {
  assert.equal(container.packingEligible, false, `${container.id} 必须明确排除在自动装箱外`);
  assert.ok(!ids.has(container.id), `${container.id} 不得同时进入算法箱型集合`);
  assert.ok(String(container.dimensionNote || "").trim(), `${container.id} 必须解释不参与算法的原因`);
}

const tank = referenceOnlyContainers.find((container) => container.id === "20iso-tank");
assert.ok(tank, "缺少 20ISO TANK 资料项");
assert.ok(
  [tank.lengthCm, tank.widthCm, tank.heightCm].every((value) => value == null),
  "20ISO TANK 不得伪造普通货物内部装箱尺寸"
);
assert.equal(tank.payloadKg, 26_000, "20ISO TANK 配货毛重参考应采用客户文件的 26,000kg");
assert.match(tank.dimensionNote, /仍不进入普通货物自动装箱/);

const garment = referenceOnlyContainers.find((container) => container.id === "40garment");
assert.ok(garment, "缺少 40 挂衣柜资料项");
assert.deepEqual(
  [garment.lengthCm, garment.widthCm, garment.heightCm],
  [1203, 235, 269],
  "40 挂衣柜只读尺寸与客户文件不一致"
);
assert.equal(garment.payloadKg, null, "客户未提供挂衣柜载重时不得自行推定");

assert.match(
  defaultContainers.find((container) => container.id === "20fr")?.dimensionNote || "",
  /脚架 565×203×207\.3cm.*板框 563\.9×222\.8×223\.3cm/,
  "20FR 说明必须保留脚架/板框差异"
);
assert.match(
  defaultContainers.find((container) => container.id === "40fr")?.dimensionNote || "",
  /脚架 1178\.4×203×194\.3cm.*板架 1177\.6×222\.8×195\.5cm/,
  "40FR 说明必须保留脚架/板架差异"
);
assert.match(defaultContainers.find((container) => container.id === "20hq")?.dimensionNote || "", /参考高 238、门高 255/);
assert.match(defaultContainers.find((container) => container.id === "40hq")?.dimensionNote || "", /门高 2525/);

const clones = cloneDefaultContainers();
assert.equal(clones.length, defaultContainers.length, "克隆后不应丢失默认箱型");
assert.notEqual(clones[0], defaultContainers[0], "克隆必须返回独立对象");
const originalLength = defaultContainers[0].lengthCm;
clones[0].lengthCm += 1;
assert.equal(defaultContainers[0].lengthCm, originalLength, "修改工作副本不能污染默认资料库");

const reference = defaultContainers[0];
const custom = {
  id: "custom-contract-test",
  name: "用户自定义测试箱型",
  lengthCm: 321,
  widthCm: 210,
  heightCm: 205,
  heightLimitCm: 205,
  payloadKg: 12_345,
  usagePriority: "common",
  visualKind: "dry"
};

const migrated = mergeDefaultContainers([
  {
    ...reference,
    lengthCm: reference.lengthCm + 17,
    dimensionEdited: false
  },
  custom
]);
assert.equal(
  migrated.find((item) => item.id === reference.id)?.lengthCm,
  reference.lengthCm,
  "未手工编辑的历史默认箱型应自动迁移到最新版资料"
);
assert.equal(
  migrated.find((item) => item.id === custom.id)?.lengthCm,
  custom.lengthCm,
  "用户自定义箱型不得被默认资料迁移覆盖"
);

const editedLength = reference.lengthCm + 23;
const preserved = mergeDefaultContainers([{
  ...reference,
  lengthCm: editedLength,
  dimensionEdited: true
}]);
assert.equal(
  preserved.find((item) => item.id === reference.id)?.lengthCm,
  editedLength,
  "用户手工编辑过的默认箱型尺寸不得被自动迁移覆盖"
);

console.log(`Container reference data contract passed (${defaultContainers.length} packing types + ${referenceOnlyContainers.length} reference-only types).`);

function assertMeasurement(container, field, lowerBound, upperBound, unit) {
  const value = Number(container[field]);
  assert.ok(Number.isFinite(value), `${container.id}.${field} 必须是有效数字`);
  assert.ok(
    value >= lowerBound && value <= upperBound,
    `${container.id}.${field}=${value} 超出合理 ${unit} 范围，请检查 Excel 单位换算`
  );
}
