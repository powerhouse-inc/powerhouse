import { IDocumentDriveServer } from "document-drive";
import { createSchema } from "src/utils/create-schema";
import { resolvers } from "./resolvers";
import typeDefs from "./schema.graphql";

export const getSchema = (driveServer: IDocumentDriveServer) =>
  createSchema(driveServer.getDocumentModels(), typeDefs, resolvers);
