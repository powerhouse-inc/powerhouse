import { gql } from "graphql-tag";

export const inspectionAdminTypeDefs = gql`
  """
  The levers a listed admin may pull. Only served when the host enables
  inspection-admin; every field refuses any other caller.
  """
  type InspectionAdmin {
    "Processor retry and rerun are served."
    processors: Boolean!
    "The catch-up priority can be set."
    catchUpPriority: Boolean!
    "Keyframe clean-up and reclaim are served."
    keyframes: Boolean!
  }

  "Rows and stored bytes a keyframe clean-up saw, can remove and removed."
  type InspectionKeyframeCleanupTotals {
    streams: Float!
    rows: Float!
    bytes: Float!
    removableRows: Float!
    removableBytes: Float!
    removedRows: Float!
    removedBytes: Float!
  }

  type InspectionKeyframeCleanupType {
    documentType: String!
    "The rule in force; absent keeps every keyframe."
    keep: Float
    interval: Float!
    streams: Float!
    rows: Float!
    bytes: Float!
    removableRows: Float!
    removableBytes: Float!
    removedRows: Float!
    removedBytes: Float!
  }

  type InspectionKeyframeCleanupReason {
    "beyond-keep or deleted-document."
    reason: String!
    rows: Float!
    bytes: Float!
  }

  type InspectionKeyframeCleanupStream {
    documentId: String!
    documentType: String!
    scope: String!
    branch: String!
    reason: String!
    rows: Float!
    bytes: Float!
    removableRows: Float!
    removableBytes: Float!
  }

  type InspectionKeyframeCleanupRun {
    id: String!
    dryRun: Boolean!
    "running, done, cancelled or failed."
    state: String!
    startedAtUtcMs: Float!
    finishedAtUtcMs: Float
    documentsTotal: Float!
    documentsSeen: Float!
    "The catch-up priority is at level 0, which stops the run."
    parked: Boolean!
    totals: InspectionKeyframeCleanupTotals!
    types: [InspectionKeyframeCleanupType!]!
    reasons: [InspectionKeyframeCleanupReason!]!
    topStreams: [InspectionKeyframeCleanupStream!]!
    error: String
  }

  type InspectionKeyframeReclaim {
    "running, done, busy, failed or unsupported."
    state: String!
    startedAtUtcMs: Float!
    finishedAtUtcMs: Float
    tableBytesBefore: Float
    tableBytesAfter: Float
    durationMs: Float
    "What happened, or what to do by hand."
    message: String!
  }

  type Query {
    inspectionAdmin: InspectionAdmin!
    "The running or latest keyframe clean-up."
    inspectionKeyframeCleanup: InspectionKeyframeCleanupRun
    "The running or latest reclaim of the Keyframe table's disk space."
    inspectionKeyframeReclaim: InspectionKeyframeReclaim
  }

  type Mutation {
    "Clears a processor's error and replays from its cursor."
    inspectionRetryProcessor(processorId: String!): Boolean!
    """
    Replays a processor. With clear, it and the processors sharing its clear
    scope are cleared and replayed from their floor; otherwise its cursor moves
    back to fromOrdinal, between its floor and its cursor. Answers once the
    replay ends or has run for two seconds; its progress shows in the
    processor's lastOrdinal, and a later failure in its status and the log.
    """
    inspectionRerunProcessor(
      processorId: String!
      clear: Boolean!
      fromOrdinal: Float!
    ): Boolean!
    """
    Sets the pace of processor backfills: mode dynamic hands the level to the
    load controller (level must be absent); mode fixed holds level, 0-7.
    """
    inspectionSetCatchUpPriority(mode: String!, level: Int): Boolean!
    """
    Starts a keyframe clean-up and answers at once; poll
    inspectionKeyframeCleanup. A dry run only reports. Otherwise it applies the
    configured keep and removes the keyframes of deleted documents. Refused
    while another run or a reclaim is going.
    """
    inspectionStartKeyframeCleanup(
      dryRun: Boolean!
    ): InspectionKeyframeCleanupRun!
    "Stops a running keyframe clean-up after its current statement."
    inspectionCancelKeyframeCleanup: Boolean!
    """
    Rewrites the Keyframe table to give its dead space back to the disk, once
    the store is quiet; poll inspectionKeyframeReclaim. Where the host has no
    way to do that, it answers with what to do by hand.
    """
    inspectionReclaimKeyframeSpace: InspectionKeyframeReclaim!
  }
`;
