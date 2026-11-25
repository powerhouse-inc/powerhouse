import { logoutArgs } from "@powerhousedao/shared/clis/args";
import { command } from "cmd-ts";

export const logout = command({
  name: "logout",
  description: `
The logout command withdraws your Renown login at Renown and deletes it from this computer,
its key included. Your pseudonym acts again.`,
  args: logoutArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    const { runLogout } = await import("../services/identity.js");
    // Not process.exit right after a request: Node on Windows aborts on a
    // socket it is still closing.
    process.exitCode = await runLogout(args);
  },
});
