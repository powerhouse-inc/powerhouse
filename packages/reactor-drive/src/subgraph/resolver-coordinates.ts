import type { ResolverCoordinateDefinition } from "@powerhousedao/shared/document-model";

export const reactorDriveResolverCoordinates = [
  {
    typeName: "Query",
    fieldName: "reactorDrive",
    resolverKind: "field",
  },
  {
    typeName: "Query",
    fieldName: "reactorDriveDescendants",
    resolverKind: "field",
  },
  {
    typeName: "Query",
    fieldName: "reactorDriveNode",
    resolverKind: "field",
  },
  {
    typeName: "ReactorDriveFolderNode",
    fieldName: "children",
    resolverKind: "field",
  },
  {
    typeName: "ReactorDriveInfo",
    fieldName: "rootNodes",
    resolverKind: "field",
  },
  {
    typeName: "ReactorDriveNode",
    fieldName: null,
    resolverKind: "resolveType",
  },
] as const satisfies readonly ResolverCoordinateDefinition[];
