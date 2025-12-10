import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import { addFile } from "document-drive";
import { setName } from "document-model";
import {
  actions,
  toDoDocumentDocumentType,
} from "connect-e2e/document-models/to-do-document";

import type {
  ToDoDocumentDocument,
  AddTodoItemInputInput,
  UpdateTodoItemInputInput,
  DeleteTodoItemInputInput,
} from "connect-e2e/document-models/to-do-document";

export const getResolvers = (
  subgraph: BaseSubgraph,
): Record<string, unknown> => {
  const reactor = subgraph.reactor;

  return {
    Query: {
      ToDoDocument: async () => {
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

            const doc = await reactor.getDocument<ToDoDocumentDocument>(docId);
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
                const doc =
                  await reactor.getDocument<ToDoDocumentDocument>(docId);
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
              (doc) => doc.header.documentType === toDoDocumentDocumentType,
            );
          },
        };
      },
    },
    Mutation: {
      ToDoDocument_createDocument: async (
        _: unknown,
        args: { name: string; driveId?: string },
      ) => {
        const { driveId, name } = args;
        const document = await reactor.addDocument(toDoDocumentDocumentType);

        if (driveId) {
          await reactor.addAction(
            driveId,
            addFile({
              name,
              id: document.header.id,
              documentType: toDoDocumentDocumentType,
            }),
          );
        }

        if (name) {
          await reactor.addAction(document.header.id, setName(name));
        }

        return document.header.id;
      },

      ToDoDocument_addTodoItemInput: async (
        _: unknown,
        args: { docId: string; input: AddTodoItemInputInput },
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument<ToDoDocumentDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.addTodoItemInput(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(
            result.error?.message ?? "Failed to addTodoItemInput",
          );
        }

        return true;
      },

      ToDoDocument_updateTodoItemInput: async (
        _: unknown,
        args: { docId: string; input: UpdateTodoItemInputInput },
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument<ToDoDocumentDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.updateTodoItemInput(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(
            result.error?.message ?? "Failed to updateTodoItemInput",
          );
        }

        return true;
      },

      ToDoDocument_deleteTodoItemInput: async (
        _: unknown,
        args: { docId: string; input: DeleteTodoItemInputInput },
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument<ToDoDocumentDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.deleteTodoItemInput(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(
            result.error?.message ?? "Failed to deleteTodoItemInput",
          );
        }

        return true;
      },
    },
  };
};
