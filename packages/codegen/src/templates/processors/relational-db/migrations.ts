import { ts } from "@tmpl/core";

export const relationalDbMigrationsTemplate = () =>
  ts`
import type { IRelationalDb } from "@powerhousedao/reactor-browser"

export async function up(db: IRelationalDb<any>): Promise<void> {
  // One row per document; replace it with your own tables.
  await db.schema
    .createTable("documents")
    // A document-id column: its rows are deleted with the document.
    .addColumn("document_id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("document_type", "varchar(255)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(32)", (col) => col.notNull())
    .ifNotExists()
    .execute();
}

export async function down(db: IRelationalDb<any>): Promise<void> {
  // drop table
  await db.schema.dropTable("documents").execute();
}
`.raw;
