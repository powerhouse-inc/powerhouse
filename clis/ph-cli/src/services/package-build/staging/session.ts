import {
  lstatSync,
  mkdirSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import {
  pathWithin,
  realPathThroughExistingParent,
} from "@powerhousedao/shared/clis/real-paths";
import {
  CannotStage,
  cloneTree,
  creating,
  exists,
  isHeldOpen,
  linkTree,
  moveEntries,
  openDirectories,
  removeTree,
  renamePatiently,
  unstageableEntryIn,
} from "./files.js";
import { type CompilerRedirect, redirectRootProject } from "./compiler.js";
import type { CompilerOutput, ShownConfig } from "./inventory.js";
import { BUILD_DIRECTORY } from "../../build-control.js";
import {
  type CompilerSnapshot,
  fromJournalPath,
  type JournalState,
  type RunJournal,
  RUNS_DIRECTORY,
  toJournalPath,
  writeJournal,
} from "./journal.js";
import type { BuildLock } from "./lock.js";
import {
  installBuildInfo,
  isScratchOf,
  outputDigest,
  rollBack,
  type RunPaths,
  runPaths,
} from "./recovery.js";

const isUnreadable = (error: unknown) => {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "EACCES" || code === "EPERM";
};

/** `path` is `dir` or holds it. */
const isOrHolds = (path: string, dir: string) => pathWithin(path, dir) !== null;

/** The outermost directory of `path`, inside the package, that does not exist. */
function outermostMissing(packageRoot: string, path: string): string {
  let missing = path;
  for (
    let parent = dirname(path);
    pathWithin(packageRoot, parent) && !exists(parent);
    parent = dirname(parent)
  ) {
    missing = parent;
  }
  return missing;
}

/** A path as messages name it: from the package root, which is named so. */
export const shownPath = (packageRoot: string, path: string) =>
  toJournalPath(packageRoot, path) || "the package root";

export const scratchBeside = (path: string, kind: string, runId: string) =>
  join(dirname(path), `.${basename(path)}.ph-${kind}-${runId}`);

export type CompilerRun = {
  readonly configFile: string;
  readonly config: ShownConfig;
  readonly outputs: readonly CompilerOutput[];
};

/** One `ph build` of one package, as the steps and the step runner see it. */
export type BuildSession = {
  /** The output directory's real path, for comparing it with other paths. */
  readonly output: string;
  /** The output is `<package>/dist`, where the stylesheet and manifest copy belong. */
  readonly writesPackageDist: boolean;
  /** The directory every output write targets. */
  stage(): string;
  /**
   * Call before tsc runs, with what it is about to write. Returns the
   * generated config tsc builds instead when it can write into the stage.
   */
  prepareCompiler(compiler: CompilerRun): Promise<string | undefined>;
  /** Call once tsc has written, whatever it reported, before any bundle step. */
  compilerOutputsWritten(): void;
  commit(): void;
  /** Releases the lock. Call once nothing of this build runs any more. */
  close(): void;
  /**
   * Releases the lock and keeps the run, for a process a signal is about to
   * end: the next build replays the run's journal.
   */
  releaseLock(): void;
  rollback(): void;
  /**
   * Notes that the process was told to stop. Synchronous, for a signal
   * handler; the step runner stops the build once the running step settles.
   */
  cancel(signal: NodeJS.Signals): void;
  stopped(): NodeJS.Signals | undefined;
  /**
   * Runs `stop` synchronously inside `cancel`, so work outside this process,
   * such as a child, ends before a signal handler lets the process exit.
   * Returns the unregister function.
   */
  onCancel(stop: () => void): () => void;
};

type Status = "open" | "committed" | "rolled-back";

/**
 * One `ph build` of one package: the output is written to a stage beside the
 * output directory and replaces it only on commit. Until then the previous
 * output and the compiler outputs tsc rewrote can be put back, by `rollback`
 * in this process or, after a crash, by the next build.
 */
export class StagedBuildSession implements BuildSession {
  readonly runId: string;
  readonly packageRoot: string;
  readonly output: string;
  readonly writesPackageDist: boolean;
  readonly runDir: string;
  private readonly paths: RunPaths;
  private readonly lock: BuildLock;
  private journal: RunJournal;
  private status: Status = "open";
  private stoppedBy: NodeJS.Signals | undefined;
  private seeded = false;
  private compilerWritten = false;
  private restored = false;
  private redirected: readonly string[] = [];
  private readonly cleanedEntries: readonly string[];
  private readonly linkCleanedEntries: boolean;

  private constructor(fields: {
    runId: string;
    packageRoot: string;
    output: string;
    writesPackageDist: boolean;
    cleanedEntries: readonly string[];
    linkCleanedEntries: boolean;
    runDir: string;
    lock: BuildLock;
    journal: RunJournal;
  }) {
    this.runId = fields.runId;
    this.packageRoot = fields.packageRoot;
    this.output = fields.output;
    this.writesPackageDist = fields.writesPackageDist;
    this.cleanedEntries = fields.cleanedEntries;
    this.linkCleanedEntries = fields.linkCleanedEntries;
    this.runDir = fields.runDir;
    this.lock = fields.lock;
    this.journal = fields.journal;
    this.paths = runPaths(fields.packageRoot, fields.runDir, fields.journal);
  }

  /**
   * Starts a run under `lock`, which the caller took and recovered stale
   * runs under; the caller still releases it when this throws. The stage
   * sits beside `logical`, the output as given, so the paths the bundlers
   * record from it are the ones an unstaged build records.
   */
  static async open(options: {
    readonly packageRoot: string;
    readonly logical: string;
    readonly output: string;
    readonly writesPackageDist: boolean;
    /** Top-level entries of the output a step empties before it writes them. */
    readonly cleanedEntries: readonly string[];
    /** Seed those entries by hard link: no step writes them before that. */
    readonly linkCleanedEntries: boolean;
    readonly runId: string;
    readonly lock: BuildLock;
  }): Promise<StagedBuildSession> {
    const { packageRoot, logical, runId } = options;
    const runDir = join(packageRoot, RUNS_DIRECTORY, runId);
    try {
      const beside = (kind: string) => scratchBeside(logical, kind, runId);
      const journal: RunJournal = {
        format: 1,
        runId,
        pid: process.pid,
        state: "building",
        undo: null,
        output: toJournalPath(packageRoot, logical),
        stage: toJournalPath(packageRoot, beside("stage")),
        retired: toJournalPath(packageRoot, beside("old")),
        compiler: null,
      };
      await creating(BUILD_DIRECTORY, () => {
        mkdirSync(runDir, { recursive: true });
        writeJournal(runDir, journal);
      });
      await creating(shownPath(packageRoot, dirname(logical)), () =>
        mkdirSync(beside("stage"), { recursive: true }),
      );
      return new StagedBuildSession({ ...options, runDir, journal });
    } catch (error) {
      removeTree(runDir);
      throw error;
    }
  }

  private assertOpen(): void {
    if (this.status !== "open") {
      throw new Error("The build was stopped before it finished.");
    }
  }

  private record(
    changes: Partial<
      Pick<
        RunJournal,
        | "state"
        | "compiler"
        | "generatedConfig"
        | "pendingBuildInfo"
        | "outputDigest"
      >
    >,
  ) {
    this.journal = { ...this.journal, ...changes };
    writeJournal(this.runDir, this.journal);
  }

  private setState(state: JournalState): void {
    this.record({ state });
  }

  /**
   * Compiler outputs strictly inside the output directory, relative to it:
   * tsc rewrote them in the real output, so the stage leaves them out when
   * it is seeded and takes them fresh at commit. A protected directory that
   * is the output or holds it is not one: it holds the bundles too.
   */
  private compilerOutputsInOutput(): string[] {
    // Compared by real path: tsc's outputs are recorded that way.
    return (this.journal.compiler ?? []).flatMap(({ path }) => {
      const rel = pathWithin(
        this.output,
        fromJournalPath(this.packageRoot, path),
      );
      return rel ? [rel] : [];
    });
  }

  /**
   * The stage directory every output write targets. The first call seeds it
   * with the current output, minus what tsc writes afresh. With
   * `linkCleanedEntries`, the entries a step cleans are seeded by hard link,
   * since it unlinks their files before it writes and says so in the same
   * words as on the output; the rest, and otherwise everything, by clone.
   */
  stage(): string {
    this.assertOpen();
    const { stage, output } = this.paths;
    if (this.seeded) return stage;
    removeTree(stage);
    if (exists(output)) {
      const skipped = new Set(
        this.compilerWritten
          ? []
          : this.compilerOutputsInOutput().map((rel) => join(output, rel)),
      );
      const keep = (source: string) => !skipped.has(source);
      // tsc rewrites files in place, so what it writes into is copied.
      const linked = (this.linkCleanedEntries ? this.cleanedEntries : [])
        .filter((entry) => {
          const real = join(this.output, entry);
          return !this.redirected.some(
            (path) => isOrHolds(real, path) || isOrHolds(path, real),
          );
        })
        .map((entry) => join(output, entry))
        .filter(
          (dir) =>
            keep(dir) &&
            lstatSync(dir, { throwIfNoEntry: false })?.isDirectory(),
        );
      cloneTree(
        output,
        stage,
        (source) => keep(source) && !linked.includes(source),
      );
      for (const dir of linked) {
        linkTree(dir, join(stage, basename(dir)), keep);
      }
    } else {
      mkdirSync(stage);
    }
    this.seeded = true;
    return stage;
  }

  async prepareCompiler(compiler: CompilerRun): Promise<string | undefined> {
    this.assertOpen();
    const redirect = redirectRootProject(compiler.config, {
      configFile: compiler.configFile,
      packageRoot: this.packageRoot,
      output: this.output,
      stage: this.paths.stage,
      pending: (target) => scratchBeside(target, "stage", this.runId),
    });
    let config: string | undefined;
    let staged: readonly string[] = [];
    if (redirect) {
      config = await this.writeCompilerConfig(compiler.configFile, redirect);
      if (config) staged = redirect.staged;
    }
    const real = (path: string) => realPathThroughExistingParent(path);
    this.protectCompilerOutputs(
      compiler.outputs.filter(
        ({ path }) => !staged.some((dir) => isOrHolds(dir, real(path))),
      ),
    );
    if (!config) return undefined;
    this.redirected = staged;
    this.stage();
    return config;
  }

  /**
   * Writes the config that sends the root project's outputs into the stage,
   * beside the package's so `${configDir}` and its relative paths mean the
   * same, with the package config's modification time so tsc finds the
   * project up to date when it would. The pending build info starts as a
   * copy of the real one. Undefined when the package does not let the run
   * write them: tsc then writes in place.
   */
  private async writeCompilerConfig(
    configFile: string,
    redirect: CompilerRedirect,
  ): Promise<string | undefined> {
    const generated = join(
      dirname(configFile),
      `.${basename(configFile, extname(configFile))}.ph-stage-${this.runId}.json`,
    );
    const pending = redirect.pendingBuildInfo;
    const recorded = (path: string) => toJournalPath(this.packageRoot, path);
    this.record({
      generatedConfig: recorded(generated),
      ...(pending && {
        pendingBuildInfo: {
          path: recorded(pending.path),
          target: recorded(pending.target),
        },
      }),
    });
    try {
      await creating(shownPath(this.packageRoot, dirname(configFile)), () => {
        writeFileSync(
          generated,
          `${JSON.stringify(
            {
              extends: `./${basename(configFile)}`,
              compilerOptions: redirect.compilerOptions,
              ...(redirect.exclude && { exclude: redirect.exclude }),
            },
            null,
            2,
          )}\n`,
        );
        const { atime, mtime } = statSync(configFile);
        utimesSync(generated, atime, mtime);
        if (pending && exists(pending.target)) {
          cloneTree(pending.target, pending.path);
        }
      });
      return generated;
    } catch (error) {
      if (!(error instanceof CannotStage)) throw error;
      removeTree(generated);
      if (pending) removeTree(pending.path);
      this.record({ generatedConfig: undefined, pendingBuildInfo: undefined });
      return undefined;
    }
  }

  /**
   * Copies what tsc is about to rewrite into the run, or notes it absent, so
   * a build that does not finish puts it back. Call before tsc runs. An
   * output that is or holds `.ph/build` or this run, by real path, is left
   * unprotected, as without staging: a copy of it would copy itself. So is
   * one holding something a copy cannot take: a FIFO, socket or device, or
   * an entry this process cannot read. The copy's directories are made
   * owner-writable, so the run can always be removed; the journal keeps
   * their modes for a restore.
   */
  private protectCompilerOutputs(outputs: readonly CompilerOutput[]): void {
    const real = (path: string) => realPathThroughExistingParent(path);
    const control = [
      real(join(this.packageRoot, BUILD_DIRECTORY)),
      real(this.runDir),
    ];
    const snapshots: CompilerSnapshot[] = [...(this.journal.compiler ?? [])];
    for (const { path, kind } of outputs) {
      const target = real(path);
      if (control.some((dir) => isOrHolds(target, dir))) continue;
      const recorded = toJournalPath(this.packageRoot, target);
      if (snapshots.some((snapshot) => snapshot.path === recorded)) continue;
      if (exists(target)) {
        const copy = `compiler/${snapshots.length}`;
        const output = basename(this.paths.output);
        const snapshot = join(this.runDir, copy);
        const keep = (source: string) => !isScratchOf(output, basename(source));
        // Left unprotected, as without staging.
        if (unstageableEntryIn(target, keep) !== undefined) continue;
        try {
          cloneTree(target, snapshot, keep);
        } catch (error) {
          if (!isUnreadable(error)) throw error;
          removeTree(snapshot);
          continue;
        }
        const modes = openDirectories(snapshot);
        snapshots.push({
          path: recorded,
          kind,
          copy,
          created: null,
          ...(modes.length > 0 && { modes }),
        });
      } else {
        const missing = outermostMissing(this.packageRoot, target);
        const created =
          missing === target ? null : toJournalPath(this.packageRoot, missing);
        snapshots.push({ path: recorded, kind, copy: null, created });
      }
    }
    const digest =
      snapshots.length > 0
        ? outputDigest(this.packageRoot, this.paths.output, snapshots)
        : undefined;
    this.record({
      compiler: snapshots,
      ...(digest !== undefined && { outputDigest: digest }),
    });
  }

  /**
   * tsc wrote into the real output directory; the stage takes its fresh
   * files now, before any bundle step, so a step that cleans or rewrites an
   * entry treats them as it would in the output.
   */
  compilerOutputsWritten(): void {
    this.assertOpen();
    this.compilerWritten = true;
    const generated = this.journal.generatedConfig;
    if (generated) removeTree(fromJournalPath(this.packageRoot, generated));
    if (this.seeded) this.carryOverCompilerOutputs(this.paths.stage);
  }

  private carryOverCompilerOutputs(stage: string): void {
    for (const rel of this.compilerOutputsInOutput()) {
      const target = join(stage, rel);
      removeTree(target);
      const source = join(this.paths.output, rel);
      if (exists(source)) {
        mkdirSync(dirname(target), { recursive: true });
        cloneTree(source, target);
      }
    }
  }

  private warnNotAtomic(): void {
    const shown = toJournalPath(this.packageRoot, this.paths.output);
    console.warn(
      `⚠ Another process holds files in ${shown}, so ${shown} was replaced entry by entry instead of in one rename; while that ran, it held parts of both builds.`,
    );
  }

  /**
   * Replaces the output with the stage: the output moves aside, the stage
   * takes its place, the old tree goes. The journal records each move first.
   * Synchronous, so no signal handler runs in between. The lock stays held
   * until `close`.
   */
  commit(): void {
    const stage = this.stage();
    const { output, retired } = this.paths;
    try {
      this.setState("retiring");
      let entryByEntry = false;
      if (exists(output)) {
        try {
          renamePatiently(output, retired);
        } catch (error) {
          if (!isHeldOpen(error)) throw error;
          entryByEntry = true;
          mkdirSync(retired);
          moveEntries(output, retired);
        }
      }
      this.setState("installing");
      if (exists(output)) {
        moveEntries(stage, output);
        removeTree(stage);
      } else {
        try {
          renamePatiently(stage, output);
        } catch (error) {
          if (!isHeldOpen(error)) throw error;
          entryByEntry = true;
          mkdirSync(output);
          moveEntries(stage, output);
          removeTree(stage);
        }
      }
      installBuildInfo(this.packageRoot, this.journal.pendingBuildInfo);
      this.status = "committed";
      if (entryByEntry) this.warnNotAtomic();
    } catch (error) {
      this.rollback();
      throw error;
    }
    try {
      this.setState("committed");
      removeTree(retired);
      removeTree(this.runDir);
    } catch (error) {
      console.warn(
        `⚠ The build finished, but its scratch files were not all removed (${error instanceof Error ? error.message : String(error)}); the next build removes them.`,
      );
    }
  }

  /**
   * Releases the lock a commit keeps, so steps that read the committed
   * output finish before another build replaces it, and drops the run a
   * rollback restored from. Idempotent.
   */
  close(): void {
    try {
      if (this.status === "rolled-back" && this.restored) {
        removeTree(this.runDir);
      }
    } finally {
      this.lock.release();
    }
  }

  releaseLock(): void {
    this.lock.release();
  }

  /**
   * Puts the previous output and compiler outputs back. Synchronous, so a
   * signal handler can call it; a no-op after commit. The run and its
   * snapshot stay until `close`, so a call after a step still running at
   * the first one settles restores again, undoing what that step wrote
   * since. A restore that failed is left to the next build. The lock stays
   * held until `close`.
   */
  rollback(): void {
    if (this.status === "committed") return;
    if (this.status === "rolled-back" && !this.restored) return;
    this.status = "rolled-back";
    try {
      rollBack(this.paths, this.journal);
      this.journal = { ...this.journal, state: "rolling-back", undo: "stage" };
      this.restored = true;
    } catch (error) {
      this.restored = false;
      console.error(
        `✘ The previous output could not be restored (${error instanceof Error ? error.message : String(error)}); the next build restores it.`,
      );
    }
  }

  private readonly stops = new Set<() => void>();

  cancel(signal: NodeJS.Signals): void {
    this.stoppedBy ??= signal;
    for (const stop of [...this.stops]) stop();
  }

  onCancel(stop: () => void): () => void {
    this.stops.add(stop);
    return () => this.stops.delete(stop);
  }

  /** The signal `cancel` was called with, if it was. */
  stopped(): NodeJS.Signals | undefined {
    return this.stoppedBy;
  }
}
