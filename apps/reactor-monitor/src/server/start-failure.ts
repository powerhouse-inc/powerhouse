import type { SpawnHostError } from "@powerhousedao/host-core";

export type StartFailure = {
  message: string;
  phase: string;
  tail: string;
  /** What spawnHost saw, when `message` leads with a reason from the log. */
  context?: string;
};

const LEADS: Record<string, string> = {
  exited: "Stopped while starting",
  timeout: "Didn't finish starting",
  aborted: "Stopped before it was ready",
};

const ERROR_LINE = /^(?:[A-Z]\w*)?Error(?: \[[^\]]+\])?: (.+)$/;

// A killed native child's dying output, never the cause.
const NOISE = [
  /memory allocation of/,
  /bytes failed$/,
  /skipping backtrace/,
  /^Node\.js v\d/,
];

function noise(line: string): boolean {
  return NOISE.some((pattern) => pattern.test(line));
}

/** A log line (`[name] …`, `[12:00:00.00] …`, vite's `12:00:00 AM [vite] …`). */
function logLine(line: string): boolean {
  return /^\[|^\d{1,2}:\d{2}:\d{2}(?: [AP]M)? \[/.test(line);
}

/** The last `Error:` line, else the last plain line (ph run's failure). */
export function failureReason(tail: string): string | undefined {
  const lines = tail
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "" && !noise(line));
  for (const line of lines.toReversed()) {
    const match = ERROR_LINE.exec(line.trim());
    if (match) return match[1];
  }
  return lines
    .toReversed()
    .find(
      (line) =>
        !/^\s/.test(line) &&
        !logLine(line) &&
        !/^\s*(?:➜|at )/.test(line) &&
        !/^[\s^~]*$/.test(line),
    );
}

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** The reason first, the spawn sentence as context, without spawnHost's prefix. */
export function startFailure(error: SpawnHostError): StartFailure {
  const spawned = error.message
    .split("\n--- output tail ---\n")[0]
    .replace(/^spawnHost: /, "");
  const lead = LEADS[error.phase] ?? "Couldn't start";
  const reason = failureReason(error.outputTail);
  return reason
    ? {
        message: `${lead}: ${sentence(reason)}`,
        phase: error.phase,
        tail: error.outputTail,
        context: spawned,
      }
    : {
        message: `${lead}: ${spawned}`,
        phase: error.phase,
        tail: error.outputTail,
      };
}
