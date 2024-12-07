export const typeDefs = `type Query {
  system: System
  drive: DocumentDriveState
  document(id: ID!): IDocument
  documents: [String!]!
}

type Mutation {
  registerPullResponderListener(filter: InputListenerFilter!): Listener
  pushUpdates(strands: [InputStrandUpdate!]): [ListenerRevision!]!
  acknowledge(listenerId: String!, revisions: [ListenerRevisionInput]): Boolean
}

input InputOperationSignerUser {
  address: String!
  networkId: String!
  chainId: Int!
}

type OperationSignerUser {
  address: String!
  networkId: String!
  chainId: Int!
}

input InputOperationSignerApp {
  name: String!
  key: String!
}

type OperationSignerApp {
  name: String!
  key: String!
}

type OperationSigner {
  app: OperationSignerApp
  user: OperationSignerUser
  signatures: [[String!]]!
}

input InputOperationSigner {
  app: InputOperationSignerApp
  user: InputOperationSignerUser
  signatures: [[String!]]!
}

type OperationContext {
  signer: OperationSigner
}

input InputOperationContext {
  signer: InputOperationSigner
}

input InputOperationUpdate {
  index: Int!
  skip: Int
  type: String!
  id: String!
  input: String!
  hash: String!
  timestamp: String!
  error: String
  context: InputOperationContext
}

type OperationUpdate {
  index: Int!
  skip: Int
  type: String!
  id: String!
  input: String!
  hash: String!
  timestamp: String!
  error: String
  context: OperationContext
}

type StrandUpdate {
  driveId: String!
  documentId: String!
  scope: String!
  branch: String!
  operations: [OperationUpdate!]!
}

input InputStrandUpdate {
  driveId: String!
  documentId: String!
  scope: String!
  branch: String!
  operations: [InputOperationUpdate!]!
}

input InputListenerFilter {
  documentType: [String!]
  documentId: [String!]
  scope: [String!]
  branch: [String!]
}

enum UpdateStatus {
  SUCCESS
  MISSING
  CONFLICT
  ERROR
}

input ListenerRevisionInput {
  driveId: String!
  documentId: String!
  scope: String!
  branch: String!
  status: UpdateStatus!
  revision: Int!
}

type ListenerRevision {
  driveId: String!
  documentId: String!
  scope: String!
  branch: String!
  status: UpdateStatus!
  revision: Int!
  error: String
}

type System {
  sync: Sync
}

type Sync {
  strands(listenerId: ID!, since: String): [StrandUpdate!]!
}
`;
