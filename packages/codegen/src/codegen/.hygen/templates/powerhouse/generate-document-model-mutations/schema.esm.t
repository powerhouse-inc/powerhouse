---
to: "<%= rootDir %>/<%= h.changeCase.param(subgraph) %>/schema.ts"
force: true
---
import { gql } from "graphql-tag";

export const schema = gql`
"""
Subgraph definition for <%= h.changeCase.pascal(documentType) %> (<%- documentTypeId %>)

"""
<%- schema %> 

"""
Mutations: <%= h.changeCase.pascal(documentType) %>
"""
type Mutation {

    <%- h.changeCase.pascal(documentType) %>_createDocument(driveId:String, name:String): String

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
<%- op.schema.replace('input ', 'input ' + h.changeCase.pascal(documentType) + '_') %>
<%_ })}); %>
`;