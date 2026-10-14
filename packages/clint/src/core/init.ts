import fs from "node:fs";
import path from "node:path";
import type { WorkdirStore } from "./types.js";

/**
 * Recursively copy a directory tree, returning the number of files copied.
 */
function copyDirRecursive(src: string, dest: string): number {
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

/**
 * Options for installSkills.
 */
export interface InstallSkillsOptions {
  /** WorkdirStore — used to compute the target `.mastra/skills/` folder. */
  store: WorkdirStore;
  /** Candidate directories containing pre-built skill artifacts. First existing wins. */
  skillArtifacts: string[];
  /** Optional output callback. Default: console.log. */
  stdout?: (text: string) => void;
}

/**
 * Copy pre-packaged skill folders into the store's `.mastra/skills/` directory.
 *
 * Iterates `skillArtifacts` and uses the first directory that exists.
 * Clears the target before copying to avoid stale skills.
 * Each skill folder is expected to contain at least a `SKILL.md` file.
 *
 * @returns The number of skill folders copied, or 0 if no source was found.
 */
export function installSkills(options: InstallSkillsOptions): number {
  const { store, skillArtifacts, stdout = console.log } = options;
  const targetDir = store.getStoreFolder(".mastra/skills");

  // Find first existing source directory
  const source = skillArtifacts.find((s) => fs.existsSync(s));
  if (!source) {
    stdout(
      "[init] No skill source directory found — skipping skill installation",
    );
    return 0;
  }

  stdout(`[init] Installing skills from ${source}`);

  // Read skill subdirectories (skip hidden dirs like .ph to avoid cycles)
  const skillDirs = fs
    .readdirSync(source, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name);

  if (skillDirs.length === 0) {
    stdout("[init] No skill folders found in source — skipping");
    return 0;
  }

  // Clear target before copying
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  let totalFiles = 0;
  for (const skillName of skillDirs) {
    const src = path.join(source, skillName);
    const dest = path.join(targetDir, skillName);
    totalFiles += copyDirRecursive(src, dest);
  }

  stdout(`[init] Installed ${skillDirs.length} skills (${totalFiles} files)`);
  return skillDirs.length;
}
