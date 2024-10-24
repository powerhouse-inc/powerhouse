import { like, or } from "drizzle-orm";
import { searchTable } from "./schema";
import { PgDatabase } from "drizzle-orm/pg-core";

// provide separate search fields for query type
export const resolvers = {
  Query: {
    search: async (
      _: null,
      { title, type }: { title: string; type: string },
      db: PgDatabase<any, any, any>
    ) => {
      const results = await db
        .select()
        .from(searchTable)
        .where(
          or(
            like(searchTable.label, `%${title}%`),
            like(searchTable.type, `%${type}%`)
          )
        );

      return results.map((result) => ({
        driveId: result.driveId,
        documentId: result.documentId,
        objectId: result.objectId,
        label: result.label,
        type: result.type,
      }));
    },
  },
};
