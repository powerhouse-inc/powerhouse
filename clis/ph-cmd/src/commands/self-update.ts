import { debugArgs } from "@powerhousedao/shared/clis/args";
import { command, optional, option, string } from "cmd-ts";
import { realpath } from "node:fs/promises";
import { PH_CMD_STREAMS, setCacheCurrent } from "../utils/version-check.js";
import { runSelfUpdate } from "../utils/self-update.js";
import { getVersion } from "../get-version.js";

export const selfUpdate = command({
  name: "self-update",
  description:
    "Update the globally installed ph to the newest version of its release stream",
  args: {
    tag: option({
      type: optional(string),
      long: "tag",
      short: "t",
      description: `dist-tag to install (defaults to the running build's stream; e.g. ${PH_CMD_STREAMS.join(
        ", ",
      )})`,
    }),
    ...debugArgs,
  },
  handler: async (args) => {
    if (args.debug) {
      console.log({ args });
    }
    // The real path of the running bundle identifies the global install
    // (and its package manager). argv[1] is the entry script; the ESM
    // loader already resolved symlinks, realpath is belt-and-braces.
    const entry = process.argv[1];
    const realPath = entry
      ? await realpath(entry)
      : import.meta.url.replace(/^file:\/\//, "");
    const result = await runSelfUpdate({
      currentVersion: getVersion(),
      tag: args.tag,
      realPath,
    });
    if (!result.ok) {
      process.exit(1);
    }
    // Quiet the notice on the next run: the new version is now current.
    await setCacheCurrent(result.to);
    process.exit(0);
  },
});
