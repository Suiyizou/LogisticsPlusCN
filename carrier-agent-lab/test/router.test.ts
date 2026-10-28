import assert from "node:assert/strict";
import test from "node:test";
import { CARRIERS } from "../src/carriers.js";
import { resolveCarrier } from "../src/router.js";

test("explicit carrier selection always has precedence", () => {
  const resolution = resolveCarrier({
    carrier: "MSC",
    referenceType: "BOOKING",
    reference: "123456789",
  });
  assert.equal(resolution.kind, "TRACK");
  assert.equal(resolution.carrier, "MSC");
  assert.equal(resolution.detectedBy, "EXPLICIT");
  assert.equal(resolution.confidence, 1);
});

test("an explicit browser carrier cannot override a COSCO existing-channel prefix", () => {
  const resolution = resolveCarrier({
    carrier: "MAERSK",
    referenceType: "BILL_OF_LADING",
    reference: "COSUTEST00000001",
  });
  assert.equal(resolution.kind, "DELEGATE_EXISTING");
  assert.equal(resolution.carrier, "COSCO");
  assert.equal(resolution.detectedBy, "PREFIX");
  assert.match(resolution.warnings[0]!, /与人工选择的 Maersk 冲突/);
});

test("numeric booking numbers remain ambiguous instead of being guessed", () => {
  const resolution = resolveCarrier({ reference: "123456789", referenceType: "BOOKING" });
  assert.equal(resolution.kind, "AMBIGUOUS");
  assert.match(resolution.warnings[0]!, /纯数字订舱号/);
});

test("strong prefixes route known carriers and COSCO delegates", () => {
  const oocl = resolveCarrier({ reference: "OOLU1234567890" });
  assert.equal(oocl.carrier, "OOCL");
  assert.equal(oocl.referenceType, "AUTO");
  const cosco = resolveCarrier({ reference: "COSU1234567890" });
  assert.equal(cosco.carrier, "COSCO");
  assert.equal(cosco.kind, "DELEGATE_EXISTING");
});

test("new carrier prefixes route to the prepared browser adapters", () => {
  const fixtures = [
    ["MATS0000000000", "MATSON"],
    ["ONEYTEST00000001", "ONE"],
    ["HDMUTEST00000001", "HMM"],
    ["EGLVTEST00000001", "EVERGREEN"],
    ["YMJATEST00000001", "YANG_MING"],
    ["WHLCTEST00000001", "WAN_HAI"],
    ["ZIMUTEST00000001", "ZIM"],
  ] as const;
  for (const [reference, expectedCarrier] of fixtures) {
    const resolution = resolveCarrier({ reference, referenceType: "BILL_OF_LADING" });
    assert.equal(resolution.kind, "TRACK");
    assert.equal(resolution.carrier, expectedCarrier);
    assert.equal(resolution.detectedBy, "PREFIX");
  }
});

test("all prepared carrier routes are ASCII official URLs with unique strong prefixes", () => {
  assert.equal(Object.keys(CARRIERS).length, 13);
  const prefixes = Object.values(CARRIERS).flatMap((carrier) => carrier.strongPrefixes);
  assert.equal(new Set(prefixes).size, prefixes.length);
  for (const carrier of Object.values(CARRIERS)) {
    if (!carrier.trackingUrl) continue;
    assert.match(carrier.trackingUrl, /^[\x00-\x7F]+$/);
    const hostname = new URL(carrier.trackingUrl).hostname;
    assert(carrier.officialHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)));
  }
});

test("container prefix routing carries an ownership warning", () => {
  const resolution = resolveCarrier({ reference: "MSCU1234567", referenceType: "CONTAINER" });
  assert.equal(resolution.carrier, "MSC");
  assert.equal(resolution.confidence, 0.65);
  assert.match(resolution.warnings[0]!, /箱号前缀只代表箱主/);
});

test("other carriers require a caller-confirmed official URL before browser use", () => {
  assert.equal(resolveCarrier({ carrier: "OTHER", reference: "ABC12345" }).kind, "AMBIGUOUS");
  const custom = resolveCarrier({
    carrier: "OTHER",
    reference: "ABC12345",
    customUrl: "https://carrier.example/track",
  });
  assert.equal(custom.kind, "TRACK");
  assert.equal(custom.detectedBy, "CUSTOM_URL");
  const discovery = resolveCarrier({
    carrier: "OTHER",
    carrierName: "Evergreen Marine",
    reference: "ABC12345",
  });
  assert.equal(discovery.kind, "AMBIGUOUS");
  assert.equal(discovery.detectedBy, "NONE");
  assert.equal(discovery.trackingUrl, null);
  assert.match(discovery.warnings[0]!, /官方公开货踪网址/);
});
