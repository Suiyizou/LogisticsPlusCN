#!/usr/bin/env node
/**
 * 渐进式质量门（format + lint）。
 *
 * 策略是“棘轮”：只检查相对基线发生变更的源码文件，避免把历史遗留的
 * 格式与规范问题一次性引爆。基线按以下优先级解析：
 *   1. 环境变量 QUALITY_BASE_REF
 *   2. origin/main
 *   3. 工作区当前变更（未提交）
 * 如果无法解析到任何 git 基线（例如没有 .git 的构建产物目录），则退回到
 * 本文件下方的 FALLBACK_TARGETS 目录清单。
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

function runGit(args) {
  return spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
}

function changedFilesFromGit() {
  const files = new Set();
  const bases = [process.env.QUALITY_BASE_REF, "origin/main"].filter(Boolean);
  let resolvedBase = false;
  for (const base of bases) {
    const probe = runGit(["rev-parse", "--verify", "--quiet", `${base}^{commit}`]);
    if (probe.status !== 0) continue;
    const diff = runGit(["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`]);
    if (diff.status !== 0) continue;
    resolvedBase = true;
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
  return { files: [...files], resolvedBase };
}

function listFallbackFiles() {
  const collected = [];
  for (const target of FALLBACK_TARGETS) {
    const absolute = resolve(root, target);
    if (!existsSync(absolute)) continue;
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
  const { files, resolvedBase } = changedFilesFromGit();
  const repositoryFiles = files.filter((file) => existsSync(resolve(root, file)));
  if (repositoryFiles.length > 0) {
    return { mode: resolvedBase ? "changed-vs-base" : "working-tree", files: repositoryFiles };
  }
  return { mode: "fallback-targets", files: listFallbackFiles() };
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
  const errors = ESLint.getErrorResults(results);
  return errors;
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
    const output = await formatter.format(errors);
    console.error("[quality] eslint errors:");
    console.error(output);
  } else {
    console.log(`[quality] eslint: ok (${lintTargets.length} file(s))`);
  }
}

if (failed) process.exit(1);
console.log("[quality] passed");
