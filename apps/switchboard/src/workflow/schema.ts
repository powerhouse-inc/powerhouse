import type { DocumentNode } from "graphql";
import { gql } from "graphql-tag";

export const schema: DocumentNode = gql`
  """
  WorkflowRuntime Queries
  """
  type WorkflowRuntimeQueries {
    health: String!
    """
    Whether this reactor enforces document auth (REACTOR_AUTH_ENFORCEMENT).
    On, a workflow needs a signed publish, and the host grants, to reach
    documents. Answered to any caller.
    """
    authEnforcement: Boolean!
    """
    Who this host signs as: grant it on each document a step writes. Null for
    a caller who is not signed in, or a host with no signer.
    """
    reactorIdentity: ReactorIdentity
    """
    REACTOR_AUTH_CONDITIONS. True: grant the host by key, with
    { match: subject.key == key }; false: by address. Null for a caller who
    is not signed in.
    """
    authConditions: Boolean
    """
    Why the workflow's last publish or enable got no reactor access, naming
    the publisher and the connection; null when the check passed.
    """
    reactorAccessDenial(workflowId: String!): String
    """
    Persisted runs, newest first. Scope them to one workflow, or to every
    workflow a drive holds; workflowId wins when both are given.
    """
    runs(
      workflowId: String
      driveId: String
      limit: Int
      "Trigger kinds to leave out, e.g. test."
      excludeTriggerKinds: [String!]
    ): [WorkflowRunRecord!]!
    """
    The same listing a page at a time, newest journaled first. Pass a page's
    cursor back in paging to read the next; a page is short only when
    hasNextPage is false, or when the caller could read none of a long
    stretch of runs. A run that starts between pages keeps its place.
    """
    runsPage(
      workflowId: String
      driveId: String
      excludeTriggerKinds: [String!]
      paging: WorkflowRunsPagingInput
    ): WorkflowRunResultPage!
    run(id: String!): WorkflowRunRecord
    """
    The descriptor (props, auth, ports) of one action or trigger, as the
    version that runs it describes it; triggers come back under "trigger".
    """
    blockDescriptor(block: BlockInput!): Unknown
    """
    Resolves a dynamic prop against the current config values: a DROPDOWN
    yields { options, placeholder, disabled }, a DYNAMIC prop yields the
    resolved sub-property descriptor list.
    """
    blockOptions(
      block: BlockInput!
      propName: String!
      input: Unknown
      connectionId: String
      "What the author typed, for a DROPDOWN declared with refreshOnSearch."
      searchValue: String
      "The step's reactor connection; its filter narrows what the resolver reads."
      reactorConnectionId: String
    ): Unknown
    """
    Every piece this reactor offers: the core piece, its package pieces, and
    the pieces the registry and Activepieces publish.
    """
    pieceCatalog: Unknown
    """
    A piece's actions at one version; pin a step to that version.
    """
    pieceActions(
      packageName: String!
      "That version; the installed or latest one when omitted."
      version: String
    ): Unknown
    """
    A piece's triggers at one version; pin a trigger to that version.
    """
    pieceTriggers(
      packageName: String!
      "That version; the installed or latest one when omitted."
      version: String
    ): Unknown
    """
    Full piece detail (PieceMetadataModel-shaped), verbatim from the cloud API.
    """
    pieceDetail(
      packageName: String!
      "That version; the installed or latest one when omitted."
      version: String
    ): Unknown
    """
    Piece and block search across the catalog, grouped by piece. The index
    builds lazily on first use; poll while status is "indexing".
    """
    searchPieces(
      query: String!
      "action | trigger"
      kind: String!
      "local | registry | activepieces; all when omitted."
      sources: [String!]
      "Category ids, any of; all when omitted."
      categories: [String!]
      "Pieces returned."
      limit: Int
    ): PieceSearchResult!
    """
    Health of every registered piece trigger (poll schedule, errors).
    """
    triggerStates: [TriggerStateRecord!]!
    """
    Authored output shape of a block (SDL / outputSchema / sampleData).
    """
    blockOutputTree(block: BlockInput!, config: Unknown): Unknown
    """
    Output shape of a draft step or trigger: its latest test output
    (source "test", with sample and testedAt) when tested, else as blockOutputTree.
    """
    stepOutputTree(workflowId: String!, stepId: String!): Unknown
    """
    Every block of the draft (trigger first) as this reactor resolves it:
    which piece version runs, from where, and how it matches the pin.
    """
    blockResolutions(workflowId: String!): [BlockResolutionRecord!]!
    """
    Every powerhouse/connection document, for connection pickers.
    """
    connections: [ConnectionRecord!]!
    """
    The webhook endpoint for a workflow: the URL to hand the provider. Minted
    on first ask, whether or not the workflow is armed — an author needs the
    URL before enabling, and the armed field carries that difference. Null
    only when the host has no webhook service. With driveId, a workflow not
    synced here yet is waited for briefly, then fails as WORKFLOW_SYNCING.
    """
    webhookEndpoint(workflowId: String!, driveId: String): WebhookEndpointRecord
    """
    Secret metadata (label, version, status). Never the value.
    """
    secret(ref: String!): SecretRecord
    secrets: [SecretRecord!]!
    """
    The URL an OAuth2 app must register as its redirect. A bare path when
    this host does not know its public origin; resolve it against the URL
    this API is reached at. Null when the host serves no HTTP routes.
    """
    oauthRedirectUri: String
    """
    How an OAuth2 sign-in opened by startOAuth stands; null when unknown.
    """
    oauthAttempt(state: String!): OAuthAttempt
  }

  type OAuthAttempt {
    connectionId: String!
    "PENDING | EXCHANGING | OK | ERROR"
    status: String!
    error: String
  }

  type OAuthStart {
    state: String!
    "Where to send the user to sign in."
    authorizationUrl: String!
    redirectUri: String!
    expiresAt: String!
  }

  """
  One action or trigger of a piece, as a workflow pins it. The engine's own
  blocks are the piece @powerhousedao/piece-core.
  """
  input BlockInput {
    pieceName: String!
    "Exact semver."
    pieceVersion: String!
    "The action or trigger name."
    name: String!
    "action | trigger"
    kind: String!
  }

  type BlockSearchHit {
    pieceName: String!
    "The version the hit is listed at; pin to it when picking the block."
    pieceVersion: String!
    "The action or trigger name."
    name: String!
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

  type BlockResolutionRecord {
    "The trigger's or step's id."
    stepId: String!
    pieceName: String!
    "The version the block pins."
    pieceVersion: String!
    "The action or trigger name."
    name: String!
    "action | trigger"
    kind: String!
    "The version that runs; null when nothing resolves."
    resolvedVersion: String
    "local | registry | activepieces | npm; null when nothing resolves."
    source: String
    "exact | compatible | fallback | installed | missing"
    match: String!
    "Why the version that runs differs from the pin, or why nothing resolves."
    note: String
    "The newest version any source offers."
    latestVersion: String
  }

  type PieceSearchMatch {
    pieceName: String!
    pieceVersion: String!
    displayName: String!
    description: String!
    logoUrl: String!
    categories: [String!]!
    "local | registry | activepieces"
    source: String!
    deprecated: Boolean
    "Why no block of the piece can run on this reactor."
    unsupported: String
    "Every query token matched the piece's own name."
    namedPiece: Boolean!
    "Matching blocks of the kind asked for, best first."
    blocks: [BlockSearchHit!]!
  }

  type PieceSearchResult {
    "ready | indexing | error"
    status: String!
    pieces: [PieceSearchMatch!]!
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

  type ReactorIdentity {
    "The address the host signs as; null without a signed-in identity."
    address: String
    "The did:key that signs the host's operations."
    key: String!
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
    False when the host gave the webhook service no public origin, so the url
    above is a bare path. Switchboard always gives one, falling back to
    http://localhost:<port> when PUBLIC_URL is unset.
    """
    absoluteUrl: Boolean!
    "True while the workflow is ENABLED with a valid webhook trigger"
    armed: Boolean!
    createdAt: String!
  }

  type TriggerStateRecord {
    workflowId: String!
    pieceName: String!
    triggerName: String!
    status: String!
    intervalMs: Int!
    nextPollAt: String
    lastPollAt: String
    lastError: String
    consecutiveFailures: Int!
    "When a webhook trigger next renews its subscription; null if it never does."
    nextRenewAt: String
    "The last failed renewal, kept apart from lastError, the poll's."
    renewError: String
    renewFailures: Int!
    "The piece version the trigger armed with; null for a host-fed trigger."
    pieceVersion: String
    pieceSource: String
    versionMatch: String
    versionNote: String
  }

  type Query {
    workflowRuntime: WorkflowRuntimeQueries!
  }

  type WorkflowStepRunRecord {
    stepId: String!
    stepKey: String!
    pieceName: String!
    "The action the step ran, or the trigger a trigger test sampled."
    blockName: String!
    status: String!
    input: Unknown
    output: Unknown
    port: String
    error: String
    "The thrown error's name, e.g. ReactorAccessDeniedError."
    errorName: String
    startedAt: String
    endedAt: String
    "The piece version that ran; null for an unresolved block."
    pieceVersion: String
    "local | registry | activepieces | npm"
    pieceSource: String
    "exact | compatible | fallback | installed | missing"
    versionMatch: String
    "Why the version that ran differs from the pin."
    versionNote: String
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
    errorName: String
    "When the run began executing; a PENDING run's is when it was journaled."
    startedAt: String!
    endedAt: String
    rerunOf: String
    "How many warningNotes the run has; a run with any is not a plain success."
    warnings: Int!
    "Steps that ran a fallback piece version, edges on ports nothing emits."
    warningNotes: [String!]!
    steps: [WorkflowStepRunRecord!]!
  }

  input WorkflowRunsPagingInput {
    "Page size; default 25, at most 100."
    limit: Int
    "The cursor of the previous page."
    cursor: String
  }

  type WorkflowRunResultPage {
    items: [WorkflowRunRecord!]!
    hasNextPage: Boolean!
    "True when the page was read after a cursor."
    hasPreviousPage: Boolean!
    "Resumes after this page's last run; null for an empty page."
    cursor: String
  }

  type WorkflowStepRun {
    stepId: String!
    key: String!
    pieceName: String!
    blockName: String!
    status: String!
    input: Unknown
    output: Unknown
    port: String
    error: String
    errorName: String
  }

  type WorkflowRunPayload {
    runId: String
    status: String!
    error: String
    errorName: String
    steps: [WorkflowStepRun!]!
  }

  type WorkflowStepTestResult {
    "Null when the test never started, e.g. an upstream block is untested."
    runId: String
    """
    SUCCEEDED | FAILED | INDETERMINATE. INDETERMINATE is neither: a host call
    the block made timed out, so a write it asked for may well have landed.
    Show it distinctly - it is not a confirmed pass.
    """
    status: String!
    output: Unknown
    error: String
    errorName: String
    durationMs: Int!
  }

  """
  WorkflowRuntime Mutations
  """
  type WorkflowRuntimeMutations {
    """
    Fires a workflow's manual trigger (the core piece's) and runs it to completion.
    """
    fire(workflowId: String!, payload: Unknown): WorkflowRunPayload!
    """
    Samples the draft trigger and saves it as the trigger's last test. A piece
    trigger runs its test hook (no cursor changes). Of the core piece's
    triggers, manual takes payload, schedule samples a fire now, and webhook
    waits for the next delivery to the workflow's endpoint, up to
    timeoutSeconds (default and cap 300), and that delivery runs nothing.
    """
    testTrigger(
      workflowId: String!
      payload: Unknown
      timeoutSeconds: Int
      driveId: String
    ): Unknown
    """
    Stops a webhook trigger test that is waiting; false when none was.
    """
    cancelTriggerTest(workflowId: String!): Boolean!
    """
    Runs one draft step against the latest test outputs of the blocks it
    reads, journaled as a "test" run and noted as the step's lastTest.
    driveId waits for an unsynced workflow, as for webhookEndpoint.
    """
    testStep(
      workflowId: String!
      stepId: String!
      driveId: String
    ): WorkflowStepTestResult!
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
    """
    Opens an OAuth2 sign-in with the connection's own app (client_id in its
    config, client_secret in its secretRefs). redirectUri is needed only when
    oauthRedirectUri is a bare path. With returnUrl, which must be on the
    caller's origin, the callback sends the browser back there with
    ?ph_oauth=<state> instead of closing the window.
    """
    startOAuth(
      connectionId: String!
      redirectUri: String
      returnUrl: String
    ): OAuthStart!
  }

  type Mutation {
    workflowRuntime: WorkflowRuntimeMutations!
  }
`;
