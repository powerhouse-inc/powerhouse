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

  // Resolve registry config: canonical env vars (PH_REGISTRY_URL,
  // PH_REGISTRY_PACKAGES) take priority over powerhouse.config.json.
  // Then translate the resolved values to PH_CONNECT_* so Vite exposes
  // them to the browser via envPrefix.
  const configPath = join(process.cwd(), "powerhouse.config.json");
  const phConfig = getConfig(configPath);

  const registryUrl = process.env.PH_REGISTRY_URL ?? phConfig.registryUrl;

  const packageNames = process.env.PH_REGISTRY_PACKAGES
    ? process.env.PH_REGISTRY_PACKAGES.split(",").map((p) => p.trim())
    : (phConfig.packages
        ?.filter((p) => p.provider === "registry")
        .map((p) => p.packageName) ?? []);

  if (registryUrl) {
    setConnectEnv({
      PH_CONNECT_PACKAGES_REGISTRY: registryUrl,
    });
  }
  if (packageNames.length > 0) {
    setConnectEnv({
      PH_CONNECT_REGISTRY_PACKAGE_NAMES: packageNames.join(","),
    });
  }
}
