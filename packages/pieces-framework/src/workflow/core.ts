// The built-in piece every reactor serves: branch, assert and the triggers
// that belong to no service. Its version is the runtime's own.
import { ERROR_PORT, PIECE_ACTION_PORTS, TRIGGER_PORTS } from "./ports.js";

export const CORE_PIECE_NAME = "@powerhousedao/piece-core";

// The core branch action leaves on "true" or "false".
export const BRANCH_PORTS: readonly string[] = ["true", "false", ERROR_PORT];

// The core stop action ends the run, so it continues on no port.
export const STOP_PORTS: readonly string[] = [ERROR_PORT];

// A block's ports as known before its descriptor loads: fixed per kind, and
// the core branch's and stop's own.
export function knownPorts(block: {
  pieceName: string;
  kind: "action" | "trigger";
  name: string;
}): readonly string[] {
  if (block.kind === "trigger") return TRIGGER_PORTS;
  if (block.pieceName !== CORE_PIECE_NAME) return PIECE_ACTION_PORTS;
  if (block.name === "branch") return BRANCH_PORTS;
  if (block.name === "stop") return STOP_PORTS;
  return PIECE_ACTION_PORTS;
}
