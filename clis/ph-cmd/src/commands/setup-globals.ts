import { command } from "cmd-ts";
import { createGlobalProject } from "../utils/create-global-project.js";
import { initArgs } from "./init.js";

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
    await createGlobalProject(name, options);
    process.exit(0);
  },
});
