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

/** A sentence ph run printed, not progress (`…`), a URL banner or a brace. */
function plain(line: string): boolean {
  return (
    !logLine(line) &&
    /[a-z]/i.test(line) &&
    !/(?:\.\.\.|…)$/.test(line) &&
    !/^[➜{}[\]]/.test(line)
  );
}

/** The last line only: an uncaught error past its stack, else ph run's failure. */
export function failureReason(tail: string): string | undefined {
  const lines = tail
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "" && !noise(line));
  let at = lines.length - 1;
  while (at >= 0 && (/^\s/.test(lines[at]) || /^[}\]]$/.test(lines[at]))) {
    at -= 1;
  }
  if (at < 0) return undefined;
  const error = ERROR_LINE.exec(lines[at]);
  if (error) return error[1];
  return at === lines.length - 1 && plain(lines[at]) ? lines[at] : undefined;
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
  // A run that timed out or was stopped printed no failure of its own.
  const reason =
    error.phase === "exited" ? failureReason(error.outputTail) : undefined;
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
