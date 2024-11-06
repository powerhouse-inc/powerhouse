import { createSchema } from "@powerhousedao/reactor-api";
import { AnalyticsResolvers, typedefs } from "@powerhousedao/analytics-engine-graphql";
import { BaseDocumentDriveServer } from "document-drive";
import { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper";

export const getSchema = (documentDriveServer: BaseDocumentDriveServer) =>
  createSchema(documentDriveServer, AnalyticsResolvers as GraphQLResolverMap, typedefs);