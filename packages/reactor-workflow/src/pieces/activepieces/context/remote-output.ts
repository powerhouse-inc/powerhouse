// ctx.output.update: the piece reporting progress before it returns. A long
// step is otherwise opaque until the moment it finishes.
import { notifyHost } from "../worker/host-call.js";
import { jsonSafe } from "../worker/json-safe.js";
import { OUTPUT_UPDATE } from "../worker/protocol.js";

export interface PartialOutput {
  update(output: unknown): Promise<void>;
}

// Resolves immediately: a tap the step waits on is a tap that can stall it,
// which is the one thing plan/08 §7.8 rules out.
export class RemoteOutput implements PartialOutput {
  update(output: unknown): Promise<void> {
    notifyHost(OUTPUT_UPDATE, jsonSafe(output));
    return Promise.resolve();
  }
}
