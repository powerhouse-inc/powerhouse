import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("search_index")
    .addColumn("document_id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("document_type", "varchar(255)", (col) => col.notNull())
    .addColumn("title", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("content", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("tsv", sql`tsvector`)
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .ifNotExists()
    .execute();

  await sql`CREATE INDEX IF NOT EXISTS idx_search_tsv ON search_index USING GIN(tsv)`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_search_tsv").ifExists().execute();
  await db.schema.dropTable("search_index").ifExists().execute();
}
