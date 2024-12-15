---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/index.ts"
force: true
---
import { Subgraph } from "@powerhousedao/reactor-api";
import { Knex } from "knex";
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
    await this.createOperationalTables(this.operationalStore);
  }

  async createOperationalTables(db: Knex) {
    await db.schema.createTableIfNotExists("example", (table) => {
      table.string("id").primary();
      table.string("name");
    });
  }

  async onDisconnect() {}
}