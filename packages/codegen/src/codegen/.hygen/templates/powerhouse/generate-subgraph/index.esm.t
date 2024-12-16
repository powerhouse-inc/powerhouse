---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/index.ts"
force: true
---
import { Subgraph, Db } from "@powerhousedao/reactor-api";
import { gql } from "graphql-tag";

export class <%= pascalName %>Subgraph extends Subgraph {
  name = "<%= h.changeCase.param(name) %>";
  resolvers = {
    Query: {
      example: {
        resolve: async (parent, args, context, info) => {
          return "example";
        }
      }
    }
  }

  typeDefs = gql`
    type Query {
      example(id: ID!): String
    }
  `;

  additionalContextFields = {
    example: "test"
  }

  async onSetup() {
    await this.createOperationalTables();
  }

  async createOperationalTables() {
    await this.operationalStore.schema.createTableIfNotExists("example", (table) => {
      table.string("id").primary();
      table.string("name");
    });
  }

  async onDisconnect() {}
}