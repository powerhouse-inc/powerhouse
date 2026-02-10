import type { PGlite } from "@electric-sql/pglite";
import { REACTOR_SCHEMA } from "@powerhousedao/reactor/storage/migrations/migrator";

async function dropTablesInSchema(pg: PGlite, schema: string): Promise<void> {
  await pg.exec(`
DO $$
DECLARE
    _schemaname text := '${schema}';
    _tablename text;
BEGIN
    FOR _tablename IN SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = _schemaname LOOP
        RAISE INFO 'Dropping table %.%', _schemaname, _tablename;
        EXECUTE format('DROP TABLE %I.%I CASCADE;', _schemaname, _tablename);
    END LOOP;
    IF NOT FOUND THEN
        RAISE WARNING 'Schema % does not exist', _schemaname;
    END IF;
END $$;
`);
}

export async function dropAllTables(
  pg: PGlite,
  schema: string = REACTOR_SCHEMA,
): Promise<void> {
  await dropTablesInSchema(pg, schema);
}

export async function dropAllReactorStorage(pg: PGlite): Promise<void> {
  await dropTablesInSchema(pg, REACTOR_SCHEMA);

  // legacy
  await dropTablesInSchema(pg, "public");
}
