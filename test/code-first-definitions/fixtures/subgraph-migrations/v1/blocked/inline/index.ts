import { BaseSubgraph, type SubgraphArgs } from "@powerhousedao/reactor-api";
import { parse } from "graphql";

/** Every member here is a form the migration must refuse to approximate. */
export class InlineSubgraph extends BaseSubgraph {
  private label = "inline";

  constructor(args: SubgraphArgs) {
    super(args);
  }

  name = "inline";
  typeDefs = parse("type Query { inline: String }");
  resolvers = {
    Query: {
      inline: () => this.label,
    },
  };

  onSetup() {
    this.label = "ready";
    return Promise.resolve();
  }
}
