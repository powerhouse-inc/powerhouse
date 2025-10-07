import type { ConnectStudioOptions } from "@powerhousedao/builder-tools";
import { startConnectStudio } from "@powerhousedao/builder-tools";

export type ConnectOptions = ConnectStudioOptions["devServerOptions"] & {
  defaultDrivesUrl?: string[];
  drivesPreserveStrategy?: "preserve-all" | "preserve-by-url-and-detach";
  disableLocalPackages?: boolean;
};

export function startConnect(options?: ConnectOptions) {
  const {
    defaultDrivesUrl,
    drivesPreserveStrategy,
    disableLocalPackages,
    ...devServerOptions
  } = options || {};

  if (defaultDrivesUrl) {
    process.env.PH_CONNECT_DEFAULT_DRIVES_URL = defaultDrivesUrl.join(",");
  }
  if (drivesPreserveStrategy) {
    process.env.PH_CONNECT_DRIVES_PRESERVE_STRATEGY = drivesPreserveStrategy;
  }
  if (disableLocalPackages) {
    process.env.PH_CONNECT_DISABLE_LOCAL_PACKAGES = "true";
  }

  return startConnectStudio({ devServerOptions });
}
