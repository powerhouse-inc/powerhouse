import { DriveInput } from "document-drive";
import { GraphQLError } from "graphql";
import { gql } from "graphql-tag";
import { Subgraph } from "../base";
import { ADMIN_USERS } from "./env";
import { SystemContext } from "./types";

export class SystemSubgraph extends Subgraph {
  name = "system";

  typeDefs = gql`
    type Query {
      drives: [String!]!
      driveIdBySlug(slug: String!): String
    }

    type Mutation {
      addDrive(global: DocumentDriveStateInput!): DocumentDriveState
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
        args: DriveInput,
        ctx: SystemContext,
      ) => {
        try {
          const isAdmin = ctx.isAdmin(ctx);
          if (!isAdmin) {
            throw new GraphQLError("Unauthorized");
          }
          const drive = await this.reactor.addDrive(args);
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
        return (
          ADMIN_USERS.length === 0 ||
          (ctx.session.address &&
            ADMIN_USERS.includes(ctx.session.address.toLocaleLowerCase()))
        );
      },
    });
  }
}
