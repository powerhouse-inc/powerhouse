import {
  browserBuildConfig,
  nodeBuildConfig,
} from "@powerhousedao/shared/build-config";
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
  const agent = detectResult?.agent ?? "npm";

  // Emit types with tsc
  const tscCommand = resolveCommand(agent, "execute-local", ["tsc", "--build"]);
  if (tscCommand === null) {
    console.error(
      "You need to have typescript installed to use the `build` command.",
    );
    process.exit(1);
  }
  console.log("\n▶ Emitting types via tsc...");
  try {
    execSync(`${tscCommand.command} ${tscCommand.args.join(" ")}`, {
      stdio: "inherit",
    });
    console.log("✔ Types emitted to", join(outDir, "types"));
  } catch {
    console.warn(
      "✘ tsc reported errors above; declarations were still written. Fix the errors to keep types accurate.",
    );
  }

  const executeLocalCommand = resolveCommand(agent, "execute-local", [
    "tailwindcss",
    "-i",
    "./style.css",
    "-o",
    "./dist/style.css",
  ]);
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
