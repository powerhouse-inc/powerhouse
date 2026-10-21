import { gql } from "graphql-tag";
import type { CoreSubgraphSchema } from "../../../src/graphql/subgraph-types.js";
import schemaSource from "./auth.graphql";

export const authSchema = {
  subgraphName: "auth",
  typeDefs: gql(schemaSource),
  resolverCoordinates: [
    {
      typeName: "Mutation",
      fieldName: "grantDocumentPermission",
      resolverKind: "field",
    },
    {
      typeName: "Mutation",
      fieldName: "grantOperationPermission",
      resolverKind: "field",
    },
    {
      typeName: "Mutation",
      fieldName: "revokeDocumentPermission",
      resolverKind: "field",
    },
    {
      typeName: "Mutation",
      fieldName: "revokeOperationPermission",
      resolverKind: "field",
    },
    {
      typeName: "Mutation",
      fieldName: "setDocumentProtection",
      resolverKind: "field",
    },
    {
      typeName: "Mutation",
      fieldName: "transferDocumentOwnership",
      resolverKind: "field",
    },
    {
      typeName: "Query",
      fieldName: "canExecuteOperation",
      resolverKind: "field",
    },
    { typeName: "Query", fieldName: "documentAccess", resolverKind: "field" },
    {
      typeName: "Query",
      fieldName: "documentProtection",
      resolverKind: "field",
    },
    {
      typeName: "Query",
      fieldName: "operationPermissions",
      resolverKind: "field",
    },
    {
      typeName: "Query",
      fieldName: "userDocumentPermissions",
      resolverKind: "field",
    },
  ],
} as const satisfies CoreSubgraphSchema;
