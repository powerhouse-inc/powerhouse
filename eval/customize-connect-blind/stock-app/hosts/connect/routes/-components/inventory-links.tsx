import {
  makeDriveSlug,
  makeNodeSlug,
  useDrives,
  useLinkProps,
} from "@powerhousedao/reactor-browser";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export const INVENTORY_ITEM_TYPE = "stock-app/inventory-item";

/** Where a document lives: the drive that has a file node for it. */
export function useDocumentLocations() {
  const drives = useDrives();
  const byId = new Map<
    string,
    { driveSlug: string; driveName: string; nodeSlug: string }
  >();
  for (const drive of drives ?? []) {
    const driveSlug = String(makeDriveSlug(drive));
    for (const node of drive.state.global.nodes) {
      if (node.kind !== "file") continue;
      byId.set(node.id, {
        driveSlug,
        driveName: drive.header.name,
        nodeSlug: makeNodeSlug(node),
      });
    }
  }
  return byId;
}

export function OpenDocumentLink({
  driveSlug,
  nodeSlug,
  children,
}: {
  driveSlug: string;
  nodeSlug: string;
  children: ReactNode;
}) {
  const props = useLinkProps({ driveSlug, nodeSlug });
  return (
    <a {...props} className="text-primary font-medium hover:underline">
      {children}
    </a>
  );
}

/** Links that open a drive with the create-document modal on top. The
 * modal adds the document to the drive of the current route, so a page
 * outside a drive sends the user to one first. */
export function NewItemInDriveLinks() {
  const drives = useDrives();
  if (!drives?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">New item in</span>
      {drives.map((drive) => (
        <Link
          key={drive.header.id}
          to="/d/$driveSlug/{-$nodeSlug}"
          params={{ driveSlug: String(makeDriveSlug(drive)) }}
          search={{
            modal: "create-document",
            documentType: INVENTORY_ITEM_TYPE,
          }}
          className="border-border rounded-md border px-3 py-1 hover:bg-accent"
        >
          {drive.header.name}
        </Link>
      ))}
    </div>
  );
}
