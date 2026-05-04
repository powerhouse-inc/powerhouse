import { gql } from "graphql-tag";
import { BaseSubgraph } from "../base-subgraph.js";
import { getGitHash, getVersion } from "./version.js";

export class SystemSubgraph extends BaseSubgraph {
  name = "system";
  hasSubscriptions = false;

  typeDefs = gql`
    type SystemInfo {
      version: String!
      gitHash: String!
    }

    type Query {
      system: SystemInfo!
    }
  `;

  resolvers = {
    Query: {
      system: () => ({
        version: getVersion(),
        gitHash: getGitHash(),
      }),
    },
  };
}
