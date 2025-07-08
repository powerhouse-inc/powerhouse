---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/migrations.ts"
force: true
---
import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
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

  const tables = await db.introspection.getTables();
  console.log(tables);
}

export async function down(db: Kysely<any>): Promise<void> {
  // drop table
  await db.schema.dropTable("todo").execute();
}
