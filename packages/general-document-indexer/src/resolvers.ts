import { like, or } from "drizzle-orm";
import { searchTable } from "./schema";
import { PgDatabase } from "drizzle-orm/pg-core";

export const resolvers = {
  Query: {
    search: async (
      _: null,
      { title, type }: { title: string; type: string },
      { db }: { db: PgDatabase<any, any, any> },
    ) => {
      const results = await db
        .select()
        .from(searchTable)
        .where(
          or(
            like(searchTable.title, `%${title}%`),
            like(searchTable.type, `%${type}%`),
          ),
        );

      return results.map((result) => ({
        driveId: result.driveId,
        documentId: result.documentId,
        title: result.title,
        type: result.type,
      }));
    },
  },
};
