import { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper";
import { BaseDocumentDriveServer } from "document-drive";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createSchema } from "src/utils/create-schema";
import { resolvers } from "./resolvers";
import schemaPath from "./schema.graphql";

const __dirname =
  import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));

const typeDefs = readFileSync(resolve(__dirname, schemaPath), "utf8");

export const getSchema = (driveServer: BaseDocumentDriveServer) =>
  createSchema(driveServer, resolvers as GraphQLResolverMap, typeDefs);
