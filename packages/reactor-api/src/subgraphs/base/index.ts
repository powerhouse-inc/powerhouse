import { ISubgraph } from "../types";
import { DocumentNode } from "graphql";
import { IDocumentDriveServer } from "document-drive";
import { SubgraphArgs } from "../types";
import { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper";
import { gql } from "graphql-tag";
import { Knex } from "knex";
import { Context } from "../types";

export class Subgraph implements ISubgraph {
  name = "example";
  resolvers: GraphQLResolverMap<Context> = {};
  typeDefs: DocumentNode = gql``;
  reactor: IDocumentDriveServer;
  operationalStore: Knex;
  constructor(args: SubgraphArgs) {
    this.reactor = args.reactor;
    this.operationalStore = args.operationalStore;
  }
  async onSetup() {
    // noop
  }
}
