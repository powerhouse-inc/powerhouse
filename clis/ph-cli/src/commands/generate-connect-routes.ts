import { debugArgs } from "@powerhousedao/shared/clis/args";
import { command } from "cmd-ts";

export const generateConnectRoutesCmd = command({
  name: "connect-routes",
  description:
    "Generate .ph/connect-routes.gen.ts, the route tree hosts/connect/routes/ type-checks against",
  args: { ...debugArgs },
  handler: async () => {
    const { syncProjectConnectRoutes } =
      await import("../utils/sync-connect-routes.js");
    await syncProjectConnectRoutes(process.cwd());
  },
});
