import { BaseSubgraph } from "../base-subgraph.js";
import { systemTypeDefs } from "./schema.js";
import { getGitHash, getGitUrl, getVersion } from "./version.js";

export class SystemSubgraph extends BaseSubgraph {
  name = "system";
  hasSubscriptions = false;

  typeDefs = systemTypeDefs;

  resolvers = {
    Query: {
      system: () => ({
        version: getVersion(),
        gitHash: getGitHash(),
        gitUrl: getGitUrl(),
      }),
    },
  };
}
