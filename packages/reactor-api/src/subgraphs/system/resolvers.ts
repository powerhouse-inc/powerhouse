import { DriveInput } from "document-drive";
import { Context } from "../types";
import { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper";

export const resolvers: GraphQLResolverMap<Context> = {
  Query: {
    drives: async (parent: unknown, args: unknown, ctx: Context) => {
      const drives = await ctx.driveServer.getDrives();
      return drives;
    },
  },
  Mutation: {
    addDrive: async (parent: unknown, args: DriveInput, ctx: Context) => {
      try {
        const drive = await ctx.driveServer.addDrive(args);
        return drive.state.global;
      } catch (e) {
        console.error(e);
        throw new Error(e as string);
      }
    },
  },
};
