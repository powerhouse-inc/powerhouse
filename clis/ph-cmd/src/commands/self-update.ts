import { debugArgs } from "@powerhousedao/shared/clis/args";
import { command, optional, option, string } from "cmd-ts";
import { PH_CMD_STREAMS, setCacheCurrent } from "../utils/version-check.js";
import { runSelfUpdate, runningEntryRealPath } from "../utils/self-update.js";
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
    const realPath = await runningEntryRealPath();
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
