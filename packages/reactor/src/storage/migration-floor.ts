import { sql } from "kysely";
import type { Kysely } from "kysely";
// Platform packages are versioned together, so this is the platform release.
import pkg from "../../package.json" with { type: "json" };

/** The release this build belongs to. */
export const PLATFORM_RELEASE: string = pkg.version;

/**
 * The oldest migration release this build boots on. A build that deletes a
 * one-shot migration raises it to the last release that still ran that
 * migration. "0.0.0" admits every store, recorded or not.
 */
export const MIGRATION_FLOOR = "0.0.0";

const MIGRATION_RELEASE_TABLE = "MigrationRelease";

/** What a store says about its one-shot migrations. */
export interface StoreMigrationState {
  /** No operation was ever written: there is nothing to migrate. */
  empty: boolean;
  /** The release that last completed its one-shot migrations, if recorded. */
  release?: string;
  completedAtUtcIso?: string;
}

/** The store is below the floor of the running release. */
export class MigrationFloorError extends Error {
  constructor(
    readonly storeRelease: string | undefined,
    readonly floor: string,
    readonly runningRelease: string,
  ) {
    super(
      `This store is below the migration floor of release ${runningRelease}: ` +
        `its one-shot migrations were last completed by ${
          storeRelease === undefined
            ? "no recorded release"
            : `release ${storeRelease}`
        }, and release ${runningRelease} needs ${floor} or later. ` +
        `Run release ${floor} on this store first, then start this release again.`,
    );
    this.name = "MigrationFloorError";
  }
}

type ParsedRelease = { core: number[]; pre: string[] };

function parseRelease(release: string): ParsedRelease | undefined {
  const match =
    /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
      release.trim(),
    );
  if (!match) return undefined;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ? match[4].split(".") : [],
  };
}

function comparePreRelease(a: string[], b: string[]): number {
  // A release orders after each of its pre-releases.
  if (a.length === 0 || b.length === 0) return b.length - a.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const [x, y] = [a[i], b[i]];
    if (x === y) continue;
    const [xNumeric, yNumeric] = [/^\d+$/.test(x), /^\d+$/.test(y)];
    if (xNumeric && yNumeric) return Number(x) - Number(y);
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return a.length - b.length;
}

/**
 * Semver precedence: negative when `a` orders before `b`, zero when equal,
 * positive when after. `6.3.0-dev.5 < 6.3.0-dev.10 < 6.3.0`; build metadata is
 * ignored. A string that is not a version orders before every version.
 */
export function compareReleases(a: string, b: string): number {
  const [x, y] = [parseRelease(a), parseRelease(b)];
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0);
  for (let i = 0; i < 3; i++) {
    if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  }
  return comparePreRelease(x.pre, y.pre);
}

/** Reads the store's migration state. Safe before any migration has run. */
export async function readMigrationState(
  db: Kysely<any>,
  schema: string,
): Promise<StoreMigrationState> {
  const tables = await sql<{ table_name: string }>`
    select table_name from information_schema.tables
    where table_schema = ${schema}
      and table_name in ('Operation', ${MIGRATION_RELEASE_TABLE})
  `.execute(db);
  const present = new Set(tables.rows.map((row) => row.table_name));
  const scoped = db.withSchema(schema);

  const empty =
    !present.has("Operation") ||
    (await scoped
      .selectFrom("Operation")
      .select("id")
      .limit(1)
      .executeTakeFirst()) === undefined;

  if (!present.has(MIGRATION_RELEASE_TABLE)) return { empty };
  const record = await scoped
    .selectFrom(MIGRATION_RELEASE_TABLE)
    .select(["release", "completedAtUtcIso"])
    .where("id", "=", 1)
    .executeTakeFirst();
  return {
    empty,
    release: record?.release as string | undefined,
    completedAtUtcIso: record?.completedAtUtcIso as string | undefined,
  };
}

/**
 * Refuses a store whose migration release is below `floor`. Runs before the
 * schema migrations, so a refused store is left exactly as the release named
 * in the error expects it.
 *
 * An empty store passes: it has nothing to migrate. A store with operations
 * and no record counts as below every floor above "0.0.0". A store recorded
 * by a newer release than the running one passes.
 */
export async function checkMigrationFloor(
  db: Kysely<any>,
  schema: string,
  floor: string = MIGRATION_FLOOR,
  runningRelease: string = PLATFORM_RELEASE,
): Promise<StoreMigrationState> {
  const state = await readMigrationState(db, schema);
  if (state.empty) return state;
  if (compareReleases(state.release ?? "0.0.0", floor) < 0) {
    throw new MigrationFloorError(state.release, floor, runningRelease);
  }
  return state;
}

/**
 * Records that `release` completed its one-shot migrations on this store.
 * Never lowers the record: a store a newer release already ran on keeps that
 * release. Safe to call from several reactors on one store at once.
 *
 * Returns false, writing nothing, when the store has no record table yet (a
 * host that runs the schema migrations itself has not applied 032).
 */
export async function recordMigrationRelease(
  db: Kysely<any>,
  schema: string,
  release: string = PLATFORM_RELEASE,
): Promise<boolean> {
  const tables = await sql`
    select 1 from information_schema.tables
    where table_schema = ${schema} and table_name = ${MIGRATION_RELEASE_TABLE}
  `.execute(db);
  if (tables.rows.length === 0) return false;

  const scoped = db.withSchema(schema);
  const completedAtUtcIso = new Date().toISOString();
  await scoped
    .insertInto(MIGRATION_RELEASE_TABLE)
    .values({ id: 1, release, completedAtUtcIso })
    .onConflict((oc) => oc.column("id").doNothing())
    .execute();

  // Raised by compare-and-swap. A lost swap means another writer raised the
  // record; the loop ends when the record is at or above `release`.
  for (;;) {
    const current = await scoped
      .selectFrom(MIGRATION_RELEASE_TABLE)
      .select("release")
      .where("id", "=", 1)
      .executeTakeFirst();
    if (!current) return false;
    if (compareReleases(release, current.release as string) <= 0) return true;
    const raised = await scoped
      .updateTable(MIGRATION_RELEASE_TABLE)
      .set({ release, completedAtUtcIso })
      .where("id", "=", 1)
      .where("release", "=", current.release)
      .returning("release")
      .execute();
    if (raised.length > 0) return true;
  }
}
