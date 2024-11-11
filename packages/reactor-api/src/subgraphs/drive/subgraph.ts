import { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper";
import { IDocumentDriveServer } from "document-drive";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSchema } from "src/utils/create-schema";
import { resolvers } from "./resolvers";
import schemaPath from "./schema.graphql";

const __dirname =
  import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));

const typeDefs = readFileSync(resolve(__dirname, schemaPath), "utf8");

export const getSchema = (driveServer: IDocumentDriveServer) =>
  createSchema(driveServer, resolvers as GraphQLResolverMap, typeDefs);
