import type { ConnectStudioOptions } from "@powerhousedao/builder-tools";
import { startConnectStudio } from "@powerhousedao/builder-tools";

export type ConnectOptions = ConnectStudioOptions["devServerOptions"];

export function startConnect(options?: ConnectOptions) {
  return startConnectStudio({ devServerOptions: options });
}
