import {
  coordinatesOfResolverMap,
  normalizeCompatibility,
  typeKindsOfDocument,
} from "document-model/tooling";
import { type DocumentNode, print } from "graphql";
import { describeSubgraphClass } from "../../src/graphql/hosted-subgraph.js";

export function readAuthoredShape(subgraph: object) {
  const { typeDefs, resolvers, hasSubscriptions } = authoredOf(subgraph);
  const { document } = normalizeCompatibility({
    kind: "graphql-ast-v1",
    typeDefs,
    resolverCoordinates: [],
  });
  return {
    typeDefs: print(typeDefs) + "\n",
    resolverCoordinates: [
      ...coordinatesOfResolverMap(resolvers, typeKindsOfDocument(document)),
    ].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    hasSubscriptions: {
      raw: hasSubscriptions,
      normalized: Boolean(hasSubscriptions),
    },
  };
}

function authoredOf(subgraph: object): {
  typeDefs: DocumentNode;
  resolvers: Record<string, unknown>;
  hasSubscriptions: boolean;
} {
  const described = describeSubgraphClass(subgraph.constructor);
  if (described === undefined) {
    throw new Error(
      `${subgraph.constructor.name} declares no static subgraphName, so the golden cannot read it through the protocol.`,
    );
  }
  return {
    typeDefs: described.description.typeDefs as DocumentNode,
    resolvers: { ...described.protocol.bind(subgraph).resolvers },
    hasSubscriptions: described.description.hasSubscriptions,
  };
}
