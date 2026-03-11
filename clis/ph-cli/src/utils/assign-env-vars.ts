import { getConfig } from "@powerhousedao/config/node";
import { setConnectEnv } from "@powerhousedao/shared/connect";
import { join } from "path";
import type {
  ConnectBuildArgs,
  ConnectPreviewArgs,
  ConnectStudioArgs,
} from "../types.js";

export function assignEnvVars(
  args: ConnectBuildArgs | ConnectPreviewArgs | ConnectStudioArgs,
) {
  const {
    connectBasePath,
    defaultDrivesUrl,
    drivesPreserveStrategy,
    disableLocalPackages,
  } = args;

  setConnectEnv({
    PH_CONNECT_BASE_PATH: connectBasePath,
    PH_CONNECT_DEFAULT_DRIVES_URL: defaultDrivesUrl,
    PH_CONNECT_DRIVES_PRESERVE_STRATEGY: drivesPreserveStrategy,
    PH_DISABLE_LOCAL_PACKAGE: disableLocalPackages,
  });

  // Set registry env vars from powerhouse.config.json so Vite exposes them
  // to the client via envPrefix before the config is loaded
  const configPath = join(process.cwd(), "powerhouse.config.json");
  const phConfig = getConfig(configPath);

  if (phConfig.registryUrl) {
    setConnectEnv({
      PH_CONNECT_PACKAGES_REGISTRY: phConfig.registryUrl,
    });
  }

  const registryPackageNames =
    phConfig.packages
      ?.filter((p) => p.provider === "registry")
      .map((p) => p.packageName) ?? [];
  if (registryPackageNames.length > 0) {
    setConnectEnv({
      PH_CONNECT_REGISTRY_PACKAGE_NAMES: registryPackageNames.join(","),
    });
  }
}
