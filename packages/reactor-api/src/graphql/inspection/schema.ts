import { gql } from "graphql-tag";

/**
 * SDL of the inspection subgraph (multi-reactor W3.2): the reactor's typed
 * inspection surfaces -- `IInspector` and `ISyncInspector` from
 * `@powerhousedao/reactor` -- served over the existing `/graphql` plane so a
 * monitor can inspect a REMOTE reactor through the same contracts the local
 * hosting kinds use.
 *
 * Shape notes:
 *
 * - Every read hangs off ONE root field, `inspection`, so the supergraph gains
 *   a single name and a client can fetch queue state, processors, storage
 *   health and the sync view in one round trip. Mutations are flat and
 *   `inspection`-prefixed, because a nested mutation type gives no such
 *   batching and only hides which field is the write.
 * - The flat, stable records (counts, cursors, mailbox depths, processor
 *   identity) are spelled out as GraphQL fields. The open-ended payload
 *   records -- a `Job`, a `DeadLetterRecord`, a `CatchUpStatus`, an integrity
 *   result -- ride the `JSONObject` scalar the host injects into every
 *   subgraph. Re-declaring the reactor's whole type graph in SDL would be a
 *   second definition of it that can only drift; the TypeScript types stay
 *   authoritative, exactly as they do across the worker RPC boundary where the
 *   same records are structured-cloned.
 * - `Date`s do not survive JSON, so the one date-typed inspection field
 *   (`InspectorProcessorInfo.lastErrorTimestamp`) travels as epoch
 *   milliseconds and is rebuilt client-side.
 */
export const inspectionTypeDefs = gql`
  """
  What this reactor is, as the reactor itself reports it. The facts a caller
  cannot derive from the far side of a wire: whether the workflow engine is
  composed here, which sync channel types the BUILT channel factory routes,
  and which inspection tiers this deployment has opted into.
  """
  type ReactorInspectionInfo {
    """
    How the reactor is hosted, as the CALLER sees it: always "remote", because
    anything reading this is on the other side of HTTP.
    """
    hosting: String!
    """
    How the caller's inspector reaches it: always "rpc" over this surface.
    """
    inspection: String!
    """
    The server's own store class ("postgres" or "pglite"), informational. A
    caller's capability contract records this store as "remote": it is not the
    caller's to open, close or heal.
    """
    storageKind: String!
    """
    Whether this reactor can host processor factories. Always true: a server reactor registers its own.
    """
    processors: Boolean!
    """
    Whether the workflow engine is composed into this host (plan agreed decision 3: the engine is Node-only and a singleton).
    """
    workflows: Boolean!
    """
    The ChannelConfig types the built channel factory routes, e.g. ["polling"].
    """
    syncChannels: [String!]!
    """
    Whether this deployment opted into the mutating inspection ops (PH_INSPECTION_ADMIN).
    """
    adminEnabled: Boolean!
    """
    Whether this deployment opted into raw SQL against the reactor store (PH_INSPECTION_SQL). Independent of, and additional to, adminEnabled.
    """
    sqlEnabled: Boolean!
  }

  """
  Point-in-time job-queue view; the job records ride the JSON scalar.
  """
  type InspectionQueueState {
    isPaused: Boolean!
    totalPending: Int!
    totalExecuting: Int!
    pendingJobs: [JSONObject!]!
    executingJobs: [JSONObject!]!
  }

  """
  A tracked processor's identity and progress.
  """
  type InspectionProcessor {
    processorId: String!
    factoryId: String!
    driveId: String!
    processorIndex: Int!
    lastOrdinal: Int!
    status: String!
    lastError: String
    """
    Epoch milliseconds; a Date does not survive JSON.
    """
    lastErrorTimestampUtcMs: Float
  }

  """
  The reactor's storage-health dimension. A host that opened no self-healing
  PGlite session reports the healthy, never-recreated default -- the field
  exists so one client reads every hosting kind the same way.
  """
  type InspectionStorageHealth {
    healthy: Boolean!
    everRecreated: Boolean!
    recreateCount: Int!
    lastRecreated: JSONObject
  }

  """
  A remote's persisted cursor beside the live watermark its channel polls from.
  """
  type InspectionCursor {
    cursorType: String!
    cursorOrdinal: Int!
    lastSyncedAtUtcMs: Float
    liveAckOrdinal: Int!
    liveLatestOrdinal: Int!
  }

  type InspectionMailboxDepths {
    inbox: Int!
    outbox: Int!
    deadLetter: Int!
  }

  """
  A channel's connection snapshot plus the two derived lie-detector signals.
  """
  type InspectionConnectionHealth {
    snapshot: JSONObject!
    neverSucceeded: Boolean!
    stalenessMs: Float
  }

  """
  One remote's sync state. meta carries the remote's configuration (name,
  channel config, collection, filter, options) so a client can rebuild the
  remote list from the same query that feeds the inspection view.
  """
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
  One page of a remote's dead letters, newest first.
  """
  type InspectionDeadLetterPage {
    remoteName: String!
    results: [JSONObject!]!
    nextCursor: String
  }

  """
  The read side of the reactor's inspection surface. Read-only: nothing here
  changes reactor state. Still operator-grade -- queue jobs and dead letters
  carry operation payloads, i.e. document content -- so every field is gated on
  the host's policy-wide reader check.
  """
  type ReactorInspection {
    info: ReactorInspectionInfo!
    queueState: InspectionQueueState!
    processors: [InspectionProcessor!]!
    catchUpStatus: JSONObject!
    storageHealth: InspectionStorageHealth!
    """
    Cursors, mailbox depths and connection health for every configured remote.
    """
    remotes: [InspectionRemote!]!
    """
    The same inspection for one remote by name.
    """
    remote(remoteName: String!): InspectionRemote!
    deadLetters(
      remoteName: String!
      cursor: String
      limit: Int
    ): InspectionDeadLetterPage!
    """
    Sync holds: operations withheld from a peer, by remote and/or document.
    """
    holds(remoteName: String, documentId: String): [JSONObject!]!
  }

  type Query {
    """
    The reactor's inspection surface (multi-reactor W3.2).
    """
    inspection: ReactorInspection!
  }

  type Mutation {
    inspectionPauseQueue: Boolean!
    inspectionResumeQueue: Boolean!
    inspectionRetryProcessor(processorId: String!): Boolean!
    inspectionSweepCatchUp: [JSONObject!]!
    inspectionValidateDocument(documentId: String!, branch: String): JSONObject!
    inspectionRebuildKeyframes(documentId: String!, branch: String): JSONObject!
    inspectionRebuildSnapshots(documentId: String!, branch: String): JSONObject!
    inspectionTriggerPull(remoteName: String!): Boolean!
    inspectionRewindInboxCursor(remoteName: String!, toOrdinal: Int!): Boolean!
    inspectionResetChannel(remoteName: String!): Boolean!
    inspectionRequeueDeadLetter(remoteName: String!, id: String!): Boolean!
    inspectionClearDeadLetter(remoteName: String!, id: String!): Boolean!
    """
    Raw SQL against the reactor's own store. Its own opt-in tier
    (PH_INSPECTION_SQL) on top of the admin one: unlike every other field here
    it is unconstrained access to the store, read and write.
    """
    inspectionQueryDb(sql: String!, params: [Unknown!]): [Unknown!]!
  }
`;
