import { like, or } from "drizzle-orm";
import { getDb } from "../../db";
import { searchTable } from "./schema";

export const resolvers = {
  Query: {
    search: async (_: null, { query }: { query: string }) => {
      const db = await getDb();
      const results = await db
        .select()
        .from(searchTable)
        .where(
          or(
            like(searchTable.label, `%${query}%`),
            like(searchTable.type, `%${query}%`),
            like(searchTable.objectId, `%${query}%`),
            like(searchTable.driveId, `%${query}%`),
            like(searchTable.documentId, `%${query}%`)
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
