import { and, eq, like } from "drizzle-orm";
import { contributorBillAnalyzer } from "./schema";
import { PgDatabase } from "drizzle-orm/pg-core";

export const resolvers = {
  Query: {
    compensation: async (
      _: null,
      { projectCode, token }: { projectCode: string; token: string },
      { db }: { db: PgDatabase<any, any, any> }
    ) => {
      const results = await db
        .select()
        .from(contributorBillAnalyzer)
        .where(
          and(
            projectCode
              ? like(contributorBillAnalyzer.projectCode, `%${projectCode}%`)
              : undefined,
            token
              ? like(contributorBillAnalyzer.token, `%${token}%`)
              : undefined
          )
        );

      return results;
    },
  },
};
