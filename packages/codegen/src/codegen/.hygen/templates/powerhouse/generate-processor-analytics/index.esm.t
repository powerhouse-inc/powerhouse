---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/src/index.ts"
force: true
---
import {
  AnalyticsResolvers as resolvers,
  typedefs as typeDefs,
} from "@powerhousedao/analytics-engine-graphql";
import { transmit } from "./transmit";
import { options } from "./options";

export { options, resolvers, transmit, typeDefs };
