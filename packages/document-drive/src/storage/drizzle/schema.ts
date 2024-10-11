import {
  pgTable,
  text,
  boolean,
  jsonb,
  foreignKey,
  uniqueIndex,
  integer,
  timestamp,
  primaryKey,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Custom type for bytea from https://stackoverflow.com/a/76499742
const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const listener = pgTable("Listener", {
  listenerId: text().primaryKey().notNull(),
  driveId: text().notNull(),
  label: text(),
  block: boolean().notNull(),
  system: boolean().notNull(),
  filter: jsonb().notNull(),
  callInfo: jsonb().notNull(),
});

export const drive = pgTable("Drive", {
  slug: text().primaryKey().notNull(),
  id: text().notNull(),
});

export const attachment = pgTable(
  "Attachment",
  {
    id: text().primaryKey().notNull(),
    operationId: text().notNull(),
    mimeType: text().notNull(),
    data: text().notNull(),
    filename: text(),
    extension: text(),
    hash: text().notNull(),
  },
  (table) => {
    return {
      attachmentOperationIdFkey: foreignKey({
        columns: [table.operationId],
        foreignColumns: [operation.id],
        name: "Attachment_operationId_fkey",
      })
        .onUpdate("cascade")
        .onDelete("cascade"),
    };
  },
);

export const operation = pgTable(
  "Operation",
  {
    id: text().primaryKey().notNull(),
    opId: text(),
    driveId: text().notNull(),
    documentId: text().notNull(),
    scope: text().notNull(),
    branch: text().notNull(),
    index: integer().notNull(),
    skip: integer().notNull(),
    hash: text().notNull(),
    timestamp: timestamp({ precision: 3, mode: "string" }).notNull(),
    input: text().notNull(),
    type: text().notNull(),
    syncId: text(),
    clipboard: boolean().default(false),
    context: jsonb(),
    // TODO: failed to parse database type 'bytea'
    resultingState: bytea("resultingState"),
  },
  (table) => {
    return {
      driveIdDocumentIdScopeBranchIndexKey: uniqueIndex(
        "Operation_driveId_documentId_scope_branch_index_key",
      ).using(
        "btree",
        table.driveId.asc().nullsLast(),
        table.documentId.asc().nullsLast(),
        table.scope.asc().nullsLast(),
        table.branch.asc().nullsLast(),
        table.index.asc().nullsLast(),
      ),
      operationDriveIdDocumentIdFkey: foreignKey({
        columns: [table.driveId, table.documentId],
        foreignColumns: [document.id, document.driveId],
        name: "Operation_driveId_documentId_fkey",
      })
        .onUpdate("cascade")
        .onDelete("cascade"),
      operationSyncIdDriveIdFkey: foreignKey({
        columns: [table.driveId, table.syncId],
        foreignColumns: [syncronizationUnit.id, syncronizationUnit.driveId],
        name: "Operation_syncId_driveId_fkey",
      })
        .onUpdate("cascade")
        .onDelete("cascade"),
    };
  },
);

export const syncronizationUnit = pgTable(
  "SyncronizationUnit",
  {
    id: text().notNull(),
    driveId: text().notNull(),
    documentId: text().notNull(),
    scope: text().notNull(),
    branch: text().notNull(),
  },
  (table) => {
    return {
      syncronizationUnitDocumentIdDriveIdFkey: foreignKey({
        columns: [table.driveId, table.documentId],
        foreignColumns: [document.id, document.driveId],
        name: "SyncronizationUnit_documentId_driveId_fkey",
      })
        .onUpdate("cascade")
        .onDelete("cascade"),
      syncronizationUnitPkey: primaryKey({
        columns: [table.id, table.driveId],
        name: "SyncronizationUnit_pkey",
      }),
    };
  },
);

export const document = pgTable(
  "Document",
  {
    id: text().notNull(),
    driveId: text().notNull(),
    created: timestamp({ precision: 3, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    lastModified: timestamp({ precision: 3, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    revision: text().notNull(),
    name: text(),
    initialState: text().notNull(),
    documentType: text().notNull(),
  },
  (table) => {
    return {
      documentPkey: primaryKey({
        columns: [table.id, table.driveId],
        name: "Document_pkey",
      }),
    };
  },
);
