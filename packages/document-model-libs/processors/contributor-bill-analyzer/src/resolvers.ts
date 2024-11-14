import { PgliteDatabase } from "drizzle-orm/pglite/driver";
import { powtCompensation } from "./schema";

export const resolvers = {
  Query: {
    powtComp: async (root, args, ctx, info) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const db = ctx.db as PgliteDatabase;
      const query = db.select().from(powtCompensation);

      let where;
      // if (projectCode) {
      //   where = like(powtCompensation.projectCode, `%${projectCode}%`);
      // }

      // if (where) {
      //   query.where(where);
      // }

      const results = await query;
      return results;
    },
  },
};
