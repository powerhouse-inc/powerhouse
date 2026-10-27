import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const SKIPPED_DIRS = new Set(["node_modules", "dist", "backup-documents"]);
const MAX_FILES = 500;

/** The project's files modified at or after `since`, relative and sorted. */
export async function filesWrittenSince(
  projectDir: string,
  since: number,
): Promise<string[]> {
  const written: string[] = [];
  const visit = async (dir: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (written.length >= MAX_FILES) return;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || SKIPPED_DIRS.has(entry.name)) {
          continue;
        }
        await visit(path);
      } else if (entry.isFile()) {
        try {
          if ((await stat(path)).mtimeMs >= since) {
            written.push(relative(projectDir, path).replaceAll("\\", "/"));
          }
        } catch {
          // Removed while listing.
        }
      }
    }
  };
  await visit(projectDir);
  return written.sort();
}
