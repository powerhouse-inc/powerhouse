import { pgTable, primaryKey, text } from "drizzle-orm/pg-core";

export const searchTable = pgTable(
  "searchTable",
  {
    driveId: text().notNull(),
    documentId: text().notNull(),
    objectId: text().notNull(),
    label: text().notNull(),
    description: text().notNull(),
  },
  (table) => {
    return {
      searchTableDriveIdDocumentIdObjectIdPk: primaryKey({
        columns: [table.driveId, table.documentId, table.objectId],
        name: "searchTable_driveId_documentId_objectId_pk",
      }),
    };
  },
);
