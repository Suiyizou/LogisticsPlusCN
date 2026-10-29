import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { carrierIdentity } from "../src/components/brand/carrierIdentity.js";

test("carrier display identities accept source names and preserve unfamiliar carriers", () => {
  assert.equal(carrierIdentity(" cosco shipping lines ").code, "COSCO");
  assert.equal(carrierIdentity("HAPAG-LLOYD").code, "HAPAG_LLOYD");
  assert.equal(carrierIdentity("yang ming").code, "YML");
  for (const code of [
    "HMM",
    "SML",
    "COSCO",
    "MATSON",
    "OOCL",
    "MSC",
    "EVERGREEN",
    "HAPAG_LLOYD",
    "KMTC",
    "MAERSK",
    "YML",
    "ZIM"
  ]) {
    const identity = carrierIdentity(code);
    assert.equal(identity.code, code);
    assert.ok(identity.name);
    if (!["COSCO", "OOCL"].includes(code))
      assert.equal(identity.logo, "", "unverified brands remain text badges");
  }
  assert.deepEqual(carrierIdentity("New Local Carrier"), {
    code: "NEW LOCAL CARRIER",
    name: "New Local Carrier",
    logo: ""
  });
  assert.equal(carrierIdentity(null).name, "—");
});

test("official carrier images remain identical to the recorded local source assets", () => {
  const expected = {
    COSCO: "ac42616f2114df19c8409adab85b01f13b24e14425cbbc633b5102cee532a4a2",
    OOCL: "d6b364887f9389b53a4f5e1c23a74cf26ccb3c64f62b9e57cef9aef2f8d32f65"
  };
  for (const [code, hash] of Object.entries(expected)) {
    const identity = carrierIdentity(code);
    const contents = readFileSync(new URL(`../public${identity.logo}`, import.meta.url));
    assert.equal(createHash("sha256").update(contents).digest("hex"), hash);
  }
});
