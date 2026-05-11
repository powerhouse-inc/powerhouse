import { buildArgs } from "@powerhousedao/shared/clis/args";
import { command } from "cmd-ts";

export const build = command({
  name: "build",
  args: buildArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    try {
      const { runBuild } = await import("../services/build.js");
      await runBuild(args);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  },
});
