import { Subgraph } from "#graphql/base/index.js";
import { type SubgraphArgs } from "#graphql/types.js";
import { childLogger } from "document-drive";
import fs from "fs";
import { GraphQLError } from "graphql";
import { gql } from "graphql-tag";
import path from "path";
import {
  fromInputMaybe,
  toDocumentModelResultPage,
  toGqlJobInfo,
  toGqlPhDocument,
  toMutableArray,
  toPhDocumentResultPage,
} from "./adapters.js";
import { type Resolvers } from "./gen/graphql.js";

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
          const result = await this.reactorClient.getDocumentModels(
            fromInputMaybe(args.namespace),
            args.paging && (args.paging.cursor || args.paging.limit)
              ? {
                  cursor: fromInputMaybe(args.paging.cursor) || "",
                  limit: fromInputMaybe(args.paging.limit) || 10,
                }
              : undefined,
          );
          return toDocumentModelResultPage(result);
        } catch (error) {
          this.logger.error("Error fetching document models:", error);
          throw new GraphQLError(
            `Failed to fetch document models: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },

      document: async (_parent, args) => {
        this.logger.debug("document", args);
        try {
          const result = await this.reactorClient.get(
            args.identifier,
            args.view
              ? {
                  branch: fromInputMaybe(args.view.branch),
                  scopes: toMutableArray(fromInputMaybe(args.view.scopes)),
                }
              : undefined,
          );
          return {
            document: toGqlPhDocument(result.document),
            childIds: result.childIds,
          };
        } catch (error) {
          this.logger.error("Error fetching document:", error);
          throw new GraphQLError(
            `Failed to fetch document: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },

      documentChildren: async (_parent, args) => {
        this.logger.debug("documentChildren", args);
        try {
          const result = await this.reactorClient.getChildren(
            args.parentIdentifier,
            args.view
              ? {
                  branch: fromInputMaybe(args.view.branch),
                  scopes: toMutableArray(fromInputMaybe(args.view.scopes)),
                }
              : undefined,
            args.paging && (args.paging.cursor || args.paging.limit)
              ? {
                  cursor: fromInputMaybe(args.paging.cursor) || "",
                  limit: fromInputMaybe(args.paging.limit) || 10,
                }
              : undefined,
          );
          return toPhDocumentResultPage(result);
        } catch (error) {
          this.logger.error("Error fetching document children:", error);
          throw new GraphQLError(
            `Failed to fetch document children: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },

      documentParents: async (_parent, args) => {
        this.logger.debug("documentParents", args);
        try {
          const result = await this.reactorClient.getParents(
            args.childIdentifier,
            args.view
              ? {
                  branch: fromInputMaybe(args.view.branch),
                  scopes: toMutableArray(fromInputMaybe(args.view.scopes)),
                }
              : undefined,
            args.paging && (args.paging.cursor || args.paging.limit)
              ? {
                  cursor: fromInputMaybe(args.paging.cursor) || "",
                  limit: fromInputMaybe(args.paging.limit) || 10,
                }
              : undefined,
          );
          return toPhDocumentResultPage(result);
        } catch (error) {
          this.logger.error("Error fetching document parents:", error);
          throw new GraphQLError(
            `Failed to fetch document parents: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },

      findDocuments: async (_parent, args) => {
        this.logger.debug("findDocuments", args);
        try {
          const result = await this.reactorClient.find(
            {
              type: fromInputMaybe(args.search.type),
              parentId: fromInputMaybe(args.search.parentId),
              // Note: ids and slugs might not be in the GraphQL schema yet
            },
            args.view
              ? {
                  branch: fromInputMaybe(args.view.branch),
                  scopes: toMutableArray(fromInputMaybe(args.view.scopes)),
                }
              : undefined,
            args.paging && (args.paging.cursor || args.paging.limit)
              ? {
                  cursor: fromInputMaybe(args.paging.cursor) || "",
                  limit: fromInputMaybe(args.paging.limit) || 10,
                }
              : undefined,
          );
          return toPhDocumentResultPage(result);
        } catch (error) {
          this.logger.error("Error finding documents:", error);
          throw new GraphQLError(
            `Failed to find documents: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },

      jobStatus: async (_parent, args) => {
        this.logger.debug("jobStatus", args);
        try {
          const result = await this.reactorClient.getJobStatus(args.jobId);
          return toGqlJobInfo(result);
        } catch (error) {
          this.logger.error("Error fetching job status:", error);
          throw new GraphQLError(
            `Failed to fetch job status: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
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
    this.logger.info(
      `ReactorClient is ${this.reactorClient ? "available" : "not available"}`,
    );
    return Promise.resolve();
  }
}
