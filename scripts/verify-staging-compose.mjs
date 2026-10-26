#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const result = spawnSync(
  "docker",
  [
    "compose",
    "-p",
    "cargo-staging",
    "-f",
    "docker-compose.yml",
    "-f",
    "docker-compose.staging.yml",
    "config",
    "--format",
    "json"
  ],
  {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      IMAGE_TAG: "staging-isolation-check",
      STAGING_FRONTEND_PORT: "18080",
      SHIPMENT_FILE_HOST_PATH: "/tmp/cargo-staging/shipment-files"
    }
  }
);
if (result.status !== 0) throw new Error(result.stderr || "Compose config failed");
const config = JSON.parse(result.stdout);
for (const [name, service] of Object.entries(config.services)) {
  assert.equal(service.container_name, `cargo-staging-${name}`);
  assert.match(service.image, name === "mysql" ? /^mysql:/ : /:staging-isolation-check$/);
  if (name !== "frontend")
    assert.equal(service.ports?.length || 0, 0, `${name} must not bind a host port`);
}
const ports = config.services.frontend.ports;
assert.equal(ports.length, 1);
assert.equal(ports[0].host_ip, "127.0.0.1");
assert.equal(String(ports[0].published), "18080");
for (const volume of Object.values(config.volumes)) {
  assert.match(volume.name, /^cargo-staging-/);
  assert.notEqual(volume.external, true);
}
for (const network of Object.values(config.networks)) assert.match(network.name, /^cargo-staging-/);
assert.equal(config.services.backend.environment.SPRING_FLYWAY_ENABLED, "true");
const shipment = config.services.backend.volumes.find(
  (volume) => volume.target === "/app/shipment-files"
);
assert.equal(shipment.source, "/tmp/cargo-staging/shipment-files");
console.log(
  "[staging] Compose isolation passed: loopback-only frontend, dedicated names/networks/volumes, Flyway enabled."
);
