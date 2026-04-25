import { z } from "zod";
import { adaptCmdTs } from "./adapter.js";
import { list as listCmd } from "../commands/list.js";
import { logout as logoutCmd } from "../commands/logout.js";
import { accessToken as accessTokenCmd } from "../commands/access-token.js";

const debugSchema = { debug: z.boolean().optional() };

export const listAdapted = adaptCmdTs({
  id: "list",
  description:
    "List installed Powerhouse packages from powerhouse.config.json.",
  inputSchema: z.object({ ...debugSchema }),
  invoke: (input) => listCmd.handler(input as never),
});

export const logoutAdapted = adaptCmdTs({
  id: "logout",
  description: "Remove the local Renown session created with `ph login`.",
  inputSchema: z.object({}),
  invoke: () => logoutCmd.handler({} as never),
});

export const accessTokenAdapted = adaptCmdTs({
  id: "access-token",
  description:
    "Generate a bearer JWT for Powerhouse APIs using the local DID. " +
    "Requires `ph login` first.",
  inputSchema: z.object({
    expiry: z
      .string()
      .optional()
      .describe('Token expiry, e.g. "7d", "24h", "3600s".'),
    audience: z.string().optional().describe("Target audience URL."),
    ...debugSchema,
  }),
  invoke: (input) => accessTokenCmd.handler(input as never),
});

export const phCliAdaptedCommands = [
  listAdapted,
  logoutAdapted,
  accessTokenAdapted,
];
