import { generateArgs } from "@powerhousedao/common/clis";
import { command } from "cmd-ts";
import { startGenerate } from "../services/generate.js";

export const generate = command({
  name: "generate",
  description: `
The generate command creates code from document models. It helps you build editors, 
processors, and other components based on your document model files.

This command:
1. Reads document model definitions
2. Generates code for specified components (editors, processors, etc.)
3. Supports customization of output and generation options
4. Can watch files for changes and regenerate code automatically
`,
  args: generateArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    await startGenerate(args);
    process.exit(0);
  },
});
