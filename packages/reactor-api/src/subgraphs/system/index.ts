import { Subgraph } from "#subgraphs/base/index.js";
import { type DriveInput } from "document-drive";
import { GraphQLError } from "graphql";
import { gql } from "graphql-tag";
import { type SystemContext } from "./types.js";

export class SystemSubgraph extends Subgraph {
  name = "system";

  typeDefs = gql`
    type Query {
      drives: [String!]!
      driveIdBySlug(slug: String!): String
    }

    type Mutation {
      addDrive(
        global: DocumentDriveStateInput!
        preferredEditor: String
      ): DocumentDrive_DocumentDriveState
      deleteDrive(id: ID!): Boolean
      setDriveIcon(id: String!, icon: String!): Boolean
      setDriveName(id: String!, name: String!): Boolean
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
        return await this.reactor.getDrives();
      },
    },
    Mutation: {
      addDrive: async (
        parent: unknown,
        args: DriveInput & { preferredEditor?: string },
        ctx: SystemContext,
      ) => {
        try {
          const isAdmin = ctx.isAdmin(ctx);
          if (!isAdmin) {
            throw new GraphQLError("Unauthorized");
          }
          const drive = await this.reactor.addDrive(
            { global: args.global, local: args.local },
            args.preferredEditor,
          );
          return drive.state.global;
        } catch (e) {
          console.error(e);
          throw new Error(e as string);
        }
      },
    },
  };

  async onSetup() {
    await super.onSetup();
    this.subgraphManager.setAdditionalContextFields({
      isAdmin: (ctx: SystemContext) => {
        const adminUsers =
          process.env.ADMIN_USERS?.split(",")
            .map((user) => user.trim())
            .filter(Boolean) ?? [];
        return (
          adminUsers.length === 0 ||
          (ctx.session.address &&
            adminUsers.includes(ctx.session.address.toLocaleLowerCase()))
        );
      },
    });
  }
}
