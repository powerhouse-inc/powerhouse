import { useEffect } from "react";
import type { PHDriveTarget } from "../types/global.js";
import { isFileNodeKind } from "../utils/nodes.js";
import { makeDriveSlug, makeNodeSlug } from "../utils/url.js";
import { getDriveNode, useDriveNodesCache } from "./drive-nodes.js";
import { useDrives } from "./drives.js";
import { type LinkProps, useLinkProps } from "./link-props.js";
import { getPHStore, usePHStore } from "./ph-store.js";

/** Where a document opens: the loaded drive that lists it, or undefined while none does. */
export function useDocumentTarget(
  documentId: string | null | undefined,
): PHDriveTarget | undefined {
  const store = usePHStore() ?? getPHStore();
  const drives = useDrives();
  const cache = useDriveNodesCache();
  const driveIds = drives?.map((d) => d.header.id).join("\n") ?? "";

  let target: PHDriveTarget | undefined;
  if (documentId && drives) {
    for (const drive of drives) {
      const node = cache?.get(drive.header.id)?.byId.get(documentId);
      if (!isFileNodeKind(node)) continue;
      target = {
        driveSlug: makeDriveSlug(drive),
        nodeSlug: makeNodeSlug(node),
      };
      break;
    }
  }
  const found = target !== undefined;

  // Asks each drive for the node once per document; the cache serves drives
  // whose nodes are already loaded.
  useEffect(() => {
    if (!documentId || !driveIds || found) return;
    for (const driveId of driveIds.split("\n")) {
      getDriveNode(driveId, documentId, { store }).catch(() => undefined);
    }
  }, [documentId, driveIds, found, store]);

  return target;
}

/** `useLinkProps` for a document by id, e.g. a `useDocumentsOfType` row;
 * undefined while no loaded drive lists it. */
export function useDocumentLinkProps(
  documentId: string | null | undefined,
): LinkProps | undefined {
  const target = useDocumentTarget(documentId);
  // Called either way: hooks run in the same order on every render.
  const props = useLinkProps(target);
  return target ? props : undefined;
}
