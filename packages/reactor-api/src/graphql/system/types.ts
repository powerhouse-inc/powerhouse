import { type Context } from "#graphql/types.js";

export type SystemContext = Context & {
  isAdmin: (ctx: Context) => boolean;
};
