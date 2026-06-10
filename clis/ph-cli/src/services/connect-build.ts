import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import { getConfig } from "@powerhousedao/shared/clis";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { InlineConfig } from "vite";
import { build, mergeConfig } from "vite";
import type { ConnectBuildArgs } from "../types.js";
import { buildCliConnectOverride } from "../utils/cli-connect-override.js";
import { runBuild } from "./build.js";

export async function runConnectBuild(args: ConnectBuildArgs) {
  const { outDir, debug, dynamicBase } = args;

  const mode = "production";
  const dirname = process.cwd();

  // Build has no read mode; a bare positional `<key>` is a user error. The
  // 2-positional `<key> <value>` form is handled inside buildCliConnectOverride
  // so it layers on top of --json + flags like any other override input.
  if (args.keyPositional !== undefined && args.valuePositional === undefined) {
    throw new Error(
      "ph connect build: positional override requires both <key> and <value> (e.g. `ph connect build connect.renown.url https://renown.staging`). To read a value, use `ph connect config <key>`.",
    );
  }

  // Fail fast if any package marked as provider: "local" is missing from
  // node_modules — the Vite plugin that bundles them needs them on disk.
  assertLocalPackagesInstalled(dirname);

  // Build the CLI override layers (--json + individual flags + positional)
  // once here so a bad payload fails before we waste a build.
  // `--packages-registry` lands at the top-level `packageRegistryUrl`
  // (mirrors source-config shape); every other flag feeds the connect-block
  // precedence ladder.
  const { connectOverride, packageRegistryUrl } = buildCliConnectOverride(args);

  await runBuild({
    outDir: "dist",
    debug,
  });

  const baseConfig = getConnectBaseViteConfig({
    mode,
    dirname,
    cliConnectOverride: connectOverride,
    cliPackageRegistryUrl: packageRegistryUrl,
    dynamicBase,
  });

  const buildConfig: InlineConfig = {
    build: {
      outDir,
    },
  };

  const config = mergeConfig(baseConfig, buildConfig);

  await build(config);
}

function assertLocalPackagesInstalled(projectPath: string) {
  const config = getConfig(join(projectPath, "powerhouse.config.json"));
  const localPackages = (config.packages ?? []).filter(
    (p) => p.provider === "local",
  );
  if (localPackages.length === 0) return;

  const missing = localPackages.filter(
    (p) =>
      !existsSync(
        join(projectPath, "node_modules", p.packageName, "package.json"),
      ),
  );
  if (missing.length === 0) return;

  const names = missing.map((p) => p.packageName);
  throw new Error(
    `ph connect build requires these packages to be installed in node_modules (they are declared with provider: "local" in powerhouse.config.json):\n` +
      names.map((n) => `  - ${n}`).join("\n") +
      `\n\nInstall them with:\n  ph install --local ${names.join(" ")}`,
  );
}
