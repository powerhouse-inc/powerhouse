/**
 * Regenerates the parity goldens from the committed code-first declarations.
 *
 *     pnpm exec tsx --conditions=source test/parity/regenerate.ts
 *
 * Deterministic: the same declarations produce the same bytes on every run
 * and every machine. Tests never call it — a golden changes only when someone
 * runs this on purpose and reviews the diff, because a published golden not
 * changing is the whole point of having one.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { GOLDEN_DIRECTORY, goldenContents, goldenPath } from "./goldens.js";
import { loadParityRoots } from "./corpus.js";

const roots = loadParityRoots();
mkdirSync(GOLDEN_DIRECTORY, { recursive: true });

let written = 0;
for (const root of roots) {
  for (const [suffix, contents] of goldenContents(root.codeFirst[0])) {
    const name = `${root.name}.${suffix}`;
    writeFileSync(goldenPath(name), contents);
    written += 1;
  }
}
process.stdout.write(`wrote ${written} goldens for ${roots.length} roots\n`);
