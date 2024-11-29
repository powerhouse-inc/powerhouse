---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/src/index.ts"
force: true
---
import { transmit } from "./transmit";
import { resolvers } from "./resolvers";
import { typeDefs } from "./graphql-definitions";
import { options } from "./options";
import * as dbSchema from "./db-schema";

export { options, resolvers, transmit, typeDefs, dbSchema };
