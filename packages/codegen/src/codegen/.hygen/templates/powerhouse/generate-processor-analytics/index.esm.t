---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/src/index.ts"
force: true
---
import {
  AnalyticsResolvers as resolvers,
  typedefs as typeDefs,
} from "@powerhousedao/analytics-engine-graphql";
import { options, transmit } from "./listener";

export { options, resolvers, transmit, typeDefs };
