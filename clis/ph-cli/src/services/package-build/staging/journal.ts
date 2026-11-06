import { readFileSync, renameSync, writeFileSync } from "node:fs";
import nodePath, { join } from "node:path";
import { BUILD_DIRECTORY } from "../../build-control.js";
import type { DirectoryMode } from "./files.js";
import type { CompilerOutput } from "./inventory.js";

export const RUNS_DIRECTORY = join(BUILD_DIRECTORY, "runs");
const JOURNAL_FILE = "journal.json";

/**
 * Where a run is, written before each move it makes:
 * - building: the stage is being written; the output is untouched.
 * - retiring: the output is moving aside to the retired path.
 * - installing: the stage is moving into the output's place.
 * - rolling-back: the run is being undone; `undo` names the step it is at.
 * - committed: the stage is the output; only cleanup is left.
 */
export type JournalState =
  | "building"
  | "retiring"
  | "installing"
  | "rolling-back"
  | "committed";

/**
 * The steps of a rollback, in order, each safe to repeat:
 * - install: the output loses what the stage put in it.
 * - retire: the retired tree, or its entries, goes back into the output.
 * - stage: the stage goes and the compiler outputs come back.
 */
export const UNDO_STEPS = ["install", "retire", "stage"] as const;
export type UndoStep = (typeof UNDO_STEPS)[number];

/**
 * A compiler output as it was before tsc ran. `copy` is null when it was
 * absent; `created` is then the outermost of its directories that was absent
 * too, removed again if tsc left nothing else in it. `modes` holds the
 * directories of the copy that lacked owner permissions, which the copy was
 * given so the run can be removed; a restore sets them back.
 */
export type CompilerSnapshot = {
  readonly path: string;
  readonly kind: CompilerOutput["kind"];
  readonly copy: string | null;
  readonly created: string | null;
  readonly modes?: readonly DirectoryMode[];
};

export type PendingBuildInfo = {
  readonly path: string;
  readonly target: string;
};

/** Paths as `toJournalPath` records them: package paths from the package root, copies from the run directory. */
export type RunJournal = {
  readonly format: 1;
  readonly runId: string;
  readonly pid: number;
  readonly state: JournalState;
  /** With `rolling-back`: the first rollback step not known to be done. */
  readonly undo: UndoStep | null;
  readonly output: string;
  readonly stage: string;
  readonly retired: string;
  readonly compiler: readonly CompilerSnapshot[] | null;
  readonly generatedConfig?: string;
  readonly pendingBuildInfo?: PendingBuildInfo;
  readonly outputDigest?: string;
};

const STATES: readonly JournalState[] = [
  "building",
  "retiring",
  "installing",
  "rolling-back",
  "committed",
];

/**
 * A path inside `from` is recorded relative, in POSIX form. Any other path
 * is recorded absolute and comes back unchanged: a relative spelling of
 * another drive or a UNC share does not resolve back to it on Windows.
 */
export function toJournalPath(
  from: string,
  to: string,
  paths: typeof nodePath = nodePath,
): string {
  const rel = paths.relative(from, to);
  if (
    paths.isAbsolute(rel) ||
    rel === ".." ||
    rel.startsWith(`..${paths.sep}`)
  ) {
    return paths.resolve(to);
  }
  return rel.split(paths.sep).join("/");
}

export function fromJournalPath(
  from: string,
  recorded: string,
  paths: typeof nodePath = nodePath,
): string {
  return paths.isAbsolute(recorded) ? recorded : paths.resolve(from, recorded);
}

export function journalPath(runDir: string): string {
  return join(runDir, JOURNAL_FILE);
}

/** Replaces the journal in one rename, so a reader sees the old state or the new. */
export function writeJournal(runDir: string, journal: RunJournal): void {
  const file = journalPath(runDir);
  const pending = `${file}.${process.pid}.tmp`;
  writeFileSync(pending, `${JSON.stringify(journal, null, 2)}\n`);
  renameSync(pending, file);
}

const isString = (value: unknown): value is string =>
  typeof value === "string" && value !== "";

function parseSnapshot(value: unknown): CompilerSnapshot | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { path, kind, copy, created } = value as Record<string, unknown>;
  if (
    !isString(path) ||
    (kind !== "directory" && kind !== "build-info" && kind !== "file")
  ) {
    return undefined;
  }
  if (copy !== null && !isString(copy)) return undefined;
  if (created !== null && !isString(created)) return undefined;
  const { modes } = value as Record<string, unknown>;
  if (modes === undefined) return { path, kind, copy, created };
  if (!Array.isArray(modes) || !modes.every(isDirectoryMode)) return undefined;
  return { path, kind, copy, created, modes };
}

function parsePendingBuildInfo(
  value: unknown,
): PendingBuildInfo | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null) return null;
  const { path, target } = value as Record<string, unknown>;
  return isString(path) && isString(target) ? { path, target } : null;
}

const isDirectoryMode = (value: unknown): value is DirectoryMode =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === "string" &&
  Number.isInteger(value[1]);

/** The journal of a run directory, or undefined when it is missing or unreadable. */
export function readJournal(runDir: string): RunJournal | undefined {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(journalPath(runDir), "utf8"));
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (
    record.format !== 1 ||
    !isString(record.runId) ||
    typeof record.pid !== "number" ||
    !STATES.includes(record.state as JournalState) ||
    !isString(record.output) ||
    !isString(record.stage) ||
    !isString(record.retired)
  ) {
    return undefined;
  }
  const optional = (key: string) =>
    record[key] === undefined || isString(record[key]);
  if (!optional("generatedConfig") || !optional("outputDigest"))
    return undefined;
  const pending = parsePendingBuildInfo(record.pendingBuildInfo);
  if (pending === null) return undefined;
  const undo = UNDO_STEPS.find((step) => step === record.undo) ?? null;
  if ((record.state === "rolling-back") !== (undo !== null)) return undefined;
  let compiler: CompilerSnapshot[] | null = null;
  if (Array.isArray(record.compiler)) {
    compiler = [];
    for (const entry of record.compiler) {
      const snapshot = parseSnapshot(entry);
      if (snapshot === undefined) return undefined;
      compiler.push(snapshot);
    }
  } else if (record.compiler !== null) {
    return undefined;
  }
  return {
    format: 1,
    runId: record.runId,
    pid: record.pid,
    state: record.state as JournalState,
    undo,
    output: record.output,
    stage: record.stage,
    retired: record.retired,
    compiler,
    ...(isString(record.generatedConfig) && {
      generatedConfig: record.generatedConfig,
    }),
    ...(pending !== undefined && { pendingBuildInfo: pending }),
    ...(isString(record.outputDigest) && { outputDigest: record.outputDigest }),
  };
}
