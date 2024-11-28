---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/src/resolvers.ts"
force: true
---
import { exampleTable } from "./db-schema";

/**
 * The resolvers for the processor.
 */
export const resolvers = {
  Query: {
    example: async (root, args, ctx, info) => {
      const results = await ctx.db.select().from(exampleTable);
      return results;
    },
  },
};
