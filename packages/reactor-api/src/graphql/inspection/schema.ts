import { gql } from "graphql-tag";

// Pinned by test to INSPECTION_WIRE_FIELDS/ROOT_FIELDS; ordinals are Float.
export const inspectionTypeDefs = gql`
  type ReactorStorageFacts {
    engine: String!
    persistence: String!
    durable: Boolean!
    selfHeal: Boolean!
  }

  type InspectorAccess {
    admin: Boolean!
    sql: Boolean!
  }

  """
  What this reactor reports about itself. access is null unless the caller is
  one of the host's admins.
  """
  type ReactorInfo {
    storage: ReactorStorageFacts!
    workflows: Boolean!
    syncChannels: [String!]!
    access: InspectorAccess
  }

  type InspectionDocumentModel {
    documentType: String!
    name: String!
    version: Int!
    supportedVersions: [Int!]!
  }

  type InspectionDrive {
    driveId: String!
    name: String!
    branch: String!
    collectionId: String!
    documentType: String!
    nodeCount: Int!
    fileCount: Int!
    folderCount: Int!
    otherNodeCount: Int!
    unreadableNodeCount: Int!
    icon: String
  }

  type InspectionDrivePage {
    results: [InspectionDrive!]!
    nextCursor: String
  }

  type InspectionDriveIntegrityRef {
    id: String!
    documentType: String!
  }

  type InspectionDriveIntegrity {
    driveId: String!
    checkedNodeCount: Int!
    totalFileNodeCount: Int!
    """
    File nodes whose document is missing or not served to you; the two are
    reported alike so a withheld document's existence does not leak.
    """
    missingDocuments: [InspectionDriveIntegrityRef!]!
    unsupportedTypes: [InspectionDriveIntegrityRef!]!
  }

  type InspectionAttachmentInfo {
    present: Boolean!
    storeKind: String!
    hasReplicator: Boolean!
    replicatorRunning: Boolean!
    backlogScanned: Boolean!
    refsSeen: Int!
    held: Int!
    bytesHeld: Float!
    queued: Int!
    fetching: Int!
    pendingFetches: Int!
    waiting: Int!
    notFound: Int!
    failed: Int!
    lastError: String
  }

  """
  A queued job without its actions or operations.
  """
  type InspectionQueueJob {
    id: String!
    kind: String!
    documentId: String!
    scope: String!
    branch: String!
    status: String!
    actionCount: Int!
    operationCount: Int!
    retryCount: Int!
  }

  type InspectionQueueState {
    isPaused: Boolean!
    totalPending: Int!
    totalExecuting: Int!
    pendingJobs: [InspectionQueueJob!]!
    executingJobs: [InspectionQueueJob!]!
  }

  type InspectionProcessor {
    processorId: String!
    factoryId: String!
    driveId: String!
    processorIndex: Int!
    lastOrdinal: Float!
    status: String!
    lastError: String
    lastErrorTimestampUtcMs: Float
    floor: Float!
    clearable: Boolean!
    runFrom: Float!
    phase: String!
  }

  """
  What one catch-up priority level sets. giveWay is stop (level 0: no page is
  read until the level rises), pause (pauseMs between pages), yield (one
  event-loop turn) or none.
  """
  type InspectionCatchUpLevelSettings {
    slots: Int!
    pageSize: Int!
    pauseMs: Int!
    giveWay: String!
  }

  """
  The host's load over its last window, as the dynamic controller read it.
  """
  type InspectionCatchUpLoadSample {
    requests: Int!
    p95LatencyMs: Float!
    eventLoopDelayMs: Float!
    idleForMs: Float!
  }

  """
  The pace of processor backfills. mode is fixed or dynamic; level is 0-7.
  sample is null until a dynamic tick has sampled the host's load.
  """
  type InspectionCatchUpPriority {
    mode: String!
    level: Int!
    settings: InspectionCatchUpLevelSettings!
    reason: String!
    sample: InspectionCatchUpLoadSample
  }

  """
  healthy means something only when tracked; an untracked store reports false.
  """
  type InspectionStorageHealth {
    tracked: Boolean!
    healthy: Boolean!
    everRecreated: Boolean!
    recreateCount: Int!
  }

  """
  Issues in scopes the caller may not read are left out.
  """
  type InspectionValidation {
    documentId: String!
    isConsistent: Boolean!
    keyframeIssues: [JSONObject!]!
    snapshotIssues: [JSONObject!]!
    streamOrderIssues: [JSONObject!]!
  }

  type InspectionCursor {
    cursorType: String!
    cursorOrdinal: Float!
    lastSyncedAtUtcMs: Float
    liveAckOrdinal: Float!
    liveLatestOrdinal: Float!
  }

  type InspectionMailboxDepths {
    inbox: Int!
    outbox: Int!
    deadLetter: Int!
  }

  type InspectionConnectionHealth {
    snapshot: JSONObject!
    neverSucceeded: Boolean!
    stalenessMs: Float
  }

  type InspectionRemote {
    remoteName: String!
    remoteId: String!
    inboxCursor: InspectionCursor!
    outboxCursor: InspectionCursor!
    mailboxDepths: InspectionMailboxDepths!
    connection: InspectionConnectionHealth!
    meta: JSONObject!
  }

  """
  A dead letter without its operations.
  """
  type InspectionDeadLetter {
    id: String!
    jobId: String!
    documentId: String!
    branch: String!
    scopes: [String!]!
    errorType: String!
    errorMessage: String!
    operationCount: Int!
  }

  type InspectionDeadLetterPage {
    remoteName: String!
    results: [InspectionDeadLetter!]!
    nextCursor: String
  }

  """
  Reads only. info and documentModels serve every caller; drive and document
  reads are made as the caller through the reactor read gate; the rest need
  one of the host's admins.
  """
  type ReactorInspection {
    info: ReactorInfo!
    documentModels: [InspectionDocumentModel!]!
    drives(cursor: String, limit: Int): InspectionDrivePage!
    """
    Reads every file node's document. Throttled per caller.
    """
    driveIntegrity(driveId: String!, branch: String!): InspectionDriveIntegrity!
    attachmentInfo: InspectionAttachmentInfo!
    queueState: InspectionQueueState!
    processors: [InspectionProcessor!]!
    catchUpStatus: JSONObject!
    catchUpPriority: InspectionCatchUpPriority!
    storageHealth: InspectionStorageHealth!
    """
    Replays the whole document; expensive. Throttled per caller.
    """
    validateDocument(documentId: String!, branch: String): InspectionValidation!
    remotes: [InspectionRemote!]!
    remote(remoteName: String!): InspectionRemote!
    deadLetters(
      remoteName: String!
      cursor: String
      limit: Int
    ): InspectionDeadLetterPage!
  }

  type Query {
    inspection: ReactorInspection!
  }
`;
