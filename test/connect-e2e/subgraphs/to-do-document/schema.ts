import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql`
  """
  Queries: ToDoDocument Document
  """
  type ToDoDocumentQueries {
    getDocument(docId: PHID!, driveId: PHID): ToDoDocument
    getDocuments(driveId: String!): [ToDoDocument!]
  }

  type Query {
    ToDoDocument: ToDoDocumentQueries
  }

  """
  Mutations: ToDoDocument
  """
  type Mutation {
    ToDoDocument_createDocument(name: String!, driveId: String): String

    ToDoDocument_addTodoItemInput(
      driveId: String
      docId: PHID
      input: ToDoDocument_AddTodoItemInputInput
    ): Int
    ToDoDocument_updateTodoItemInput(
      driveId: String
      docId: PHID
      input: ToDoDocument_UpdateTodoItemInputInput
    ): Int
    ToDoDocument_deleteTodoItemInput(
      driveId: String
      docId: PHID
      input: ToDoDocument_DeleteTodoItemInputInput
    ): Int
  }

  """
  Module: BaseOperations
  """
  input ToDoDocument_AddTodoItemInputInput {
    id: ID!
    text: String!
  }

  input ToDoDocument_UpdateTodoItemInputInput {
    id: ID!
    text: String
    checked: Boolean
  }

  input ToDoDocument_DeleteTodoItemInputInput {
    id: ID!
  }
`;
