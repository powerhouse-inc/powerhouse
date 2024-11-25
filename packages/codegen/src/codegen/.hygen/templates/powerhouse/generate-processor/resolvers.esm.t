---
to: "<%= rootDir %>/processors/<%= h.changeCase.param(name) %>/src/resolvers.ts"
force: true
---
import { and, like } from "drizzle-orm";
import { PgDatabase } from "drizzle-orm/pg-core";
import { exampleTable } from "./schema";

export const resolvers = {
  Query: {
    example: async (root, args, ctx, info) => {
      const results = await ctx.db.select().from(exampleTable);
      return results;
    },
  },
};