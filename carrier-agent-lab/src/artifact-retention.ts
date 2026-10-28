import { readdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const RUN_DIRECTORY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ArtifactCleanupOptions {
  rootDir: string;
  ttlMs: number;
  isRetainedRun?: (runId: string) => boolean;
  now?: number;
}

export async function cleanupExpiredRunArtifacts(options: ArtifactCleanupOptions): Promise<number> {
  const artifactRoot = resolve(join(options.rootDir, "artifacts"));
  let entries;
  try {
    entries = await readdir(artifactRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }

  const now = options.now ?? Date.now();
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !RUN_DIRECTORY.test(entry.name) || options.isRetainedRun?.(entry.name)) continue;
    const directory = resolve(join(artifactRoot, entry.name));
    if (!directory.startsWith(`${artifactRoot}/`) && !directory.startsWith(`${artifactRoot}\\`)) continue;
    try {
      const directoryStat = await stat(directory);
      if (now - directoryStat.mtimeMs < options.ttlMs) continue;
      await rm(directory, { recursive: true, force: true });
      removed += 1;
    } catch (error) {
      // A concurrent cleanup or container lifecycle operation may remove the
      // directory between discovery and stat/removal. That is already the
      // desired state and must not prevent server startup.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return removed;
}
