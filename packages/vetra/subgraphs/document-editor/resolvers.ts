import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import { addFile } from "document-drive";
import { setName } from "document-model";
import {
  actions,
  documentEditorDocumentType,
} from "@powerhousedao/vetra/document-models/document-editor";

import type {
  DocumentEditorDocument,
  SetEditorNameInput,
  AddDocumentTypeInput,
  RemoveDocumentTypeInput,
  SetEditorStatusInput,
} from "@powerhousedao/vetra/document-models/document-editor";

export const getResolvers = (
  subgraph: BaseSubgraph,
): Record<string, unknown> => {
  const reactor = subgraph.reactor;

  return {
    Query: {
      DocumentEditor: async () => {
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

            const doc =
              await reactor.getDocument<DocumentEditorDocument>(docId);
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
                  await reactor.getDocument<DocumentEditorDocument>(docId);
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
              (doc) => doc.header.documentType === documentEditorDocumentType,
            );
          },
        };
      },
    },
    Mutation: {
      DocumentEditor_createDocument: async (
        _: unknown,
        args: { name: string; driveId?: string },
      ) => {
        const { driveId, name } = args;
        const document = await reactor.addDocument(documentEditorDocumentType);

        if (driveId) {
          await reactor.addAction(
            driveId,
            addFile({
              name,
              id: document.header.id,
              documentType: documentEditorDocumentType,
            }),
          );
        }

        if (name) {
          await reactor.addAction(document.header.id, setName(name));
        }

        return document.header.id;
      },

      DocumentEditor_setEditorName: async (
        _: unknown,
        args: { docId: string; input: SetEditorNameInput },
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument<DocumentEditorDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.setEditorName(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(result.error?.message ?? "Failed to setEditorName");
        }

        return true;
      },

      DocumentEditor_addDocumentType: async (
        _: unknown,
        args: { docId: string; input: AddDocumentTypeInput },
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument<DocumentEditorDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.addDocumentType(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(result.error?.message ?? "Failed to addDocumentType");
        }

        return true;
      },

      DocumentEditor_removeDocumentType: async (
        _: unknown,
        args: { docId: string; input: RemoveDocumentTypeInput },
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument<DocumentEditorDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.removeDocumentType(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(
            result.error?.message ?? "Failed to removeDocumentType",
          );
        }

        return true;
      },

      DocumentEditor_setEditorStatus: async (
        _: unknown,
        args: { docId: string; input: SetEditorStatusInput },
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument<DocumentEditorDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.setEditorStatus(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(result.error?.message ?? "Failed to setEditorStatus");
        }

        return true;
      },
    },
  };
};
