// The piece child's entry: the piece worker, plus ctx.reactor over the reactor
// RPC. Both listeners go on in this one synchronous evaluation.
import { flushCompileCache } from "node:module";
import { startPieceWorker } from "../pieces/activepieces/worker/entry.js";
import { installWorkerReactor } from "./reactor.js";

startPieceWorker();
installWorkerReactor();
// The host SIGKILLs a child, which skips the exit that writes NODE_COMPILE_CACHE.
flushCompileCache();

// --cpu-prof writes on exit, which SIGTERM's default action skips.
if (process.execArgv.includes("--cpu-prof")) {
  process.once("SIGTERM", () => process.exit(0));
}
