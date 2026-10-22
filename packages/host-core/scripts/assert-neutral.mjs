// Fails the build when a platform-neutral entry (or any chunk it imports)
// references a Node built-in: these entries must load in a browser.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
);
const NEUTRAL_ENTRIES = ["schema.mjs", "projection.mjs", "plugins.mjs"];
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;
const NODE_BUILTIN = /^node:/;

const failures = [];
for (const entry of NEUTRAL_ENTRIES) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const full = path.join(dist, file);
    if (!existsSync(full)) {
      failures.push(`${entry}: ${file} is missing from dist/`);
      continue;
    }
    const code = readFileSync(full, "utf8");
    for (const [, specifier] of code.matchAll(IMPORT)) {
      if (NODE_BUILTIN.test(specifier)) {
        failures.push(`${entry}: ${file} imports "${specifier}"`);
      } else if (specifier.startsWith(".")) {
        queue.push(path.posix.join(path.posix.dirname(file), specifier));
      }
    }
  }
}

if (failures.length > 0) {
  console.error(
    `neutral entries reach Node built-ins:\n  ${failures.join("\n  ")}`,
  );
  process.exit(1);
}
console.log(`neutral entries are node-free: ${NEUTRAL_ENTRIES.join(", ")}`);
