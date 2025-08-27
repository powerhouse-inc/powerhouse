import { type IDocumentDriveServer, type IRelationalDb } from "document-drive";
import { type DocumentNode } from "graphql";
import { gql } from "graphql-tag";
import type { GraphQLManager } from "../graphql-manager.js";
import type { ISubgraph, SubgraphArgs } from "../types.js";

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
  relationalDb: IRelationalDb;

  constructor(args: SubgraphArgs) {
    this.reactor = args.reactor;
    this.graphqlManager = args.graphqlManager;
    this.relationalDb = args.relationalDb;
    this.path = args.path ?? "";
  }

  async onSetup() {
    // noop
  }
}
