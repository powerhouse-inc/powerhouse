import { and, like } from "drizzle-orm";
import { PgDatabase } from "drizzle-orm/pg-core";
import { powtCompensation } from "./schema";

export const resolvers = {
  Query: {
    powtComp: async (root, args, ctx, info) => {
      console.log(root, args, ctx, info);
      const query = ctx.db.select().from(powtCompensation);

      let where;
      // if (projectCode) {
      //   where = like(powtCompensation.projectCode, `%${projectCode}%`);
      // }

      if (where) {
        query.where(where);
      }

      const results = await query;

      return results;
    },
  },
};
