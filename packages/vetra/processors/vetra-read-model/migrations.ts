import { type IRelationalDbLegacy } from "document-drive";

export async function up(db: IRelationalDbLegacy<any>): Promise<void> {
  // Create vetra_package table to store VetraPackage document state
  await db.schema
    .createTable("vetra_package")
    .addColumn("document_id", "varchar(255)", (col) => col.primaryKey()) // VetraPackage state fields
    .addColumn("name", "varchar(255)")
    .addColumn("description", "text")
    .addColumn("category", "varchar(255)")
    .addColumn("author_name", "varchar(255)")
    .addColumn("author_website", "varchar(512)")
    .addColumn("keywords", "text") // JSON array of {id, label}
    .addColumn("github_url", "varchar(512)")
    .addColumn("npm_url", "varchar(512)")
    .addColumn("drive_id", "varchar(255)")
    // Document metadata
    .addColumn("last_operation_index", "integer", (col) => col.notNull())
    .addColumn("last_operation_hash", "varchar(255)", (col) => col.notNull())
    .addColumn("last_operation_timestamp", "timestamptz", (col) =>
      col.notNull(),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo("now()"),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo("now()"),
    )
    .ifNotExists()
    .execute();

  // Create indexes for common queries
  await db.schema
    .createIndex("idx_vetra_package_document_id")
    .on("vetra_package")
    .column("document_id")
    .ifNotExists()
    .execute();

  await db.schema
    .createIndex("idx_vetra_package_name")
    .on("vetra_package")
    .column("name")
    .ifNotExists()
    .execute();

  await db.schema
    .createIndex("idx_vetra_package_category")
    .on("vetra_package")
    .column("category")
    .ifNotExists()
    .execute();
}

export async function down(db: IRelationalDbLegacy<any>): Promise<void> {
  // Drop indexes first
  await db.schema.dropIndex("idx_vetra_package_category").ifExists().execute();
  await db.schema.dropIndex("idx_vetra_package_name").ifExists().execute();
  await db.schema
    .dropIndex("idx_vetra_package_document_id")
    .ifExists()
    .execute();

  // Drop table
  await db.schema.dropTable("vetra_package").ifExists().execute();
}
