import { pgTable, primaryKey, text } from "drizzle-orm/pg-core";

export const searchSchema = pgTable(
  "searchTable",
  {
    driveId: text("driveId").notNull(),
    documentId: text("documentId").notNull(),
    objectId: text("objectId").notNull(),
    label: text("label").notNull(),
    description: text("description").notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.driveId, table.documentId, table.objectId],
    }),
  })
);
