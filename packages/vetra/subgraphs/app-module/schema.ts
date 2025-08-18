import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql`
  """
  Subgraph definition for AppModule (powerhouse/app)
  """
  type AppModuleState {
    name: String!
    status: StatusType!
  }

  enum StatusType {
    DRAFT
    CONFIRMED
  }

  """
  Queries: AppModule
  """
  type AppModuleQueries {
    getDocument(docId: PHID!, driveId: PHID): AppModule
    getDocuments(driveId: String!): [AppModule!]
  }

  type Query {
    AppModule: AppModuleQueries
  }

  """
  Mutations: AppModule
  """
  type Mutation {
    AppModule_createDocument(name: String!, driveId: String): String

    AppModule_setAppName(
      driveId: String
      docId: PHID
      input: AppModule_SetAppNameInput
    ): Int
    AppModule_setAppStatus(
      driveId: String
      docId: PHID
      input: AppModule_SetAppStatusInput
    ): Int
  }

  """
  Module: BaseOperations
  """
  input AppModule_SetAppNameInput {
    name: String!
  }
  input AppModule_SetAppStatusInput {
    status: StatusType!
  }
`;
