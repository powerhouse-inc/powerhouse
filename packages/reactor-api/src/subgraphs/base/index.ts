import { SubgraphManager } from "#subgraphs/manager.js";
import { ISubgraph, SubgraphArgs } from "#subgraphs/types.js";
import { Db } from "#types.js";
import { IDocumentDriveServer } from "document-drive";
import { DocumentNode } from "graphql";
import { gql } from "graphql-tag";

export class Subgraph implements ISubgraph {
  name = "example";
  resolvers: Record<string, any> = {
    Query: {
      hello: () => this.name,
    },
  };
  typeDefs: DocumentNode = gql`
    type Query {
      hello: String
    }
  `;
  reactor: IDocumentDriveServer;
  subgraphManager: SubgraphManager;
  operationalStore: Db;
  constructor(args: SubgraphArgs) {
    this.reactor = args.reactor;
    this.subgraphManager = args.subgraphManager;
    this.operationalStore = args.operationalStore;
  }
  async onSetup() {
    // noop
  }
}
