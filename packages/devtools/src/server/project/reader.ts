import type { ProjectReader } from "../../project-types.js";
import { pathWithin } from "@powerhousedao/shared/clis/real-paths";
import { realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { ProjectBuild, ProjectBuilder } from "./build.js";
import {
  modelsFiles,
  modelsFingerprint,
  modulesFingerprint,
  revisionOf,
} from "./revision.js";

export type ProjectReaderOptions = {
  /** How long one read may take before it is stopped. A code-first model's
   * module is evaluated in this process and can wait forever. */
  buildTimeoutMs?: number;
  /** How long a revision is reused before the files are fingerprinted again. */
  revisionTtlMs?: number;
  /** How long a read that is not settled is kept before the next request reads again. */
  retryAfterMs?: number;
  now?: () => number;
};

type Stamp = { revision: string; modelsKey: string };

type Reading = {
  revision: string;
  build: Promise<ProjectBuild>;
  /** When a read that failed or is not settled finished. Undefined while it
   * runs and once it is settled. */
  unsettledAt?: number;
  /** Whether the document models are part of what is not settled. */
  modelsUnsettled?: boolean;
};

function realPathOr(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}

function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  onTimeout: () => Error,
): Promise<T> {
  return new Promise<T>((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    // The dev server must be able to exit while a read is pending.
    timer.unref();
    work.then(resolvePromise, reject).finally(() => clearTimeout(timer));
  });
}

/**
 * Reads what a project's code contains. It never writes to the
 * project and watches nothing: a request fingerprints the files again.
 *
 * - Requests for one revision share one read, including those that arrive
 *   while it runs. Reads never overlap: a newer revision waits for the read
 *   in flight, then is read once.
 * - A read that takes longer than the limit is stopped and fails. A module
 *   it was evaluating may run on: the same files are not read again until
 *   that module ends.
 * - A read that failed or is not settled (a section failed, or a model's
 *   source did not import) can depend on files outside the fingerprint, so
 *   it gets a new revision and is read again after `retryAfterMs`.
 */
export function createProjectReader(
  projectDir: string,
  {
    buildTimeoutMs = 30_000,
    revisionTtlMs = 300,
    retryAfterMs = 5_000,
    now = Date.now,
  }: ProjectReaderOptions = {},
): ProjectReader {
  const root = resolve(projectDir);
  /** The files outside the module folders that the last read's models evaluated. */
  let imported: string[] = [];
  /** Counts the retries of unsettled reads, so each one has its own revision. */
  let retries = 0;
  /** Counts those whose models were not settled: only they load the models
   * again. A retry for a failed section alone keeps the models it has. */
  let modelRetries = 0;
  let stamped: { at: number; stamp: Stamp } | undefined;
  let current: Reading | undefined;
  let inFlight: Promise<void> | undefined;
  // Loaded on first use: the readers pull in ts-morph and the definition
  // tooling, which a dev server whose tools never ask does not need.
  let builder: Promise<ProjectBuilder> | undefined;

  const stamp = (): Stamp => {
    const at = now();
    if (stamped !== undefined && at - stamped.at < revisionTtlMs) {
      return stamped.stamp;
    }
    if (
      current?.unsettledAt !== undefined &&
      at - current.unsettledAt >= retryAfterMs
    ) {
      if (current.modelsUnsettled) modelRetries += 1;
      current = undefined;
      retries += 1;
    }
    const modelsKey = revisionOf(
      modelsFingerprint(root, imported),
      modelRetries,
    );
    const revision = revisionOf(modelsKey, modulesFingerprint(root), retries);
    stamped = { at, stamp: { revision, modelsKey } };
    return stamped.stamp;
  };

  /**
   * Keeps the files the models evaluated that the fingerprint does not
   * already cover: those of the project, outside `node_modules`, the models
   * directory and the scalars.
   */
  const follow = (build: ProjectBuild) => {
    const covered = new Set(modelsFiles(root));
    // The module graph names a file by its real path, which leaves out a
    // symlink, a junction or a `subst` drive on the way to the project.
    const realRoot = realPathOr(root);
    const files = build.importedFiles.filter((file) => {
      const inside = (
        pathWithin(realRoot, file) ?? pathWithin(root, file)
      )?.split(sep);
      return (
        inside !== undefined &&
        !inside.includes("node_modules") &&
        !covered.has(inside.join("/"))
      );
    });
    // A source that did not import reports no files, so the ones it
    // evaluated before stay followed until it imports again.
    const next = [
      ...new Set(build.settled ? files : [...imported, ...files]),
    ].sort();
    if (next.join("\0") === imported.join("\0")) return;
    imported = next;
    stamped = undefined;
  };

  const start = ({ revision, modelsKey }: Stamp): Promise<ProjectBuild> => {
    const stop = new AbortController();
    builder ??= import("./build.js").then(({ createProjectBuilder }) =>
      createProjectBuilder(root),
    );
    const work = builder.then((run) => run(revision, modelsKey, stop.signal));
    const build = withTimeout(work, buildTimeoutMs, () => {
      const error = new Error(
        `Reading the project took longer than ${buildTimeoutMs / 1000} s and was stopped. A document model's module may be waiting for something that never settles.`,
      );
      stop.abort(error);
      return error;
    });
    const reading: Reading = { revision, build };
    current = reading;
    const settling = build
      .then(
        (done) => {
          follow(done);
          if (!done.settled) {
            reading.unsettledAt = now();
            reading.modelsUnsettled = !done.modelsSettled;
          }
        },
        () => {
          // A read that failed stays the answer for its revision, so a poll
          // does not start it again: the files change it, or `retryAfterMs`.
          // A stopped read can still be evaluating a module, which nothing
          // can end, so `retryAfterMs` counts from when that module ends.
          const failed = () => {
            reading.unsettledAt = now();
            reading.modelsUnsettled = true;
          };
          if (stop.signal.aborted) void work.then(failed, failed);
          else failed();
        },
      )
      .finally(() => {
        if (inFlight === settling) inFlight = undefined;
      });
    inFlight = settling;
    return build;
  };

  const build = async (): Promise<ProjectBuild> => {
    for (;;) {
      const next = stamp();
      if (current?.revision === next.revision) return current.build;
      if (inFlight === undefined) return start(next);
      await inFlight;
    }
  };

  return {
    revision: () => stamp().revision,
    snapshot: async () => (await build()).snapshot,
    documentModel: async (documentType) =>
      (await build()).documentModel(documentType),
    fileList: async () => (await build()).fileList(),
    file: async (path) => (await build()).file(path),
  };
}
