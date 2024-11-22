---
to: "<%= rootDir %>/processors/<%= h.changeCase.param(name) %>/src/index.ts"
force: true
---
import { options, transmit } from "./listener";
import { resolvers } from "./resolvers";

const typeDefs = `
 type Query {
  example: [Example!]!
}

type Example {
  id: String!
  value: String!
}
`;

export { options, resolvers, transmit, typeDefs };