import fs from "node:fs";
import path from "node:path";
import type { ResolvedBuildConfig } from "./types.js";

/**
 * Copy external skills from skills-ext/ to the output directory without processing.
 *
 * @returns Number of skills copied.
 */
export function copyExternalSkills(config: ResolvedBuildConfig): number {
  const log = config.logger;
  const skillsExtSubdir = config.subdirs?.skillsExt ?? "skills-ext";

  log("\n--- Copying external skills ---");

  // Search all include dirs for skills-ext/
  let found = false;
  let total = 0;

  for (const dir of config.include) {
    const skillsExtDir = path.join(dir, skillsExtSubdir);
    if (!fs.existsSync(skillsExtDir)) continue;
    found = true;

    const skillDirs = fs
      .readdirSync(skillsExtDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    for (const skillName of skillDirs) {
      const srcDir = path.join(skillsExtDir, skillName);
      for (const out of config.output) {
        fs.cpSync(srcDir, path.join(out, "skills", skillName), {
          recursive: true,
        });
      }
      log(`  OK ${skillName} → copied as-is`);
    }

    total += skillDirs.length;
  }

  if (!found) {
    log("  No skills-ext/ directory — skipping.");
  }

  return total;
}
