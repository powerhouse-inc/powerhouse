import { debugArgs } from "@powerhousedao/shared/clis/args";
import { command } from "cmd-ts";

export const generateConnectRoutesCmd = command({
  name: "connect-routes",
  description:
    "Generate .ph/connect-routes.gen.ts, the route tree hosts/connect/routes/ type-checks against, and fail if a route the package offers imports @powerhousedao/connect",
  args: { ...debugArgs },
  handler: async () => {
    const { syncProjectConnectRoutes } =
      await import("../utils/sync-connect-routes.js");
    const { checkOfferedRoutesImports } =
      await import("../utils/offered-routes-imports.js");
    await syncProjectConnectRoutes(process.cwd());
    // npm run tsc and lint run this first: they fail where `ph build` would.
    await checkOfferedRoutesImports(process.cwd());
  },
});
