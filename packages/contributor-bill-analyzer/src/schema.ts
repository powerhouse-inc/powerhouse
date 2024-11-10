import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const contributorBillAnalyzer = pgTable(
  "contributor_bill_analyzer",
  {
    projectCode: text("projectCode").notNull(),
    amount: integer("amount").notNull(),
    token: text("token").notNull(),
    updatedAt: timestamp("updatedAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.projectCode, table.token],
    }),
  })
);
