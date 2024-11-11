import {
  date,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
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

export const powtLineItem = pgTable(
  "powt_line_item",
  {
    id: uuid("id").notNull(),
    projectCode: text("projectCode").notNull(),
    amount: integer("amount").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
  })
);
