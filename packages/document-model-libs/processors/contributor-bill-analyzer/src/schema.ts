import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const powtCompensation = pgTable(
  "powt_compensation",
  {
    projectCode: text("projectCode").notNull(),
    amount: integer("amount").notNull(),
    updatedAt: timestamp("updatedAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.projectCode],
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
