import type { DocumentNode } from "graphql";
import { gql } from "graphql-tag";

export const schema: DocumentNode = gql`
  """
  WorkflowRuntime Queries
  """
  type WorkflowRuntimeQueries {
    health: String!
    """
    Persisted runs, newest first. Scope them to one workflow, or to every
    workflow a drive holds; workflowId wins when both are given.
    """
    runs(workflowId: String, driveId: String, limit: Int): [WorkflowRunRecord!]!
    run(id: String!): WorkflowRunRecord
    """
    Action descriptor (props, auth) for a piece block type; null for core blocks.
    """
    blockDescriptor(blockType: String!): Unknown
    """
    Resolves a dynamic prop against the current config values: a DROPDOWN
    yields { options, placeholder, disabled }, a DYNAMIC prop yields the
    resolved sub-property descriptor list.
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
    Action/trigger name search across the catalog. The index builds lazily on
    first use; poll while status is "indexing".
    """
    searchBlocks(query: String!, limit: Int): BlockSearchResult!
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
    The webhook endpoint for a workflow: the URL to hand the provider. Minted
    on first ask, whether or not the workflow is armed — an author needs the
    URL before enabling, and the armed field carries that difference. Null
    only when the host has no webhook service.
    """
    webhookEndpoint(workflowId: String!): WebhookEndpointRecord
    """
    Secret metadata (label, version, status). Never the value.
    """
    secret(ref: String!): SecretRecord
    secrets: [SecretRecord!]!
  }

  type BlockSearchHit {
    blockType: String!
    pieceName: String!
    pieceDisplayName: String!
    logoUrl: String!
    displayName: String!
    description: String!
    "action | trigger"
    kind: String!
    "Triggers only: POLLING | WEBHOOK | APP_WEBHOOK | MANUAL"
    strategy: String
    "Why this block cannot run on this reactor; null when it can."
    unsupported: String
  }

  type BlockSearchResult {
    "ready | indexing | error"
    status: String!
    hits: [BlockSearchHit!]!
    indexedPieces: Int!
    error: String
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

  type ConnectionCheckResult {
    ok: Boolean!
    detail: String
    """
    From auth.getConnectionIdentifier when the check passes; otherwise the
    label the connection already holds.
    """
    accountLabel: String
  }

  type WebhookEndpointRecord {
    workflowId: String!
    url: String!
    """
    False when the reactor does not know its own public origin, so the url
    above is a bare path no provider can call: the author supplies the origin.
    """
    absoluteUrl: Boolean!
    "True while the workflow is ENABLED with a valid webhook trigger"
    armed: Boolean!
    createdAt: String!
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
    startedAt: String
    endedAt: String
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
    """
    Runs the piece's auth.validate against the connection's credentials,
    then auth.getConnectionIdentifier for the account label, and records the
    outcome on the connection document.
    """
    checkConnection(connectionId: String!): ConnectionCheckResult!
  }

  type Mutation {
    workflowRuntime: WorkflowRuntimeMutations!
  }
`;
