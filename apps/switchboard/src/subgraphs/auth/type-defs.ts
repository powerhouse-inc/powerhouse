export const typeDefs = `type Query {
  me: User
  sessions: [Session!]!
}

type Mutation {
  createChallenge(address: String!): Challenge
  solveChallenge(nonce: String!, signature: String!): SessionOutput
  createSession(session: SessionInput!): SessionOutput
  revokeSession(sessionId: String!): SessionOutput
}

type User {
  address: String!
  createdAt: DateTime!
}

type Challenge {
  nonce: String!
  message: String!
  hex: String!
}

type SessionOutput {
  id: ID!
  token: String
}

type Session {
  id: ID!
  userId: String!
  address: String!
  expiresAt: DateTime!
  createdAt: DateTime!
  updatedAt: DateTime!
  referenceTokenId: String!
  createdBy: String!
  referenceExpiryDate: DateTime
  isUserCreated: Boolean!
  name: String
  allowedOrigins: String
  revokedAt: DateTime
}

input SessionInput {
  expiryDurationSeconds: Int
  name: String!
  allowedOrigins: String!
}
`;
