import { Subgraph } from "@powerhousedao/reactor-api";
import type { DocumentNode } from "graphql";
import { getResolvers } from "./resolvers.js";
import { schema } from "./schema.js";

export class VetraReadModelSubgraph extends Subgraph {
  name = "vetra-read-model";
  typeDefs: DocumentNode = schema;
  resolvers = getResolvers(this);
}
