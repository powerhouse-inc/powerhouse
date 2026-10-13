import { buildArgs } from "@powerhousedao/shared/clis/args";
import { command } from "cmd-ts";

export const build = command({
  name: "build",
  description: `Compile, check, bundle, and verify this package, then replace its output.

A failed build leaves the published tree unchanged. TypeScript runs first; type errors require confirmation or --ignore-type-errors. For a
code-first package, the definition check runs against that compilation, and a
project that installs the packed tarball imports the bundles before the build
promotes anything. Pieces are bundled as self-contained modules under dist/node/pieces,
and shared browser dependencies are externalized unless --no-shared-deps is set.

Exit codes: 0 built, 1 the declarations are wrong, 2 the build could not run.`,
  args: buildArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    try {
      const { logRefusal, runBuild } = await import("../services/build.js");
      const result = await runBuild(args);
      await logRefusal(result);
      process.exit(result.exitCode);
    } catch (error) {
      console.error(error);
      process.exit(2);
    }
  },
});
