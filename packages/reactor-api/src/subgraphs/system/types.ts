import { AuthContext } from "../auth/types";

export type SystemContext = AuthContext & {
  isAdmin: (ctx: AuthContext) => boolean;
};
