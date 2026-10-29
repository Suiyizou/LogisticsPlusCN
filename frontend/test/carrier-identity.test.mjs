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
    assert.match(identity.logo, /^\/carriers\//, "verified brands use original local images");
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

test("verified brand registry keeps both UI maps, provenance hashes and local files consistent", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../public/carriers/manifest.json", import.meta.url), "utf8")
  );
  const trackingRoot = new URL("../../tracking-service/public/", import.meta.url);
  assert.equal(manifest.assets.length, 14);
  for (const asset of manifest.assets) {
    assert.equal(carrierIdentity(asset.code).logo, `/carriers/${asset.file}`);
    const local = readFileSync(new URL(`../public/carriers/${asset.file}`, import.meta.url));
    assert.equal(createHash("sha256").update(local).digest("hex"), asset.sha256);
    assert.deepEqual(readFileSync(new URL(`carriers/${asset.file}`, trackingRoot)), local);
    assert.match(asset.source, /^https:\/\//);
  }
  for (const [file, constant] of [
    ["app.js", "CARRIER_BRAND_ASSETS"],
    ["tracking-v1-adapter.mjs", "CARRIER_LOGOS"]
  ]) {
    const source = readFileSync(new URL(file, trackingRoot), "utf8");
    const mapping = source.match(
      new RegExp(`const ${constant} = Object\\.freeze\\(\\{([\\s\\S]*?)\\}\\)`)
    )[1];
    for (const asset of manifest.assets)
      assert.ok(
        mapping.includes(`${asset.code}: "./carriers/${asset.file}"`),
        `${file}: ${asset.code}`
      );
  }
  for (const code of ["WAN_HAI", "HEDE"]) assert.equal(carrierIdentity(code).logo, "");
  assert.deepEqual(
    JSON.parse(readFileSync(new URL("carriers/manifest.json", trackingRoot), "utf8")),
    manifest
  );
});
