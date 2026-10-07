#!/usr/bin/env node
/**
 * 渐进式质量门（format + lint）。
 *
 * 策略是“棘轮”：只检查相对基线发生变更的源码文件，避免把历史遗留的
 * 格式与规范问题一次性引爆。
 *
 * 基线解析（按优先级）：
 *   1. 环境变量 QUALITY_BASE_REF（CI 必须显式传入 push 的前一 SHA / PR 目标基线）
 *   2. 环境变量 QUALITY_BASE_BRANCH
 *   3. origin/main（且不能等于 HEAD）
 *   4. CI 环境下退回 HEAD~1
 * 规则：
 *   - 显式传入的 QUALITY_BASE_REF 无法解析时直接失败（退出码 2），不做静默降级；
 *   - 任何等于 HEAD 的候选基线都会被跳过，避免“基线=HEAD → 差集为空 → 漏检”；
 *   - CI 下解析不到可信基线时失败，绝不缩小到固定目录或零文件；
 *   - 仅本地非 CI 且完全取不到 git 基线时，才退回 FALLBACK_TARGETS。
 *
 * 失败返回非零退出码；Windows / Linux / macOS 行为一致。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import prettier from "prettier";

const root = fileURLToPath(new URL("../", import.meta.url));
const FALLBACK_TARGETS = ["scripts"];
const PRETTIER_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".vue",
  ".json",
  ".yml",
  ".yaml",
  ".css",
  ".scss",
  ".md"
]);
const ESLINT_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);
const ZERO_SHA = /^0+$/;

const CI =
  Boolean(process.env.CI) ||
  Boolean(process.env.GITHUB_ACTIONS) ||
  Object.keys(process.env).some((key) => key.startsWith("GITEE") || key.startsWith("GITLAB"));

function runGit(args) {
  return spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
}

function commitOf(ref) {
  if (!ref || ZERO_SHA.test(ref)) return null;
  const result = runGit(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  return result.status === 0 ? result.stdout.trim() : null;
}

function headCommit() {
  return commitOf("HEAD");
}

function resolveBase() {
  const head = headCommit();
  if (!head) return { base: null, reason: "not-a-git-repository" };

  const explicit = process.env.QUALITY_BASE_REF;
  if (explicit && !ZERO_SHA.test(explicit)) {
    const commit = commitOf(explicit);
    if (!commit) {
      console.error(
        `[quality] QUALITY_BASE_REF='${explicit}' 无法解析为提交；拒绝静默降级，退出。`
      );
      process.exit(2);
    }
    if (commit === head) {
      if (CI) {
        console.error("[quality] QUALITY_BASE_REF 等于 HEAD，无法计算变更集；CI 下拒绝继续。");
        process.exit(2);
      }
      console.warn("[quality] QUALITY_BASE_REF 等于 HEAD，本地忽略该基线。");
    } else {
      return { base: { ref: explicit, commit }, reason: "explicit" };
    }
  }

  for (const ref of [process.env.QUALITY_BASE_BRANCH, "origin/main"].filter(Boolean)) {
    const commit = commitOf(ref);
    if (commit && commit !== head) return { base: { ref, commit }, reason: "branch" };
  }

  if (CI) {
    const previous = commitOf("HEAD~1");
    if (previous && previous !== head)
      return { base: { ref: "HEAD~1", commit: previous }, reason: "ci-previous" };
    return { base: null, reason: "ci-no-base" };
  }

  return { base: null, reason: "local-no-base" };
}

function changedFilesFromGit(baseCommit) {
  const files = new Set();
  if (baseCommit) {
    const diff = runGit(["diff", "--name-only", "--diff-filter=ACMR", `${baseCommit}...HEAD`]);
    if (diff.status === 0)
      diff.stdout
        .split("\n")
        .filter(Boolean)
        .forEach((file) => files.add(file));
  }
  for (const args of [
    ["diff", "--name-only", "--diff-filter=ACMR", "HEAD"],
    ["diff", "--name-only", "--diff-filter=ACMR", "--cached"],
    ["ls-files", "--others", "--exclude-standard"]
  ]) {
    const result = runGit(args);
    if (result.status !== 0) continue;
    result.stdout
      .split("\n")
      .filter(Boolean)
      .forEach((file) => files.add(file));
  }
  return [...files];
}

function listFallbackFiles() {
  const collected = [];
  for (const target of FALLBACK_TARGETS) {
    if (!existsSync(resolve(root, target))) continue;
    const result = runGit(["ls-files", "--", target]);
    if (result.status === 0) {
      result.stdout
        .split("\n")
        .filter(Boolean)
        .forEach((file) => collected.push(file));
    }
  }
  return collected;
}

function selectTargets() {
  const { base, reason } = resolveBase();
  if (!base) {
    if (CI) {
      console.error(
        `[quality] CI 下无法解析可信变更基线（${reason}）：需要 QUALITY_BASE_REF 或包含完整历史的 origin/main。`
      );
      console.error("[quality] 拒绝回退到固定目录或零文件，构建失败。");
      process.exit(2);
    }
    console.warn(`[quality] 本地未解析到 git 基线（${reason}），退回固定目录检查。`);
    return { mode: "fallback-targets", files: listFallbackFiles() };
  }
  const repositoryFiles = changedFilesFromGit(base.commit).filter((file) =>
    existsSync(resolve(root, file))
  );
  return { mode: `changed-vs-${base.ref}`, files: repositoryFiles };
}

function extensionOf(file) {
  const index = file.lastIndexOf(".");
  return index < 0 ? "" : file.slice(index).toLowerCase();
}

async function checkFormat(files) {
  const problems = [];
  for (const file of files) {
    const absolute = resolve(root, file);
    const info = await prettier.getFileInfo(absolute, {
      ignorePath: resolve(root, ".prettierignore")
    });
    if (info.ignored || info.inferredParser == null) continue;
    const options = (await prettier.resolveConfig(absolute)) ?? {};
    const source = readFileSync(absolute, "utf8");
    const formatted = await prettier.format(source, { ...options, filepath: absolute });
    if (formatted !== source) problems.push(file);
  }
  return problems;
}

async function checkLint(files) {
  const eslint = new ESLint({ cwd: root });
  const results = await eslint.lintFiles(files);
  return ESLint.getErrorResults(results);
}

const targets = selectTargets();
const formatTargets = targets.files.filter((file) => PRETTIER_EXTENSIONS.has(extensionOf(file)));
const lintTargets = targets.files.filter((file) => ESLINT_EXTENSIONS.has(extensionOf(file)));

console.log(`[quality] mode: ${targets.mode}`);
console.log(
  `[quality] files: ${targets.files.length} (format ${formatTargets.length}, lint ${lintTargets.length})`
);

let failed = false;

if (formatTargets.length > 0) {
  const unformatted = await checkFormat(formatTargets);
  if (unformatted.length > 0) {
    failed = true;
    console.error(`[quality] prettier: ${unformatted.length} file(s) not formatted:`);
    unformatted.forEach((file) => console.error(`  - ${file}`));
    console.error("[quality] 运行 `npm run format` 修复。");
  } else {
    console.log(`[quality] prettier: ok (${formatTargets.length} file(s))`);
  }
}

if (lintTargets.length > 0) {
  const errors = await checkLint(lintTargets);
  if (errors.length > 0) {
    failed = true;
    const formatter = await new ESLint({ cwd: root }).loadFormatter("stylish");
    console.error("[quality] eslint errors:");
    console.error(await formatter.format(errors));
  } else {
    console.log(`[quality] eslint: ok (${lintTargets.length} file(s))`);
  }
}

if (failed) process.exit(1);
console.log("[quality] passed");
