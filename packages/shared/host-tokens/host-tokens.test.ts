import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `@powerhousedao/shared/host-tokens` and the Connect config schema that
 * imports it load in a browser and in the zod-only
 * `@powerhousedao/connect/plugin-configs` entry: their source import graph
 * reaches no `node:` module and no package but zod.
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;

/** Every bare specifier reached from `entry` through relative imports. */
function bareImports(entry: string): Set<string> {
  const bare = new Set<string>();
  const seen = new Set<string>();
  const queue = [path.join(ROOT, entry)];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const code = readFileSync(file, "utf8");
    for (const [, specifier] of code.matchAll(IMPORT)) {
      if (specifier.startsWith(".")) {
        queue.push(
          path.join(path.dirname(file), specifier.replace(/\.js$/, ".ts")),
        );
      } else {
        bare.add(specifier);
      }
    }
  }
  return bare;
}

describe("host-tokens import graph", () => {
  it.each(["host-tokens/index.ts", "connect/connect-config-schema.ts"])(
    "%s imports zod only",
    (entry) => {
      expect([...bareImports(entry)]).toEqual(["zod"]);
    },
  );
});
