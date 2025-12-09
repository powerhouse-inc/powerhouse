import type { PGlite } from "@electric-sql/pglite";

export async function dropAllTables(pg: PGlite): Promise<void> {
  await pg.exec(`
DO $$
DECLARE
    _schemaname text := 'public';
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
