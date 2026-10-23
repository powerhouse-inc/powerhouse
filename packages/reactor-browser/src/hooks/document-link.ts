import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import type { PHDriveTarget } from "../types/global.js";
import { isFileNodeKind } from "../utils/nodes.js";
import { makeDriveSlug, makeNodeSlug } from "../utils/url.js";
import { useDrives } from "./drives.js";
import { type LinkProps, useLinkProps } from "./link-props.js";

// Built once per drives list: a page of rows looks each one up.
const indexes = new WeakMap<
  readonly DocumentDriveDocument[],
  Map<string, PHDriveTarget>
>();

function documentTargets(drives: readonly DocumentDriveDocument[]) {
  let index = indexes.get(drives);
  if (index) return index;
  index = new Map();
  for (const drive of drives) {
    for (const node of drive.state.global.nodes) {
      if (!isFileNodeKind(node) || index.has(node.id)) continue;
      index.set(node.id, {
        driveSlug: makeDriveSlug(drive),
        nodeSlug: makeNodeSlug(node),
      });
    }
  }
  indexes.set(drives, index);
  return index;
}

/** Where a document opens: the loaded drive that lists it, or undefined while none does. */
export function useDocumentTarget(
  documentId: string | null | undefined,
): PHDriveTarget | undefined {
  const drives = useDrives();
  if (!documentId || !drives) return undefined;
  return documentTargets(drives).get(documentId);
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
