import type { Context, GqlDriveDocument } from "@powerhousedao/reactor-api";
import { deleteNode as baseDeleteNode, childLogger } from "document-drive";
import { GraphQLError } from "graphql";
import { gql } from "graphql-tag";
import { BaseSubgraph } from "../base-subgraph.js";
import { DocumentDriveResolvers } from "../drive-subgraph.js";
import { buildGraphQlDriveDocument } from "../utils.js";

type SystemContext = Context;

const logger = childLogger(["reactor", "system-subgraph"]);

export class SystemSubgraph extends BaseSubgraph {
  name = "system";

  typeDefs = gql`
    type DriveMeta {
      preferredEditor: String
    }
    extend type DocumentDrive {
      meta: DriveMeta
      slug: String!
    }

    type Query {
      drives: [String!]!
      driveIdBySlug(slug: String!): String
      driveDocument(idOrSlug: String!): DocumentDrive
      driveDocuments: [DocumentDrive!]!
    }

    type Mutation {
      addDrive(
        name: String!
        icon: String
        id: String
        slug: String
        preferredEditor: String
      ): AddDriveResult
      deleteDrive(id: String!): Boolean
      setDriveIcon(id: String!, icon: String!): Boolean
      setDriveName(id: String!, name: String!): Boolean
      deleteDocument(id: PHID!): Boolean
    }

    type AddDriveResult {
      id: String!
      slug: String!
      name: String!
      icon: String
      preferredEditor: String
    }

    input DocumentDriveStateInput {
      name: String
      id: String
      slug: String
      icon: String
    }
  `;

  resolvers = {
    Query: {
      driveIdBySlug: async (
        parent: unknown,
        args: { slug: string },
        ctx: SystemContext,
      ) => {
        return await this.reactor.getDriveIdBySlug(args.slug);
      },
      drives: async () => {
        return await this.reactor.getDrivesSlugs();
      },
      driveDocument: async (
        parent: unknown,
        args: { idOrSlug: string },
        ctx: SystemContext,
      ): Promise<GqlDriveDocument> => {
        let driveId: string;
        try {
          driveId = await this.reactor.getDriveIdBySlug(args.idOrSlug);
        } catch {
          driveId = args.idOrSlug;
        }
        const drive = await this.reactor.getDrive(driveId);
        ctx.document = drive;
        return buildGraphQlDriveDocument(drive);
      },
      driveDocuments: async (parent: unknown, args: {}, ctx: SystemContext) => {
        const docIds = await this.reactor.getDrives();
        const docs = await Promise.allSettled(
          docIds.map((docId) => this.reactor.getDrive(docId)),
        );
        return docs
          .filter((doc) => doc.status === "fulfilled")
          .map((doc) => buildGraphQlDriveDocument(doc.value));
      },
    },
    Mutation: {
      addDrive: async (
        parent: unknown,
        args: {
          name: string;
          icon?: string;
          id?: string;
          slug?: string;
          preferredEditor?: string;
        },
        ctx: SystemContext,
      ): Promise<{
        id: string;
        slug: string;
        name: string;
        icon: string | null;
        preferredEditor?: string;
      }> => {
        try {
          const isAdmin = ctx.isAdmin?.(ctx.user?.address ?? "");
          if (!isAdmin) {
            throw new GraphQLError("Forbidden");
          }

          const { name, icon, preferredEditor, ...driveInput } = args;

          const drive = await this.reactor.addDrive(
            {
              ...driveInput,
              global: { name, icon },
              local: {},
            },
            preferredEditor,
          );

          const driveAdded = {
            id: drive.header.id,
            slug: drive.header.slug,
            name: drive.state.global.name,
            icon: drive.state.global.icon,
            preferredEditor: drive.header.meta?.preferredEditor,
          };
          logger.info("Drive added", driveAdded);

          return driveAdded;
        } catch (e) {
          logger.error(e);
          throw e instanceof Error ? e : new Error(e as string);
        }
      },
      deleteDrive: async (
        parent: unknown,
        args: { id: string },
        ctx: SystemContext,
      ): Promise<boolean> => {
        const isAdmin = ctx.isAdmin?.(ctx.user?.address ?? "");
        if (!isAdmin) {
          throw new GraphQLError("Forbidden");
        }

        try {
          await this.reactor.deleteDrive(args.id);

          return true;
        } catch (e) {
          logger.error(e);

          return false;
        }
      },
      deleteDocument: async (
        _: unknown,
        { id }: { id: string },
        ctx: SystemContext,
      ): Promise<boolean> => {
        logger.verbose(`deleteDocument(id: ${id})`);

        if (!id) {
          throw new Error("Document id is required");
        }

        const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "");
        const isGlobalUser = ctx.isUser?.(ctx.user?.address ?? "");
        const hasGlobalWriteAccess = isGlobalAdmin || isGlobalUser;

        if (!hasGlobalWriteAccess && this.documentPermissionService) {
          const canWrite =
            await this.documentPermissionService.canWriteDocument(
              id,
              ctx.user?.address,
            );
          if (!canWrite) {
            logger.warn(
              `deleteDocument rejected: user ${ctx.user?.address ?? "anonymous"} lacks write permission for document ${id}`,
            );
            throw new GraphQLError(
              "Forbidden: insufficient permissions to delete this document",
            );
          }
        } else if (!hasGlobalWriteAccess) {
          throw new GraphQLError("Forbidden");
        }

        // Find the drive that contains this document as a node
        // and remove the node from the drive first
        const driveIds = await this.reactor.getDrives();
        for (const driveId of driveIds) {
          const drive = await this.reactor.getDrive(driveId);
          const node = drive.state.global.nodes.find((n) => n.id === id);
          if (node) {
            await this.reactor.addAction(driveId, baseDeleteNode({ id }));
            break;
          }
        }

        // Delete the document itself
        await this.reactor.deleteDocument(id);
        return true;
      },
    },
    ...DocumentDriveResolvers,
  };

  async onSetup() {
    await super.onSetup();
  }
}
