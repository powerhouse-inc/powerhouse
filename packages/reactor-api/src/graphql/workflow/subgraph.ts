import { BaseSubgraph } from "@powerhousedao/reactor-api";
import type { DocumentNode } from "graphql";
import { getResolvers } from "./resolvers.js";
import { schema } from "./schema.js";
import { workflowRuntime } from "./service.js";

export class WorkflowRuntimeSubgraph extends BaseSubgraph {
  name = "workflow-runtime";
  typeDefs: DocumentNode = schema;
  resolvers = getResolvers(this);
  additionalContextFields = {};

  // The webhook endpoint is HTTP, not GraphQL, so it is registered here rather
  // than served by a resolver. The subgraph's HTTP scope arrives already bound
  // to this package's namespace, so its URL space is not ours to choose.
  async onSetup() {
    await workflowRuntime.registerWebhookEndpoint(this);
  }

  async onDisconnect() {}
}
