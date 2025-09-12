import type { Context } from "@powerhousedao/reactor-api";
import { childLogger } from "document-drive";
import { GraphQLError } from "graphql";
import { gql } from "graphql-tag";
import { BaseSubgraph } from "../base-subgraph.js";

type SystemContext = Context;

const logger = childLogger(["reactor", "system-subgraph"]);

export class SystemSubgraph extends BaseSubgraph {
  name = "system";

  typeDefs = gql`
    type Query {
      drives: [String!]!
      driveIdBySlug(slug: String!): String
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
      drives: async () => {
        return await this.reactor.getDrivesSlugs();
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
  };

  async onSetup() {
    await super.onSetup();
  }
}
