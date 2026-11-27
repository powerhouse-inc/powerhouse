import { mutateArgs } from "@powerhousedao/shared/clis/args";
import { command } from "cmd-ts";

export const mutate = command({
  name: "mutate",
  description: `
Send a change to a document on a switchboard, signed as you (your Renown login or pseudonym, or the
key in PH_IDENTITY_KEY) through ph-cli's own session "ph-cli": a Powerhouse 6.4 host signs nothing
for its callers. The actions are plain objects; no document model is needed but for --create.

  ph mutate <document> <TYPE> [--input <json> | --input-file <file>] [--scope <scope>] [--branch <branch>]
  ph mutate <document> --actions <file.json>
  ph mutate --create <type> [--parent <drive>] [--name <name>]
  ph mutate --delete <document> [--cascade]

The switchboard is --url (its GraphQL endpoint or base URL), else the one this project runs (its run
record). A refusal prints the host's code (UNSIGNED_WRITE and its reason, or another) and its fix.
  `,
  args: mutateArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    const { runMutate } = await import("../services/mutate.js");
    process.exitCode = await runMutate(args);
  },
});
