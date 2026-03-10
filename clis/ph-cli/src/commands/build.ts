import { connectBuildArgs } from "@powerhousedao/common/clis";
import { command } from "cmd-ts";
import { execSync } from "node:child_process";
import { detect, resolveCommand } from "package-manager-detector";
import { build as tsdownBuild } from "tsdown";

export const build = command({
  name: "build",
  args: connectBuildArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }

    try {
      await tsdownBuild({
        entry: [
          "index.ts",
          "document-models/index.ts",
          "document-models/*/index.ts",
          "editors/index.ts",
          "editors/*/index.ts",
          "processors/index.ts",
          "processors/*/index.ts",
          "powerhouse.manifest.json",
        ],
        platform: "neutral",
        outDir: "dist",
        clean: true,
        dts: true,
        sourcemap: true,
      });

      const detectResult = await detect();
      const executeLocalCommand = resolveCommand(
        detectResult?.agent ?? "npm",
        "execute-local",
        ["tailwindcss", "-i", "./style.css", "-o", "./dist/style.css"],
      );
      if (executeLocalCommand === null) {
        console.error(
          "You need to have tailwindcss installed to use the `build` command.",
        );
        process.exit(1);
      }
      execSync(
        `${executeLocalCommand.command} ${executeLocalCommand.args.join(" ")}`,
      );
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  },
});
