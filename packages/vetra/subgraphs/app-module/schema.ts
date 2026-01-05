import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql`
  """
  Queries: AppModule Document
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
    AppModule_addDocumentType(
      driveId: String
      docId: PHID
      input: AppModule_AddDocumentTypeInput
    ): Int
    AppModule_removeDocumentType(
      driveId: String
      docId: PHID
      input: AppModule_RemoveDocumentTypeInput
    ): Int
    AppModule_setDocumentTypes(
      driveId: String
      docId: PHID
      input: AppModule_SetDocumentTypesInput
    ): Int
    AppModule_setDragAndDropEnabled(
      driveId: String
      docId: PHID
      input: AppModule_SetDragAndDropEnabledInput
    ): Int
  }

  """
  Module: BaseOperations
  """
  input AppModule_SetAppNameInput {
    name: String!
  }
  input AppModule_SetAppStatusInput {
    status: AppModule_StatusType!
  }
  input AppModule_AddDocumentTypeInput {
    documentType: String!
  }
  input AppModule_RemoveDocumentTypeInput {
    documentType: String!
  }
  input AppModule_SetDocumentTypesInput {
    documentTypes: [String!]!
  }

  """
  Module: DndOperations
  """
  input AppModule_SetDragAndDropEnabledInput {
    enabled: Boolean!
  }
`;
