import { ph } from "document-model";
import { compileSubgraphTypeDefs } from "document-model/tooling";
import type { DocumentNode } from "graphql";
import type { CoreSubgraphSchema } from "../subgraph-types.js";
import type { SchemaBuilder } from "../subgraph-schema.js";
import type { SystemSubgraph } from "./subgraph.js";
import { getGitHash, getGitUrl, getVersion } from "./version.js";

const SystemInfo = ph.object("SystemInfo", {
  fields: {
    version: ph.String({ required: true }),
    gitHash: ph.String({ required: true }),
    gitUrl: ph.String(),
  },
});

export function systemEntries(schema: SchemaBuilder<SystemSubgraph>) {
  return [
    schema.query("system", {
      returns: ph.ref(SystemInfo, { required: true }),
      resolve: () => ({
        version: getVersion(),
        gitHash: getGitHash(),
        gitUrl: getGitUrl(),
      }),
    }),
  ];
}

export const systemSchema = {
  subgraphName: "system",
  typeDefs: compileSubgraphTypeDefs("system", systemEntries) as DocumentNode,
  resolverCoordinates: [
    { typeName: "Query", fieldName: "system", resolverKind: "field" },
  ],
} as const satisfies CoreSubgraphSchema;
