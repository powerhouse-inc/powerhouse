import { pgTable, primaryKey, text } from "drizzle-orm/pg-core";

export const searchTable = pgTable(
  "searchTable",
  {
    driveId: text("driveId").notNull(),
    documentId: text("documentId").notNull(),
    title: text("title").notNull(),
    type: text("type").notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.driveId, table.documentId],
    }),
  }),
);
