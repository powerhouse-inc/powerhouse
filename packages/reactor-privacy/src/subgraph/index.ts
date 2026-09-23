import { BaseSubgraph, type SubgraphClass } from "@powerhousedao/reactor-api";
import type { DocumentNode } from "graphql";
import type { PrivacyService } from "../privacy-service.js";
import { createPrivacyResolvers } from "./resolvers.js";
import { typeDefs } from "./schema.js";

export { createPrivacyResolvers } from "./resolvers.js";
export { typeDefs as privacySubgraphTypeDefs } from "./schema.js";

/** The host composes the service, so the subgraph serves only what it is handed. */
export function createPrivacySubgraph(service: PrivacyService): SubgraphClass {
  return class PrivacySubgraph extends BaseSubgraph {
    name = "privacy";
    typeDefs: DocumentNode = typeDefs;
    // Runs after super(), so the authorization service is already in place.
    resolvers = createPrivacyResolvers(service, this.authorizationService);
    additionalContextFields = {};
  };
}
