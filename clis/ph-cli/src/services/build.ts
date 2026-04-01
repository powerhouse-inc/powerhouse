import {
  browserBuildConfig,
  nodeBuildConfig,
} from "@powerhousedao/shared/clis";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { detect, resolveCommand } from "package-manager-detector";
import { build as tsdownBuild } from "tsdown";
import type { BuildArgs } from "../types.js";

export async function runBuild(args: BuildArgs) {
  const { outDir } = args;

  await tsdownBuild({
    ...browserBuildConfig,
    outDir: join(outDir, "browser"),
  });

  await tsdownBuild({
    ...nodeBuildConfig,
    outDir: join(outDir, "node"),
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
}
