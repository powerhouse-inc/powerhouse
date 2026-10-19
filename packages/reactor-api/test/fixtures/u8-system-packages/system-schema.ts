import { gql } from "graphql-tag";
import type { CoreSubgraphSchema } from "../../../src/graphql/subgraph-types.js";

const systemTypeDefs = gql`
  type SystemInfo {
    version: String!
    gitHash: String!
    gitUrl: String
  }

  type Query {
    system: SystemInfo!
  }
`;

export const systemSchema = {
  subgraphName: "system",
  typeDefs: systemTypeDefs,
  resolverCoordinates: [
    { typeName: "Query", fieldName: "system", resolverKind: "field" },
  ],
} as const satisfies CoreSubgraphSchema;
