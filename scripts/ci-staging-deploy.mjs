#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function validateStagingSettings(env) {
  const settings = {
    host: env.STAGING_HOST || "",
    user: env.STAGING_USER || "ubuntu",
    port: env.STAGING_PORT || "22",
    root: env.STAGING_ROOT || "",
    branch: env.STAGING_BRANCH || "combine"
  };
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(settings.host)) throw new Error("Invalid staging host");
  if (!/^[a-z_][a-z0-9_-]*$/.test(settings.user)) throw new Error("Invalid SSH user");
  if (!/^\d+$/.test(settings.port) || +settings.port < 1 || +settings.port > 65535)
    throw new Error("Invalid SSH port");
  if (
    !/^\/[a-zA-Z0-9_./-]+-staging$/.test(settings.root) ||
    settings.root.split("/").includes("..") ||
    settings.root.includes("//") ||
    settings.root.split("/").includes(".")
  )
    throw new Error("Use a canonical absolute root ending in -staging");
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(settings.branch) ||
    settings.branch.includes("..") ||
    settings.branch.endsWith("/") ||
    settings.branch.includes("//")
  )
    throw new Error("Invalid staging branch");
  return settings;
}

export const shellQuote = (value) => "'" + String(value).replaceAll("'", "'\"'\"'") + "'";

export function stagingExtractionScript(sha, digest) {
  if (!/^[0-9a-f]{40}$/.test(sha) || !/^[0-9a-f]{64}$/.test(digest))
    throw new Error("Invalid release hashes");
  return `set -euo pipefail
umask 077
root="$1"
archive="$root/incoming/${sha}.tar.gz"
printf '%s  %s\\n' '${digest}' "$archive" | sha256sum -c -
release="$root/releases/${sha}"
if [[ ! -d "$release" ]]; then
  mkdir "$release"
  tar -xzf "$archive" -C "$release"
  printf '%s\\n' '${sha}' > "$release/.release-sha"
fi
bash "$release/scripts/deploy-staging.sh" "$root" '${sha}'
`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    ...options
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} failed (${result.status}): ${result.stderr || "see command output"}`
    );
  return String(result.stdout || "").trim();
}

export function main(env = process.env) {
  if (env.STAGING_DEPLOY_ENABLED !== "true") {
    console.log(
      "[staging] Deployment disabled. Configure protected staging credentials before enabling."
    );
    return;
  }
  const settings = validateStagingSettings(env);
  const sha = run("git", ["rev-parse", "HEAD"]);
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("Invalid checkout SHA");
  // Verify the actual remote branch; do not trust an event field to identify a release.
  const remote = run("git", [
    "ls-remote",
    "--exit-code",
    "origin",
    `refs/heads/${settings.branch}`
  ]);
  if (remote.split(/\s+/)[0] !== sha) {
    console.log(`[staging] Skipped ${sha}: not the current ${settings.branch} head.`);
    return;
  }
  run("git", ["cat-file", "-e", `${sha}:scripts/deploy-staging.sh`]);
  if (!env.STAGING_SSH_KNOWN_HOSTS?.trim())
    throw new Error("Verified SSH known_hosts content is required");
  if (!env.STAGING_SSH_KEY_FILE && !env.STAGING_SSH_PRIVATE_KEY?.trim())
    throw new Error("SSH deployment key is required");
  const temporary = mkdtempSync(join(tmpdir(), "cargo-staging-"));
  const owned = [];
  try {
    const key = env.STAGING_SSH_KEY_FILE || join(temporary, "deploy-key");
    if (!env.STAGING_SSH_KEY_FILE) {
      writeFileSync(key, env.STAGING_SSH_PRIVATE_KEY.trim() + "\n", { mode: 0o600 });
      owned.push(key);
    }
    const hosts = join(temporary, "known_hosts");
    writeFileSync(hosts, env.STAGING_SSH_KNOWN_HOSTS.trim() + "\n", { mode: 0o600 });
    owned.push(hosts);
    const archive = join(temporary, "source.tar.gz");
    run("git", ["archive", "--format=tar.gz", "-o", archive, sha]);
    owned.push(archive);
    const digest = createHash("sha256").update(readFileSync(archive)).digest("hex");
    const target = `${settings.user}@${settings.host}`;
    const options = [
      "-i",
      key,
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      `UserKnownHostsFile=${hosts}`,
      "-o",
      "ConnectTimeout=15",
      "-o",
      "ServerAliveInterval=30"
    ];
    const prepare = `set -euo pipefail
umask 077
root="$1"
if [[ -e "$root" && ! -f "$root/.cargo-staging-owner" ]]; then
  [[ -z "$(find "$root" -mindepth 1 -maxdepth 1 -print -quit)" ]] || { echo 'Refusing an unowned staging directory' >&2; exit 2; }
fi
mkdir -p "$root/incoming" "$root/releases"
if [[ -f "$root/.cargo-staging-owner" ]]; then
  [[ "$(cat "$root/.cargo-staging-owner")" == cargo-staging-v1 ]] || exit 2
else
  printf '%s\\n' cargo-staging-v1 > "$root/.cargo-staging-owner"
fi
`;
    const remoteShell = `bash -s -- ${shellQuote(settings.root)}`;
    run("ssh", [...options, "-p", settings.port, target, remoteShell], {
      input: prepare,
      stdio: ["pipe", "inherit", "pipe"]
    });
    run(
      "scp",
      [
        ...options,
        "-P",
        settings.port,
        archive,
        `${target}:${settings.root}/incoming/${sha}.tar.gz`
      ],
      { stdio: ["ignore", "inherit", "pipe"] }
    );
    console.log(`[staging] Deploying ${sha} from ${settings.branch} to the isolated test project.`);
    run("ssh", [...options, "-p", settings.port, target, remoteShell], {
      input: stagingExtractionScript(sha, digest),
      stdio: ["pipe", "inherit", "pipe"]
    });
  } finally {
    // Only remove files created by this invocation; never recursively remove a supplied path.
    for (const path of owned.reverse()) unlinkSync(path);
    rmdirSync(temporary);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`[staging] ${error.message}`);
    process.exitCode = 1;
  }
}
