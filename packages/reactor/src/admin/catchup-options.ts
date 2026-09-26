import { REACTOR_SCHEMA } from "../storage/migrations/migrator.js";

export type CatchUpCommand = "status" | "rescan";

/** What `pnpm catchup` reads and, for a rescan, what it lowers. */
export type CatchUpOptions = {
  command: CatchUpCommand;
  /** Postgres connection string. Mutually exclusive with `pglite`. */
  pg?: string;
  /** PGlite data directory. Mutually exclusive with `pg`. */
  pglite?: string;
  schema: string;
  /** rescan: lower every chosen cursor to at most this ordinal. */
  from?: number;
  /** rescan: ViewState read model ids or ProcessorCursor processor ids. */
  consumers: string[];
  /** rescan: every ViewState and ProcessorCursor row. */
  all: boolean;
  dryRun: boolean;
};

export const CATCHUP_EXIT = {
  done: 0,
  usage: 64,
  error: 68,
} as const;

export const CATCHUP_USAGE = `Read-side catch-up for a reactor store.

Usage:
  pnpm catchup status --pg <url> | --pglite <dir> [--schema reactor]
  pnpm catchup rescan --pg <url> | --pglite <dir> [--schema reactor] --from <ordinal>
                      (--consumer <id>... | --all) [--dry-run]

status   sequence head, a probe's settled value and the sessions it waits on, and
         every ViewState and ProcessorCursor row with its lag
rescan   lowers the chosen cursors to at most --from; a running reactor's next
         compare-and-set fails and the consumer replays from the lowered value

Exit codes:
  0   done
  64  bad arguments
  68  the run failed`;

/** Parses the operator's arguments, or throws with what is wrong. */
export function parseCatchUpOptions(argv: string[]): CatchUpOptions {
  if (argv.length === 0) {
    throw new Error("A command is required: status or rescan");
  }
  const [command, ...rest] = argv as [string, ...string[]];
  if (command !== "status" && command !== "rescan") {
    throw new Error(`Unknown command: ${command}`);
  }

  const options: CatchUpOptions = {
    command,
    schema: REACTOR_SCHEMA,
    consumers: [],
    all: false,
    dryRun: false,
  };

  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag === "--all") {
      options.all = true;
      continue;
    }
    if (flag === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (i + 1 >= rest.length || rest[i + 1]!.startsWith("--")) {
      throw new Error(`Missing value for ${flag}`);
    }
    const value = rest[i + 1]!;
    i++;
    switch (flag) {
      case "--pg":
        options.pg = value;
        break;
      case "--pglite":
        options.pglite = value;
        break;
      case "--schema":
        options.schema = value;
        break;
      case "--from": {
        const from = Number(value);
        if (!Number.isInteger(from) || from < 0) {
          throw new Error(`--from must be a non-negative integer: ${value}`);
        }
        options.from = from;
        break;
      }
      case "--consumer":
        options.consumers.push(value);
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  if (!options.pg && !options.pglite) {
    throw new Error("One of --pg or --pglite is required");
  }
  if (options.pg && options.pglite) {
    throw new Error("Pass only one of --pg or --pglite");
  }

  if (options.command === "rescan") {
    if (options.from === undefined) {
      throw new Error("rescan requires --from");
    }
    if (options.all === options.consumers.length > 0) {
      throw new Error("rescan requires exactly one of --consumer or --all");
    }
  } else if (
    options.from !== undefined ||
    options.all ||
    options.consumers.length > 0 ||
    options.dryRun
  ) {
    throw new Error("status takes no --from, --consumer, --all or --dry-run");
  }

  return options;
}
