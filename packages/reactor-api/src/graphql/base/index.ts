import { type GraphQLManager } from "#graphql/graphql-manager.js";
import { type ISubgraph, type SubgraphArgs } from "#graphql/types.js";
import { type Db } from "#types.js";
import { type IDocumentDriveServer } from "document-drive";
import { type DocumentNode } from "graphql";
import { gql } from "graphql-tag";

export class Subgraph implements ISubgraph {
  name = "example";
  path = "";
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
  graphqlManager: GraphQLManager;
  operationalStore: Db;
  constructor(args: SubgraphArgs) {
    this.reactor = args.reactor;
    this.graphqlManager = args.graphqlManager;
    this.operationalStore = args.operationalStore;
    this.path = args.path ?? "";
  }
  async onSetup() {
    // noop
  }
}
