import { type IRelationalDb } from "document-drive/processors/types";

/**
 * Database migration for TodoList processor
 * Following the exact pattern from the RelationalDbProcessor documentation
 */

export async function up(db: IRelationalDb<any>): Promise<void> {
  // Create todo table following documentation schema
  await db.schema
    .createTable("todo")
    .addColumn("task", "varchar(255)") // Task description (operation ID + type)
    .addColumn("status", "boolean") // Completion status
    .addPrimaryKeyConstraint("todo_pkey", ["task"]) // Primary key on task
    .ifNotExists() // Only create if doesn't exist
    .execute();
}

export async function down(db: IRelationalDb<any>): Promise<void> {
  // Drop table when processor is removed
  await db.schema.dropTable("todo").execute();
}