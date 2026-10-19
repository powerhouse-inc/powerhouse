import type { ResolverCoordinateDefinition } from "@powerhousedao/shared/document-model";

export const privacyResolverCoordinates = [
  {
    typeName: "Mutation",
    fieldName: "requestErasure",
    resolverKind: "field",
  },
  {
    typeName: "Query",
    fieldName: "disclose",
    resolverKind: "field",
  },
  {
    typeName: "Query",
    fieldName: "erasurePlan",
    resolverKind: "field",
  },
  {
    typeName: "Query",
    fieldName: "erasureRequest",
    resolverKind: "field",
  },
] as const satisfies readonly ResolverCoordinateDefinition[];
