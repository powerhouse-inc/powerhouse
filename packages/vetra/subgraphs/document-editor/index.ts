import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { getResolvers } from "./resolvers.js";
import { schema } from "./schema.js";

export class DocumentEditorSubgraph extends BaseSubgraph {
  name = "document-editor";
  typeDefs = schema;
  resolvers = getResolvers(this);
  additionalContextFields = {};
  async onSetup() {}
  async onDisconnect() {}
}
