import { mkdirSync, rmdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  cloneTree,
  entriesOf,
  exists,
  isHeldOpen,
  moveEntries,
  removeTree,
  renamePatiently,
  restoreDirectoryModes,
} from "./files.js";
import {
  type CompilerSnapshot,
  fromJournalPath,
  type JournalState,
  readJournal,
  RUNS_DIRECTORY,
  type RunJournal,
  UNDO_STEPS,
  type UndoStep,
  writeJournal,
} from "./journal.js";

/** A run's paths, absolute. */
export type RunPaths = {
  readonly packageRoot: string;
  readonly runDir: string;
  readonly output: string;
  readonly stage: string;
  readonly retired: string;
};

export function runPaths(
  packageRoot: string,
  runDir: string,
  journal: Pick<RunJournal, "output" | "stage" | "retired">,
): RunPaths {
  return {
    packageRoot,
    runDir,
    output: fromJournalPath(packageRoot, journal.output),
    stage: fromJournalPath(packageRoot, journal.stage),
    retired: fromJournalPath(packageRoot, journal.retired),
  };
}

/** Puts `from` at `to`: one rename, or entry by entry when `from` is held open. */
export function moveTree(from: string, to: string): "renamed" | "entries" {
  try {
    renamePatiently(from, to);
    return "renamed";
  } catch (error) {
    if (!isHeldOpen(error)) throw error;
    mkdirSync(to, { recursive: true });
    moveEntries(from, to);
    removeTree(from);
    return "entries";
  }
}

/** Build info first: if a later copy fails, tsc still sees its outputs as stale. */
export function restoreCompilerOutputs(
  paths: Pick<RunPaths, "packageRoot" | "runDir">,
  snapshots: readonly CompilerSnapshot[] | null,
): void {
  const ordered = [...(snapshots ?? [])].sort(
    (a, b) => Number(b.kind === "build-info") - Number(a.kind === "build-info"),
  );
  for (const snapshot of ordered) {
    const path = fromJournalPath(paths.packageRoot, snapshot.path);
    removeTree(path);
    if (snapshot.copy !== null) {
      cloneTree(fromJournalPath(paths.runDir, snapshot.copy), path);
      restoreDirectoryModes(path, snapshot.modes ?? []);
    } else if (snapshot.created !== null) {
      removeEmptyDirectories(
        dirname(path),
        fromJournalPath(paths.packageRoot, snapshot.created),
      );
    }
  }
}

/** Removes `from` and its parents up to `upTo` while each is an empty directory. */
function removeEmptyDirectories(from: string, upTo: string): void {
  for (let dir = from; ; dir = dirname(dir)) {
    if (!exists(dir) || entriesOf(dir).length > 0) return;
    rmdirSync(dir);
    if (dir === upTo || dirname(dir) === dir) return;
  }
}

const FIRST_UNDO_STEP: Readonly<
  Record<Exclude<JournalState, "rolling-back" | "committed">, UndoStep>
> = { building: "stage", retiring: "retire", installing: "install" };

/**
 * Undoes a run: the previous output goes back in place, the stage goes, and
 * the compiler outputs are restored. The journal records each step before
 * it starts, so a rollback cut short is finished by the next build, never
 * rolled forward; the run directory, and the snapshot in it, stay until
 * the caller removes them.
 */
export function rollBack(paths: RunPaths, journal: RunJournal): void {
  if (journal.state === "committed") return;
  const first =
    journal.state === "rolling-back"
      ? (journal.undo ?? "stage")
      : FIRST_UNDO_STEP[journal.state];
  const { output, retired } = paths;
  for (const step of UNDO_STEPS.slice(UNDO_STEPS.indexOf(first))) {
    writeJournal(paths.runDir, {
      ...journal,
      state: "rolling-back",
      undo: step,
    });
    if (step === "install") {
      // Every old entry is in the retired tree by now, so what the output
      // holds is new. Emptied rather than removed: a directory held open
      // cannot go.
      if (!exists(retired)) removeTree(output);
      else
        for (const entry of entriesOf(output)) removeTree(join(output, entry));
    } else if (step === "retire") {
      if (exists(retired)) {
        if (exists(output)) moveEntries(retired, output);
        else moveTree(retired, output);
      }
    } else {
      removeTree(paths.stage);
      removeTree(retired);
      restoreCompilerOutputs(paths, journal.compiler);
    }
  }
}

/** Finishes a run that was installing its stage: the stage becomes the output. */
export function rollForward(paths: RunPaths): void {
  const { output, stage } = paths;
  if (exists(stage)) {
    if (exists(output)) moveEntries(stage, output);
    else moveTree(stage, output);
  }
  removeTree(stage);
  removeTree(paths.retired);
}

export type Replayed = "rolled-back" | "completed" | "discarded";

/**
 * Brings the package back to a consistent state after a run that died, then
 * removes its run directory. A run that had not started to install its stage,
 * or had started to roll back, is undone; one installing its stage is
 * finished.
 */
export function replayRun(packageRoot: string, runDir: string): Replayed {
  const journal = readJournal(runDir);
  let replayed: Replayed = "discarded";
  if (journal !== undefined) {
    const paths = runPaths(packageRoot, runDir, journal);
    if (journal.state !== "installing" && journal.state !== "committed") {
      rollBack(paths, journal);
      replayed = "rolled-back";
    } else {
      rollForward(paths);
      replayed = "completed";
    }
  }
  removeTree(runDir);
  return replayed;
}

/** A run's stage and retired tree beside the output named `output`. */
export const isScratchOf = (output: string, entry: string) =>
  entry.startsWith(`.${output}.ph-stage-`) ||
  entry.startsWith(`.${output}.ph-old-`);

/**
 * Undoes or finishes every run a dead build left behind, then removes any
 * stage or retired tree beside `output` that no run claims any more: a
 * bundler of a stopped build can go on writing after its rollback. Call
 * under the lock, where no other run of this package is live.
 */
export function recoverStaleRuns(packageRoot: string, output: string): void {
  const runsDir = join(packageRoot, RUNS_DIRECTORY);
  for (const runId of entriesOf(runsDir)) {
    const replayed = replayRun(packageRoot, join(runsDir, runId));
    if (replayed === "rolled-back") {
      console.warn(
        "⚠ An earlier build of this package stopped before it finished; its partial output was removed and the previous output restored.",
      );
    } else if (replayed === "completed") {
      console.warn(
        "⚠ An earlier build of this package stopped while it replaced its output; the replacement was completed.",
      );
    }
  }
  const beside = dirname(output);
  for (const entry of entriesOf(beside)) {
    if (isScratchOf(basename(output), entry)) removeTree(join(beside, entry));
  }
}
