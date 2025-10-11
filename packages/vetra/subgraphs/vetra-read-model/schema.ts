import type { DocumentNode } from "graphql";
import { gql } from "graphql-tag";

export const schema: DocumentNode = gql`
  """
  Subgraph definition
  """
  type VetraPackageItem {
    documentId: String!
    name: String!
    description: String
    category: String
    authorName: String
    authorWebsite: String
    githubUrl: String
    npmUrl: String
    driveId: String
  }

  type Query {
    vetraPackages(
      search: String
      sortOrder: String
      documentId_in: [PHID!]
    ): [VetraPackageItem!]!
  }
`;
