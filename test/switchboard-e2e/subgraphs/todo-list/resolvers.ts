import type { ISubgraph } from "@powerhousedao/reactor-api";
import { addFile } from "document-drive";
import { setName } from "document-model";
import {
  actions,
  todoListDocumentType,
  type TodoListDocument,
  type AddTodoItemInput,
  type UpdateTodoItemInput,
  type DeleteTodoItemInput,
} from "../../document-models/todo-list/index.js";
import { TodoListProcessor } from "../../processors/todo-list/index.js";

/**
 * TodoList Subgraph Resolvers
 * Following documentation pattern - connecting to processor's relational database
 */
export const getResolvers = (subgraph: ISubgraph) => {
  const reactor = subgraph.reactor;
  const relationalDb = subgraph.relationalDb;

  return {
    Query: {
      // Processor database query (following documentation)
      todos: {
        resolve: async (_: any, args: { driveId: string }) => {
          // Query the database using the processor's static query method
          const todos = await TodoListProcessor.query(
            args.driveId,
            relationalDb,
          )
            .selectFrom("todo") // Select from the "todo" table
            .selectAll() // Get all columns
            .execute(); // Execute the query

          // Transform database results to match GraphQL schema
          return todos.map((todo) => ({
            task: todo.task, // Map database "task" column
            status: todo.status, // Map database "status" column
            documentId: todo.task.split('-')[0], // Extract document ID from task
            driveId: args.driveId, // Pass through drive ID
          }));
        },
      },
      // Search functionality (following documentation pattern)
      searchTodos: {
        resolve: async (_: any, args: { driveId: string; searchTerm: string }) => {
          const { driveId, searchTerm } = args;
          const foundDocumentIds: string[] = [];

          try {
            // Get all documents in the drive
            const documentIds = await reactor.getDocuments(driveId);
            
            // Search through each TodoList document
            for (const docId of documentIds) {
              try {
                const doc = await reactor.getDocument<TodoListDocument>(docId);
                
                // Only search TodoList documents
                if (doc.header.documentType !== todoListDocumentType) {
                  continue;
                }

                // Search through todo items in the document state
                const items = doc.state.global?.items || [];
                const hasMatch = items.some((item: any) => 
                  item.text && item.text.toLowerCase().includes(searchTerm.toLowerCase())
                );

                if (hasMatch) {
                  foundDocumentIds.push(docId);
                }
              } catch (error) {
                // Skip documents that can't be loaded
                console.warn(`[searchTodos] Failed to load document ${docId}:`, error);
              }
            }
          } catch (error) {
            console.error(`[searchTodos] Error searching drive ${driveId}:`, error);
            throw new Error(`Failed to search todos: ${error}`);
          }

          return foundDocumentIds;
        },
      },
      TodoList: async () => {
        return {
          getDocument: async (args: { docId: string; driveId: string }) => {
            const { docId, driveId } = args;

            if (!docId) {
              throw new Error("Document id is required");
            }

            if (driveId) {
              const docIds = await reactor.getDocuments(driveId);
              if (!docIds.includes(docId)) {
                throw new Error(
                  `Document with id ${docId} is not part of ${driveId}`,
                );
              }
            }

            const doc = await reactor.getDocument<TodoListDocument>(docId);
            return {
              driveId: driveId,
              ...doc,
              ...doc.header,
              created: doc.header.createdAtUtcIso,
              lastModified: doc.header.lastModifiedAtUtcIso,
              state: doc.state.global,
              stateJSON: doc.state.global,
              revision: doc.header?.revision?.global ?? 0,
            };
          },
          getDocuments: async (args: { driveId: string }) => {
            const { driveId } = args;
            const docsIds = await reactor.getDocuments(driveId);
            const docs = await Promise.all(
              docsIds.map(async (docId) => {
                const doc = await reactor.getDocument<TodoListDocument>(docId);
                return {
                  driveId: driveId,
                  ...doc,
                  ...doc.header,
                  created: doc.header.createdAtUtcIso,
                  lastModified: doc.header.lastModifiedAtUtcIso,
                  state: doc.state.global,
                  stateJSON: doc.state.global,
                  revision: doc.header?.revision?.global ?? 0,
                };
              }),
            );

            return docs.filter(
              (doc) => doc.header.documentType === todoListDocumentType,
            );
          },
        };
      },
    },
    Mutation: {
      TodoList_createDocument: async (
        _: unknown,
        args: { name: string; driveId?: string },
      ) => {
        const { driveId, name } = args;
        const document = await reactor.addDocument(todoListDocumentType);

        if (driveId) {
          await reactor.addAction(
            driveId,
            addFile({
              name,
              id: document.header.id,
              documentType: todoListDocumentType,
            }),
          );
        }

        if (name) {
          await reactor.addAction(document.header.id, setName(name));
        }

        return document.header.id;
      },

      TodoList_addTodoItem: async (
        _: unknown,
        args: { docId: string; input: AddTodoItemInput },
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument<TodoListDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.addTodoItem(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(result.error?.message ?? "Failed to addTodoItem");
        }

        return true;
      },

      TodoList_updateTodoItem: async (
        _: unknown,
        args: { docId: string; input: UpdateTodoItemInput },
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument<TodoListDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.updateTodoItem(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(result.error?.message ?? "Failed to updateTodoItem");
        }

        return true;
      },

      TodoList_deleteTodoItem: async (
        _: unknown,
        args: { docId: string; input: DeleteTodoItemInput },
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument<TodoListDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.deleteTodoItem(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(result.error?.message ?? "Failed to deleteTodoItem");
        }

        return true;
      },
    },
  };
};
