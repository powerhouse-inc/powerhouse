---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/migrations.ts"
force: true
---
import { type DB } from "./schema.js";
import { type IOperationalStore } from "document-drive/processors/types"

export async function up(db: IOperationalStore<DB>): Promise<void> {
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

export async function down(db: IOperationalStore<DB>): Promise<void> {
  // drop table
  await db.schema.dropTable("todo").execute();
}
