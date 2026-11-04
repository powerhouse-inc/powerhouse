import type { SpawnHostError } from "@powerhousedao/host-core";

export type StartFailure = {
  message: string;
  phase: string;
  tail: string;
  /** What spawnHost saw, when `message` leads with a line from the log. */
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

// Words a failure says; progress and status lines ("catch-up: … 0%") don't.
const FAILURE_WORDS =
  /\b(?:error|errors|fail(?:s|ed|ure)?|refused|denied|EADDRINUSE|EACCES|ENOENT|already in use|cannot|can't|could not|couldn't|unable to|not found|no such|invalid|missing|timed out)\b/i;

/** A line saying what failed: not a log, progress or status line. */
function failureLine(line: string): boolean {
  return (
    !logLine(line) &&
    FAILURE_WORDS.test(line) &&
    !/\d\s?%/.test(line) &&
    !/(?:\.\.\.|…)$/.test(line) &&
    !/^[➜{}[\]]/.test(line)
  );
}

/** The last line only: an uncaught error past its stack, else a failure line. */
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
  return at === lines.length - 1 && failureLine(lines[at])
    ? lines[at]
    : undefined;
}

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

const LAST_LINE_MAX = 200;

// spawnHost's own notes in the tail, not the run's output.
const SPAWN_NOTES = /^(?:logFile|onOutput): /;

/** Where a run that never got ready stopped printing. */
export function lastOutput(tail: string): string | undefined {
  const line = tail
    .split("\n")
    .map((each) => each.trimEnd())
    .findLast(
      (each) =>
        each.trim() !== "" &&
        !noise(each) &&
        !SPAWN_NOTES.test(each) &&
        !/^\s/.test(each) &&
        !/^[{}[\]]$/.test(each),
    );
  if (!line) return undefined;
  return line.length > LAST_LINE_MAX
    ? `${line.slice(0, LAST_LINE_MAX - 1)}…`
    : line;
}

/** The reason first, the spawn sentence as context, without spawnHost's prefix. */
export function startFailure(error: SpawnHostError): StartFailure {
  const spawned = error.message
    .split("\n--- output tail ---\n")[0]
    .replace(/^spawnHost: /, "");
  const lead = LEADS[error.phase] ?? "Couldn't start";
  const last =
    error.phase === "timeout" ? lastOutput(error.outputTail) : undefined;
  if (last) {
    return {
      message: `${lead}: its last output was "${last}".`,
      phase: error.phase,
      tail: error.outputTail,
      context: spawned,
    };
  }
  // A stopped run, or one that printed nothing, has no failure of its own.
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
