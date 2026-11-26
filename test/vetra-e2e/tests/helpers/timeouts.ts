import { reactorWorkerModeRequested } from "./fixtures.js";

// Capped short under PH_REACTOR_WORKER so worker hangs fail fast. OFF fits its slowest test (117.5 s, the
// consumer project's install, on the green run of 11-25) and stops a hang long before the CI job's 30 minutes.
export const DESCRIBE_TIMEOUT = reactorWorkerModeRequested()
  ? 5 * 60 * 1000
  : 4 * 60 * 1000;

export const LONG_VISIBLE_TIMEOUT = reactorWorkerModeRequested()
  ? 90_000
  : 2 * 60 * 1000;
