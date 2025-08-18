import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql`
  """
  Subgraph definition for DocumentEditor (powerhouse/document-editor)
  """
  type DocumentEditorState {
    name: String!
    documentTypes: [DocumentTypeItem!]!
    status: StatusType!
  }

  type DocumentTypeItem {
    id: OID!
    documentType: String!
  }

  enum StatusType {
    DRAFT
    CONFIRMED
  }

  """
  Queries: DocumentEditor
  """
  type DocumentEditorQueries {
    getDocument(docId: PHID!, driveId: PHID): DocumentEditor
    getDocuments(driveId: String!): [DocumentEditor!]
  }

  type Query {
    DocumentEditor: DocumentEditorQueries
  }

  """
  Mutations: DocumentEditor
  """
  type Mutation {
    DocumentEditor_createDocument(name: String!, driveId: String): String

    DocumentEditor_setEditorName(
      driveId: String
      docId: PHID
      input: DocumentEditor_SetEditorNameInput
    ): Int
    DocumentEditor_addDocumentType(
      driveId: String
      docId: PHID
      input: DocumentEditor_AddDocumentTypeInput
    ): Int
    DocumentEditor_removeDocumentType(
      driveId: String
      docId: PHID
      input: DocumentEditor_RemoveDocumentTypeInput
    ): Int
    DocumentEditor_setEditorStatus(
      driveId: String
      docId: PHID
      input: DocumentEditor_SetEditorStatusInput
    ): Int
  }

  """
  Module: BaseOperations
  """
  input DocumentEditor_SetEditorNameInput {
    name: String!
  }
  input DocumentEditor_AddDocumentTypeInput {
    id: OID!
    documentType: String!
  }
  input DocumentEditor_RemoveDocumentTypeInput {
    id: OID!
  }
  input DocumentEditor_SetEditorStatusInput {
    status: StatusType!
  }
`;
