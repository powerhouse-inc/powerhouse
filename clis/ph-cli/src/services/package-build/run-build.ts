import { planPieces } from "@powerhousedao/shared/build-pieces";
import { createDetectionCache } from "@powerhousedao/shared/build-pieces";
import { detect } from "package-manager-detector";
import type { BuildArgs } from "../../types.js";
import { runBuildSteps } from "./pipeline/run-steps.js";
import { openBuildSession } from "./staging/open.js";
import type { BuildSession } from "./staging/session.js";
import { entriesCleanedBy } from "./steps/bundles.js";
import type { BuildContext, StandardBuildStep } from "./steps/context.js";
import { standardBuildSteps } from "./steps/standard.js";
import { createTraceFiles } from "./steps/trace.js";
import { UNSAFE_BUILD_WARNING } from "./steps/typecheck.js";

export type BuildOptions = {
  readonly steps?: readonly StandardBuildStep[];
  /**
   * Check the package's definitions, importing its modules in a child
   * process. Only `ph build` asks; `--release` always checks.
   */
  readonly checkDefinitions?: boolean;
  /**
   * This process belongs to ph-cli and loads no package code, so a stop
   * signal ends it: the lock can go before the signal is re-raised, and a
   * next build on another host does not wait for it. An embedding process
   * (the switchboard runner) keeps the lock until the running step settles,
   * since one of its signal-exit callbacks may keep the process alive.
   */
  readonly ownsProcess?: boolean;
};

const STOP_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

/**
 * The signal listeners signal-exit installs: each ends the process when
 * only signal-exit listeners are left, so they are not an embedding
 * process that keeps running. Read from the counts its copies share.
 */
function exitOnlyListeners(): number {
  const count = (emitter: unknown) => {
    const value = (emitter as { count?: unknown } | undefined)?.count;
    return typeof value === "number" ? value : 0;
  };
  const shared = globalThis as Record<symbol, unknown>;
  const legacy = process as unknown as Record<string, unknown>;
  return (
    count(shared[Symbol.for("signal-exit emitter")]) +
    count(legacy.__signal_exit_emitter__)
  );
}

/**
 * Stops the build when the process is told to stop, for as long as it runs.
 * The handler runs first and removes itself, so the listeners already there
 * act as if it had never been added. When one of them keeps the process
 * running (an embedding process), the handler only cancels: the step runner
 * rolls back once the running step settles, and the lock is released after
 * that. Otherwise the process should end with the signal: the handler
 * restores the previous output at once, releases the lock and, with no
 * listener left, re-raises the signal. The run and its snapshot stay for
 * the next build to replay. The lock does not: a dead owner's lock is taken
 * over only from the same host, which a new container or a renamed machine
 * is not. A signal-exit callback can still keep the process running; then
 * the runner restores again from that snapshot once the running step
 * settles.
 */
function stopOnSignal(session: BuildSession, ownsProcess: boolean): () => void {
  const stop = (signal: NodeJS.Signals) => {
    session.cancel(signal);
    remove();
    if (process.listenerCount(signal) > exitOnlyListeners()) return;
    session.rollback();
    if (ownsProcess) session.releaseLock();
    if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
  };
  const remove = () => {
    for (const signal of STOP_SIGNALS) process.removeListener(signal, stop);
  };
  for (const signal of STOP_SIGNALS) process.prependListener(signal, stop);
  return remove;
}

/**
 * Builds the package in the current directory: every step writes to a stage,
 * which replaces the output directory only when all of them succeed. A
 * failure, a refusal or a stop signal leaves the previous output and
 * compiler outputs as they were.
 */
export async function buildPackage(
  args: BuildArgs,
  options: BuildOptions = {},
): Promise<void> {
  const { outDir } = args;
  const projectRoot = process.cwd();
  const steps = options.steps ?? standardBuildSteps;
  const session = await openBuildSession({
    packageRoot: projectRoot,
    outDir,
    cleanedEntries: entriesCleanedBy(steps),
    // Only in the standard list does no step write those entries before
    // the bundle steps empty them, which seeding them by hard link needs.
    linkCleanedEntries: options.steps === undefined,
  });
  const stopListening = stopOnSignal(session, options.ownsProcess ?? false);
  try {
    const detectResult = await detect();
    const ctx: BuildContext = {
      args,
      projectRoot,
      outDir,
      agent: detectResult?.agent ?? "npm",
      session,
      checkDefinitions: options.checkDefinitions ?? false,
      pieces: planPieces(projectRoot, outDir),
      detection: createDetectionCache(),
      trace: createTraceFiles(),
      findings: {
        offersRoutes: false,
        typesOk: true,
        compilerOutputs: [],
        releaseStart: undefined,
        release: undefined,
        external: new Map(),
        pkg: undefined,
        built: [],
      },
    };
    await runBuildSteps(steps, ctx, session);
    // Last, so it is the line a finished build leaves on screen.
    if (!ctx.findings.typesOk) console.warn(`\n${UNSAFE_BUILD_WARNING}`);
  } finally {
    stopListening();
    session.rollback();
    session.close();
  }
}
