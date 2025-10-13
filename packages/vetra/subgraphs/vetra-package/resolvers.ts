import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import { addFile, childLogger } from "document-drive";
import { createVetraPackageDocument } from "../../document-models/vetra-package/gen/ph-factories.js";
import { actions } from "../../document-models/vetra-package/index.js";

const DEFAULT_DRIVE_ID = "powerhouse";

const logger = childLogger(["VetraPackageResolvers"]);

export const getResolvers = (subgraph: BaseSubgraph): Record<string, any> => {
  const reactor = subgraph.reactor;

  return {
    Query: {
      VetraPackage: async (_: any, args: any, ctx: any) => {
        return {
          getDocument: async (args: any) => {
            const driveId: string = args.driveId || DEFAULT_DRIVE_ID;
            const docId: string = args.docId || "";
            const doc = await reactor.getDocument(driveId, docId);

            return {
              driveId: driveId,
              ...doc,
              ...doc.header,
              // these will be ripped out in the future, but for now all doc models have global state
              // TODO (thegoldenmule): once the gql interface is updated for arbitrary state, we can remove this
              state: (doc.state as any).global ?? {},
              stateJSON: (doc.state as any).global ?? "{}",
              revision: doc.header.revision.global ?? 0,
            };
          },
          getDocuments: async (args: any) => {
            const driveId: string = args.driveId || DEFAULT_DRIVE_ID;
            const docsIds = await reactor.getDocuments(driveId);
            const docs = await Promise.all(
              docsIds.map(async (docId) => {
                const doc = await reactor.getDocument(driveId, docId);
                return {
                  driveId: driveId,
                  ...doc,
                  ...doc.header,
                  // these will be ripped out in the future, but for now all doc models have global state
                  // TODO (thegoldenmule): once the gql interface is updated for arbitrary state, we can remove this
                  state: (doc.state as any).global ?? {},
                  stateJSON: (doc.state as any).global ?? "{}",
                  revision: doc.header.revision.global ?? 0,
                };
              }),
            );

            return docs.filter(
              (doc) => doc.header.documentType === "powerhouse/package",
            );
          },
        };
      },
    },
    Mutation: {
      VetraPackage_createDocument: async (_: any, args: any) => {
        const driveId: string = args.driveId || DEFAULT_DRIVE_ID;
        const document = createVetraPackageDocument();
        const documentId = document.header.id;

        await reactor.addDocument(document);

        let revert = false;
        try {
          await reactor.addDriveAction(
            driveId,
            addFile({
              id: documentId,
              name: args.name,
              documentType: document.header.documentType,
            }),
          );
        } catch (error) {
          logger.error(
            `Created document but failed to add file to drive. Reverting: ${(error as Error).message}`,
          );

          revert = true;
        }

        if (revert) {
          try {
            await reactor.deleteDocument(documentId);
          } catch (error) {
            logger.error(
              `Failed to revert document creation! This means there was a document created but not added to a drive. DocumentId: ${documentId}, Error: ${(error as Error).message}`,
            );

            throw error;
          }
        }

        return document.header.id;
      },

      VetraPackage_setPackageName: async (_: any, args: any) => {
        const driveId: string = args.driveId || DEFAULT_DRIVE_ID;
        const docId: string = args.docId || "";
        const doc = await reactor.getDocument(driveId, docId);

        await reactor.addAction(
          driveId,
          docId,
          actions.setPackageName({ ...args.input }),
        );

        return (doc.header.revision.global ?? 0) + 1;
      },

      VetraPackage_setPackageDescription: async (_: any, args: any) => {
        const driveId: string = args.driveId || DEFAULT_DRIVE_ID;
        const docId: string = args.docId || "";
        const doc = await reactor.getDocument(driveId, docId);

        await reactor.addAction(
          driveId,
          docId,
          actions.setPackageDescription({ ...args.input }),
        );

        return (doc.header.revision.global ?? 0) + 1;
      },

      VetraPackage_setPackageCategory: async (_: any, args: any) => {
        const driveId: string = args.driveId || DEFAULT_DRIVE_ID;
        const docId: string = args.docId || "";
        const doc = await reactor.getDocument(driveId, docId);

        await reactor.addAction(
          driveId,
          docId,
          actions.setPackageCategory({ ...args.input }),
        );

        return (doc.header.revision.global ?? 0) + 1;
      },

      VetraPackage_setPackageAuthor: async (_: any, args: any) => {
        const driveId: string = args.driveId || DEFAULT_DRIVE_ID;
        const docId: string = args.docId || "";
        const doc = await reactor.getDocument(driveId, docId);

        await reactor.addAction(
          driveId,
          docId,
          actions.setPackageAuthor({ ...args.input }),
        );

        return (doc.header.revision.global ?? 0) + 1;
      },

      VetraPackage_setPackageAuthorName: async (_: any, args: any) => {
        const driveId: string = args.driveId || DEFAULT_DRIVE_ID;
        const docId: string = args.docId || "";
        const doc = await reactor.getDocument(driveId, docId);

        await reactor.addAction(
          driveId,
          docId,
          actions.setPackageAuthorName({ ...args.input }),
        );

        return (doc.header.revision.global ?? 0) + 1;
      },

      VetraPackage_setPackageAuthorWebsite: async (_: any, args: any) => {
        const driveId: string = args.driveId || DEFAULT_DRIVE_ID;
        const docId: string = args.docId || "";
        const doc = await reactor.getDocument(driveId, docId);

        await reactor.addAction(
          driveId,
          docId,
          actions.setPackageAuthorWebsite({ ...args.input }),
        );

        return (doc.header.revision.global ?? 0) + 1;
      },

      VetraPackage_addPackageKeyword: async (_: any, args: any) => {
        const driveId: string = args.driveId || DEFAULT_DRIVE_ID;
        const docId: string = args.docId || "";
        const doc = await reactor.getDocument(driveId, docId);

        await reactor.addAction(
          driveId,
          docId,
          actions.addPackageKeyword({ ...args.input }),
        );

        return (doc.header.revision.global ?? 0) + 1;
      },

      VetraPackage_removePackageKeyword: async (_: any, args: any) => {
        const driveId: string = args.driveId || DEFAULT_DRIVE_ID;
        const docId: string = args.docId || "";
        const doc = await reactor.getDocument(driveId, docId);

        await reactor.addAction(
          driveId,
          docId,
          actions.removePackageKeyword({ ...args.input }),
        );

        return (doc.header.revision.global ?? 0) + 1;
      },

      VetraPackage_setPackageGithubUrl: async (_: any, args: any) => {
        const driveId: string = args.driveId || DEFAULT_DRIVE_ID;
        const docId: string = args.docId || "";
        const doc = await reactor.getDocument(driveId, docId);

        await reactor.addAction(
          driveId,
          docId,
          actions.setPackageGithubUrl({ ...args.input }),
        );

        return (doc.header.revision.global ?? 0) + 1;
      },

      VetraPackage_setPackageNpmUrl: async (_: any, args: any) => {
        const driveId: string = args.driveId || DEFAULT_DRIVE_ID;
        const docId: string = args.docId || "";
        const doc = await reactor.getDocument(driveId, docId);

        await reactor.addAction(
          driveId,
          docId,
          actions.setPackageNpmUrl({ ...args.input }),
        );

        return (doc.header.revision.global ?? 0) + 1;
      },
    },
  };
};
