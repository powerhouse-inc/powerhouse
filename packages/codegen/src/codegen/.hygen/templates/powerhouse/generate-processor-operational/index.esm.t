---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/src/index.ts"
force: true
---
import { transmit } from "./transmit";
import { resolvers } from "./resolvers";
import { typeDefs } from "./graphql-definitions";
import { options } from "./options";

export { options, resolvers, transmit, typeDefs };
