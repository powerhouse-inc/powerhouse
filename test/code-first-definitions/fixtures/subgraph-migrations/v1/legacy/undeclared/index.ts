import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { parse } from "graphql";

/**
 * Declares no `hasSubscriptions`, which the host reads as `undefined`, and
 * holds both bindings in the same module the class lives in.
 */
export const undeclaredSchema = parse("type Query { undeclared: String }");
export const undeclaredResolvers = {
  Query: { undeclared: () => "undeclared" },
};

export class UndeclaredSubgraph extends BaseSubgraph {
  name = "undeclared";
  typeDefs = undeclaredSchema;
  resolvers = undeclaredResolvers;
}
