import { PGlite } from "@electric-sql/pglite";
import type { PGlite as PGliteType } from "@electric-sql/pglite";
import { AtomicNodeFs } from "@powerhousedao/pglite-fs";
import type { Knex } from "knex";
import knex from "knex";
import ClientPgLite from "knex-pglite";
import { type Generated, Kysely } from "kysely";
import { KyselyKnexDialect, PGColdDialect } from "kysely-knex";
import fs from "node:fs";
import path from "node:path";

/**
 * Permission levels for documents:
 * - READ: Can fetch and read the document
 * - WRITE: Can push updates and modify the document
 * - ADMIN: Can manage document permissions and settings
 */
export type DocumentPermissionLevel = "READ" | "WRITE" | "ADMIN";

/**
 * Database schema for document permissions
 */
export interface DocumentProtectionTable {
  documentId: string;
  protected: boolean;
  ownerAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentPermissionDatabase {
  DocumentPermission: DocumentPermissionTable;
  Group: GroupTable;
  UserGroup: UserGroupTable;
  DocumentGroupPermission: DocumentGroupPermissionTable;
  OperationUserPermission: OperationUserPermissionTable;
  OperationGroupPermission: OperationGroupPermissionTable;
  DocumentProtection: DocumentProtectionTable;
}

export interface DocumentPermissionTable {
  id: Generated<number>;
  documentId: string;
  userAddress: string;
  permission: DocumentPermissionLevel;
  grantedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Group management tables
export interface GroupTable {
  id: Generated<number>;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserGroupTable {
  userAddress: string;
  groupId: number;
  createdAt: Date;
}

export interface DocumentGroupPermissionTable {
  id: Generated<number>;
  documentId: string;
  groupId: number;
  permission: DocumentPermissionLevel;
  grantedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Operation permission tables
export interface OperationUserPermissionTable {
  id: Generated<number>;
  documentId: string;
  operationType: string;
  userAddress: string;
  grantedBy: string;
  createdAt: Date;
}

export interface OperationGroupPermissionTable {
  id: Generated<number>;
  documentId: string;
  operationType: string;
  groupId: number;
  grantedBy: string;
  createdAt: Date;
}

type Db = Kysely<any>;

function isPG(connectionString: string) {
  if (
    connectionString.startsWith("postgresql://") ||
    connectionString.startsWith("postgres://")
  ) {
    return true;
  }
  return false;
}

/**
 * Optional factory used by callers (e.g. Switchboard) to inject a
 * version-specific PGLite instance — e.g. `pglite-legacy-02` when an existing
 * data dir was created with an older PG major. Wire-compatible with the
 * current PGLite class for the surface knex-pglite uses.
 */
export type PgliteFactory = (
  connectionString: string | undefined,
) => PGliteType;

export interface DbClient {
  db: Db;
  knex: Knex;
  pglite: PGliteType | undefined;
}

/**
 * Cache of DB clients keyed by connection string. Reactor-api's read-model
 * layer wires analytics, attachments, and document-permissions as separate
 * consumers but they all target the same logical database (one postgres
 * instance, many schemas). Without caching:
 *   - PGlite: two `new PGlite(samePath)` calls mean two embedded postgres
 *     processes contending for the same data dir, racing shutdown syncs
 *     and silently losing writes — a correctness bug.
 *   - Postgres: each consumer opens an independent pool against the same
 *     backend — wasteful but correct.
 * Caching by connection string returns the same knex/PGlite pair to every
 * consumer so writes coexist in one MemoryFS and one atomic snapshot, and
 * postgres callers get connection-pool dedup for free.
 *
 * Entries are evicted from inside the wrapped `knex.destroy()` below, so a
 * teardown + re-init in the same process (tests, hot-reloads) constructs
 * a fresh client instead of returning a closed pool.
 */
const IN_MEMORY_CACHE_KEY = Symbol("getDbClient:in-memory");
type CacheKey = string | typeof IN_MEMORY_CACHE_KEY;
const dbClientCache = new Map<CacheKey, DbClient>();

export function getDbClient(
  connectionString: string | undefined = undefined,
  pgliteFactory?: PgliteFactory,
): DbClient {
  const cacheKey: CacheKey = connectionString ?? IN_MEMORY_CACHE_KEY;
  const cached = dbClientCache.get(cacheKey);
  if (cached) return cached;

  const isPg = connectionString && isPG(connectionString);
  const client = isPg ? "pg" : (ClientPgLite as typeof knex.Client);
  const pgliteInstance: PGliteType | undefined = isPg
    ? undefined
    : pgliteFactory
      ? pgliteFactory(connectionString)
      : connectionString
        ? new PGlite({ fs: new AtomicNodeFs(connectionString) })
        : new PGlite();
  const connection = isPg ? { connectionString } : { pglite: pgliteInstance };

  // If path is not postgres then it is a filesystem path.
  // Ensures parent directory is created.
  if (connectionString && !isPg) {
    const dirPath = path.resolve(connectionString, "..");
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  const knexInstance = knex({
    client,
    connection,
  });

  const kyselyInstance = new Kysely({
    dialect: new KyselyKnexDialect({
      knex: knexInstance,
      kyselySubDialect: new PGColdDialect(),
    }),
  });

  const dbClient: DbClient = {
    db: kyselyInstance,
    knex: knexInstance,
    pglite: pgliteInstance,
  };

  // Wrap knex.destroy so closing the client also drops the cache entry.
  // Works for both PGlite (which has a `closed` flag) and raw Postgres
  // pools (which don't), and keeps the Map from accumulating dead entries
  // when callers cycle through many distinct paths. `destroy` lives on
  // the Knex prototype as a read-only method, so use defineProperty to
  // shadow it on this instance.
  const originalDestroy = knexInstance.destroy.bind(knexInstance);
  Object.defineProperty(knexInstance, "destroy", {
    configurable: true,
    writable: true,
    value: async (...args: unknown[]) => {
      if (dbClientCache.get(cacheKey) === dbClient) {
        dbClientCache.delete(cacheKey);
      }
      return originalDestroy(...(args as []));
    },
  });

  dbClientCache.set(cacheKey, dbClient);
  return dbClient;
}

export const initAnalyticsStoreSql = [
  `create table if not exists "AnalyticsSeries"
  (
    id     serial       primary key,
    source varchar(255) not null,
    start  timestamp    not null,
    "end"  timestamp,
    metric varchar(255) not null,
    value  real         not null,
    unit   varchar(255),
    fn     varchar(255) not null,
    params json
  );`,
  `create unique index if not exists "AnalyticsSeries_pkey"
    on "AnalyticsSeries" (id);`,
  `create index if not exists analyticsseries_end_index
      on "AnalyticsSeries" ("end");`,
  `create index if not exists analyticsseries_fn_index
      on "AnalyticsSeries" (fn);`,
  `create index if not exists analyticsseries_metric_index
      on "AnalyticsSeries" (metric);`,
  `create index if not exists analyticsseries_source_index
      on "AnalyticsSeries" (source);`,
  `create index if not exists analyticsseries_start_index
      on "AnalyticsSeries" (start);`,
  `create index if not exists analyticsseries_unit_index
      on "AnalyticsSeries" (unit);`,
  `create index if not exists analyticsseries_value_index
      on "AnalyticsSeries" (value);`,
  `create table if not exists "AnalyticsDimension"
  (
    id          serial        primary key,
    dimension   varchar(255)  not null,
    path        varchar(255)  not null,
    label       varchar(255),
    icon        varchar(1000),
    description text
  );`,
  `create unique index if not exists "AnalyticsDimension_pkey"
    on "AnalyticsDimension" (id);`,
  `create index if not exists analyticsdimension_dimension_index
      on "AnalyticsDimension" (dimension);`,
  `create index if not exists analyticsdimension_path_index
      on "AnalyticsDimension" (path);`,
  `create table if not exists "AnalyticsSeries_AnalyticsDimension"
  (
    "seriesId"    integer not null
      constraint analyticsseries_analyticsdimension_seriesid_foreign
        references "AnalyticsSeries"
        on delete cascade,
    "dimensionId" integer not null
      constraint analyticsseries_analyticsdimension_dimensionid_foreign
        references "AnalyticsDimension"
        on delete cascade
  );`,
  `create index if not exists analyticsseries_analyticsdimension_dimensionid_index
    on "AnalyticsSeries_AnalyticsDimension" ("dimensionId");`,
  `create index if not exists analyticsseries_analyticsdimension_seriesid_index
      on "AnalyticsSeries_AnalyticsDimension" ("seriesId");`,
];
