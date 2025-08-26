/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { type Subgraph } from "@powerhousedao/reactor-api";
import { addFile } from "document-drive";
import { generateId } from "document-model";
import { actions } from "../../document-models/vetra-package/index.js";

const DEFAULT_DRIVE_ID = "powerhouse";

export const getResolvers = (subgraph: Subgraph): Record<string, any> => {
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
              revision: doc.header.revision["global"] ?? 0,
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
                  revision: doc.header.revision["global"] ?? 0,
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
        const docId = generateId();

        await reactor.addDriveAction(
          driveId,
          addFile({
            id: docId,
            name: args.name,
            documentType: "powerhouse/package",
            synchronizationUnits: [
              {
                branch: "main",
                scope: "global",
                syncId: generateId(),
              },
              {
                branch: "main",
                scope: "local",
                syncId: generateId(),
              },
            ],
          }),
        );

        return docId;
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

        return (doc.header.revision["global"] ?? 0) + 1;
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

        return (doc.header.revision["global"] ?? 0) + 1;
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

        return (doc.header.revision["global"] ?? 0) + 1;
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

        return (doc.header.revision["global"] ?? 0) + 1;
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

        return (doc.header.revision["global"] ?? 0) + 1;
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

        return (doc.header.revision["global"] ?? 0) + 1;
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

        return (doc.header.revision["global"] ?? 0) + 1;
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

        return (doc.header.revision["global"] ?? 0) + 1;
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

        return (doc.header.revision["global"] ?? 0) + 1;
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

        return (doc.header.revision["global"] ?? 0) + 1;
      },
    },
  };
};
