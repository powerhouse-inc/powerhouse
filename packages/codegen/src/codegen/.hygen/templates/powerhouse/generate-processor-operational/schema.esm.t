---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/src/schema.ts"
force: true
---
import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const exampleTable = pgTable(
  "example_table",
  {
    id: uuid("id").notNull(),
    value: text("value").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
  })
);