import { type BuildStep, BuildStopped, orderBuildSteps } from "./steps.js";

/** What the runner replaces the output with, or puts back. */
export type StepSession = {
  readonly commit: () => void;
  readonly rollback: () => void;
  /** The signal that cancelled the build, if one did. */
  readonly stopped: () => string | undefined;
};

function throwIfStopped(session: StepSession): void {
  const signal = session.stopped();
  if (signal === undefined) return;
  session.rollback();
  throw new BuildStopped(signal);
}

/**
 * Runs the steps in order, commits, then runs the `committed` steps. When a
 * step before the commit throws, `rollback` runs before the error goes on to
 * the caller, so nothing the build wrote outlives the failure. A committed
 * step's throw goes to the caller with the new output in place. A stop is
 * seen once the running step settles, and before each step and the commit:
 * no step starts after it, and the rollback waits for the step it stopped.
 */
export async function runBuildSteps<C>(
  steps: readonly BuildStep<C>[],
  ctx: C,
  session: StepSession,
): Promise<void> {
  const ordered = orderBuildSteps(steps);
  for (const step of ordered.filter(({ when }) => when !== "committed")) {
    throwIfStopped(session);
    try {
      await step.run(ctx);
    } catch (error) {
      session.rollback();
      throwIfStopped(session);
      throw error;
    }
  }
  throwIfStopped(session);
  session.commit();
  for (const step of ordered.filter(({ when }) => when === "committed")) {
    throwIfStopped(session);
    await step.run(ctx);
  }
}
