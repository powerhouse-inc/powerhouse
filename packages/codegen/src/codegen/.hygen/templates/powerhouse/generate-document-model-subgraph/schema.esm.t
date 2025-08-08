---
to: "<%= rootDir %>/<%= h.changeCase.param(subgraph) %>/schema.ts"
force: true
---
import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql`
"""
Subgraph definition for <%= h.changeCase.pascal(documentType) %> (<%- documentTypeId %>)

"""
<%- schema %> 

"""
Queries: <%= h.changeCase.pascal(documentType) %>
"""

type <%- h.changeCase.pascal(documentType) %>Queries {
    getDocument(docId: PHID!, driveId: PHID): <%- h.changeCase.pascal(documentType) %>
    getDocuments(driveId: String!): [<%- h.changeCase.pascal(documentType) %>!]
}

type Query {
    <%- h.changeCase.pascal(documentType) %>: <%- h.changeCase.pascal(documentType) %>Queries
}

"""
Mutations: <%= h.changeCase.pascal(documentType) %>
"""
type Mutation {

    <%- h.changeCase.pascal(documentType) %>_createDocument(name:String!, driveId:String): String

<% modules.forEach(module => { _%>
<% module.operations.forEach(op => { _%>
    <%- h.changeCase.pascal(documentType) + '_' + h.changeCase.camel(op.name) 
    %>(driveId:String, docId:PHID, input:<%- 
        h.changeCase.pascal(documentType) + '_' + h.changeCase.pascal(op.name) %>Input): Int
<%_ })}); %>}
<% modules.forEach(module => { _%>

"""
Module: <%= h.changeCase.pascal(module.name) %>
"""
<% module.operations.forEach(op => { _%>
<%- op.schema.replace('input ', 'input ' + h.changeCase.pascal(documentType) + '_').replace('type ', 'type ' + h.changeCase.pascal(documentType) + '_') %>
<%_ })}); %>
`