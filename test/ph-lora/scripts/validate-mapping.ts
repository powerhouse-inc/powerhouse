/**
 * ph-lora mapping validator.
 *
 * Checks that every sourceFiles entry in ph-lora-mapping.json points to a
 * path that actually exists in the monorepo. A path ending in .ts is treated
 * as a single file; any other path is treated as a directory.
 *
 * Exit 0 = all paths valid.
 * Exit 1 = one or more paths missing — update ph-lora-mapping.json.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.resolve(__dirname, "../../..");
const MAPPING_PATH = path.resolve(__dirname, "../ph-lora-mapping.json");

interface MappingSection {
  id: string;
  label: string;
  sourceFiles?: string[];
  skipMechanicalCheck?: boolean;
}

interface Mapping {
  sections: MappingSection[];
}

const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, "utf8")) as Mapping;

let failures = 0;
let checked = 0;

for (const section of mapping.sections) {
  if (!section.sourceFiles || section.sourceFiles.length === 0) continue;

  for (const entry of section.sourceFiles) {
    const fullPath = path.resolve(MONOREPO_ROOT, entry);
    checked++;

    if (!fs.existsSync(fullPath)) {
      console.error(`  ❌ [${section.id}] not found: ${entry}`);
      failures++;
      continue;
    }

    const stat = fs.statSync(fullPath);
    const expectedIsFile = entry.endsWith(".ts");
    if (expectedIsFile && !stat.isFile()) {
      console.error(
        `  ❌ [${section.id}] expected a file but found a directory: ${entry}`,
      );
      failures++;
    } else if (!expectedIsFile && !stat.isDirectory()) {
      console.error(
        `  ❌ [${section.id}] expected a directory but found a file: ${entry}`,
      );
      failures++;
    }
  }
}

if (failures === 0) {
  console.log(`✅ All ${checked} sourceFiles paths are valid.`);
  process.exit(0);
} else {
  console.error(
    `\n${failures} invalid sourceFiles path(s) across ${mapping.sections.length} sections. Update test/ph-lora/ph-lora-mapping.json.`,
  );
  process.exit(1);
}
