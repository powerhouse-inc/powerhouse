import {
  AnalyticsResolvers as resolvers,
  typedefs as typeDefs,
} from "@powerhousedao/analytics-engine-graphql";
import { createSchema } from "./db.js";
import { Knex } from "knex";

export { resolvers, typeDefs };

export async function initialize(knex: Knex) {
  await createSchema(knex);
}
