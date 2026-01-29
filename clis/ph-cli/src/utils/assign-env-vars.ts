import { setConnectEnv } from "@powerhousedao/builder-tools";
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
}
