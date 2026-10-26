import type { ILogger } from "document-model";
import { sql, type Generated, type Kysely, type Transaction } from "kysely";

/** The permission tables, as reactor-api once kept them on the read-model store. */
export const PERMISSION_TABLES = [
  "DocumentPermission",
  "OperationUserPermission",
  "DocumentProtection",
] as const;

export type PermissionTable = (typeof PERMISSION_TABLES)[number];

/** What a read-model table is renamed to once its rows live in the reactor store. */
export const MIGRATED_TABLE_SUFFIX = "_migrated_2026_10_25";

export type PermissionTableCounts = Record<PermissionTable, number>;

export type PermissionBackfillOutcome =
  /** The read-model store never had the tables. */
  | { status: "fresh-install" }
  /** An earlier boot copied the rows and renamed the tables. */
  | { status: "already-backfilled" }
  /** Rows copied now, read-model tables renamed. */
  | { status: "copied"; counts: PermissionTableCounts }
  /** An earlier boot copied the rows but stopped before renaming. */
  | { status: "rename-completed"; counts: PermissionTableCounts }
  /** Left both stores untouched; the reason says what needs a person. */
  | { status: "refused"; reason: string };

interface DocumentPermissionRow {
  documentId: string;
  userAddress: string;
  permission: string;
  grantedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface OperationUserPermissionRow {
  documentId: string;
  operationType: string;
  userAddress: string;
  grantedBy: string;
  createdAt: Date;
}

interface DocumentProtectionRow {
  documentId: string;
  protected: boolean;
  ownerAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PermissionTablesDatabase {
  DocumentPermission: DocumentPermissionRow & { id: Generated<number> };
  OperationUserPermission: OperationUserPermissionRow & {
    id: Generated<number>;
  };
  DocumentProtection: DocumentProtectionRow;
}

const INSERT_BATCH_SIZE = 500;

/**
 * Moves the document permission rows from the read-model store into the
 * reactor store, once.
 *
 * Runs at boot after the reactor's migrations (029 creates the target tables)
 * and before the permission service serves a check. When the read-model
 * store still has the legacy tables and the reactor store's are empty, every
 * row is copied in one reactor-store transaction (ids are not carried: no
 * table references them, and the target's serial assigns fresh ones), then
 * the legacy tables are renamed to `<name>_migrated_2026_10_25` so the copy
 * cannot run again. The renamed tables are kept for a release.
 *
 * Idempotent across crashes: when the copy committed but the rename did not,
 * the next boot finds equal row counts on both sides and only renames. Any
 * other mix of rows on both sides is refused with a warning and both stores
 * are left as they are. Plain SQL throughout, so a PGlite or Postgres read
 * store behaves the same.
 */
export async function backfillPermissionTables(
  readModelDb: Kysely<unknown>,
  reactorDb: Kysely<unknown>,
  logger: ILogger,
): Promise<PermissionBackfillOutcome> {
  const source = readModelDb as Kysely<PermissionTablesDatabase>;
  const target = reactorDb as Kysely<PermissionTablesDatabase>;

  const present = await existingTables(source);
  const legacy = PERMISSION_TABLES.filter((table) => present.has(table));
  if (legacy.length === 0) {
    const migrated = PERMISSION_TABLES.some((table) =>
      present.has(migratedName(table)),
    );
    if (migrated) {
      logger.debug(
        "Permission tables backfill: already done; the read-model tables carry the " +
          MIGRATED_TABLE_SUFFIX +
          " suffix",
      );
      return { status: "already-backfilled" };
    }
    logger.debug(
      "Permission tables backfill: the read-model store has no permission tables; nothing to copy",
    );
    return { status: "fresh-install" };
  }

  const blocked = legacy.filter((table) => present.has(migratedName(table)));
  if (blocked.length > 0) {
    return refuse(
      logger,
      `the read-model store has both ${blocked.join(", ")} and ${blocked
        .map(migratedName)
        .join(", ")}; drop or rename one of each pair`,
    );
  }

  const legacyCounts = await countRows(source, present);
  const reactorCounts = await countRows(target, new Set(PERMISSION_TABLES));
  const reactorTotal = PERMISSION_TABLES.reduce(
    (sum, table) => sum + reactorCounts[table],
    0,
  );

  if (reactorTotal > 0) {
    if (!countsEqual(legacyCounts, reactorCounts)) {
      return refuse(
        logger,
        `the reactor store already has permission rows (${formatCounts(
          reactorCounts,
        )}) that differ from the read-model store's (${formatCounts(
          legacyCounts,
        )})`,
      );
    }
    await renameLegacyTables(source, legacy);
    logger.info(
      `Permission tables backfill: rows were copied by an earlier boot (${formatCounts(
        legacyCounts,
      )}); renamed the read-model tables to *${MIGRATED_TABLE_SUFFIX}`,
    );
    return { status: "rename-completed", counts: legacyCounts };
  }

  await target.transaction().execute(async (trx) => {
    if (present.has("DocumentPermission")) {
      await copyDocumentPermissions(source, trx);
    }
    if (present.has("OperationUserPermission")) {
      await copyOperationUserPermissions(source, trx);
    }
    if (present.has("DocumentProtection")) {
      await copyDocumentProtections(source, trx);
    }
    const copied = await countRows(trx, new Set(PERMISSION_TABLES));
    if (!countsEqual(copied, legacyCounts)) {
      throw new Error(
        `Permission tables backfill copied ${formatCounts(copied)} but the read-model store has ${formatCounts(legacyCounts)}; rolled back`,
      );
    }
  });
  await renameLegacyTables(source, legacy);
  logger.info(
    `Permission tables backfill: copied ${formatCounts(
      legacyCounts,
    )} from the read-model store to the reactor store; renamed the read-model tables to *${MIGRATED_TABLE_SUFFIX}`,
  );
  return { status: "copied", counts: legacyCounts };
}

function migratedName(table: PermissionTable): string {
  return `${table}${MIGRATED_TABLE_SUFFIX}`;
}

function refuse(logger: ILogger, reason: string): PermissionBackfillOutcome {
  logger.warn(
    `Permission tables backfill refused: ${reason}. Permission checks read the reactor store; both stores were left unchanged.`,
  );
  return { status: "refused", reason };
}

/** The permission tables, legacy or renamed, in the read-model store's own schema. */
async function existingTables(
  db: Kysely<PermissionTablesDatabase>,
): Promise<Set<string>> {
  const names = PERMISSION_TABLES.flatMap((table) => [
    table,
    migratedName(table),
  ]);
  const result = await sql<{ table_name: string }>`
    select table_name from information_schema.tables
    where table_schema = current_schema()
      and table_name in (${sql.join(names)})
  `.execute(db);
  return new Set(result.rows.map((row) => row.table_name));
}

async function countRows(
  db: Kysely<PermissionTablesDatabase> | Transaction<PermissionTablesDatabase>,
  tables: ReadonlySet<string>,
): Promise<PermissionTableCounts> {
  const counts: PermissionTableCounts = {
    DocumentPermission: 0,
    OperationUserPermission: 0,
    DocumentProtection: 0,
  };
  for (const table of PERMISSION_TABLES) {
    if (!tables.has(table)) continue;
    const row = await db
      .selectFrom(table)
      .select((eb) => eb.fn.countAll<string | number>().as("count"))
      .executeTakeFirstOrThrow();
    counts[table] = Number(row.count);
  }
  return counts;
}

function countsEqual(
  a: PermissionTableCounts,
  b: PermissionTableCounts,
): boolean {
  return PERMISSION_TABLES.every((table) => a[table] === b[table]);
}

function formatCounts(counts: PermissionTableCounts): string {
  return PERMISSION_TABLES.map((table) => `${table}=${counts[table]}`).join(
    ", ",
  );
}

async function copyDocumentPermissions(
  source: Kysely<PermissionTablesDatabase>,
  trx: Transaction<PermissionTablesDatabase>,
): Promise<void> {
  const rows: DocumentPermissionRow[] = await source
    .selectFrom("DocumentPermission")
    .select([
      "documentId",
      "userAddress",
      "permission",
      "grantedBy",
      "createdAt",
      "updatedAt",
    ])
    .orderBy("id")
    .execute();
  for (const batch of batches(rows)) {
    await trx.insertInto("DocumentPermission").values(batch).execute();
  }
}

async function copyOperationUserPermissions(
  source: Kysely<PermissionTablesDatabase>,
  trx: Transaction<PermissionTablesDatabase>,
): Promise<void> {
  const rows: OperationUserPermissionRow[] = await source
    .selectFrom("OperationUserPermission")
    .select([
      "documentId",
      "operationType",
      "userAddress",
      "grantedBy",
      "createdAt",
    ])
    .orderBy("id")
    .execute();
  for (const batch of batches(rows)) {
    await trx.insertInto("OperationUserPermission").values(batch).execute();
  }
}

async function copyDocumentProtections(
  source: Kysely<PermissionTablesDatabase>,
  trx: Transaction<PermissionTablesDatabase>,
): Promise<void> {
  const rows: DocumentProtectionRow[] = await source
    .selectFrom("DocumentProtection")
    .select([
      "documentId",
      "protected",
      "ownerAddress",
      "createdAt",
      "updatedAt",
    ])
    .orderBy("documentId")
    .execute();
  for (const batch of batches(rows)) {
    await trx.insertInto("DocumentProtection").values(batch).execute();
  }
}

function* batches<T>(rows: T[]): Generator<T[]> {
  for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
    yield rows.slice(start, start + INSERT_BATCH_SIZE);
  }
}

async function renameLegacyTables(
  db: Kysely<PermissionTablesDatabase>,
  tables: PermissionTable[],
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    for (const table of tables) {
      await sql`ALTER TABLE ${sql.id(table)} RENAME TO ${sql.id(
        migratedName(table),
      )}`.execute(trx);
    }
  });
}
