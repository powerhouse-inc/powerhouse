import type { BaseSubgraph, Context } from "@powerhousedao/reactor-api";
import { addFile } from "document-drive";
import { setName } from "document-model";
import { GraphQLError } from "graphql";
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

import {
  assertCanRead,
  assertCanWrite,
  assertCanExecuteOperation,
  canReadDocument,
  hasGlobalReadAccess,
  hasGlobalWriteAccess,
} from "../permission-utils.js";

export const getResolvers = (
  subgraph: BaseSubgraph,
): Record<string, unknown> => {
  const reactor = subgraph.reactor;

  return {
    Query: {
      ProcessorModule: (_: unknown, __: unknown, ctx: Context) => {
        return {
          getDocument: async (args: { docId: string; driveId: string }) => {
            const { docId, driveId } = args;

            if (!docId) {
              throw new Error("Document id is required");
            }

            // Check read permission before accessing document
            await assertCanRead(subgraph, docId, ctx);

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

            // Check read permission on drive before listing documents
            await assertCanRead(subgraph, driveId, ctx);

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

            const filteredByType = docs.filter(
              (doc) => doc.header.documentType === processorModuleDocumentType,
            );

            // If user doesn't have global read access, filter by document-level permissions
            if (
              !hasGlobalReadAccess(ctx) &&
              subgraph.documentPermissionService
            ) {
              const filteredDocs = [];
              for (const doc of filteredByType) {
                const canRead = await canReadDocument(subgraph, doc.id, ctx);
                if (canRead) {
                  filteredDocs.push(doc);
                }
              }
              return filteredDocs;
            }

            return filteredByType;
          },
        };
      },
    },
    Mutation: {
      ProcessorModule_createDocument: async (
        _: unknown,
        args: { name: string; driveId?: string },
        ctx: Context,
      ) => {
        const { driveId, name } = args;

        // If creating under a drive, check write permission on drive
        if (driveId) {
          await assertCanWrite(subgraph, driveId, ctx);
        } else if (!hasGlobalWriteAccess(ctx)) {
          throw new GraphQLError(
            "Forbidden: insufficient permissions to create documents",
          );
        }

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
        ctx: Context,
      ) => {
        const { docId, input } = args;

        // Check write permission before mutating document
        await assertCanWrite(subgraph, docId, ctx);
        await assertCanExecuteOperation(
          subgraph,
          docId,
          "SET_PROCESSOR_NAME",
          ctx,
        );

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
        ctx: Context,
      ) => {
        const { docId, input } = args;

        // Check write permission before mutating document
        await assertCanWrite(subgraph, docId, ctx);
        await assertCanExecuteOperation(
          subgraph,
          docId,
          "SET_PROCESSOR_TYPE",
          ctx,
        );

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
        ctx: Context,
      ) => {
        const { docId, input } = args;

        // Check write permission before mutating document
        await assertCanWrite(subgraph, docId, ctx);
        await assertCanExecuteOperation(
          subgraph,
          docId,
          "ADD_DOCUMENT_TYPE",
          ctx,
        );

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
        ctx: Context,
      ) => {
        const { docId, input } = args;

        // Check write permission before mutating document
        await assertCanWrite(subgraph, docId, ctx);
        await assertCanExecuteOperation(
          subgraph,
          docId,
          "REMOVE_DOCUMENT_TYPE",
          ctx,
        );

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
        ctx: Context,
      ) => {
        const { docId, input } = args;

        // Check write permission before mutating document
        await assertCanWrite(subgraph, docId, ctx);
        await assertCanExecuteOperation(
          subgraph,
          docId,
          "SET_PROCESSOR_STATUS",
          ctx,
        );

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
