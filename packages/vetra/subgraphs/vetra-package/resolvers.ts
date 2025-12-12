import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import { addFile } from "document-drive";
import { setName } from "document-model";
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

export const getResolvers = (
  subgraph: BaseSubgraph,
): Record<string, unknown> => {
  const reactor = subgraph.reactor;

  return {
    Query: {
      VetraPackage: async () => {
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

            return docs.filter(
              (doc) => doc.header.documentType === vetraPackageDocumentType,
            );
          },
        };
      },
    },
    Mutation: {
      VetraPackage_createDocument: async (
        _: unknown,
        args: { name: string; driveId?: string },
      ) => {
        const { driveId, name } = args;
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
      ) => {
        const { docId, input } = args;
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
      ) => {
        const { docId, input } = args;
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
      ) => {
        const { docId, input } = args;
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
      ) => {
        const { docId, input } = args;
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
      ) => {
        const { docId, input } = args;
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
      ) => {
        const { docId, input } = args;
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
      ) => {
        const { docId, input } = args;
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
      ) => {
        const { docId, input } = args;
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
      ) => {
        const { docId, input } = args;
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
      ) => {
        const { docId, input } = args;
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
