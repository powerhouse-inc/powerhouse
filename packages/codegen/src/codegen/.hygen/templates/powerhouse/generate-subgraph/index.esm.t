---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/index.ts"
force: true
---
import { Subgraph } from "@powerhousedao/reactor-api";
import { gql } from "graphql-tag";
<% if (loadFromFile) { %>
import { readFileSync } from "fs";
import path from "path";
import { getResolvers } from "./resolvers";

// TODO: find a better way to import the graphql schema
const gqlFile = path.join(path.resolve(path.dirname('')), './subgraphs/<%= h.changeCase.param(name) %>/schema.graphql');
const gqlCode = readFileSync(gqlFile).toString();
<% } %>

export class <%= pascalName %>Subgraph extends Subgraph {
  name = "<%= h.changeCase.param(name) %>";
<% if (loadFromFile) { %>
  typeDefs = gql`${gqlCode}`;

  resolvers = getResolvers(this);
  additionalContextFields = {};
  async onSetup() {}
  async onDisconnect() {}
<% } else { %>

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
<% } %>
}