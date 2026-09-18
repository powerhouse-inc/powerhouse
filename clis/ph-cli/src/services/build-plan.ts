// What `ph build` runs for a project, decided from the files on disk before
// any tool starts, so a step with nothing to build is announced, not failed.
import {
  browserEntry,
  buildNodeBuildConfig,
} from "@powerhousedao/shared/build-config";
import type { PiecePlan } from "@powerhousedao/shared/build-pieces";
import {
  expandEntryGlobs,
  planPieces,
  statSafe,
} from "@powerhousedao/shared/build-pieces";
import { join, relative } from "node:path";

export type StepPlan = { run: true } | { run: false; reason: string };

export type BuildPlan = {
  projectRoot: string;
  outDir: string;
  browser: StepPlan;
  node: StepPlan;
  pieces: PiecePlan[];
  types: StepPlan;
  stylesheet: StepPlan;
};

const RUN: StepPlan = { run: true };
const skip = (reason: string): StepPlan => ({ run: false, reason });

// The node build's entry list as the shared config spells it; tsdown accepts
// several shapes, so this flattens whichever one it is handed.
function nodeEntryGlobs(): string[] {
  const entry = buildNodeBuildConfig().entry;
  const items = Array.isArray(entry) ? entry : [entry];
  return items.flatMap((item) =>
    typeof item === "string" ? [item] : item ? Object.values(item).flat() : [],
  );
}

export function planBuild(projectRoot: string, outDir: string): BuildPlan {
  const browserFiles = expandEntryGlobs(projectRoot, browserEntry);
  const nodeFiles = expandEntryGlobs(projectRoot, nodeEntryGlobs());
  const pieces = planPieces(projectRoot, outDir);

  // A piece package's root index only re-exports the list of pieces, which
  // nothing in the browser ever loads. Without pieces it stays a browser module.
  const piecesOnly =
    pieces.length > 0 &&
    browserFiles.every((file) => relative(projectRoot, file) === "index.ts");

  return {
    projectRoot,
    outDir,
    browser:
      browserFiles.length === 0
        ? skip("no browser modules")
        : piecesOnly
          ? skip("no browser modules (pieces only)")
          : RUN,
    node: nodeFiles.length > 0 ? RUN : skip("no node modules"),
    pieces,
    types: RUN,
    stylesheet: statSafe(join(projectRoot, "style.css"))?.isFile()
      ? RUN
      : skip("no style.css"),
  };
}
