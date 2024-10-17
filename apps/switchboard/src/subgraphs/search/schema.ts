import { pgTable, primaryKey, text } from "drizzle-orm/pg-core";

export const searchTable = pgTable(
  "searchTable",
  {
    driveId: text("driveId").notNull(),
    documentId: text("documentId").notNull(),
    objectId: text("objectId").notNull(),
    label: text("label").notNull(),
    type: text("type").notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.driveId, table.documentId, table.objectId],
    }),
  })
);
