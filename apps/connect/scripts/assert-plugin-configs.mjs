// Fails the build when dist/plugin-configs.js (or any chunk it imports)
// imports anything beyond its zod-only allowlist: the entry must load in
// Node (`ph run` validates plugin entry configs with it) and in a browser,
// so it may not reach React, the DOM app, or a Node built-in.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
);
const ENTRY = "plugin-configs.js";
const ALLOWED = new Set([
  "zod",
  "@powerhousedao/shared/connect/connect-config-schema",
  "@powerhousedao/shared/host-tokens",
]);
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;

const failures = [];
const seen = new Set();
const queue = [ENTRY];
while (queue.length > 0) {
  const file = queue.shift();
  if (seen.has(file)) continue;
  seen.add(file);
  const full = path.join(dist, file);
  if (!existsSync(full)) {
    failures.push(`${file} is missing from dist/`);
    continue;
  }
  for (const [, specifier] of readFileSync(full, "utf8").matchAll(IMPORT)) {
    if (specifier.startsWith(".")) {
      queue.push(path.posix.join(path.posix.dirname(file), specifier));
    } else if (!ALLOWED.has(specifier)) {
      failures.push(`${file} imports "${specifier}"`);
    }
  }
}

if (failures.length > 0) {
  console.error(`${ENTRY} must stay zod-only:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`${ENTRY} is zod-only (${seen.size} file(s))`);
