---
to: "<%= rootDir %>/<%= h.changeCase.param(subgraph) %>/schema.ts"
force: true
---
import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql`
"""
Subgraph definition
"""

"""
Queries: 
"""

type Query {
    example(driveId: String!): String
}

`