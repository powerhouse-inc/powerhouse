import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Connect's `src` is browser code. `@powerhousedao/builder-tools` is the
 * node-only build toolchain: its barrel reaches `@powerhousedao/config/node`
 * -> `@powerhousedao/shared/clis` -> `write-package` -> `read-pkg`, whose
 * `unicorn-magic` dependency has no `toPath` in its browser entry. Importing
 * it from app code drags all of that into the browser graph and breaks both
 * `ph connect build` and the dev server's dependency optimizer with a
 * `[MISSING_EXPORT] "toPath"` error.
 *
 * Build-time constants that app code also needs belong in a browser-safe
 * package (`@powerhousedao/shared/connect`), not in builder-tools.
 */
// fileURLToPath, not URL.pathname: on Windows the latter yields "/D:/..." ,
// which join() then turns into "D:\\D:\\...".
const SRC = fileURLToPath(new URL("./", import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry))
      out.push(p);
  }
  return out;
}

describe("Connect browser sources", () => {
  it("never import the node-only builder-tools package", () => {
    const offenders = sourceFiles(SRC).filter((f) =>
      /\bfrom\s+["']@powerhousedao\/builder-tools(\/[^"']*)?["']/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(offenders.map((f) => relative(SRC, f))).toEqual([]);
  });
});
