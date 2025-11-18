import { childLogger } from "document-drive";
import fs from "fs";
import { GraphQLError } from "graphql";
import { gql } from "graphql-tag";
import path from "path";
import { BaseSubgraph } from "../base-subgraph.js";
import type { SubgraphArgs } from "../types.js";
import type { Resolvers } from "./gen/graphql.js";
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
    },

    Subscription: {
      documentChanges: {
        subscribe: () => {
          // TODO: Implement using IReactorClient.subscribe
          throw new GraphQLError("Not implemented yet");
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        resolve: (payload: any) => payload as any,
      },

      jobChanges: {
        subscribe: () => {
          // TODO: Implement job subscription
          throw new GraphQLError("Not implemented yet");
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        resolve: (payload: any) => payload as any,
      },
    },
  };

  onSetup(): Promise<void> {
    this.logger.info("Setting up ReactorSubgraph");

    return Promise.resolve();
  }
}
