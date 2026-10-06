import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
// 默认执行顺序：质量门与类型检查先行，随后是各模块回归，最后是生产构建。
const checks = {
  quality: { directory: ".", command: "node", args: ["scripts/quality.mjs"] },
  typecheck: { directory: "frontend", command: "npm", args: ["run", "typecheck"] },
  backend: { directory: "backend", command: "mvn", args: ["-q", "test"] },
  tracking: { directory: "tracking-service", command: "npm", args: ["test"] },
  packing: { directory: "frontend", command: "npm", args: ["run", "test:packing"] },
  frontend: { directory: "frontend", command: "npm", args: ["run", "build"] }
};
const requested = process.argv.slice(2);
const selected =
  requested.length === 0 || (requested.length === 1 && requested[0] === "all")
    ? Object.keys(checks)
    : [...new Set(requested)];

if (selected.some((name) => !Object.hasOwn(checks, name))) {
  console.error(
    "Usage: node scripts/verify.mjs [all | quality typecheck backend tracking packing frontend]"
  );
  process.exit(2);
}

for (const name of selected) {
  const check = checks[name];
  console.log(`\n[verify] ${name}: ${check.command} ${check.args.join(" ")}`);
  // `node` is an executable, not a .cmd launcher; Windows npm/mvn launchers are .cmd files.
  // Only fixed commands from this table enter cmd.exe.
  const result =
    check.command === "node"
      ? spawnSync(process.execPath, check.args, {
          cwd: resolve(root, check.directory),
          stdio: "inherit"
        })
      : process.platform === "win32"
        ? spawnSync(
            process.env.ComSpec || "cmd.exe",
            ["/d", "/s", "/c", `${check.command}.cmd ${check.args.join(" ")}`],
            { cwd: resolve(root, check.directory), stdio: "inherit" }
          )
        : spawnSync(check.command, check.args, {
            cwd: resolve(root, check.directory),
            stdio: "inherit"
          });
  if (result.error || result.status !== 0) {
    console.error(`[verify] ${name} failed${result.error ? `: ${result.error.message}` : ""}`);
    process.exit(result.status || 1);
  }
}

console.log(`\n[verify] Passed: ${selected.join(", ")}`);
