import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql`
  """
  Queries: VetraPackage Document
  """
  type VetraPackageQueries {
    getDocument(docId: PHID!, driveId: PHID): VetraPackage
    getDocuments(driveId: String!): [VetraPackage!]
  }

  type Query {
    VetraPackage: VetraPackageQueries
  }

  """
  Mutations: VetraPackage
  """
  type Mutation {
    VetraPackage_createDocument(name: String!, driveId: String): String

    VetraPackage_setPackageName(
      driveId: String
      docId: PHID
      input: VetraPackage_SetPackageNameInput
    ): Int
    VetraPackage_setPackageDescription(
      driveId: String
      docId: PHID
      input: VetraPackage_SetPackageDescriptionInput
    ): Int
    VetraPackage_setPackageCategory(
      driveId: String
      docId: PHID
      input: VetraPackage_SetPackageCategoryInput
    ): Int
    VetraPackage_setPackageAuthor(
      driveId: String
      docId: PHID
      input: VetraPackage_SetPackageAuthorInput
    ): Int
    VetraPackage_setPackageAuthorName(
      driveId: String
      docId: PHID
      input: VetraPackage_SetPackageAuthorNameInput
    ): Int
    VetraPackage_setPackageAuthorWebsite(
      driveId: String
      docId: PHID
      input: VetraPackage_SetPackageAuthorWebsiteInput
    ): Int
    VetraPackage_addPackageKeyword(
      driveId: String
      docId: PHID
      input: VetraPackage_AddPackageKeywordInput
    ): Int
    VetraPackage_removePackageKeyword(
      driveId: String
      docId: PHID
      input: VetraPackage_RemovePackageKeywordInput
    ): Int
    VetraPackage_setPackageGithubUrl(
      driveId: String
      docId: PHID
      input: VetraPackage_SetPackageGithubUrlInput
    ): Int
    VetraPackage_setPackageNpmUrl(
      driveId: String
      docId: PHID
      input: VetraPackage_SetPackageNpmUrlInput
    ): Int
  }

  """
  Module: BaseOperations
  """
  input VetraPackage_SetPackageNameInput {
    name: String!
  }
  input VetraPackage_SetPackageDescriptionInput {
    description: String!
  }
  input VetraPackage_SetPackageCategoryInput {
    category: String!
  }
  input VetraPackage_SetPackageAuthorInput {
    name: OID
    website: URL
  }
  input VetraPackage_SetPackageAuthorNameInput {
    name: String!
  }
  input VetraPackage_SetPackageAuthorWebsiteInput {
    website: URL!
  }
  input VetraPackage_AddPackageKeywordInput {
    id: String!
    label: String!
  }
  input VetraPackage_RemovePackageKeywordInput {
    id: String!
  }
  input VetraPackage_SetPackageGithubUrlInput {
    url: URL!
  }
  input VetraPackage_SetPackageNpmUrlInput {
    url: URL!
  }
`;
