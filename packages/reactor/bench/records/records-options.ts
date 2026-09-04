import { TASK_STATUSES } from "./task-schema.js";
import type { TaskStatus } from "./task-schema.js";

/**
 * Ordinals rather than bits: unlike the preflight sweeps, these outcomes are
 * mutually exclusive. 64 and 68 keep their preflight meaning so the two tools
 * read alike.
 */
export const RECORDS_EXIT = {
  ok: 0,
  invalidEntry: 1,
  corruptFile: 2,
  duplicateId: 3,
  notFound: 4,
  unmeasuredFix: 5,
  usage: 64,
  error: 68,
} as const;

export const RECORDS_USAGE = `Append-only records for the reactor bench. Every benchmark run and every
open item is a validated line in BENCHMARKS.jsonl or TASKS.jsonl, and this
tool is the only thing that writes them.

Usage:
  pnpm bench:records <subcommand> [args]

  add-benchmark <path|->       validate and append one BENCHMARKS.jsonl entry
  add-task <path|->            validate and append one TASKS.jsonl entry
  set-status <T-id> <STATUS>   set current status, appending a history event
  verify [--file benchmarks|tasks|all]
  show <B-id|T-id>

  --dir <path>     directory holding both files, resolved against the working
                   directory (default: bench)
  --note <text>    set-status metadata
  --commit <sha>   set-status metadata
  --at <iso>       set-status metadata, defaults to now
  --by <name>      set-status metadata
  --evidence <id>  set-status metadata, repeatable, B-nnn
  --id <id>        add-*: use this id instead of the next free one
  --dry-run        validate and report, write nothing
  --json           machine-readable result on stdout

A path reads one JSON object from disk; - reads it from stdin. The accepted
shape is narrower than the stored one: neither add- subcommand takes an id,
and add-task also synthesizes createdAt, status and the opening history event
when they are absent.

Statuses: ${TASK_STATUSES.join(", ")}. For a GAP, VERIFIED means the gap is
real and reproduced, FIXED means the measurement now exists and has been run,
and COMMITTED means it landed on main. REFUTED means someone tried to
reproduce the item and showed it does not hold; unlike reopening it as
UNVERIFIED, it records that the attempt was made.

Exit codes:
  0   the command succeeded
  1   the entry offered was rejected
  2   a file already on disk does not parse or does not verify
  3   the id is already taken
  4   no such id
  64  bad arguments
  68  the command failed`;

export const RECORDS_SUBCOMMANDS = [
  "add-benchmark",
  "add-task",
  "set-status",
  "verify",
  "show",
] as const;
export type RecordsSubcommand = (typeof RECORDS_SUBCOMMANDS)[number];

export const VERIFY_TARGETS = ["benchmarks", "tasks", "all"] as const;
export type VerifyTarget = (typeof VERIFY_TARGETS)[number];

export type AddOptions = {
  subcommand: "add-benchmark" | "add-task";
  /** A filesystem path, or "-" for stdin. */
  input: string;
  dir: string;
  /** Empty means allocate the next free id. */
  id: string;
  dryRun: boolean;
  json: boolean;
};

export type SetStatusOptions = {
  subcommand: "set-status";
  taskId: string;
  status: TaskStatus;
  note: string;
  commit: string;
  /** Empty means now. */
  at: string;
  by: string;
  evidence: string[];
  dir: string;
  dryRun: boolean;
  json: boolean;
};

export type VerifyOptions = {
  subcommand: "verify";
  target: VerifyTarget;
  dir: string;
  json: boolean;
};

export type ShowOptions = {
  subcommand: "show";
  id: string;
  dir: string;
  json: boolean;
};

export type RecordsOptions =
  | AddOptions
  | SetStatusOptions
  | VerifyOptions
  | ShowOptions;

const VALUE_FLAGS = [
  "--dir",
  "--id",
  "--note",
  "--commit",
  "--at",
  "--by",
  "--evidence",
  "--file",
] as const;

type ParsedArgv = {
  positionals: string[];
  values: Map<string, string>;
  evidence: string[];
  dryRun: boolean;
  json: boolean;
};

function splitArgv(argv: string[]): ParsedArgv {
  const parsed: ParsedArgv = {
    positionals: [],
    values: new Map<string, string>(),
    evidence: [],
    dryRun: false,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i];

    if (argument === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (argument === "--json") {
      parsed.json = true;
      continue;
    }
    if (argument === "-" || !argument.startsWith("--")) {
      parsed.positionals.push(argument);
      continue;
    }
    if (!VALUE_FLAGS.includes(argument as (typeof VALUE_FLAGS)[number])) {
      throw new Error(`Unknown argument: ${argument}`);
    }

    const value = argv.at(i + 1);
    if (value === undefined) {
      throw new Error(`Missing value for ${argument}`);
    }
    i += 1;

    if (argument === "--evidence") {
      parsed.evidence.push(value);
      continue;
    }
    parsed.values.set(argument, value);
  }

  return parsed;
}

function expectPositionals(
  parsed: ParsedArgv,
  subcommand: RecordsSubcommand,
  count: number,
  shape: string,
): void {
  if (parsed.positionals.length !== count) {
    throw new Error(`Usage: ${subcommand} ${shape}`);
  }
}

/** Flags are rejected where they do not apply rather than ignored: a caller
 * whose --id silently vanished would find out from the file, not the tool. */
function rejectFlags(parsed: ParsedArgv, flags: string[]): void {
  for (const flag of flags) {
    const passed =
      flag === "--evidence"
        ? parsed.evidence.length > 0
        : parsed.values.has(flag);
    if (passed) {
      throw new Error(`${flag} does not apply to this subcommand`);
    }
  }
}

/** Parses the caller's arguments, or throws with what is wrong. */
export function parseRecordsOptions(argv: string[]): RecordsOptions {
  const subcommand = argv.at(0);
  if (subcommand === undefined) {
    throw new Error("A subcommand is required");
  }
  if (!RECORDS_SUBCOMMANDS.includes(subcommand as RecordsSubcommand)) {
    throw new Error(`Unknown subcommand: ${subcommand}`);
  }

  const parsed = splitArgv(argv.slice(1));
  const dir = parsed.values.get("--dir") ?? "bench";

  if (subcommand === "add-benchmark" || subcommand === "add-task") {
    expectPositionals(parsed, subcommand, 1, "<path|->");
    rejectFlags(parsed, [
      "--note",
      "--commit",
      "--at",
      "--by",
      "--file",
      "--evidence",
    ]);
    return {
      subcommand,
      input: parsed.positionals[0],
      dir,
      id: parsed.values.get("--id") ?? "",
      dryRun: parsed.dryRun,
      json: parsed.json,
    };
  }

  if (subcommand === "set-status") {
    expectPositionals(parsed, subcommand, 2, "<T-id> <STATUS>");
    rejectFlags(parsed, ["--id", "--file"]);
    const status = parsed.positionals[1];
    if (!TASK_STATUSES.includes(status as TaskStatus)) {
      throw new Error(
        `Unknown status: ${status}. One of ${TASK_STATUSES.join(", ")}`,
      );
    }
    return {
      subcommand,
      taskId: parsed.positionals[0],
      status: status as TaskStatus,
      note: parsed.values.get("--note") ?? "",
      commit: parsed.values.get("--commit") ?? "",
      at: parsed.values.get("--at") ?? "",
      by: parsed.values.get("--by") ?? "",
      evidence: parsed.evidence,
      dir,
      dryRun: parsed.dryRun,
      json: parsed.json,
    };
  }

  if (subcommand === "verify") {
    expectPositionals(parsed, subcommand, 0, "[--file benchmarks|tasks|all]");
    rejectFlags(parsed, [
      "--id",
      "--note",
      "--commit",
      "--at",
      "--by",
      "--evidence",
    ]);
    const target = parsed.values.get("--file") ?? "all";
    if (!VERIFY_TARGETS.includes(target as VerifyTarget)) {
      throw new Error(
        `Unknown --file: ${target}. One of ${VERIFY_TARGETS.join(", ")}`,
      );
    }
    return {
      subcommand,
      target: target as VerifyTarget,
      dir,
      json: parsed.json,
    };
  }

  expectPositionals(parsed, "show", 1, "<B-id|T-id>");
  rejectFlags(parsed, [
    "--id",
    "--note",
    "--commit",
    "--at",
    "--by",
    "--file",
    "--evidence",
  ]);
  return {
    subcommand: "show",
    id: parsed.positionals[0],
    dir,
    json: parsed.json,
  };
}
