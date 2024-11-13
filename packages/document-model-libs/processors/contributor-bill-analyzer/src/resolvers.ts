import { powtCompensation } from "./schema";

export const resolvers = {
  Query: {
    powtComp: async (root, args, ctx, info) => {
      const query = ctx.db.select().from(powtCompensation);

      let where;
      // if (projectCode) {
      //   where = like(powtCompensation.projectCode, `%${projectCode}%`);
      // }

      if (where) {
        query.where(where);
      }

      const results = await query;
      console.log("RESULTS", JSON.stringify(results, null, 2));

      return results;
    },
  },
};
