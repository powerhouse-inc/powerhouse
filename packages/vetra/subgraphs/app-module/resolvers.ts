import { type BaseSubgraph } from "@powerhousedao/reactor-api";
import { addFile } from "document-drive";
import { setName } from "document-model";
import {
  actions,
  type AddDocumentTypeInput,
  type AppModuleDocument,
  type RemoveDocumentTypeInput,
  type SetAppNameInput,
  type SetAppStatusInput,
  type SetDragAndDropEnabledInput,
} from "../../document-models/app-module/index.js";

export const getResolvers = (subgraph: Subgraph): Record<string, unknown> => {
  const reactor = subgraph.reactor;

  return {
    Query: {
      AppModule: async () => {
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

            const doc = await reactor.getDocument<AppModuleDocument>(docId);
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
                const doc = await reactor.getDocument<AppModuleDocument>(docId);
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
              (doc) => doc.header.documentType === "powerhouse/app",
            );
          },
        };
      },
    },
    Mutation: {
      AppModule_createDocument: async (
        _: unknown,
        args: { name: string; driveId?: string },
      ) => {
        const { driveId, name } = args;
        const document = await reactor.addDocument("powerhouse/app");

        if (driveId) {
          await reactor.addAction(
            driveId,
            addFile({
              name,
              id: document.header.id,
              documentType: "powerhouse/app",
            }),
          );
        }

        if (name) {
          await reactor.addAction(document.header.id, setName(name));
        }

        return document.header.id;
      },

      AppModule_setAppName: async (
        _: unknown,
        args: { docId: string; input: SetAppNameInput },
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument<AppModuleDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.setAppName(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(result.error?.message ?? "Failed to setAppName");
        }

        return true;
      },

      AppModule_setAppStatus: async (
        _: unknown,
        args: { docId: string; input: SetAppStatusInput },
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument<AppModuleDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.setAppStatus(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(result.error?.message ?? "Failed to setAppStatus");
        }

        return true;
      },

      AppModule_addDocumentType: async (
        _: unknown,
        args: { docId: string; input: AddDocumentTypeInput },
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument<AppModuleDocument>(docId);
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

      AppModule_removeDocumentType: async (
        _: unknown,
        args: { docId: string; input: RemoveDocumentTypeInput },
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument<AppModuleDocument>(docId);
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

      AppModule_setDragAndDropEnabled: async (
        _: unknown,
        args: { docId: string; input: SetDragAndDropEnabledInput },
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument<AppModuleDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.setDragAndDropEnabled(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(
            result.error?.message ?? "Failed to setDragAndDropEnabled",
          );
        }

        return true;
      },
    },
  };
};
