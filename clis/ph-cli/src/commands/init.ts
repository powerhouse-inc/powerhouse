import { initArgs } from "@powerhousedao/shared/clis";
import { command } from "cmd-ts";

export const init = command({
  name: "init",
  description: "Initialize a new project",
  args: initArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log({ args });
    }
    const { startInit } = await import("../services/init.js");
    await startInit(args);
    process.exit(0);
  },
});
