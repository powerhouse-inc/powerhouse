import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import type { InlineConfig } from "vite";
import { build, mergeConfig } from "vite";
import type { ConnectBuildArgs } from "../types.js";
import { assignEnvVars } from "../utils/assign-env-vars.js";
import { runBuild } from "./build.js";

export async function runConnectBuild(args: ConnectBuildArgs) {
  const { outDir, debug } = args;
  assignEnvVars(args);

  await runBuild({
    outDir: "dist",
    debug,
  });

  const mode = "production";
  const dirname = process.cwd();

  const baseConfig = getConnectBaseViteConfig({
    mode,
    dirname,
  });

  const buildConfig: InlineConfig = {
    build: {
      outDir,
    },
  };

  const config = mergeConfig(baseConfig, buildConfig);

  await build(config);
}
