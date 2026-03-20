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
      "editors/*/module.ts",
      "processors/index.ts",
      "processors/*/index.ts",
      "subgraphs/index.ts",
      "subgraphs/*/index.ts",
    ],
    platform: "browser",
    outDir,
    clean,
    dts,
    sourcemap,
    minify: false,
    copy: [{ from: "powerhouse.manifest.json", to: "dist" }],
    config: true,
    deps: {
      alwaysBundle: ["**"],
      neverBundle: [
        // we know that we don't want connect inside connect
        "@powerhousedao/connect",
        // published code would never need the cli
        "@powerhousedao/ph-cli",
        // react is resolved from esm.sh
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react-dom/client",
        // build tools
        "tailwindcss",
        "vitest",
        "tsdown",
        "@tailwindcss/cli",
        "@vitejs/plugin-react",
        // testing tools
        "@testing-library/jest-dom",
        "@testing-library/react",
        "@testing-library/user-event",
        // types
        "@types/node",
        "@types/react",
        "@types/react-dom",
      ],
    },
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
