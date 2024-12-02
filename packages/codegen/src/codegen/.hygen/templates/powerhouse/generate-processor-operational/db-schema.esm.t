---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/src/db-schema.ts"
force: true
---
import { integer, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";

/**
 * The database schema for the processor.
 */
export const exampleTable = pgTable(
  "example_table",
  {
    id: uuid("id").notNull(),
    value: integer("value").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
  })
);
