import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SCANNED = ["packages", "apps", "clis"];
const SKIPPED_DIRS = new Set([
  "node_modules",
  "dist",
  ".tsbuild",
  "test",
  "tests",
  "bench",
  "coverage",
  ".ph",
  "storybook-static",
]);
const SOURCE = /\.(ts|tsx|mts)$/;
const NOT_PRODUCTION = /\.(test|spec|stories|d)\.(ts|tsx|mts)$/;

/** A raw read of the version, which only selection and the table may do. */
const RAW_READ = /\[\s*["']base-reducer["']\s*\]/;
/** A comparison against a version number instead of a capability read. */
const VERSION_COMPARE =
  /(\bprotocolVersion|["']base-reducer["']\s*\])\s*\)?\s*[!=]==\s*[123]\b|\bversion\s*[!=]==\s*3\b/;

/** A capability axis compared directly instead of read through a decision or an exhaustive switch. */
const AXIS_COMPARE = [
  /\.(tieOrder|derivation|reducerContract|synthesizedId|replayHash)\s*[!=]==/,
  /\b\w*caps\??\.(undo|skip)\s*[!=]==/i,
  /[!=]==\s*["'](retraction|noop-chain|canonical|rank-locale|rewind|undo-or-rewind|retraction-rule|state-reducer)["']/,
  /["'](retraction|noop-chain|canonical|rank-locale|rewind|undo-or-rewind|retraction-rule|state-reducer)["']\s*[!=]==/,
];

/** Files that decide on capability axes: the table, the order rules and the undo plan. */
const AXIS_OWNERS = new Set([
  "packages/shared/document-model/base-reducer-protocol.ts",
  "packages/shared/document-model/action-order.ts",
  "packages/shared/document-model/undo-redo-plan.ts",
]);

/** Files that read the version by design: the table, selection and backfill. */
const OWNERS = new Set([
  "packages/shared/document-model/base-reducer-protocol.ts",
  "packages/shared/document-model/create-base-reducer.ts",
  "packages/shared/document-model/files.ts",
  "packages/shared/document-model/peer-agreement.ts",
  "packages/shared/document-model/signature-policy.ts",
  "packages/reactor/src/client/create-protocol.ts",
]);

/** Not yet on capabilities, with who converts each; the list only shrinks. */
const PENDING = new Map<string, string>([]);

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        yield* sources(join(dir, entry.name));
      }
    } else if (SOURCE.test(entry.name) && !NOT_PRODUCTION.test(entry.name)) {
      yield join(dir, entry.name);
    }
  }
}

function offenders(matches: (line: string) => boolean): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const top of SCANNED) {
    for (const path of sources(join(ROOT, top))) {
      const file = relative(ROOT, path).split("\\").join("/");
      const lines = readFileSync(path, "utf8").split("\n");
      const hits = lines.flatMap((line, i) =>
        matches(line) ? [`${i + 1}: ${line.trim()}`] : [],
      );
      if (hits.length > 0) found.set(file, hits);
    }
  }
  return found;
}

describe("the base-reducer version seam", () => {
  const found = offenders(
    (line) => RAW_READ.test(line) || VERSION_COMPARE.test(line),
  );

  it("reads versions only through the capability table", () => {
    const unexpected = [...found].filter(
      ([file]) => !OWNERS.has(file) && !PENDING.has(file),
    );
    expect(Object.fromEntries(unexpected)).toEqual({});
  });

  it("drops a pending entry once its file is converted", () => {
    const converted = [...PENDING.keys()].filter((file) => !found.has(file));
    expect(converted).toEqual([]);
  });
});

describe("the capability axes", () => {
  it("are compared only by their owners", () => {
    const found = offenders((line) =>
      AXIS_COMPARE.some((pattern) => pattern.test(line)),
    );
    const unexpected = [...found].filter(([file]) => !AXIS_OWNERS.has(file));
    expect(Object.fromEntries(unexpected)).toEqual({});
  });
});
