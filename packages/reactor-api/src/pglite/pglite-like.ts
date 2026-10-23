import type { QueryOptions, Results } from "@electric-sql/pglite";

/**
 * The PGlite surface the stores use (knex-pglite, kysely-pglite-dialect,
 * HardenedPGliteDialect and the closers). A PGlite instance meets it, and so
 * does the worker-backed `ThreadedPGlite` stand-in.
 */
export interface PGliteLike {
  readonly waitReady: Promise<void>;
  readonly ready: boolean;
  readonly closed: boolean;
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
    options?: QueryOptions,
  ): Promise<Results<T>>;
  exec(sql: string, options?: QueryOptions): Promise<Results[]>;
  isInTransaction(): boolean;
  close(): Promise<void>;
  /** HardenedPGliteDialect's admission hook; see `ThreadedPGlite.admit`. */
  admit?<T>(run: () => Promise<T>): Promise<T>;
}
