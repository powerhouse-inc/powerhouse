import type { DocumentNode } from "graphql";
import { gql } from "graphql-tag";

export const schema: DocumentNode = gql`
  """
  WorkflowRuntime Queries
  """
  type WorkflowRuntimeQueries {
    health: String!
    """
    Persisted runs, newest first, optionally filtered by workflow.
    """
    runs(workflowId: String, limit: Int): [WorkflowRunRecord!]!
    run(id: String!): WorkflowRunRecord
  }

  type Query {
    workflowRuntime: WorkflowRuntimeQueries!
  }

  type WorkflowStepRunRecord {
    stepId: String!
    stepKey: String!
    blockType: String!
    status: String!
    input: Unknown
    output: Unknown
    port: String
    error: String
  }

  type WorkflowRunRecord {
    id: String!
    workflowId: String!
    workflowName: String!
    workflowVersion: Int!
    triggerKind: String!
    triggerPayload: Unknown
    status: String!
    error: String
    startedAt: String!
    endedAt: String
    steps: [WorkflowStepRunRecord!]!
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
    runId: String
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
