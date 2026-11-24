import { whoamiArgs } from "@powerhousedao/shared/clis/args";
import { command } from "cmd-ts";

export const whoami = command({
  name: "whoami",
  description: `
Show who acts here: your Renown login when you are logged in (\`ph login\`), else your
pseudonym, an Ethereum key made without a login and shown as "Anonymous" and a short
address. Reads files only; \`--check\` also asks Renown whether the login is still valid.
  `,
  args: whoamiArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    const { runWhoami } = await import("../services/identity.js");
    // Not process.exit: --check went to the network (see runLogout).
    process.exitCode = await runWhoami(args);
  },
});
