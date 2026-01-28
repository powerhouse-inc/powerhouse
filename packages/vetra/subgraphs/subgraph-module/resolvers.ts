import type { BaseSubgraph, Context } from "@powerhousedao/reactor-api";
import { addFile } from "document-drive";
import { setName } from "document-model";
import { GraphQLError } from "graphql";
import {
  actions,
  subgraphModuleDocumentType,
} from "@powerhousedao/vetra/document-models/subgraph-module";

import type {
  SubgraphModuleDocument,
  SetSubgraphNameInput,
  SetSubgraphStatusInput,
} from "@powerhousedao/vetra/document-models/subgraph-module";

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
      SubgraphModule: (_: unknown, __: unknown, ctx: Context) => {
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
              await reactor.getDocument<SubgraphModuleDocument>(docId);
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
                  await reactor.getDocument<SubgraphModuleDocument>(docId);
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
              (doc) => doc.header.documentType === subgraphModuleDocumentType,
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
      SubgraphModule_createDocument: async (
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

        const document = await reactor.addDocument(subgraphModuleDocumentType);

        if (driveId) {
          await reactor.addAction(
            driveId,
            addFile({
              name,
              id: document.header.id,
              documentType: subgraphModuleDocumentType,
            }),
          );
        }

        if (name) {
          await reactor.addAction(document.header.id, setName(name));
        }

        return document.header.id;
      },

      SubgraphModule_setSubgraphName: async (
        _: unknown,
        args: { docId: string; input: SetSubgraphNameInput },
        ctx: Context,
      ) => {
        const { docId, input } = args;

        // Check write permission before mutating document
        await assertCanWrite(subgraph, docId, ctx);
        await assertCanExecuteOperation(
          subgraph,
          docId,
          "SET_SUBGRAPH_NAME",
          ctx,
        );

        const doc = await reactor.getDocument<SubgraphModuleDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.setSubgraphName(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(result.error?.message ?? "Failed to setSubgraphName");
        }

        return true;
      },

      SubgraphModule_setSubgraphStatus: async (
        _: unknown,
        args: { docId: string; input: SetSubgraphStatusInput },
        ctx: Context,
      ) => {
        const { docId, input } = args;

        // Check write permission before mutating document
        await assertCanWrite(subgraph, docId, ctx);
        await assertCanExecuteOperation(
          subgraph,
          docId,
          "SET_SUBGRAPH_STATUS",
          ctx,
        );

        const doc = await reactor.getDocument<SubgraphModuleDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.setSubgraphStatus(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(
            result.error?.message ?? "Failed to setSubgraphStatus",
          );
        }

        return true;
      },
    },
  };
};
