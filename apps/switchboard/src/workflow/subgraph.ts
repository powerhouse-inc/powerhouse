import { BaseSubgraph, type SubgraphClass } from "@powerhousedao/reactor-api";
import type { WorkflowRuntimeService } from "@powerhousedao/reactor-workflow";
import type { DocumentNode } from "graphql";
import { getResolvers } from "./resolvers.js";
import { schema } from "./schema.js";

/** The runtime's read/write surface. The runtime itself is composed by the
 * host, so the subgraph only serves what it is handed. */
export function createWorkflowRuntimeSubgraph(
  runtime: WorkflowRuntimeService,
): SubgraphClass {
  return class WorkflowRuntimeSubgraph extends BaseSubgraph {
    name = "workflow-runtime";
    typeDefs: DocumentNode = schema;
    // A field initializer runs after super(), so the authorization service
    // the secret mutations gate on is already in place.
    resolvers = getResolvers(runtime, this.authorizationService);
    additionalContextFields = {};
  };
}
