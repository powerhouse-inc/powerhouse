import { gql } from "graphql-tag";

export const typeDefs = gql`
  enum ReactorDriveNodeKind {
    FILE
    FOLDER
  }

  input ReactorDrivePagingInput {
    cursor: String
    limit: Int
  }

  type ReactorDriveFileNode {
    id: ID!
    driveId: ID!
    name: String!
    parentFolder: ID
    documentType: String!
  }

  type ReactorDriveFolderNode {
    id: ID!
    driveId: ID!
    name: String!
    parentFolder: ID
    children(
      paging: ReactorDrivePagingInput
      kind: ReactorDriveNodeKind
    ): ReactorDriveNodePage!
  }

  union ReactorDriveNode = ReactorDriveFileNode | ReactorDriveFolderNode

  type ReactorDriveNodePage {
    results: [ReactorDriveNode!]!
    nextCursor: String
    hasMore: Boolean!
    totalCount: Int
  }

  type ReactorDrive {
    id: ID!
    name: String!
    icon: String
    sharingType: String!
    availableOffline: Boolean!
    rootNodes(
      paging: ReactorDrivePagingInput
      kind: ReactorDriveNodeKind
    ): ReactorDriveNodePage!
  }

  type Query {
    reactorDrive(id: ID!): ReactorDrive
    reactorDriveNode(driveId: ID!, id: ID!): ReactorDriveNode
    reactorDriveDescendants(driveId: ID!, root: ID!): [ReactorDriveNode!]!
  }
`;
