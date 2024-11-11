import { and, like } from "drizzle-orm";
import { PgDatabase } from "drizzle-orm/pg-core";
import { contributorBillAnalyzer } from "./schema";

export const resolvers = {
  Query: {
    compensation: async (
      _: null,
      {
        projectCode,
        token,
      }: { projectCode: string | undefined; token: string | undefined },
      { db }: { db: PgDatabase<any, any, any> }
    ) => {
      const query = db.select().from(contributorBillAnalyzer);

      let where;
      if (projectCode) {
        where = like(contributorBillAnalyzer.projectCode, `%${projectCode}%`);
      }

      if (token) {
        if (where) {
          where = and(where, like(contributorBillAnalyzer.token, `%${token}%`));
        } else {
          where = like(contributorBillAnalyzer.token, `%${token}%`);
        }
      }

      if (where) {
        query.where(where);
      }

      const results = await query;

      return results;
    },
  },
};
