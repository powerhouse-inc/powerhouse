// Document titles for Connect's routes; route heads set them through <HeadContent />.
import type { PHStore } from "@powerhousedao/reactor-browser";
import { getDriveName, peekDriveNode } from "@powerhousedao/reactor-browser";
import type { DriveRouteData } from "./drive-route-loader.js";

const DEFAULT_APP_NAME = "Connect";

/** The configured app name, else "Connect". */
export function appTitle(appName?: string) {
  return appName || DEFAULT_APP_NAME;
}

/** `Not found · <app>`. */
export function notFoundTitle(appName?: string) {
  return `Not found · ${appTitle(appName)}`;
}

/** `<node> · <drive> · <app>`, from the store so renames show. */
export function driveTitle(
  store: PHStore,
  data: DriveRouteData | undefined,
  appName?: string,
) {
  const drive = data && store.drives?.find((d) => d.header.id === data.driveId);
  if (!drive) return appTitle(appName);
  const node = data.nodeId
    ? peekDriveNode(drive.header.id, data.nodeId, store)
    : undefined;
  return [node?.name, getDriveName(drive)]
    .filter(Boolean)
    .concat(appTitle(appName))
    .join(" · ");
}
