import { buildArgs } from "@powerhousedao/shared/clis/args";
import { command } from "cmd-ts";

export const build = command({
  name: "build",
  description: `
Build a Powerhouse package for publishing: a browser bundle and a node bundle of its
document models, editors, subgraphs and processors, type declarations, and its stylesheet.

Pieces under pieces/ are built too, each into its own self-contained module under
dist/node/pieces/<name>, with a descriptor.json and package.json written beside it and
the piece listed in dist/powerhouse.manifest.json. A package that ships only pieces is an
ordinary package: it carries the same boilerplate, and every step above runs for it too.`,
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
