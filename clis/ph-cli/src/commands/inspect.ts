import { command, positional, string } from "cmd-ts";
import { startInspect } from "../services/inspect.js";
import { debugArgs } from "./common-args.js";

export const inspectArgs = {
  packageName: positional({
    type: string,
    displayName: "package-name",
    description: "The name of the package to inspect",
  }),
  ...debugArgs,
};

export const inspect = command({
  name: "inspect",
  description: `
The inspect command examines and provides detailed information about a Powerhouse package.
It helps you understand the structure, dependencies, and configuration of packages in
your project.

This command:
1. Analyzes the specified package
2. Retrieves detailed information about its structure and configuration
3. Displays package metadata, dependencies, and other relevant information
4. Helps troubleshoot package-related issues`,
  aliases: ["is"],
  args: inspectArgs,
  handler: async (args) => {
    const { packageName, ...restArgs } = args;
    if (args.debug) {
      console.log(args);
    }
    await startInspect(packageName, restArgs);
    return args;
  },
});
