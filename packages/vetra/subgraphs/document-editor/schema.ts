import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql`
  """
  Subgraph definition for DocumentEditor (powerhouse/document-editor)
  """
  type DocumentEditorState {
    name: String
    id: OID
    documentTypes: [DocumentTypeItem!]!
  }

  type DocumentTypeItem {
    id: OID!
    documentType: String!
  }

  """
  Queries: DocumentEditor
  """
  type DocumentEditorQueries {
    getDocument(driveId: String, docId: PHID): DocumentEditor
    getDocuments: [DocumentEditor!]
  }

  type Query {
    DocumentEditor: DocumentEditorQueries
  }

  """
  Mutations: DocumentEditor
  """
  type Mutation {
    DocumentEditor_createDocument(driveId: String, name: String): String

    DocumentEditor_setEditorName(
      driveId: String
      docId: PHID
      input: DocumentEditor_SetEditorNameInput
    ): Int
    DocumentEditor_setEditorId(
      driveId: String
      docId: PHID
      input: DocumentEditor_SetEditorIdInput
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
  }

  """
  Module: BaseOperations
  """
  input DocumentEditor_SetEditorNameInput {
    name: String!
  }
  input DocumentEditor_SetEditorIdInput {
    id: OID!
  }
  input DocumentEditor_AddDocumentTypeInput {
    id: OID!
    documentType: String!
  }
  input DocumentEditor_RemoveDocumentTypeInput {
    id: OID!
  }
`;
