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
    """
    Health of every registered piece trigger (poll schedule, errors).
    """
    triggerStates: [TriggerStateRecord!]!
    """
    Authored output shape of a block (SDL / outputSchema / sampleData).
    """
    blockOutputTree(blockType: String!, config: Unknown): Unknown
    """
    Every powerhouse/connection document, for connection pickers.
    """
    connections: [ConnectionRecord!]!
    """
    Secret metadata (label, version, status). Never the value.
    """
    secret(ref: String!): SecretRecord
    secrets: [SecretRecord!]!
  }

  type SecretRecord {
    ref: String!
    label: String
    version: Int!
    status: String!
    createdAt: String!
    updatedAt: String!
  }

  type ConnectionRecord {
    id: String!
    name: String!
    connectorId: String!
    authType: String!
    status: String!
    accountLabel: String
  }

  type TriggerStateRecord {
    workflowId: String!
    blockType: String!
    status: String!
    intervalMs: Int!
    nextPollAt: String
    lastPollAt: String
    lastError: String
    consecutiveFailures: Int!
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
    rerunOf: String
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
    """
    Runs a piece trigger's test hook; sample items, no cursor changes.
    """
    testTrigger(workflowId: String!): Unknown
    """
    Resumes a FAILED run: succeeded steps replay from the journal,
    execution restarts at the failure. Produces a new run.
    """
    rerun(runId: String!): WorkflowRunPayload!
    """
    Mints a managed secret and returns its ref; the value is stored
    encrypted and is never readable back over any API.
    """
    createSecret(value: String!, label: String): SecretRecord!
    """
    Replaces the value behind an existing ref; documents stay untouched.
    """
    rotateSecret(ref: String!, value: String!): SecretRecord!
    """
    Tombstones a secret; its value becomes unrecoverable.
    """
    deleteSecret(ref: String!): Boolean!
  }

  type Mutation {
    workflowRuntime: WorkflowRuntimeMutations!
  }
`;
