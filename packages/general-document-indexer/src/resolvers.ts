import { like, or } from "drizzle-orm";
import { getDb } from "../../index";
import { searchTable } from "./schema";

// provide separate search fields for query type
export const resolvers = {
  Query: {
    search: async (
      _: null,
      { title, type }: { title: string; type: string }
    ) => {
      const db = await getDb();
      const results: (typeof searchTable)[] = await db
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
