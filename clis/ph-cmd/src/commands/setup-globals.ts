import { initArgs } from "@powerhousedao/shared/clis/args";
import { command } from "cmd-ts";

export const setupGlobals = command({
  name: "setup-globals",
  description: "Initialize a new global project",
  args: initArgs,
  handler: async (args) => {
    const { namePositional, nameOption, debug, ...options } = args;
    if (debug) {
      console.log({ args });
    }
    const name = namePositional ?? nameOption;
    const { createGlobalProject } =
      await import("../utils/create-global-project.js");
    await createGlobalProject(name, options);
    process.exit(0);
  },
});
