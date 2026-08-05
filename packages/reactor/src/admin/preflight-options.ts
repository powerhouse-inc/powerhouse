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

export const PREFLIGHT_USAGE = `Pre-flight for authEnforcement. Sweeps stored streams and reports
the ones the auth projection could not walk, or that the monotonic rule would
refuse to replicate.

Usage:
  pnpm preflight:auth --pg <connection-string> [--scope auth] [--schema reactor]
  pnpm preflight:auth --pglite <data-directory> [--scope auth] [--schema reactor]

The target is required: this reads a fleet's own store, and defaulting to a
fresh in-memory database would report every fleet as safe.`;

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
