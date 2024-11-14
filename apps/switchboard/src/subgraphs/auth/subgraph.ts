import { createSchema } from "@powerhousedao/reactor-api";
import { BaseDocumentDriveServer } from "document-drive";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { resolvers } from "./resolvers";
import { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper";

const __dirname = dirname(fileURLToPath(import.meta.url));
const typeDefs = readFileSync(resolve(__dirname, "schema.graphql"), "utf8");

export const getSchema = (documentDriveServer: BaseDocumentDriveServer) =>
  createSchema(documentDriveServer, resolvers as GraphQLResolverMap, typeDefs);
