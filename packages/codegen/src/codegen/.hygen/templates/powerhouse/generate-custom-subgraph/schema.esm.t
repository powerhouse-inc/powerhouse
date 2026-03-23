---
to: "<%= rootDir %>/<%= h.changeCase.param(subgraph) %>/schema.ts"
unless_exists: true
---
import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql`
"""
<%= h.changeCase.pascal(subgraph) %> Queries
"""
type <%= h.changeCase.pascal(subgraph) %>Queries {
    example(driveId: String!): String
}

type Query {
    <%= h.changeCase.camel(subgraph) %>: <%= h.changeCase.pascal(subgraph) %>Queries!
}

`