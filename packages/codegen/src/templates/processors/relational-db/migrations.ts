import { ts } from "@tmpl/core";

export const relationalDbMigrationsTemplate = () =>
  ts`
import type { IRelationalDb } from "@powerhousedao/reactor-browser"

export async function up(db: IRelationalDb<any>): Promise<void> {
  // Create table 
  await db.schema
    .createTable("todo")
    // A document-id column: its rows are deleted with the document.
    .addColumn("document_id", "varchar(255)", (col) => col.notNull())
    .addColumn("task", "varchar(255)")
    .addColumn("status", "boolean")
    .addPrimaryKeyConstraint("todo_pkey", [
      "task"
    ])
    .ifNotExists()
    .execute();
}

export async function down(db: IRelationalDb<any>): Promise<void> {
  // drop table
  await db.schema.dropTable("todo").execute();
}
`.raw;
