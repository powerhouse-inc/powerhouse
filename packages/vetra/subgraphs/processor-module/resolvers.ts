import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import { addFile } from "document-drive";
import { setName } from "document-model";
import {
  actions,
  processorModuleDocumentType,
} from "@powerhousedao/vetra/document-models/processor-module";

import type {
  ProcessorModuleDocument,
  SetProcessorNameInput,
  SetProcessorTypeInput,
  AddDocumentTypeInput,
  RemoveDocumentTypeInput,
  SetProcessorStatusInput,
} from "@powerhousedao/vetra/document-models/processor-module";

export const getResolvers = (
  subgraph: BaseSubgraph,
): Record<string, unknown> => {
  const reactor = subgraph.reactor;

  return {
    Query: {
      ProcessorModule: async () => {
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
              await reactor.getDocument<ProcessorModuleDocument>(docId);
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
                  await reactor.getDocument<ProcessorModuleDocument>(docId);
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
              (doc) => doc.header.documentType === processorModuleDocumentType,
            );
          },
        };
      },
    },
    Mutation: {
      ProcessorModule_createDocument: async (
        _: unknown,
        args: { name: string; driveId?: string },
      ) => {
        const { driveId, name } = args;
        const document = await reactor.addDocument(processorModuleDocumentType);

        if (driveId) {
          await reactor.addAction(
            driveId,
            addFile({
              name,
              id: document.header.id,
              documentType: processorModuleDocumentType,
            }),
          );
        }

        if (name) {
          await reactor.addAction(document.header.id, setName(name));
        }

        return document.header.id;
      },

      ProcessorModule_setProcessorName: async (
        _: unknown,
        args: { docId: string; input: SetProcessorNameInput },
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument<ProcessorModuleDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.setProcessorName(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(
            result.error?.message ?? "Failed to setProcessorName",
          );
        }

        return true;
      },

      ProcessorModule_setProcessorType: async (
        _: unknown,
        args: { docId: string; input: SetProcessorTypeInput },
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument<ProcessorModuleDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.setProcessorType(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(
            result.error?.message ?? "Failed to setProcessorType",
          );
        }

        return true;
      },

      ProcessorModule_addDocumentType: async (
        _: unknown,
        args: { docId: string; input: AddDocumentTypeInput },
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument<ProcessorModuleDocument>(docId);
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

      ProcessorModule_removeDocumentType: async (
        _: unknown,
        args: { docId: string; input: RemoveDocumentTypeInput },
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument<ProcessorModuleDocument>(docId);
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

      ProcessorModule_setProcessorStatus: async (
        _: unknown,
        args: { docId: string; input: SetProcessorStatusInput },
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument<ProcessorModuleDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.setProcessorStatus(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(
            result.error?.message ?? "Failed to setProcessorStatus",
          );
        }

        return true;
      },
    },
  };
};
