import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const TSC = join(
  dirname(createRequire(import.meta.url).resolve("typescript/package.json")),
  "bin",
  "tsc",
);

/** Packages whose sources decide on capability axes; each has a tsconfig.v4-cascade.json. */
const PACKAGES = [
  "shared",
  "reactor",
  "reactor-browser",
  "design-system",
  "workflow",
];

/**
 * Every site that must fail to compile when a version adds a value to every
 * axis (shared/v4-cascade/v4.ts): the decision maps and functions, and each
 * exhaustive switch. A version reusing existing values compiles by design.
 */
const EXPECTED = [
  "packages/shared/document-model/action-order.ts: const unhandled: never = tieOrder;",
  "packages/shared/document-model/action-order.ts: const unhandled: never = form;",
  "packages/shared/document-model/base-reducer-protocol.ts: } satisfies Decision<DerivationModel, boolean>,",
  "packages/shared/document-model/base-reducer-protocol.ts: } satisfies Decision<ReducerContract, boolean>,",
  "packages/shared/document-model/base-reducer-protocol.ts: } satisfies Decision<TieOrder, boolean>,",
  "packages/shared/document-model/base-reducer-protocol.ts: } satisfies Decision<TieOrder, boolean>,",
  "packages/shared/document-model/base-reducer-protocol.ts: } satisfies Decision<SkipMeaning, boolean>,",
  "packages/shared/document-model/base-reducer-protocol.ts: return CAPABILITY_DECISIONS.usesRetractionRule[",
  "packages/shared/document-model/base-reducer-protocol.ts: return CAPABILITY_DECISIONS.needsTaggedModel[",
  "packages/shared/document-model/base-reducer-protocol.ts: return CAPABILITY_DECISIONS.sortsJobsCanonically[tieOrderOf(caps)];",
  "packages/shared/document-model/base-reducer-protocol.ts: return CAPABILITY_DECISIONS.conflictWindowMovesEveryRow[tieOrderOf(caps)];",
  "packages/shared/document-model/base-reducer-protocol.ts: return CAPABILITY_DECISIONS.skipMayUndo[(caps ?? UNVERSIONED).skip];",
  'packages/shared/document-model/base-reducer-protocol.ts: return assertNever(caps.undo, "undo model");',
  'packages/shared/document-model/base-reducer-protocol.ts: return assertNever(caps.undo, "undo model");',
  'packages/shared/document-model/reducer.ts: return assertNever(model, "undo model");',
  'packages/shared/document-model/reducer.ts: assertNever(undoModel, "undo model");',
  'packages/shared/document-model/undo-redo-plan.ts: return assertNever(caps.undo, "undo model");',
  'packages/shared/document-model/undo-redo-plan.ts: return assertNever(caps.undo, "undo model");',
  'packages/shared/document-model/undo-redo-plan.ts: return assertNever(caps.undo, "undo model");',
  "packages/reactor/src/core/feature-flags.ts: export type BaseReducerGatingFlag = KnownFlag<GatingFlag>;",
  'packages/reactor/src/executor/simple-job-executor.ts: return assertNever(caps.replayHash, "replay hash");',
  'packages/reactor/src/utils/reshuffle.ts: return assertNever(tieOrder, "tie order");',
  'packages/design-system/src/connect/components/document-toolbar/use-document-undo-redo.ts: return assertNever(caps.undo, "undo model");',
  'packages/workflow/editors/shared/editor-chrome.tsx: return assertNever(model, "undo model");',
  'packages/workflow/editors/shared/editor-chrome.tsx: return assertNever(model, "undo model");',
  'packages/workflow/editors/shared/undo-plan.ts: return assertNever(model, "undo model");',
];

/** The errors `tsc` reports in `pkg`'s own files, as `path: source line`. */
function cascadeErrors(pkg: string): string[] {
  const dir = join(ROOT, "packages", pkg);
  const run = spawnSync(
    process.execPath,
    [TSC, "-p", "tsconfig.v4-cascade.json", "--pretty", "false"],
    { cwd: dir, encoding: "utf8" },
  );
  const errors: string[] = [];
  for (const line of run.stdout.split("\n")) {
    if (!line.includes("error TS")) continue;
    const located = /^(.+?)\((\d+),\d+\): error TS\d+/.exec(line);
    if (!located) {
      errors.push(`${pkg}: ${line.trim()}`);
      continue;
    }
    const [, file, row] = located;
    if (file.startsWith("../")) continue;
    const source = readFileSync(join(dir, file), "utf8").split("\n");
    errors.push(
      `packages/${pkg}/${file.split("\\").join("/")}: ${source[Number(row) - 1].trim()}`,
    );
  }
  return errors;
}

describe("a fourth base-reducer version", () => {
  it("fails to compile at every consumer of a capability axis", () => {
    const found = PACKAGES.flatMap(cascadeErrors);
    expect(found.sort()).toEqual([...EXPECTED].sort());
  }, 120_000);
});
