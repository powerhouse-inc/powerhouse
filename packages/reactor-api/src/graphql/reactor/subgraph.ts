import { Subgraph } from "#graphql/base/index.js";
import { type SubgraphArgs } from "#graphql/types.js";
import { childLogger } from "document-drive";
import fs from "fs";
import { GraphQLError } from "graphql";
import { gql } from "graphql-tag";
import path from "path";
import { type Resolvers } from "./gen/graphql.js";
import * as resolvers from "./resolvers.js";

export class ReactorSubgraph extends Subgraph {
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
      createDocument: (_parent, args) => {
        this.logger.debug("createDocument", args);
        // TODO: Implement using IReactorClient.create
        throw new GraphQLError("Not implemented yet");
      },

      createEmptyDocument: (_parent, args) => {
        this.logger.debug("createEmptyDocument", args);
        // TODO: Implement using IReactorClient.createEmpty
        throw new GraphQLError("Not implemented yet");
      },

      mutateDocument: (_parent, args) => {
        this.logger.debug("mutateDocument", args);
        // TODO: Implement using IReactorClient.mutate
        throw new GraphQLError("Not implemented yet");
      },

      mutateDocumentAsync: (_parent, args) => {
        this.logger.debug("mutateDocumentAsync", args);
        // TODO: Implement using IReactorClient.mutateAsync
        throw new GraphQLError("Not implemented yet");
      },

      renameDocument: (_parent, args) => {
        this.logger.debug("renameDocument", args);
        // TODO: Implement using IReactorClient.rename
        throw new GraphQLError("Not implemented yet");
      },

      addChildren: (_parent, args) => {
        this.logger.debug("addChildren", args);
        // TODO: Implement using IReactorClient.addChildren
        throw new GraphQLError("Not implemented yet");
      },

      removeChildren: (_parent, args) => {
        this.logger.debug("removeChildren", args);
        // TODO: Implement using IReactorClient.removeChildren
        throw new GraphQLError("Not implemented yet");
      },

      moveChildren: (_parent, args) => {
        this.logger.debug("moveChildren", args);
        // TODO: Implement using IReactorClient.moveChildren
        throw new GraphQLError("Not implemented yet");
      },

      deleteDocument: (_parent, args) => {
        this.logger.debug("deleteDocument", args);
        // TODO: Implement using IReactorClient.deleteDocument
        throw new GraphQLError("Not implemented yet");
      },

      deleteDocuments: (_parent, args) => {
        this.logger.debug("deleteDocuments", args);
        // TODO: Implement using IReactorClient.deleteDocuments
        throw new GraphQLError("Not implemented yet");
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
