import { execSync } from "node:child_process";
import { detect, resolveCommand } from "package-manager-detector";
import { build as tsdownBuild } from "tsdown";
import type { BuildArgs } from "../types.js";

export async function runBuild(args: BuildArgs) {
  const { outDir, clean, dts, sourcemap } = args;
  await tsdownBuild({
    entry: [
      "index.ts",
      "document-models/index.ts",
      "document-models/*/index.ts",
      "editors/index.ts",
      "editors/*/index.ts",
      "processors/index.ts",
      "processors/*/index.ts",
      "subgraphs/index.ts",
      "subgraphs/*/index.ts",
      "powerhouse.manifest.json",
    ],
    platform: "neutral",
    outDir,
    clean,
    dts,
    sourcemap,
    copy: [{ from: "powerhouse.manifest.json", to: "dist" }],
    config: false,
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
