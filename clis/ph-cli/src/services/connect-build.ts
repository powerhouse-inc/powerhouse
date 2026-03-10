import { build, type InlineConfig } from "vite";
import type { ConnectBuildArgs } from "../types.js";
import { assignEnvVars } from "../utils/assign-env-vars.js";

export async function runConnectBuild(args: ConnectBuildArgs) {
  const { connectBasePath, outDir } = args;
  const mode = "production";

  assignEnvVars(args);

  const buildConfig: InlineConfig = {
    base: connectBasePath,
    mode,
    configFile: false,
    build: {
      outDir,
    },
  };

  await build(buildConfig);
}
