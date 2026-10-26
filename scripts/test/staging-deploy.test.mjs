import test from "node:test";
import assert from "node:assert/strict";
import {
  main,
  validateStagingSettings,
  shellQuote,
  stagingExtractionScript
} from "../ci-staging-deploy.mjs";

const valid = { STAGING_HOST: "test.example.com", STAGING_ROOT: "/home/ubuntu/cargo-staging" };
test("deployment is disabled before reading credentials or connecting anywhere", () => {
  assert.doesNotThrow(() => main({}));
  assert.doesNotThrow(() => main({ STAGING_DEPLOY_ENABLED: "false", STAGING_HOST: "bad host" }));
});
test("staging targets require canonical isolated paths and valid SSH fields", () => {
  assert.deepEqual(validateStagingSettings(valid), {
    host: "test.example.com",
    root: "/home/ubuntu/cargo-staging",
    user: "ubuntu",
    port: "22",
    branch: "combine"
  });
  for (const root of [
    "/",
    "/home/ubuntu/app",
    "relative-staging",
    "/home/../app-staging",
    "/home//app-staging",
    "/home/./app-staging",
    "/tmp/x\n-staging"
  ]) {
    assert.throws(() => validateStagingSettings({ ...valid, STAGING_ROOT: root }));
  }
  for (const [key, value] of [
    ["STAGING_HOST", "-oProxyCommand=x"],
    ["STAGING_HOST", "host;cmd"],
    ["STAGING_USER", "ubuntu root"],
    ["STAGING_PORT", "0"],
    ["STAGING_PORT", "65536"],
    ["STAGING_BRANCH", "-main"],
    ["STAGING_BRANCH", "feature/../main"]
  ]) {
    assert.throws(() => validateStagingSettings({ ...valid, [key]: value }));
  }
});
test("remote release hashes cannot introduce shell syntax and archive is verified before extraction", () => {
  const script = stagingExtractionScript("a".repeat(40), "b".repeat(64));
  assert.ok(script.indexOf("sha256sum -c") < script.indexOf("tar -xzf"));
  assert.ok(
    script.indexOf("tar -xzf") < script.indexOf('bash "$release/scripts/deploy-staging.sh"')
  );
  assert.throws(() => stagingExtractionScript("a; id", "b".repeat(64)));
  assert.throws(() => stagingExtractionScript("a".repeat(40), "bad"));
  assert.equal(shellQuote("a'b"), "'a'\"'\"'b'");
});
