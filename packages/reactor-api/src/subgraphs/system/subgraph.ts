import { buildSubgraphSchema } from "@apollo/subgraph";
import { BaseDocumentDriveServer } from "document-drive";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { getDocumentModelTypeDefs } from "../../utils/gen-doc-model-type-defs";
import { resolvers } from "./resolvers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const typeDefs = readFileSync(resolve(__dirname, "schema.graphql"), "utf8");

export const getSchema = (documentDriveServer: BaseDocumentDriveServer) =>
  buildSubgraphSchema([
    {
      typeDefs: getDocumentModelTypeDefs(documentDriveServer, typeDefs),
      resolvers,
    },
  ]);
