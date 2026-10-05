// Piece console output, forwarded to the host while the step runs. The child
// is forked with its stdio discarded, so without this a piece's logs vanish.
import { format } from "node:util";
import { notifyHost } from "./host-call.js";
import { LOG_WRITE, type PieceLogEntry } from "./protocol.js";

// A runaway piece can log in a loop; the channel is shared with the step's own
// result, so both the size of an entry and the number of them are capped.

// Without the count, a loop enqueues IPC messages faster than the host drains
// them and the result waits behind the backlog until the step times out.
const MAX_MESSAGE_LENGTH = 8_192;
const MAX_ENTRIES_PER_REQUEST = 1_000;

const LEVELS = ["log", "info", "warn", "error", "debug"] as const;

type Level = (typeof LEVELS)[number];

// Installs the patch for one request and returns its undo. Logs written after
// the step returned belong to no step, which is why the scope is this narrow.
export function captureConsole(): () => void {
  const original = new Map<Level, (...args: unknown[]) => void>();
  let sent = 0;

  for (const level of LEVELS) {
    const previous = console[level] as (...args: unknown[]) => void;
    original.set(level, previous);
    console[level] = (...args: unknown[]) => {
      if (sent > MAX_ENTRIES_PER_REQUEST) return;
      sent += 1;
      // The last one says why the rest are missing, so a truncated log does
      // not read as a step that fell silent.
      const message =
        sent > MAX_ENTRIES_PER_REQUEST
          ? `[log truncated after ${MAX_ENTRIES_PER_REQUEST} entries]`
          : format(...args).slice(0, MAX_MESSAGE_LENGTH);
      notifyHost(LOG_WRITE, {
        level,
        message,
        at: Date.now(),
      } satisfies PieceLogEntry);
    };
  }

  return () => {
    for (const [level, previous] of original) {
      console[level] = previous as typeof console.log;
    }
  };
}
