import { AuthContext } from "#subgraphs/auth/types.js";

export type SystemContext = AuthContext & {
  isAdmin: (ctx: AuthContext) => boolean;
};
