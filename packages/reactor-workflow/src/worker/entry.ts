// The piece child's entry: the piece worker, plus ctx.reactor over the reactor
// RPC. Both listeners go on in this one synchronous evaluation.
import { startPieceWorker } from "../pieces/activepieces/worker/entry.js";
import { installWorkerReactor } from "./reactor.js";

startPieceWorker();
installWorkerReactor();
