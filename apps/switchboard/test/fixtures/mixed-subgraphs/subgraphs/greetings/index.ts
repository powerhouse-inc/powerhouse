import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { gql } from "graphql-tag";

export class GreetingsSubgraph extends BaseSubgraph {
  override name = "greetings";
  override typeDefs = gql`
    type Query {
      greeting(to: String!): String!
    }
  `;
  override resolvers = {
    Query: {
      greeting: (_: unknown, args: { to: string }) => `Hello, ${args.to}`,
    },
  };
}
