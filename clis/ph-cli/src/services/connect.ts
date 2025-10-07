import type { ConnectStudioOptions } from "@powerhousedao/builder-tools";
import { startConnectStudio } from "@powerhousedao/builder-tools";

export function startConnect(options?: ConnectStudioOptions) {
  return startConnectStudio(options);
}
