import { PgDatabase } from "drizzle-orm/pg-core";
import { getState } from "./listener";
import { searchSchema } from "./db.schema";
import { like, or } from "drizzle-orm";

export const resolvers = {
  Query: {
    search: async (_, { query }, ctx) => {
      const db: PgDatabase = await getDb();
      const results = await db
        .select()
        .from(searchSchema)
        .where(
          or(
            like(searchSchema.label, `%${query}%`),
            like(searchSchema.description, `%${query}%`),
            like(searchSchema.objectId, `%${query}%`),
            like(searchSchema.driveId, `%${query}%`),
            like(searchSchema.documentId, `%${query}%`)
          )
        );

      return [...results];
    },
  },
};
