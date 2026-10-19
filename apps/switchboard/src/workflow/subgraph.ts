import {
  BaseSubgraph,
  type SchemaBuilder,
  type SubgraphClass,
} from "@powerhousedao/reactor-api";
import type { WorkflowRuntimeService } from "@powerhousedao/reactor-workflow";
import { workflowRuntimeResolverCoordinates } from "./resolver-coordinates.js";
import {
  getResolvers,
  type OAuthRouting,
  type ReactorAccessInfo,
} from "./resolvers.js";
import { schema as typeDefs } from "./schema.js";

export type WorkflowRuntimeSubgraphClass = SubgraphClass & {
  readonly subgraphName: "workflow-runtime";
};

export function createWorkflowRuntimeSubgraph(
  runtime: WorkflowRuntimeService,
  oauth?: OAuthRouting,
  access?: ReactorAccessInfo,
): WorkflowRuntimeSubgraphClass {
  return class WorkflowRuntimeSubgraph extends BaseSubgraph {
    static override readonly subgraphName = "workflow-runtime";

    static override getSchema(schema: SchemaBuilder<WorkflowRuntimeSubgraph>) {
      return schema.graphql({
        typeDefs,
        resolverCoordinates: workflowRuntimeResolverCoordinates,
        resolvers: (subgraph) =>
          getResolvers(
            runtime,
            subgraph.authorizationService,
            oauth,
            access,
            (documentId, ctx) => subgraph.assertCanRead(documentId, ctx),
          ),
      });
    }
  };
}
