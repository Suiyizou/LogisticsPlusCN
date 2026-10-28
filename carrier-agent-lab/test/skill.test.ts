import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";

test("pi resource loader discovers the packaged shipment skill", async () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const skillPath = join(root, ".pi", "skills", "shipment-web-tracker", "SKILL.md");
  const loader = new DefaultResourceLoader({
    cwd: root,
    agentDir: join(homedir(), ".pi", "agent"),
    settingsManager: SettingsManager.inMemory(),
    additionalSkillPaths: [skillPath],
    noExtensions: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    skillsOverride: (current) => ({
      skills: current.skills.filter((skill) => skill.filePath === skillPath),
      diagnostics: current.diagnostics.filter((diagnostic) => diagnostic.path === skillPath),
    }),
  });
  await loader.reload();
  const loaded = loader.getSkills();
  assert.equal(loaded.diagnostics.length, 0);
  assert(loaded.skills.some((skill) => skill.name === "shipment-web-tracker" && skill.filePath === skillPath));
});

test("agent exposes browser tools only and injects the fixed skill without a filesystem read tool", async () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const runner = await readFile(join(root, "src", "agent", "pi-runner.ts"), "utf8");
  assert.doesNotMatch(runner, /tools:\s*\[\s*["']read["']/);
  assert.match(runner, /readFile\(skillPath, "utf8"\)/);
});
