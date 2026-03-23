import { buildArgs } from "@powerhousedao/shared/clis";
import { command } from "cmd-ts";
import { runBuild } from "../services/build.js";

export const build = command({
  name: "build",
  args: buildArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    try {
      await runBuild(args);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  },
});
