import { command } from "cmd-ts";
import { createGlobalProject } from "../utils/package-manager.js";
import { initArgs } from "./init.js";

export const setupGlobals = command({
  name: "setup-globals",
  description: "Initialize a new global project",
  args: initArgs,
  handler: async ({ namePositional, nameOption, ...options }) => {
    const name = namePositional ?? nameOption;
    await createGlobalProject(name, options);
  },
});
