import { useDriveNode, useDrives } from "@powerhousedao/reactor-browser";
import type {
  DocumentDriveDocument,
  FolderNode,
} from "@powerhousedao/shared/document-drive";
import { useRouterState } from "@tanstack/react-router";
import type { DriveRouteData } from "./drive-route-loader.js";

/** The drive layout route's id. */
export const DRIVE_ROUTE_ID = "/_app/d/$driveSlug";
/** The node route's id: below the drive layout, with an optional node. */
export const NODE_ROUTE_ID = "/_app/d/$driveSlug/{-$nodeSlug}";

/** The open drive, folder and document, from the node route's loader data.
 * Live: a drive's edits re-render the caller. */
export type DriveRouteView = {
  drive: DocumentDriveDocument | undefined;
  /** The open folder; undefined at the drive's root or on a document. */
  folder: FolderNode | undefined;
  /** The open document's id; undefined on a folder or the drive's root. */
  documentId: string | undefined;
};

/** The ids the node route resolved, or undefined outside a drive. */
export function useDriveRouteIds(): DriveRouteData | undefined {
  return useRouterState({
    select: (state) =>
      state.matches.find((match) => match.routeId === NODE_ROUTE_ID)
        ?.loaderData as DriveRouteData | undefined,
  });
}

/** What the drive routes show: the drive, and the folder or document open in it. */
export function useDriveRouteData(): DriveRouteView {
  const ids = useDriveRouteIds();
  const drives = useDrives();
  const drive = ids && drives?.find((d) => d.header.id === ids.driveId);
  const node = useDriveNode(drive?.header.id, ids?.nodeId);
  const folder = node?.kind === "folder" ? node : undefined;
  // A node the listed drive doesn't have yet was a document the loader fetched.
  return { drive, folder, documentId: folder ? undefined : ids?.nodeId };
}
