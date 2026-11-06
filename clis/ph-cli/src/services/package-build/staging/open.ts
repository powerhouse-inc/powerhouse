import { randomBytes } from "node:crypto";
import { lstatSync, readdirSync, readlinkSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  pathWithin,
  realPathThroughExistingParent,
} from "@powerhousedao/shared/clis/real-paths";
import { CannotStage, creating, unstageableEntryIn } from "./files.js";
import { BUILD_DIRECTORY, LOCK_FILE } from "../../build-control.js";
import { RUNS_DIRECTORY } from "./journal.js";
import { acquireBuildLock, type BuildLock } from "./lock.js";
import { recoverStaleRuns } from "./recovery.js";
import {
  type BuildSession,
  scratchBeside,
  shownPath,
  StagedBuildSession,
} from "./session.js";

/**
 * The first symlink among the output and its parents inside the package:
 * a stage beside its target would change the paths the bundlers record.
 */
function symlinkOnPath(
  packageRoot: string,
  output: string,
): string | undefined {
  const root = realPathThroughExistingParent(packageRoot);
  for (let dir = output; ; dir = dirname(dir)) {
    if (lstatSync(dir, { throwIfNoEntry: false })?.isSymbolicLink()) {
      return dir;
    }
    const parent = realPathThroughExistingParent(dirname(dir));
    if (parent === root || pathWithin(root, parent) === null) return;
  }
}

/**
 * The output is a mount point, or otherwise on another filesystem than the
 * directory beside it: the stage's rename cannot replace it.
 */
function onAnotherFilesystem(output: string): boolean {
  const dev = statSync(output, { throwIfNoEntry: false })?.dev;
  return dev !== undefined && dev !== statSync(dirname(output)).dev;
}

function linkIntoOutput(
  logical: string,
  output: string,
  stage: string,
): string | undefined {
  const visit = (dir: string): string | undefined => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = visit(path);
        if (found) return found;
        continue;
      }
      if (!entry.isSymbolicLink()) continue;
      const target = readlinkSync(path);
      const copied = isAbsolute(target)
        ? target
        : resolve(stage, relative(logical, dirname(path)), target);
      if (pathWithin(logical, copied) !== null) return path;
      if (pathWithin(output, copied) !== null) return path;
    }
    return undefined;
  };
  return lstatSync(logical, { throwIfNoEntry: false })?.isDirectory()
    ? visit(logical)
    : undefined;
}

/**
 * Writes the output in place, as builds did before staging: no stage or
 * snapshot, and nothing to commit or roll back. It holds the package's lock
 * until `close` when `.ph/build` can hold one. A stop signal does not stop
 * it, as it did not stop an unstaged build.
 */
class InPlaceSession implements BuildSession {
  constructor(
    readonly output: string,
    private readonly logical: string,
    readonly writesPackageDist: boolean,
    private readonly lock: BuildLock | undefined,
  ) {}
  stage(): string {
    return this.logical;
  }
  prepareCompiler(): Promise<undefined> {
    return Promise.resolve(undefined);
  }
  compilerOutputsWritten(): void {}
  commit(): void {}
  close(): void {
    this.lock?.release();
  }
  releaseLock(): void {
    this.lock?.release();
  }
  rollback(): void {}
  private readonly stops = new Set<() => void>();
  cancel(): void {
    for (const stop of [...this.stops]) stop();
  }
  stopped(): undefined {
    return undefined;
  }
  onCancel(stop: () => void): () => void {
    this.stops.add(stop);
    return () => this.stops.delete(stop);
  }
}

function newRunId(): string {
  return `${Date.now().toString(36)}-${process.pid}-${randomBytes(3).toString("hex")}`;
}

/**
 * Takes the package's lock and finishes what dead builds left, then opens a
 * staged session, or an in-place one when staging cannot run as an unstaged
 * build would: the output or a directory on its path in the package is a
 * symlink, the output is on another filesystem than its parent, it holds an
 * entry a copy cannot take (a FIFO, socket or device, or one this process
 * cannot read) or a symlink into itself, it holds `.ph/build`, whose lock and
 * journal a swap would move away, or the stage beside it cannot be written.
 * Only when `.ph/build` cannot hold the lock does the build run without one,
 * as builds did before staging. One warning says why a build writes in place.
 */
export async function openBuildSession(options: {
  readonly packageRoot: string;
  readonly outDir: string;
  /** Top-level entries of the output a step empties before it writes them. */
  readonly cleanedEntries: readonly string[];
  /** Seed those entries by hard link: no step writes them before that. */
  readonly linkCleanedEntries: boolean;
}): Promise<BuildSession> {
  const { packageRoot, outDir, cleanedEntries, linkCleanedEntries } = options;
  const logical = resolve(packageRoot, outDir);
  const output = realPathThroughExistingParent(logical);
  const writesPackageDist =
    output === realPathThroughExistingParent(join(packageRoot, "dist"));
  const shown = (path: string) => shownPath(packageRoot, path);
  const inPlace = (reason: string, lock: BuildLock | undefined) => {
    console.warn(
      `⚠ ${reason}, so this build writes ${shown(logical)} in place: if it does not finish, ${shown(logical)} can be left part old, part new.`,
    );
    return new InPlaceSession(output, logical, writesPackageDist, lock);
  };
  const runId = newRunId();
  let lock: BuildLock;
  try {
    lock = await creating(BUILD_DIRECTORY, () =>
      acquireBuildLock(join(packageRoot, LOCK_FILE), runId, (wait) =>
        console.log(
          `Another build of this package holds ${shown(wait.file)} (${wait.owner}); waiting for it to finish... If that build is gone, delete ${shown(wait.file)}.`,
        ),
      ),
    );
  } catch (error) {
    if (!(error instanceof CannotStage)) throw error;
    return inPlace(error.message, undefined);
  }
  try {
    recoverStaleRuns(packageRoot, logical);
    const link = symlinkOnPath(packageRoot, logical);
    if (link !== undefined) {
      return inPlace(`${shown(link)} is a symbolic link`, lock);
    }
    if (onAnotherFilesystem(logical)) {
      return inPlace(
        `${shown(logical)} is on another filesystem than the directory that holds it`,
        lock,
      );
    }
    const unstageable = unstageableEntryIn(logical);
    if (unstageable !== undefined) {
      return inPlace(`${shown(unstageable.path)} ${unstageable.reason}`, lock);
    }
    const intoOutput = linkIntoOutput(
      logical,
      output,
      scratchBeside(logical, "stage", runId),
    );
    if (intoOutput !== undefined) {
      return inPlace(
        `${shown(intoOutput)} is a symbolic link into ${shown(logical)}`,
        lock,
      );
    }
    const control = [BUILD_DIRECTORY, join(RUNS_DIRECTORY, runId)].find(
      (dir) =>
        pathWithin(
          output,
          realPathThroughExistingParent(join(packageRoot, dir)),
        ) !== null,
    );
    if (control !== undefined) {
      return inPlace(`${shown(logical)} holds ${control}`, lock);
    }
    try {
      return await StagedBuildSession.open({
        packageRoot,
        logical,
        output,
        writesPackageDist,
        cleanedEntries,
        linkCleanedEntries,
        runId,
        lock,
      });
    } catch (error) {
      if (!(error instanceof CannotStage)) throw error;
      return inPlace(error.message, lock);
    }
  } catch (error) {
    lock.release();
    throw error;
  }
}
