import { gql } from "graphql-tag";

export const inspectionAdminTypeDefs = gql`
  """
  The levers a listed admin may pull. Only served when the host enables
  inspection-admin; every field refuses any other caller.
  """
  type InspectionAdmin {
    "Processor retry and rerun are served."
    processors: Boolean!
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
  }
`;
