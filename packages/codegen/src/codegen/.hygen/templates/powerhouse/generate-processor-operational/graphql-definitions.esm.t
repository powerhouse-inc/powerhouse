---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/src/graphql-definitions.ts"
force: true
---
/**
 * The GraphQL type definitions for the processor.
 */
export const typeDefs = `
type Query {
 example: [Example!]!
}

type Example {
 id: String!
 value: String!
}
`;
