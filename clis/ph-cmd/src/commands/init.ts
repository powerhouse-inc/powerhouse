import { initArgs } from "@powerhousedao/shared/clis/args";
import { command } from "cmd-ts";
import { delegateInit } from "../utils/delegate-init.js";

/**
 * Delegates `ph init` to the appropriate version of `@powerhousedao/ph-cli`.
 * This ensures the init logic (boilerplate, codegen) always matches the
 * ph-cli version being installed in the new project.
 */
export const init = command({
  name: "init",
  description: "Initialize a new project",
  args: initArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log({ args });
    }
    await delegateInit(args);
    process.exit(0);
  },
});
