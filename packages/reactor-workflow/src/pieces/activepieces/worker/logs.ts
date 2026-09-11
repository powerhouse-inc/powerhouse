// Piece console output, forwarded to the host while the step runs. The child
// is forked with its stdio discarded, so without this a piece's logs vanish.
import { format } from "node:util";
import { notifyHost } from "./host-call.js";
import { LOG_WRITE, type PieceLogEntry } from "./protocol.js";

// A runaway piece can log in a loop; the channel is shared with the step's own
// result, so one entry is capped rather than allowed to stall it.
const MAX_MESSAGE_LENGTH = 8_192;

const LEVELS = ["log", "info", "warn", "error", "debug"] as const;

type Level = (typeof LEVELS)[number];

// Installs the patch for one request and returns its undo. Logs written after
// the step returned belong to no step, which is why the scope is this narrow.
export function captureConsole(): () => void {
  const original = new Map<Level, (...args: unknown[]) => void>();

  for (const level of LEVELS) {
    const previous = console[level] as (...args: unknown[]) => void;
    original.set(level, previous);
    console[level] = (...args: unknown[]) => {
      const entry: PieceLogEntry = {
        level,
        message: format(...args).slice(0, MAX_MESSAGE_LENGTH),
        at: Date.now(),
      };
      notifyHost(LOG_WRITE, entry);
    };
  }

  return () => {
    for (const [level, previous] of original) {
      console[level] = previous as typeof console.log;
    }
  };
}
