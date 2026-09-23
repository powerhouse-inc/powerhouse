import { gql } from "graphql-tag";

export const typeDefs = gql`
  type PrivacyDisclosedDocument {
    documentId: String!
    roles: [String!]!
    firstOrdinal: Int!
    lastOrdinal: Int!
  }

  type PrivacyDisclosure {
    subjectHash: String!
    documents: [PrivacyDisclosedDocument!]!
    boundRemotes: [String!]!
    "JSON: the permission rows naming the subject, or \\"not-configured\\"."
    permissions: String!
    notIndexed: [String!]!
  }

  type PrivacyErasureCandidate {
    documentId: String!
    requested: Boolean!
    alreadyPurged: Boolean!
    status: String!
    blockers: [String!]!
    "JSON: the remotes still owed operations of this document."
    owed: String!
    groupUsers: [String!]!
  }

  type PrivacyErasurePlan {
    ready: Boolean!
    candidates: [PrivacyErasureCandidate!]!
  }

  type PrivacyErasureResult {
    requestId: String!
    status: String!
    purged: [String!]!
    alreadyPurged: [String!]!
    unacknowledgedShards: [Int!]!
    "JSON: the full purge and permission outcome."
    detail: String!
  }

  type PrivacyAuditEntry {
    id: String!
    kind: String!
    status: String!
    requestId: String
    requester: String
    authoriser: String
    subjectHash: String
    documentIds: [String!]!
    "JSON"
    detail: String!
    createdAtUtc: String!
  }

  input PrivacyEraseInput {
    documentIds: [String!]!
    requestId: String
    requester: String!
    identifier: String
    skipRemotes: [String!]
    allowGroupInUse: Boolean
  }

  type Query {
    privacyDisclosure(identifier: String!): PrivacyDisclosure!
    privacyErasurePlan(documentIds: [String!]!): PrivacyErasurePlan!
    privacyAuditLog(limit: Int): [PrivacyAuditEntry!]!
  }

  type Mutation {
    privacyErase(input: PrivacyEraseInput!): PrivacyErasureResult!
  }
`;
