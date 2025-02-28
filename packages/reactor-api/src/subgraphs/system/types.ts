import { AuthContext } from "#subgraphs/auth/types.js";

export type SystemContext = AuthContext & {
  isAdmin: (ctx: AuthContext) => boolean;
};

export type AppInput = {
  id: string;
  name: string;
  driveEditor: string;
};
