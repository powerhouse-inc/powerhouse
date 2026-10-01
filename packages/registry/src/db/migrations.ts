import type { Database, Queryable } from "./database.js";

// Serializes migrations across replicas and workers starting together
const MIGRATION_LOCK_ID = 7_446_517_101;

// A statement, or a step that decides which statements to run
type Step = string | ((q: Queryable) => Promise<void>);

interface Migration {
  id: number;
  name: string;
  /** False runs each step on its own, for CONCURRENTLY; steps must be rerunnable */
  transaction?: boolean;
  statements: Step[];
}

// A failed concurrent build leaves an INVALID index that IF NOT EXISTS would keep
function indexConcurrently(name: string, definition: string): Step[] {
  return [
    async (q) => {
      const index = await q.query<{ valid: boolean }>(
        "SELECT indisvalid AS valid FROM pg_index WHERE indexrelid = to_regclass($1)",
        [name],
      );
      if (index.rows[0]?.valid === false) {
        await q.query(`DROP INDEX CONCURRENTLY IF EXISTS ${name}`);
      }
    },
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name} ${definition}`,
  ];
}

const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "registry state",
    statements: [
      // Accounts and ownership predate migrations, hence IF NOT EXISTS
      `CREATE TABLE IF NOT EXISTS registry_users (
        username      text PRIMARY KEY,
        password_hash text NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS registry_package_owners (
        package_name text PRIMARY KEY,
        owners       text[] NOT NULL,
        claimed_at   timestamptz NOT NULL DEFAULT now()
      )`,
      // One row per package the registry has processed a version of
      `CREATE TABLE registry_packages (
        name       text PRIMARY KEY,
        local      boolean NOT NULL DEFAULT false,
        dist_tags  jsonb NOT NULL DEFAULT '{}',
        versions   jsonb NOT NULL DEFAULT '[]',
        times      jsonb NOT NULL DEFAULT '{}',
        latest     text,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE registry_versions (
        package        text NOT NULL,
        version        text NOT NULL,
        status         text NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
        manifest       jsonb,
        package_json_version text,
        files          jsonb NOT NULL DEFAULT '[]',
        error          text,
        updated_at     timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (package, version)
      )`,
      // A piece name belongs to the first package that shipped it
      `CREATE TABLE registry_piece_owners (
        name       text PRIMARY KEY,
        package    text NOT NULL,
        claimed_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE registry_pieces (
        name            text NOT NULL,
        version         text NOT NULL,
        package         text NOT NULL,
        display_name    text NOT NULL,
        description     text,
        descriptor      jsonb,
        descriptor_path text NOT NULL,
        bundle_file     text NOT NULL,
        bundle_key      text,
        published_at    timestamptz,
        is_latest       boolean NOT NULL DEFAULT false,
        PRIMARY KEY (name, version)
      )`,
      "CREATE INDEX registry_pieces_package ON registry_pieces (package, version)",
      "CREATE INDEX registry_pieces_bundle ON registry_pieces (bundle_file)",
      // version is '' for jobs about a whole package
      `CREATE TABLE registry_jobs (
        id         bigserial PRIMARY KEY,
        kind       text NOT NULL,
        package    text NOT NULL,
        version    text NOT NULL DEFAULT '',
        payload    jsonb NOT NULL DEFAULT '{}',
        attempts   integer NOT NULL DEFAULT 0,
        run_after  timestamptz NOT NULL DEFAULT now(),
        locked_by  text,
        locked_at  timestamptz,
        requeued   boolean NOT NULL DEFAULT false,
        last_error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (kind, package, version)
      )`,
      `CREATE TABLE registry_webhooks (
        endpoint   text PRIMARY KEY,
        headers    jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
    ],
  },
  {
    id: 2,
    name: "job priority",
    statements: [
      // Lower runs first: publishes and on-demand work ahead of sweeps
      "ALTER TABLE registry_jobs ADD COLUMN priority integer NOT NULL DEFAULT 0",
      "CREATE INDEX registry_jobs_due ON registry_jobs (priority, id)",
    ],
  },
  {
    id: 3,
    name: "search",
    statements: [
      // Trusted since Postgres 13: the database owner can create it
      "CREATE EXTENSION IF NOT EXISTS pg_trgm",
      // Declared IMMUTABLE so generated columns can call them; concat_ws is
      // only STABLE because of its variadic "any" signature
      `CREATE OR REPLACE FUNCTION registry_search_name(pkg text, m jsonb) RETURNS text
        LANGUAGE sql IMMUTABLE PARALLEL SAFE
        AS $$ SELECT lower(concat_ws(' ', pkg, m->>'name')) $$`,
      // Description plus every module's and the publisher's name and id
      `CREATE OR REPLACE FUNCTION registry_search_text(m jsonb) RETURNS text
        LANGUAGE sql IMMUTABLE PARALLEL SAFE
        AS $$ SELECT lower(concat_ws(' ', m->>'description',
          (SELECT string_agg(x #>> '{}', ' ')
             FROM jsonb_path_query(m, 'lax $.*[*].name') x),
          (SELECT string_agg(x #>> '{}', ' ')
             FROM jsonb_path_query(m, 'lax $.*[*].id') x))) $$`,
      `CREATE OR REPLACE FUNCTION registry_search_doc(pkg text, m jsonb) RETURNS text
        LANGUAGE sql IMMUTABLE PARALLEL SAFE
        AS $$ SELECT concat_ws(' ', registry_search_name(pkg, m),
          registry_search_text(m)) $$`,
      `CREATE OR REPLACE FUNCTION registry_piece_search_name(
          name text, display_name text, d jsonb) RETURNS text
        LANGUAGE sql IMMUTABLE PARALLEL SAFE
        AS $$ SELECT lower(concat_ws(' ', name, display_name,
          d->>'displayName')) $$`,
      `CREATE OR REPLACE FUNCTION registry_piece_search_doc(
          name text, display_name text, description text, d jsonb) RETURNS text
        LANGUAGE sql IMMUTABLE PARALLEL SAFE
        AS $$ SELECT concat_ws(' ',
          registry_piece_search_name(name, display_name, d),
          lower(coalesce(d->>'description', description))) $$`,
      // A package's listed version, kept by recomputeLatest, so listing and
      // search read one row per package instead of joining every version
      `ALTER TABLE registry_packages
        ADD COLUMN listed_manifest jsonb,
        ADD COLUMN listed_package_json_version text,
        ADD COLUMN search_doc text GENERATED ALWAYS AS
          (registry_search_doc(name, listed_manifest)) STORED,
        ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (
          setweight(to_tsvector('english',
            coalesce(registry_search_name(name, listed_manifest), '')), 'A') ||
          setweight(to_tsvector('english',
            coalesce(registry_search_text(listed_manifest), '')), 'B')) STORED`,
      // Absent manifests and descriptors were stored as the JSON value null
      `UPDATE registry_versions SET manifest = NULL
        WHERE jsonb_typeof(manifest) = 'null'`,
      `UPDATE registry_pieces SET descriptor = NULL
        WHERE jsonb_typeof(descriptor) = 'null'`,
      `UPDATE registry_packages p
          SET listed_manifest = v.manifest,
              listed_package_json_version = v.package_json_version
         FROM registry_versions v
        WHERE v.package = p.name AND v.version = p.latest
          AND v.status = 'ready' AND v.manifest IS NOT NULL`,
      `ALTER TABLE registry_pieces
        ADD COLUMN search_doc text GENERATED ALWAYS AS
          (registry_piece_search_doc(name, display_name, description, descriptor)) STORED,
        ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (
          setweight(to_tsvector('english',
            coalesce(registry_piece_search_name(name, display_name, descriptor), '')), 'A') ||
          setweight(to_tsvector('english',
            coalesce(descriptor->>'description', description, '')), 'B')) STORED`,
    ],
  },
  {
    id: 4,
    name: "write ordering",
    statements: [
      // The packument's time.modified; older snapshots don't overwrite newer
      "ALTER TABLE registry_packages ADD COLUMN modified timestamptz",
      // Unpublished versions stay retired: caches hold their files for a year
      `CREATE TABLE registry_unpublished (
        package        text NOT NULL,
        version        text NOT NULL,
        unpublished_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (package, version)
      )`,
      // A small, high-churn queue: vacuum after a fixed number of dead rows
      `ALTER TABLE registry_jobs SET (autovacuum_vacuum_scale_factor = 0,
        autovacuum_vacuum_threshold = 500)`,
    ],
  },
  {
    id: 5,
    name: "search indexes",
    transaction: false,
    statements: [
      // Partial: only listed packages and latest pieces are ever searched
      ...indexConcurrently(
        "registry_packages_search_trgm",
        `ON registry_packages USING gin (search_doc gin_trgm_ops)
          WHERE local AND listed_manifest IS NOT NULL`,
      ),
      ...indexConcurrently(
        "registry_packages_search_tsv",
        `ON registry_packages USING gin (search_tsv)
          WHERE local AND listed_manifest IS NOT NULL`,
      ),
      ...indexConcurrently(
        "registry_pieces_search_trgm",
        "ON registry_pieces USING gin (search_doc gin_trgm_ops) WHERE is_latest",
      ),
      ...indexConcurrently(
        "registry_pieces_search_tsv",
        "ON registry_pieces USING gin (search_tsv) WHERE is_latest",
      ),
      ...indexConcurrently(
        "registry_pieces_latest",
        "ON registry_pieces (package) WHERE is_latest",
      ),
      // Bundles are looked up by piece name and version now
      "DROP INDEX CONCURRENTLY IF EXISTS registry_pieces_bundle",
    ],
  },
  {
    id: 6,
    name: "reconcile by revision",
    transaction: false,
    statements: [
      // The storage plugin's manifest revision the last sync applied
      "ALTER TABLE registry_packages ADD COLUMN IF NOT EXISTS manifest_rev text",
      // Pending versions are few; reconcile looks for stranded ones
      ...indexConcurrently(
        "registry_versions_pending",
        "ON registry_versions (updated_at) WHERE status = 'pending'",
      ),
    ],
  },
];

const MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS registry_migrations (
  id         integer PRIMARY KEY,
  name       text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;
// Fail fast rather than queue every reader behind a blocked ALTER
const LOCK_TIMEOUT = "5s";

async function appliedIds(q: Queryable): Promise<Set<number>> {
  const table = await q.query<{ exists: boolean }>(
    "SELECT to_regclass('registry_migrations') IS NOT NULL AS exists",
  );
  if (!table.rows[0]?.exists) return new Set();
  const applied = await q.query<{ id: number }>(
    "SELECT id FROM registry_migrations",
  );
  return new Set(applied.rows.map((row) => row.id));
}

async function runSteps(
  q: Queryable,
  migration: Migration,
  embedded: boolean,
): Promise<void> {
  for (const step of migration.statements) {
    if (typeof step === "function") await step(q);
    // PGlite has no concurrent builds, and no other session to block
    else await q.query(embedded ? step.replace(/ CONCURRENTLY/g, "") : step);
  }
  await q.query("INSERT INTO registry_migrations (id, name) VALUES ($1, $2)", [
    migration.id,
    migration.name,
  ]);
}

// Lock waiters poll instead of blocking: a concurrent index build waits for
// every transaction with a snapshot, including one blocked on the lock
const LOCK_POLL_MS = 500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function applyInTransaction(
  db: Database,
  migration: Migration,
): Promise<void> {
  for (;;) {
    const locked = await db.transaction(async (tx) => {
      const lock = await tx.query<{ ok: boolean }>(
        "SELECT pg_try_advisory_xact_lock($1) AS ok",
        [MIGRATION_LOCK_ID],
      );
      if (!lock.rows[0]?.ok) return false;
      await tx.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
      await tx.query(MIGRATIONS_TABLE);
      if (!(await appliedIds(tx)).has(migration.id)) {
        await runSteps(tx, migration, db.embedded);
      }
      return true;
    });
    if (locked) return;
    await sleep(LOCK_POLL_MS);
  }
}

// A session lock excludes transactional migrators too: both share the key
async function applyOnline(db: Database, migration: Migration): Promise<void> {
  await db.session(async (s) => {
    for (;;) {
      const lock = await s.query<{ ok: boolean }>(
        "SELECT pg_try_advisory_lock($1) AS ok",
        [MIGRATION_LOCK_ID],
      );
      if (lock.rows[0]?.ok) break;
      await sleep(LOCK_POLL_MS);
    }
    try {
      await s.query(`SET lock_timeout = '${LOCK_TIMEOUT}'`);
      await s.query(MIGRATIONS_TABLE);
      if ((await appliedIds(s)).has(migration.id)) return;
      await runSteps(s, migration, false);
    } finally {
      await s.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
    }
  });
}

/** Applies pending migrations; any number of processes may run it at once. */
export async function migrate(db: Database): Promise<void> {
  const applied = await appliedIds(db);
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    if (migration.transaction === false && !db.embedded) {
      await applyOnline(db, migration);
    } else {
      await applyInTransaction(db, migration);
    }
  }
}

/** Migrations this build needs that the database hasn't applied. */
export async function pendingMigrations(
  db: Queryable,
): Promise<{ id: number; name: string }[]> {
  const applied = await appliedIds(db);
  return MIGRATIONS.filter((m) => !applied.has(m.id)).map(({ id, name }) => ({
    id,
    name,
  }));
}

// Newer migrations than this build knows are fine: they must stay compatible
// with the previous release, which still runs during a rollout
export async function checkSchema(db: Queryable): Promise<void> {
  const pending = await pendingMigrations(db);
  if (pending.length === 0) return;
  const list = pending.map((m) => `${m.id} (${m.name})`).join(", ");
  throw new Error(
    `the registry database is missing migration(s) ${list}; run \`ph-registry migrate\` first, or set PH_REGISTRY_MIGRATE_ON_BOOT=true`,
  );
}

/** Whether to migrate at boot: the flag, else the env, else only for PGlite. */
export function migrateOnBoot(
  explicit: boolean | undefined,
  databaseUrl: string | undefined,
): boolean {
  if (explicit !== undefined) return explicit;
  const env = process.env.PH_REGISTRY_MIGRATE_ON_BOOT;
  if (env === "true" || env === "false") return env === "true";
  return !databaseUrl;
}

/** Migrates, or checks the schema is current and refuses to start if not. */
export function prepareSchema(db: Database, migrateNow: boolean) {
  return migrateNow ? migrate(db) : checkSchema(db);
}
