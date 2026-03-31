import { execSync } from "node:child_process";
import { join } from "node:path";
import { detect, resolveCommand } from "package-manager-detector";
import { build as tsdownBuild, type InlineConfig } from "tsdown";
import type { BuildArgs } from "../types.js";

function withSharedConfig({
  neverBundle = [],
}: { neverBundle?: string[] } = {}): InlineConfig {
  return {
    entry: [
      "index.ts",
      "document-models/index.ts",
      "document-models/*/index.ts",
      "document-models/*/module.ts",
      "editors/index.ts",
      "editors/*/index.ts",
      "editors/*/module.ts",
      "subgraphs/index.ts",
      "subgraphs/*/index.ts",
      "processors/index.ts",
      "processors/*/index.ts",
    ],
    deps: {
      alwaysBundle: ["**"],
      neverBundle: [
        ...neverBundle,
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
    config: false,
    clean: true,
    dts: true,
    sourcemap: true,
  };
}

export async function runBuild(args: BuildArgs) {
  const { outDir } = args;

  await tsdownBuild({
    ...withSharedConfig({
      neverBundle: ["@powerhousedao/reactor-api"],
    }),
    copy: [{ from: "powerhouse.manifest.json", to: "dist" }],
    platform: "browser",
    outDir: join(outDir, "browser"),
  });

  await tsdownBuild({
    ...withSharedConfig(),
    platform: "node",
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
