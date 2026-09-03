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
    """
    Action descriptor (props, auth) for a piece block type; null for core blocks.
    """
    blockDescriptor(blockType: String!): Unknown
    """
    Resolves a dynamic prop's options against the current config values.
    """
    blockOptions(
      blockType: String!
      propName: String!
      input: Unknown
      connectionId: String
    ): Unknown
    """
    All published Activepieces pieces with at least one action.
    """
    pieceCatalog: Unknown
    """
    A piece's actions, each with a ready-to-use blockType.
    """
    pieceActions(packageName: String!): Unknown
    """
    A piece's triggers, each with a ready-to-use "#trigger:" blockType.
    """
    pieceTriggers(packageName: String!): Unknown
    """
    Full piece detail (PieceMetadataModel-shaped), verbatim from the cloud API.
    """
    pieceDetail(packageName: String!): Unknown
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
