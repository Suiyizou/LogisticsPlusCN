import { constants } from "node:fs";
import { chmod, copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RUNTIME_FILES = ["auth.json", "models.json"] as const;

export interface RuntimeAgentDir {
  path: string;
  cleanup: () => Promise<void>;
}

/**
 * Copy only the pi model credentials/configuration needed for a run into a
 * private, writable temporary directory. The source can remain mounted
 * read-only while pi creates its lock directories next to auth.json.
 */
export async function createRuntimeAgentDir(sourceDir: string): Promise<RuntimeAgentDir> {
  const path = await mkdtemp(join(tmpdir(), "carrier-agent-pi-"));
  try {
    await chmod(path, 0o700);
    for (const fileName of RUNTIME_FILES) {
      try {
        await copyFile(
          join(sourceDir, fileName),
          join(path, fileName),
          constants.COPYFILE_EXCL,
        );
        await chmod(join(path, fileName), 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return {
      path,
      cleanup: () => rm(path, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(path, { recursive: true, force: true });
    throw error;
  }
}
