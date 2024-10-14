import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm/relations";

export const bytea = customType({
  dataType: () => "bytea",
});

export const drivesTable = pgTable("Drive", {
  slug: text().primaryKey().notNull(),
  id: text().notNull(),
});

export const attachmentsTable = pgTable(
  "Attachment",
  {
    id: text()
      .primaryKey()
      .notNull()
      .$default(() => sql`gen_random_uuid()`),
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
        foreignColumns: [operationsTable.id],
        name: "Attachment_operationId_fkey",
      })
        .onUpdate("cascade")
        .onDelete("cascade"),
    };
  }
);

export const synchronizationUnitsTable = pgTable(
  "SynchronizationUnit",
  {
    id: text().notNull().primaryKey(), // sync Id
    driveId: text().notNull(),
    documentId: text().notNull(),
    scope: text().notNull(),
    branch: text().notNull(),
    version: integer().default(0).notNull(),
    revision: integer()
      .default(sql`'-1'`)
      .notNull(),
    lastModified: timestamp({ precision: 3, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => {
    return {
      driveIdDocumentIdScopeBranchRevisioIdx: uniqueIndex(
        "SynchronizationUnit_driveId_documentId_scope_branch_revisio_idx"
      ).using(
        "btree",
        table.driveId.asc().nullsLast(),
        table.documentId.asc().nullsLast(),
        table.scope.asc().nullsLast(),
        table.branch.asc().nullsLast(),
        table.revision.asc().nullsLast()
      ),
      driveIdSyncIdKey: uniqueIndex(
        "SynchronizationUnit_driveId_syncId_key"
      ).using(
        "btree",
        table.driveId.asc().nullsLast(),
        table.id.asc().nullsLast()
      ),
      synchronizationUnitDocumentIdDriveIdFkey: foreignKey({
        columns: [table.driveId, table.documentId],
        foreignColumns: [documentsTable.driveId, documentsTable.id],
        name: "SynchronizationUnit_documentId_driveId_fkey",
      })
        .onUpdate("cascade")
        .onDelete("cascade"),
    };
  }
);

export const documentsTable = pgTable(
  "Document",
  {
    id: text()
      .notNull()
      .$default(() => sql`gen_random_uuid()`),
    driveId: text().notNull(),
    created: timestamp({ precision: 3, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    lastModified: timestamp({ precision: 3, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    name: text(),
    initialState: text().notNull(),
    documentType: text().notNull(),
  },
  (table) => {
    return {
      driveIdIdx: index("Document_driveId_idx").using(
        "btree",
        table.driveId.asc().nullsLast()
      ),
      documentPkey: primaryKey({
        columns: [table.id, table.driveId],
        name: "Document_pkey",
      }),
    };
  }
);

export const operationsTable = pgTable(
  "Operation",
  {
    id: text()
      .primaryKey()
      .notNull()
      .$default(() => sql`gen_random_uuid()`),
    driveId: text().notNull(),
    documentId: text().notNull(),
    scope: text().notNull(),
    branch: text().notNull(),
    opId: text(),
    syncId: text().notNull(),
    index: integer().notNull(),
    skip: integer().notNull(),
    hash: text().notNull(),
    timestamp: timestamp({ precision: 3, mode: "string" }).notNull(),
    input: text().notNull(),
    type: text().notNull(),
    clipboard: boolean().default(false),
    context: jsonb(),
    resultingState: bytea(),
  },
  (table) => {
    return {
      driveIdDocumentIdScopeBranchIndexKey: uniqueIndex(
        "Operation_driveId_documentId_scope_branch_index_key"
      ).using(
        "btree",
        table.driveId.asc().nullsLast(),
        table.documentId.asc().nullsLast(),
        table.scope.asc().nullsLast(),
        table.branch.asc().nullsLast(),
        table.index.desc().nullsFirst()
      ),
      operationDriveIdDocumentIdScopeBranchFkey: foreignKey({
        columns: [table.syncId],
        foreignColumns: [synchronizationUnitsTable.id],
        name: "Operation_syncId_fkey",
      })
        .onUpdate("cascade")
        .onDelete("cascade"),
    };
  }
);
