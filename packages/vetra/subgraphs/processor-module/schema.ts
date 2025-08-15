import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql`
  """
  Subgraph definition for ProcessorModule (powerhouse/processor)
  """
  type ProcessorModuleState {
    name: String!
    type: String!
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
  Queries: ProcessorModule
  """
  type ProcessorModuleQueries {
    getDocument(docId: PHID!, driveId: PHID): ProcessorModule
    getDocuments(driveId: String!): [ProcessorModule!]
  }

  type Query {
    ProcessorModule: ProcessorModuleQueries
  }

  """
  Mutations: ProcessorModule
  """
  type Mutation {
    ProcessorModule_createDocument(name: String!, driveId: String): String

    ProcessorModule_setProcessorName(
      driveId: String
      docId: PHID
      input: ProcessorModule_SetProcessorNameInput
    ): Int
    ProcessorModule_setProcessorType(
      driveId: String
      docId: PHID
      input: ProcessorModule_SetProcessorTypeInput
    ): Int
    ProcessorModule_addDocumentType(
      driveId: String
      docId: PHID
      input: ProcessorModule_AddDocumentTypeInput
    ): Int
    ProcessorModule_removeDocumentType(
      driveId: String
      docId: PHID
      input: ProcessorModule_RemoveDocumentTypeInput
    ): Int
    ProcessorModule_setProcessorStatus(
      driveId: String
      docId: PHID
      input: ProcessorModule_SetProcessorStatusInput
    ): Int
  }

  """
  Module: BaseOperations
  """
  input ProcessorModule_SetProcessorNameInput {
    name: String!
  }
  input ProcessorModule_SetProcessorTypeInput {
    type: String!
  }
  input ProcessorModule_AddDocumentTypeInput {
    id: OID!
    documentType: String!
  }
  input ProcessorModule_RemoveDocumentTypeInput {
    id: OID!
  }
  input ProcessorModule_SetProcessorStatusInput {
    status: StatusType!
  }
`;
