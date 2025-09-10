import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import { addFile } from "document-drive";
import { setName } from "document-model";
import type {
  AddDocumentTypeInput,
  RemoveDocumentTypeInput,
  SetEditorNameInput,
  SetEditorStatusInput,
} from "../../document-models/document-editor/index.js";
import { actions } from "../../document-models/document-editor/index.js";

export const getResolvers = (subgraph: BaseSubgraph): Record<string, any> => {
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

            const doc = await reactor.getDocument(docId);
            return {
              driveId: driveId,
              ...doc,
              ...doc.header,
              // these will be ripped out in the future, but for now all doc models have global state
              // TODO (thegoldenmule): once the gql interface is updated for arbitrary state, we can remove this
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              state: (doc.state as any).global ?? {},
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              stateJSON: (doc.state as any).global ?? "{}",
              revision: doc.header?.revision?.global ?? 0,
            };
          },
          getDocuments: async (args: { driveId: string }) => {
            const { driveId } = args;
            const docsIds = await reactor.getDocuments(driveId);
            const docs = await Promise.all(
              docsIds.map(async (docId) => {
                const doc = await reactor.getDocument(docId);
                return {
                  driveId: driveId,
                  ...doc,
                  ...doc.header,
                  // these will be ripped out in the future, but for now all doc models have global state
                  // TODO (thegoldenmule): once the gql interface is updated for arbitrary state, we can remove this
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                  state: (doc.state as any).global ?? {},
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                  stateJSON: (doc.state as any).global ?? "{}",
                  revision: doc.header?.revision?.global ?? 0,
                };
              }),
            );

            return docs.filter(
              (doc) => doc.header.documentType === "powerhouse/document-editor",
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
        const document = await reactor.addDocument(
          "powerhouse/document-editor",
        );

        if (driveId) {
          await reactor.addAction(
            driveId,
            addFile({
              name,
              id: document.header.id,
              documentType: "powerhouse/document-editor",
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
        const doc = await reactor.getDocument(docId);
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
        const doc = await reactor.getDocument(docId);
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
        const doc = await reactor.getDocument(docId);
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
        const doc = await reactor.getDocument(docId);
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
