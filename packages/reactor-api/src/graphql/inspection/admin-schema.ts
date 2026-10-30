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
    "Memory telemetry can be switched and heap snapshots written."
    memoryTelemetry: Boolean!
  }

  type Query {
    inspectionAdmin: InspectionAdmin!
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
    "Starts or stops memory telemetry, or changes its interval or outputs, without a restart."
    inspectionSetMemoryTelemetry(
      enabled: Boolean!
      intervalMs: Int
      outputs: [String!]
    ): Boolean!
    """
    Writes a V8 heap snapshot of the main thread and returns its path on the
    host. Blocks the server for seconds to minutes. force skips the check for
    free memory.
    """
    inspectionWriteHeapSnapshot(force: Boolean): String!
  }
`;
