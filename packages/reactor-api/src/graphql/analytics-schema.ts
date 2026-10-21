import {
  AnalyticsResolvers,
  typedefs,
} from "@powerhousedao/analytics-engine-graphql";
import {
  coordinatesOfResolverMap,
  normalizeCompatibility,
  typeKindsOfDocument,
} from "document-model/tooling";
import { gql } from "graphql-tag";
import type { CoreSubgraphSchema } from "./subgraph-types.js";

const typeDefs = gql`
  ${typedefs}
`;

export const analyticsSchema = {
  subgraphName: "analytics",
  typeDefs,
  resolverCoordinates: coordinatesOfResolverMap(
    AnalyticsResolvers as Readonly<Record<string, unknown>>,
    typeKindsOfDocument(
      normalizeCompatibility({
        kind: "graphql-ast-v1",
        typeDefs,
        resolverCoordinates: [],
      }).document,
    ),
  ),
} as const satisfies CoreSubgraphSchema;
