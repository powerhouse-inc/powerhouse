---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/migrations.ts"
unless_exists: true
---
import { type IRelationalDb } from "document-drive"

export async function up(db: IRelationalDb<any>): Promise<void> {
  // Create table 
  await db.schema
    .createTable("todo")
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
