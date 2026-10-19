import { gql } from "graphql-tag";
import type { CoreSubgraphSchema } from "../subgraph-types.js";
import schemaSource from "./schema.graphql";

export const reactorSchema = {
  subgraphName: "r",
  typeDefs: gql(schemaSource),
  resolverCoordinates: [
    {
      typeName: "Mutation",
      fieldName: "addRelationship",
      resolverKind: "field",
    },
    {
      typeName: "Mutation",
      fieldName: "createDocument",
      resolverKind: "field",
    },
    {
      typeName: "Mutation",
      fieldName: "createEmptyDocument",
      resolverKind: "field",
    },
    {
      typeName: "Mutation",
      fieldName: "deleteDocument",
      resolverKind: "field",
    },
    {
      typeName: "Mutation",
      fieldName: "deleteDocuments",
      resolverKind: "field",
    },
    { typeName: "Mutation", fieldName: "execute", resolverKind: "field" },
    { typeName: "Mutation", fieldName: "executeAsync", resolverKind: "field" },
    { typeName: "Mutation", fieldName: "executeBatch", resolverKind: "field" },
    {
      typeName: "Mutation",
      fieldName: "moveRelationship",
      resolverKind: "field",
    },
    {
      typeName: "Mutation",
      fieldName: "mutateDocument",
      resolverKind: "field",
    },
    {
      typeName: "Mutation",
      fieldName: "mutateDocumentAsync",
      resolverKind: "field",
    },
    {
      typeName: "Mutation",
      fieldName: "pushSyncEnvelopes",
      resolverKind: "field",
    },
    {
      typeName: "Mutation",
      fieldName: "removeRelationship",
      resolverKind: "field",
    },
    {
      typeName: "Mutation",
      fieldName: "renameDocument",
      resolverKind: "field",
    },
    {
      typeName: "Mutation",
      fieldName: "setPreferredEditor",
      resolverKind: "field",
    },
    { typeName: "Mutation", fieldName: "touchChannel", resolverKind: "field" },
    {
      typeName: "Mutation",
      fieldName: "updateRelationship",
      resolverKind: "field",
    },
    { typeName: "PHDocument", fieldName: "operations", resolverKind: "field" },
    { typeName: "Query", fieldName: "createDefaults", resolverKind: "field" },
    { typeName: "Query", fieldName: "document", resolverKind: "field" },
    {
      typeName: "Query",
      fieldName: "documentIncomingRelationshipEdges",
      resolverKind: "field",
    },
    {
      typeName: "Query",
      fieldName: "documentIncomingRelationships",
      resolverKind: "field",
    },
    { typeName: "Query", fieldName: "documentModels", resolverKind: "field" },
    {
      typeName: "Query",
      fieldName: "documentOperations",
      resolverKind: "field",
    },
    {
      typeName: "Query",
      fieldName: "documentOutgoingRelationshipEdges",
      resolverKind: "field",
    },
    {
      typeName: "Query",
      fieldName: "documentOutgoingRelationships",
      resolverKind: "field",
    },
    { typeName: "Query", fieldName: "documentServed", resolverKind: "field" },
    { typeName: "Query", fieldName: "evaluateActions", resolverKind: "field" },
    { typeName: "Query", fieldName: "findDocuments", resolverKind: "field" },
    { typeName: "Query", fieldName: "jobStatus", resolverKind: "field" },
    { typeName: "Query", fieldName: "peerAgreement", resolverKind: "field" },
    {
      typeName: "Query",
      fieldName: "pollSyncEnvelopes",
      resolverKind: "field",
    },
    { typeName: "Query", fieldName: "syncHolds", resolverKind: "field" },
    {
      typeName: "Subscription",
      fieldName: "documentChanges",
      resolverKind: "resolve",
    },
    {
      typeName: "Subscription",
      fieldName: "documentChanges",
      resolverKind: "subscribe",
    },
    {
      typeName: "Subscription",
      fieldName: "jobChanges",
      resolverKind: "resolve",
    },
    {
      typeName: "Subscription",
      fieldName: "jobChanges",
      resolverKind: "subscribe",
    },
  ],
} as const satisfies CoreSubgraphSchema;
