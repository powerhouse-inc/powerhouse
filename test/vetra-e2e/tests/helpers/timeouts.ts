import { reactorWorkerModeRequested } from "./fixtures.js";

// Capped short under PH_REACTOR_WORKER so worker hangs fail fast; OFF keeps the historical ceilings.
export const DESCRIBE_TIMEOUT = reactorWorkerModeRequested()
  ? 5 * 60 * 1000
  : 5 * 60 * 60 * 1000;

export const LONG_VISIBLE_TIMEOUT = reactorWorkerModeRequested()
  ? 90_000
  : 2 * 60 * 60 * 1000;
