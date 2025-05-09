import { type AuthContext } from "#graphql/auth/types.js";

export type SystemContext = AuthContext & {
  isAdmin: (ctx: AuthContext) => boolean;
};
