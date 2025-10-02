---
to: "<%= rootDir %>/<%= h.changeCase.param(subgraph) %>/schema.ts"
unless_exists: true
---
import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql`
"""
Subgraph definition
"""
type Query {
    example(driveId: String!): String
}

`