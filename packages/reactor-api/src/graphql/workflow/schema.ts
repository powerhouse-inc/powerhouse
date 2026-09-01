import type { DocumentNode } from "graphql";
import { gql } from "graphql-tag";

export const schema: DocumentNode = gql`
  """
  WorkflowRuntime Queries
  """
  type WorkflowRuntimeQueries {
    health: String!
  }

  type Query {
    workflowRuntime: WorkflowRuntimeQueries!
  }

  type WorkflowStepRun {
    stepId: String!
    key: String!
    blockType: String!
    status: String!
    input: Unknown
    output: Unknown
    port: String
    error: String
  }

  type WorkflowRunPayload {
    status: String!
    error: String
    steps: [WorkflowStepRun!]!
  }

  """
  WorkflowRuntime Mutations
  """
  type WorkflowRuntimeMutations {
    """
    Fires a workflow's core#manual trigger and runs it to completion.
    """
    fire(workflowId: String!, payload: Unknown): WorkflowRunPayload!
  }

  type Mutation {
    workflowRuntime: WorkflowRuntimeMutations!
  }
`;
