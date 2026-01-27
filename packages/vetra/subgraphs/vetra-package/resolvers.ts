import type { BaseSubgraph, Context } from "@powerhousedao/reactor-api";
import { addFile } from "document-drive";
import { setName } from "document-model";
import { GraphQLError } from "graphql";
import {
  actions,
  vetraPackageDocumentType,
} from "@powerhousedao/vetra/document-models/vetra-package";

import type {
  VetraPackageDocument,
  SetPackageNameInput,
  SetPackageDescriptionInput,
  SetPackageCategoryInput,
  SetPackageAuthorInput,
  SetPackageAuthorNameInput,
  SetPackageAuthorWebsiteInput,
  AddPackageKeywordInput,
  RemovePackageKeywordInput,
  SetPackageGithubUrlInput,
  SetPackageNpmUrlInput,
} from "@powerhousedao/vetra/document-models/vetra-package";

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
      VetraPackage: (_: unknown, __: unknown, ctx: Context) => {
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

            const doc = await reactor.getDocument<VetraPackageDocument>(docId);
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
                  await reactor.getDocument<VetraPackageDocument>(docId);
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
              (doc) => doc.header.documentType === vetraPackageDocumentType,
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
      VetraPackage_createDocument: async (
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

        const document = await reactor.addDocument(vetraPackageDocumentType);

        if (driveId) {
          await reactor.addAction(
            driveId,
            addFile({
              name,
              id: document.header.id,
              documentType: vetraPackageDocumentType,
            }),
          );
        }

        if (name) {
          await reactor.addAction(document.header.id, setName(name));
        }

        return document.header.id;
      },

      VetraPackage_setPackageName: async (
        _: unknown,
        args: { docId: string; input: SetPackageNameInput },
        ctx: Context,
      ) => {
        const { docId, input } = args;

        // Check write permission before mutating document
        await assertCanWrite(subgraph, docId, ctx);
        await assertCanExecuteOperation(
          subgraph,
          docId,
          "SET_PACKAGE_NAME",
          ctx,
        );

        const doc = await reactor.getDocument<VetraPackageDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.setPackageName(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(result.error?.message ?? "Failed to setPackageName");
        }

        return true;
      },

      VetraPackage_setPackageDescription: async (
        _: unknown,
        args: { docId: string; input: SetPackageDescriptionInput },
        ctx: Context,
      ) => {
        const { docId, input } = args;

        // Check write permission before mutating document
        await assertCanWrite(subgraph, docId, ctx);
        await assertCanExecuteOperation(
          subgraph,
          docId,
          "SET_PACKAGE_DESCRIPTION",
          ctx,
        );

        const doc = await reactor.getDocument<VetraPackageDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.setPackageDescription(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(
            result.error?.message ?? "Failed to setPackageDescription",
          );
        }

        return true;
      },

      VetraPackage_setPackageCategory: async (
        _: unknown,
        args: { docId: string; input: SetPackageCategoryInput },
        ctx: Context,
      ) => {
        const { docId, input } = args;

        // Check write permission before mutating document
        await assertCanWrite(subgraph, docId, ctx);
        await assertCanExecuteOperation(
          subgraph,
          docId,
          "SET_PACKAGE_CATEGORY",
          ctx,
        );

        const doc = await reactor.getDocument<VetraPackageDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.setPackageCategory(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(
            result.error?.message ?? "Failed to setPackageCategory",
          );
        }

        return true;
      },

      VetraPackage_setPackageAuthor: async (
        _: unknown,
        args: { docId: string; input: SetPackageAuthorInput },
        ctx: Context,
      ) => {
        const { docId, input } = args;

        // Check write permission before mutating document
        await assertCanWrite(subgraph, docId, ctx);
        await assertCanExecuteOperation(
          subgraph,
          docId,
          "SET_PACKAGE_AUTHOR",
          ctx,
        );

        const doc = await reactor.getDocument<VetraPackageDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.setPackageAuthor(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(
            result.error?.message ?? "Failed to setPackageAuthor",
          );
        }

        return true;
      },

      VetraPackage_setPackageAuthorName: async (
        _: unknown,
        args: { docId: string; input: SetPackageAuthorNameInput },
        ctx: Context,
      ) => {
        const { docId, input } = args;

        // Check write permission before mutating document
        await assertCanWrite(subgraph, docId, ctx);
        await assertCanExecuteOperation(
          subgraph,
          docId,
          "SET_PACKAGE_AUTHOR_NAME",
          ctx,
        );

        const doc = await reactor.getDocument<VetraPackageDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.setPackageAuthorName(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(
            result.error?.message ?? "Failed to setPackageAuthorName",
          );
        }

        return true;
      },

      VetraPackage_setPackageAuthorWebsite: async (
        _: unknown,
        args: { docId: string; input: SetPackageAuthorWebsiteInput },
        ctx: Context,
      ) => {
        const { docId, input } = args;

        // Check write permission before mutating document
        await assertCanWrite(subgraph, docId, ctx);
        await assertCanExecuteOperation(
          subgraph,
          docId,
          "SET_PACKAGE_AUTHOR_WEBSITE",
          ctx,
        );

        const doc = await reactor.getDocument<VetraPackageDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.setPackageAuthorWebsite(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(
            result.error?.message ?? "Failed to setPackageAuthorWebsite",
          );
        }

        return true;
      },

      VetraPackage_addPackageKeyword: async (
        _: unknown,
        args: { docId: string; input: AddPackageKeywordInput },
        ctx: Context,
      ) => {
        const { docId, input } = args;

        // Check write permission before mutating document
        await assertCanWrite(subgraph, docId, ctx);
        await assertCanExecuteOperation(
          subgraph,
          docId,
          "ADD_PACKAGE_KEYWORD",
          ctx,
        );

        const doc = await reactor.getDocument<VetraPackageDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.addPackageKeyword(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(
            result.error?.message ?? "Failed to addPackageKeyword",
          );
        }

        return true;
      },

      VetraPackage_removePackageKeyword: async (
        _: unknown,
        args: { docId: string; input: RemovePackageKeywordInput },
        ctx: Context,
      ) => {
        const { docId, input } = args;

        // Check write permission before mutating document
        await assertCanWrite(subgraph, docId, ctx);
        await assertCanExecuteOperation(
          subgraph,
          docId,
          "REMOVE_PACKAGE_KEYWORD",
          ctx,
        );

        const doc = await reactor.getDocument<VetraPackageDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.removePackageKeyword(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(
            result.error?.message ?? "Failed to removePackageKeyword",
          );
        }

        return true;
      },

      VetraPackage_setPackageGithubUrl: async (
        _: unknown,
        args: { docId: string; input: SetPackageGithubUrlInput },
        ctx: Context,
      ) => {
        const { docId, input } = args;

        // Check write permission before mutating document
        await assertCanWrite(subgraph, docId, ctx);
        await assertCanExecuteOperation(
          subgraph,
          docId,
          "SET_PACKAGE_GITHUB_URL",
          ctx,
        );

        const doc = await reactor.getDocument<VetraPackageDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.setPackageGithubUrl(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(
            result.error?.message ?? "Failed to setPackageGithubUrl",
          );
        }

        return true;
      },

      VetraPackage_setPackageNpmUrl: async (
        _: unknown,
        args: { docId: string; input: SetPackageNpmUrlInput },
        ctx: Context,
      ) => {
        const { docId, input } = args;

        // Check write permission before mutating document
        await assertCanWrite(subgraph, docId, ctx);
        await assertCanExecuteOperation(
          subgraph,
          docId,
          "SET_PACKAGE_NPM_URL",
          ctx,
        );

        const doc = await reactor.getDocument<VetraPackageDocument>(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        const result = await reactor.addAction(
          docId,
          actions.setPackageNpmUrl(input),
        );

        if (result.status !== "SUCCESS") {
          throw new Error(
            result.error?.message ?? "Failed to setPackageNpmUrl",
          );
        }

        return true;
      },
    },
  };
};
