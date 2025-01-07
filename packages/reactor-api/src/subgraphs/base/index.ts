import { ISubgraph } from "../types";
import { DocumentNode } from "graphql";
import { IDocumentDriveServer } from "document-drive";
import { SubgraphArgs } from "../types";
import { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper";
import { gql } from "graphql-tag";
import { Context } from "../types";
import { Db } from "src/types";
import { SubgraphManager } from "../manager";

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
