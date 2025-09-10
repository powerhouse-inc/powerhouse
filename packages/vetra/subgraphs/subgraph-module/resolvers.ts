import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import { addFile } from "document-drive";
import { setName } from "document-model";
import type {
  SetSubgraphNameInput,
  SetSubgraphStatusInput,
} from "../../document-models/subgraph-module/index.js";
import { actions } from "../../document-models/subgraph-module/index.js";

export const getResolvers = (subgraph: BaseSubgraph): Record<string, any> => {
  const reactor = subgraph.reactor;

  return {
    Query: {
      SubgraphModule: async () => {
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
              (doc) => doc.header.documentType === "powerhouse/subgraph",
            );
          },
        };
      },
    },
    Mutation: {
      SubgraphModule_createDocument: async (
        _: unknown,
        args: { name: string; driveId?: string },
      ) => {
        const { driveId, name } = args;
        const document = await reactor.addDocument("powerhouse/subgraph");

        if (driveId) {
          await reactor.addAction(
            driveId,
            addFile({
              name,
              id: document.header.id,
              documentType: "powerhouse/subgraph",
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
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument(docId);
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
      ) => {
        const { docId, input } = args;
        const doc = await reactor.getDocument(docId);
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
