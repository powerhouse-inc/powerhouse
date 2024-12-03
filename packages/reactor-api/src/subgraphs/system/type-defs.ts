export const typeDefs = `type Query {
    drives: [String!]!
    driveIdBySlug(slug: String!): String
  }
  
  type Mutation {
    addDrive(global: DocumentDriveStateInput!): DocumentDriveState
    deleteDrive(id: ID!): Boolean
    setDriveIcon(id: String!, icon: String!): Boolean
    setDriveName(id: String!, name: String!): Boolean
  }
  
  input DocumentDriveStateInput {
    name: String
    id: String
    slug: String
    icon: String
  }`;
