import { BaseSubgraph } from "../../../src/graphql/base-subgraph.js";
import type { SchemaBuilder } from "../../../src/graphql/subgraph-schema.js";
import { systemSchema } from "./system-schema.js";
import {
  getGitHash,
  getGitUrl,
  getVersion,
} from "../../../src/graphql/system/version.js";

export class SystemSubgraph extends BaseSubgraph {
  static override readonly subgraphName = systemSchema.subgraphName;

  static override getSchema(schema: SchemaBuilder<SystemSubgraph>) {
    return schema.graphql({
      typeDefs: systemSchema.typeDefs,
      resolverCoordinates: systemSchema.resolverCoordinates,
      resolvers: () => ({
        Query: {
          system: () => ({
            version: getVersion(),
            gitHash: getGitHash(),
            gitUrl: getGitUrl(),
          }),
        },
      }),
    });
  }
}
