import { buildSubgraphSchema } from "@apollo/subgraph";
import { BaseDocumentDriveServer } from "document-drive";
import { readFileSync } from "fs";
import { getDocumentModelTypeDefs } from "../../utils/gen-doc-model-type-defs";
import { resolvers } from "./resolvers";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

// @ts-ignore
import schemaPath from "./schema.graphql";
const __dirname =
  import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const typeDefs = readFileSync(resolve(__dirname, schemaPath), "utf8");

export const getSchema = (documentDriveServer: BaseDocumentDriveServer) =>
  buildSubgraphSchema([
    {
      typeDefs: getDocumentModelTypeDefs(documentDriveServer, typeDefs),
      resolvers,
    },
  ]);
