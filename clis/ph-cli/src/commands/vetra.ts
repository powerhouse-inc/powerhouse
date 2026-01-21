import { vetraArgs } from "@powerhousedao/common/cli-args";
import { command } from "cmd-ts";
import { startVetra } from "../services/vetra.js";

export const vetra = command({
  name: "vetra",
  description: `
The vetra command sets up a Vetra development environment for working with Vetra projects.
It starts a Vetra Switchboard and optionally Connect Studio, enabling document collaboration 
and real-time processing with a "Vetra" drive or connection to remote drives.

This command:
1. Starts a Vetra Switchboard with a "Vetra" drive for document storage
2. Optionally connects to remote drives instead of creating a local drive
3. Starts Connect Studio pointing to the Switchboard for user interaction (unless disabled)
4. Enables real-time updates, collaboration, and code generation`,
  args: vetraArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    await startVetra(args);
  },
});
