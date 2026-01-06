import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql`
  """
  Queries: TodoList Document
  """
  type TodoListQueries {
    getDocument(docId: PHID!, driveId: PHID): TodoList
    getDocuments(driveId: String!): [TodoList!]
  }

  type Query {
    TodoList: TodoListQueries
  }

  """
  Mutations: TodoList
  """
  type Mutation {
    TodoList_createDocument(name: String!, driveId: String): String

    TodoList_addTodoItem(
      driveId: String
      docId: PHID
      input: TodoList_AddTodoItemInput
    ): Int
    TodoList_updateTodoItem(
      driveId: String
      docId: PHID
      input: TodoList_UpdateTodoItemInput
    ): Int
    TodoList_deleteTodoItem(
      driveId: String
      docId: PHID
      input: TodoList_DeleteTodoItemInput
    ): Int
  }

  """
  Module: Todos
  """
  input TodoList_AddTodoItemInput {
    text: String!
  }
  input TodoList_UpdateTodoItemInput {
    id: OID!
    text: String
    checked: Boolean
  }
  input TodoList_DeleteTodoItemInput {
    id: OID!
  }
`;
