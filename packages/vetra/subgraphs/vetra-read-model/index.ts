import type { ISubgraph, SubgraphArgs } from "@powerhousedao/reactor-api";
import type { IDocumentDriveServer, IRelationalDb } from "document-drive";
import type { DocumentNode } from "graphql";
import { getResolvers } from "./resolvers.js";
import { schema } from "./schema.js";

export class VetraReadModelSubgraph implements ISubgraph {
  name = "vetra-read-model";
  typeDefs: DocumentNode = schema;
  resolvers = getResolvers(this);
  reactor: IDocumentDriveServer;
  relationalDb: IRelationalDb;
  additionalContextFields = {};

  constructor(args: SubgraphArgs) {
    this.reactor = args.reactor;
    this.relationalDb = args.relationalDb;
  }

  async onSetup() {}
  async onDisconnect() {
    return;
  }
}
