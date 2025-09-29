import { connectConfig } from "@powerhousedao/connect/config";
import { initRenown } from "@renown/sdk";

export function initRenownBrowser(connectId: string) {
  return initRenown(connectId, connectConfig.routerBasename);
}
