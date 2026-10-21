import type { ResolverCoordinateDefinition } from "@powerhousedao/shared/document-model";
import {
  coordinatesOfResolverMap,
  normalizeCompatibility,
  typeKindsOfDocument,
} from "document-model/tooling";
import { type DocumentNode, parse } from "graphql";
import { BaseSubgraph } from "../../src/graphql/base-subgraph.js";
import type { SUBGRAPH_PROTOCOL } from "../../src/graphql/subgraph-protocol.js";
import type { SchemaBuilder } from "../../src/graphql/subgraph-schema.js";
import type { SubgraphArgs } from "../../src/graphql/types.js";

type ResolverMap = Record<string, unknown>;

type SdlBase = (abstract new (args: SubgraphArgs) => BaseSubgraph) &
  Pick<
    typeof BaseSubgraph,
    "subgraphName" | "getSchema" | typeof SUBGRAPH_PROTOCOL
  >;

export function sdlBase(
  typeDefs: DocumentNode | string,
  resolvers: ResolverMap | ((subgraph: BaseSubgraph) => ResolverMap) = {},
  resolverCoordinates?: readonly ResolverCoordinateDefinition[],
): SdlBase {
  const document = typeof typeDefs === "string" ? parse(typeDefs) : typeDefs;
  const factory = typeof resolvers === "function" ? resolvers : () => resolvers;
  const coordinates =
    resolverCoordinates ??
    (typeof resolvers === "function"
      ? []
      : coordinatesOfResolverMap(resolvers, typeKindsOf(document)));
  abstract class SdlSubgraph extends BaseSubgraph {
    static override getSchema(schema: SchemaBuilder<BaseSubgraph>) {
      return schema.graphql({
        typeDefs: document,
        resolverCoordinates: coordinates,
        resolvers: factory as never,
      });
    }
  }
  return SdlSubgraph;
}

function typeKindsOf(document: DocumentNode) {
  return typeKindsOfDocument(
    normalizeCompatibility({
      kind: "graphql-ast-v1",
      typeDefs: document,
      resolverCoordinates: [],
    }).document,
  );
}
