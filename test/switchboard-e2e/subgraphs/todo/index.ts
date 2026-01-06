import { Subgraph } from "@powerhousedao/reactor-api";

import { gql } from "graphql-tag";

export class TodoSubgraph extends Subgraph {
  name = "todo";

  resolvers = {
    Query: {
      example: {
        resolve: async (parent, args, context, info) => {
          return "example";
        },
      },
    },
  };

  typeDefs = gql`
    type Query {
      example(id: ID!): String
    }
  `;

  additionalContextFields = {
    example: "test",
  };

  async onSetup() {
    await this.createOperationalTables();
  }

  async createOperationalTables() {
    await this.operationalStore.schema.createTableIfNotExists(
      "example",
      (table) => {
        table.string("id").primary();
        table.string("name");
      },
    );
  }

  async onDisconnect() {}
}
