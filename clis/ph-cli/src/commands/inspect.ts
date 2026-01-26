import { inspectArgs } from "@powerhousedao/common/clis";
import { command } from "cmd-ts";
import console from "console";
import { startInspect } from "../services/inspect.js";

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
  handler: (args) => {
    if (args.debug) {
      console.log(args);
    }
    startInspect(args);
    process.exit(0);
  },
});
