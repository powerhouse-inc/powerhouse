import { REACTOR_SCHEMA } from "../storage/migrations/migrator.js";

/** Where `pnpm preflight:auth` reads from, and what it sweeps. */
export type PreflightOptions = {
  /** Postgres connection string. Mutually exclusive with `pglite`. */
  pg?: string;
  /** PGlite data directory. Mutually exclusive with `pg`. */
  pglite?: string;
  scope: string;
  schema: string;
};

/**
 * Exit codes. The two sweeps gate different flags, so they get different bits:
 * an operator turning on authEnforcement must not be blocked by a finding that
 * only concerns authConditions. The codes meaning nothing was checked are
 * multiples of four, so they carry neither finding bit -- a gate reading a
 * missing bit would otherwise take a run that died for a fleet that is clean.
 */
export const PREFLIGHT_EXIT = {
  clean: 0,
  streamOrderUnsafe: 1,
  versionsUnsafe: 2,
  usage: 64,
  error: 68,
} as const;

export const PREFLIGHT_USAGE = `Pre-flight for authEnforcement. Sweeps stored streams and reports
the ones the auth projection could not walk, or that the monotonic rule would
refuse to replicate.

Usage:
  pnpm preflight:auth --pg <connection-string> [--scope auth] [--schema reactor]
  pnpm preflight:auth --pglite <data-directory> [--scope auth] [--schema reactor]

The target is required: this reads a fleet's own store, and defaulting to a
fresh in-memory database would report every fleet as safe.

Exit codes:
  0   both sweeps clean
  1   streams unsafe for authEnforcement
  2   documents unsafe for authConditions
  3   both
  64  bad arguments
  68  the run failed, nothing was checked

Gate on a whole code, not on a bit: a run that died reports no bits, and that
is not a clean fleet. authEnforcement is safe on 0 or 2, authConditions on
0 or 1.`;

/**
 * Parses the operator's arguments, or throws with what is wrong.
 *
 * A target is required rather than defaulted. The tool exists to gate a
 * rollout, so a run that quietly inspected an empty database would report every
 * fleet as safe -- the one answer it must never give by accident.
 */
export function parsePreflightOptions(argv: string[]): PreflightOptions {
  const options: PreflightOptions = { scope: "auth", schema: REACTOR_SCHEMA };

  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined) {
      throw new Error(`Missing value for ${flag}`);
    }
    switch (flag) {
      case "--pg":
        options.pg = value;
        break;
      case "--pglite":
        options.pglite = value;
        break;
      case "--scope":
        options.scope = value;
        break;
      case "--schema":
        options.schema = value;
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

  return options;
}

/** Combines the two sweeps' findings into the bits a rollout gate reads. */
export function preflightExitCode(
  streamOrderFailures: number,
  documentVersionFailures: number,
): number {
  return (
    (streamOrderFailures > 0 ? PREFLIGHT_EXIT.streamOrderUnsafe : 0) |
    (documentVersionFailures > 0 ? PREFLIGHT_EXIT.versionsUnsafe : 0)
  );
}
