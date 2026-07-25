import { PGlite } from "@electric-sql/pglite";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AttachmentBuilder } from "../../../src/attachment-builder.js";
import {
  ATTACHMENT_REFERENCE_MIGRATION_LOCK_TABLE,
  ATTACHMENT_REFERENCE_MIGRATION_TABLE,
  ATTACHMENT_REFERENCE_SCHEMA,
  getAttachmentReferenceMigrationStatus,
  rollbackAttachmentReferenceMigration,
  runAttachmentReferenceMigrations,
} from "../../../src/read-models/attachment-reference/storage/migrations/migrator.js";
import {
  ATTACHMENT_SCHEMA,
  runAttachmentMigrations,
} from "../../../src/storage/migrations/migrator.js";

describe("attachment reference migration lifecycle", () => {
  let db: Kysely<unknown>;

  beforeEach(() => {
    db = new Kysely<unknown>({ dialect: new PGliteDialect(new PGlite()) });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("uses the dedicated schema and frozen bookkeeping table names", async () => {
    const result = await runAttachmentReferenceMigrations(db);
    expect(result).toMatchObject({
      success: true,
      migrationsExecuted: ["001_create_attachment_reference_table"],
    });

    const tableNames = (await db.introspection.getTables())
      .filter((table) => table.schema === ATTACHMENT_REFERENCE_SCHEMA)
      .map((table) => table.name);
    expect(tableNames).toEqual(
      expect.arrayContaining([
        "attachment_reference",
        ATTACHMENT_REFERENCE_MIGRATION_TABLE,
        ATTACHMENT_REFERENCE_MIGRATION_LOCK_TABLE,
      ]),
    );
    expect(tableNames).not.toContain("kysely_migration");
    expect(tableNames).not.toContain("kysely_migration_lock");

    const attachments = await runAttachmentMigrations(db);
    expect(attachments.success).toBe(true);
    const attachmentTableNames = (await db.introspection.getTables())
      .filter((table) => table.schema === ATTACHMENT_SCHEMA)
      .map((table) => table.name);
    expect(attachmentTableNames).not.toContain(
      ATTACHMENT_REFERENCE_MIGRATION_TABLE,
    );
    expect(attachmentTableNames).not.toContain(
      ATTACHMENT_REFERENCE_MIGRATION_LOCK_TABLE,
    );

    const status = await getAttachmentReferenceMigrationStatus(db);
    expect(status).toHaveLength(1);
    expect(status[0]).toMatchObject({
      name: "001_create_attachment_reference_table",
    });
    expect(status[0].executedAt).toBeInstanceOf(Date);
  });

  it("rolls back only the dedicated relationship migration", async () => {
    await runAttachmentReferenceMigrations(db);
    const rollback = await rollbackAttachmentReferenceMigration(db);
    expect(rollback).toMatchObject({
      success: true,
      migrationsExecuted: ["001_create_attachment_reference_table"],
    });

    const tables = await db.introspection.getTables();
    expect(tables).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "attachment_reference",
          schema: ATTACHMENT_REFERENCE_SCHEMA,
        }),
      ]),
    );
    const status = await getAttachmentReferenceMigrationStatus(db);
    expect(status[0].executedAt).toBeUndefined();
  });

  it("normal AttachmentBuilder migrations do not create the relationship table", async () => {
    const attachments = await new AttachmentBuilder(
      db,
      "/tmp/attachment-reference-builder-isolation",
    ).build();
    attachments.destroy();

    const tables = await db.introspection.getTables();
    expect(tables).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "attachment_reference" }),
      ]),
    );
  });

  it("attachment migrations succeed when reference migrations fail", async () => {
    await db.schema.createSchema(ATTACHMENT_REFERENCE_SCHEMA).execute();
    await db
      .withSchema(ATTACHMENT_REFERENCE_SCHEMA)
      .schema.createTable("attachment_reference")
      .addColumn("collision", "text")
      .execute();

    const references = await runAttachmentReferenceMigrations(db);
    expect(references.success).toBe(false);
    const attachments = await runAttachmentMigrations(db);
    expect(attachments.success).toBe(true);
  });

  it("reference migrations succeed when attachment migrations fail", async () => {
    await db.schema.createSchema(ATTACHMENT_SCHEMA).execute();
    await db
      .withSchema(ATTACHMENT_SCHEMA)
      .schema.createTable("attachment")
      .addColumn("collision", "text")
      .execute();

    const attachments = await runAttachmentMigrations(db);
    expect(attachments.success).toBe(false);
    const references = await runAttachmentReferenceMigrations(db);
    expect(references.success).toBe(true);
  });
});
