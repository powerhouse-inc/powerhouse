import { command } from "cmd-ts";
import { codeArgs } from "@powerhousedao/shared/clis";
import { buildPhCodeCli } from "../code/cli.js";

export const code = command({
  name: "code",
  description: `
Open the Powerhouse coding agent — a REPL backed by Mastra that has every
installed Powerhouse tool available as an agent tool.

Examples:
  ph code                           Start the interactive REPL.
  ph code "list my installed packs" One-shot agent prompt.
`,
  args: codeArgs,
  handler: async (args) => {
    const cli = buildPhCodeCli();
    // ph-clint's cli.run consumes a full argv array (it slices off the first
    // two entries internally). Reconstruct that shape from the forwarded rest.
    // No args → drop into the interactive REPL by default.
    const forwarded = args.rest.length === 0 ? ["-i"] : args.rest;
    const argv = ["node", "ph-code", ...forwarded];
    await cli.run(argv);
  },
});
