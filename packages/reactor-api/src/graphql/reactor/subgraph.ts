import { childLogger } from "document-drive";
import fs from "fs";
import { withFilter } from "graphql-subscriptions";
import { gql } from "graphql-tag";
import path from "path";
import { BaseSubgraph } from "../base-subgraph.js";
import type { SubgraphArgs } from "../types.js";
import {
  matchesJobFilter,
  matchesSearchFilter,
  toGqlDocumentChangeEvent,
} from "./adapters.js";
import type { Resolvers } from "./gen/graphql.js";
import {
  ensureGlobalDocumentSubscription,
  ensureJobSubscription,
  getPubSub,
  SUBSCRIPTION_TRIGGERS,
  type DocumentChangesPayload,
  type JobChangesPayload,
} from "./pubsub.js";
import * as resolvers from "./resolvers.js";

export class ReactorSubgraph extends BaseSubgraph {
  private logger = childLogger([
    "ReactorSubgraph",
    Math.floor(Math.random() * 999).toString(),
  ]);

  constructor(args: SubgraphArgs) {
    super(args);
    this.logger.verbose(`constructor()`);
  }

  name = "r/:reactor";
  hasSubscriptions = true;

  // Load schema from file
  typeDefs = gql(
    fs.readFileSync(path.join(__dirname, "schema.graphql"), "utf-8"),
  );

  resolvers: Resolvers = {
    Query: {
      documentModels: async (_parent, args) => {
        this.logger.debug("documentModels", args);
        try {
          return await resolvers.documentModels(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in documentModels:", error);
          throw error;
        }
      },

      document: async (_parent, args) => {
        this.logger.debug("document", args);
        try {
          return await resolvers.document(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in document:", error);
          throw error;
        }
      },

      documentChildren: async (_parent, args) => {
        this.logger.debug("documentChildren", args);
        try {
          return await resolvers.documentChildren(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in documentChildren:", error);
          throw error;
        }
      },

      documentParents: async (_parent, args) => {
        this.logger.debug("documentParents", args);
        try {
          return await resolvers.documentParents(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in documentParents:", error);
          throw error;
        }
      },

      findDocuments: async (_parent, args) => {
        this.logger.debug("findDocuments", args);
        try {
          return await resolvers.findDocuments(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in findDocuments:", error);
          throw error;
        }
      },

      jobStatus: async (_parent, args) => {
        this.logger.debug("jobStatus", args);
        try {
          return await resolvers.jobStatus(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in jobStatus:", error);
          throw error;
        }
      },

      pollSyncEnvelopes: async (
        _parent: unknown,
        args: { channelId: string; cursorOrdinal: number },
      ) => {
        this.logger.debug("pollSyncEnvelopes", args);
        if (!this.syncManager) {
          throw new Error("SyncManager not available");
        }
        try {
          return await resolvers.pollSyncEnvelopes(this.syncManager as any, args);
        } catch (error) {
          this.logger.error("Error in pollSyncEnvelopes:", error);
          throw error;
        }
      },
    },

    Mutation: {
      createDocument: async (_parent, args) => {
        this.logger.debug("createDocument", args);
        try {
          return await resolvers.createDocument(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in createDocument:", error);
          throw error;
        }
      },

      createEmptyDocument: async (_parent, args) => {
        this.logger.debug("createEmptyDocument", args);
        try {
          return await resolvers.createEmptyDocument(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in createEmptyDocument:", error);
          throw error;
        }
      },

      mutateDocument: async (_parent, args) => {
        this.logger.debug("mutateDocument", args);
        try {
          return await resolvers.mutateDocument(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in mutateDocument:", error);
          throw error;
        }
      },

      mutateDocumentAsync: async (_parent, args) => {
        this.logger.debug("mutateDocumentAsync", args);
        try {
          return await resolvers.mutateDocumentAsync(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in mutateDocumentAsync:", error);
          throw error;
        }
      },

      renameDocument: async (_parent, args) => {
        this.logger.debug("renameDocument", args);
        try {
          return await resolvers.renameDocument(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in renameDocument:", error);
          throw error;
        }
      },

      addChildren: async (_parent, args) => {
        this.logger.debug("addChildren", args);
        try {
          return await resolvers.addChildren(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in addChildren:", error);
          throw error;
        }
      },

      removeChildren: async (_parent, args) => {
        this.logger.debug("removeChildren", args);
        try {
          return await resolvers.removeChildren(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in removeChildren:", error);
          throw error;
        }
      },

      moveChildren: async (_parent, args) => {
        this.logger.debug("moveChildren", args);
        try {
          return await resolvers.moveChildren(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in moveChildren:", error);
          throw error;
        }
      },

      deleteDocument: async (_parent, args) => {
        this.logger.debug("deleteDocument", args);
        try {
          return await resolvers.deleteDocument(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in deleteDocument:", error);
          throw error;
        }
      },

      deleteDocuments: async (_parent, args) => {
        this.logger.debug("deleteDocuments", args);
        try {
          return await resolvers.deleteDocuments(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in deleteDocuments:", error);
          throw error;
        }
      },

      createChannel: async (
        _parent: unknown,
        args: {
          input: {
            id: string;
            name: string;
            collectionId: string;
            filter: {
              documentId: readonly string[];
              scope: readonly string[];
              branch: string;
            };
          };
        },
      ) => {
        this.logger.debug("createChannel", args);
        if (!this.syncManager) {
          throw new Error("SyncManager not available");
        }
        try {
          return await resolvers.createChannel(this.syncManager as any, args);
        } catch (error) {
          this.logger.error("Error in createChannel:", error);
          throw error;
        }
      },

      pushSyncEnvelope: async (
        _parent: unknown,
        args: {
          envelope: {
            type: string;
            channelMeta: { id: string };
            operations?: Array<{
              operation: any;
              context: {
                documentId: string;
                documentType: string;
                scope: string;
                branch: string;
              };
            }> | null;
            cursor?: {
              remoteName: string;
              cursorOrdinal: number;
              lastSyncedAtUtcMs?: string | null;
            } | null;
          };
        },
      ) => {
        this.logger.debug("pushSyncEnvelope", args);
        if (!this.syncManager) {
          throw new Error("SyncManager not available");
        }
        try {
          return await resolvers.pushSyncEnvelope(this.syncManager as any, args);
        } catch (error) {
          this.logger.error("Error in pushSyncEnvelope:", error);
          throw error;
        }
      },
    },

    Subscription: {
      documentChanges: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        subscribe: withFilter(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          (() => {
            this.logger.debug("documentChanges subscription started");
            ensureGlobalDocumentSubscription(this.reactorClient);

            return getPubSub().asyncIterableIterator<DocumentChangesPayload>(
              SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES,
            );
          }) as any,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          ((
            payload: DocumentChangesPayload | undefined,
            args: {
              search: { type?: string | null; parentId?: string | null };
            },
          ) => {
            if (!payload) {
              return false;
            }

            const search = {
              type: args.search.type ?? undefined,
              parentId: args.search.parentId ?? undefined,
            };

            return matchesSearchFilter(payload.documentChanges, search);
          }) as any,
        ) as any,
        resolve: (payload: DocumentChangesPayload) => {
          return toGqlDocumentChangeEvent(payload.documentChanges);
        },
      },

      jobChanges: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        subscribe: withFilter(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          ((_parent: unknown, args: { jobId: string }) => {
            this.logger.debug("jobChanges subscription", args);
            ensureJobSubscription(this.reactorClient, args.jobId);

            return getPubSub().asyncIterableIterator<JobChangesPayload>(
              SUBSCRIPTION_TRIGGERS.JOB_CHANGES,
            );
          }) as any,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          ((
            payload: JobChangesPayload | undefined,
            args: { jobId: string },
          ) => {
            if (!payload) {
              return false;
            }

            return matchesJobFilter(payload, args);
          }) as any,
        ) as any,
        resolve: (payload: JobChangesPayload) => {
          return payload.jobChanges;
        },
      },
    },
  };

  onSetup(): Promise<void> {
    this.logger.info("Setting up ReactorSubgraph");

    return Promise.resolve();
  }
}
