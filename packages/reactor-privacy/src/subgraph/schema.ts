import { gql } from "graphql-tag";

export const typeDefs = gql`
  type PrivacySubjectDocument {
    documentId: ID!
    role: String!
    firstOrdinal: Int!
    lastOrdinal: Int!
  }

  type PrivacyBoundSyncRemote {
    name: String!
    collectionId: String!
    channelType: String!
  }

  type PrivacyPeerManifestAppKey {
    remoteName: String!
    appKey: String!
    heardAtUtcMs: Float
  }

  type PrivacyPermissionRow {
    table: String!
    column: String!
    documentId: ID
    "JSON-encoded"
    detail: String
  }

  type PrivacyDisclosure {
    subjectHash: String!
    documents: [PrivacySubjectDocument!]!
    boundSyncRemotes: [PrivacyBoundSyncRemote!]!
    peerManifests: [PrivacyPeerManifestAppKey!]!
    permissions: [PrivacyPermissionRow!]!
    notCovered: [String!]!
  }

  type PrivacyErasurePlanItem {
    documentId: ID!
    expandedFrom: ID
    live: Boolean!
    operationCount: Int!
    groupReferencers: [ID!]!
  }

  type PrivacyErasurePlan {
    maxPurgeOperations: Int!
    items: [PrivacyErasurePlanItem!]!
  }

  type PrivacyErasureItem {
    documentId: ID!
    status: String!
    allowLarge: Boolean!
    markerOrdinal: Int
    lastError: String
    updatedAt: String!
  }

  type PrivacyErasureRequest {
    requestId: ID!
    subjectHash: String
    requestedBy: String!
    requestedAt: String!
    deadline: String!
    status: String!
    items: [PrivacyErasureItem!]!
  }

  type Query {
    disclose(identifier: String!): PrivacyDisclosure!
    erasurePlan(ids: [ID!]!): PrivacyErasurePlan!
    erasureRequest(requestId: ID!): PrivacyErasureRequest!
  }

  type Mutation {
    "deadline is an ISO 8601 timestamp"
    requestErasure(
      ids: [ID!]!
      deadline: String
      allowLarge: [ID!]
    ): PrivacyErasureRequest!
  }
`;
