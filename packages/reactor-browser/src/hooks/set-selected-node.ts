import type {
  PHNavigateOptions,
  PHNavigationTarget,
} from "@powerhousedao/reactor-browser";
import type {
  DocumentDriveDocument,
  Node,
} from "@powerhousedao/shared/document-drive";
import {
  extractDriveSlugFromPath,
  extractNodeIdFromSlug,
  makeDriveSlug,
  makeNodeSlug,
} from "../utils/url.js";
import {
  makePHEventFunctions,
  subscribeToPHValue,
} from "./make-ph-event-functions.js";
import { useCallback } from "react";
import { useDriveContext } from "./drive-context.js";
import {
  getCurrentPathname,
  hasHostNavigation,
  openTarget,
  preloadTarget,
} from "./navigation.js";
import type { PHStore } from "./ph-store.js";
import { getPHStore } from "./ph-store.js";

const selectedNodeIdEventFunctions = makePHEventFunctions("selectedNodeId");
const useStoreSelectedNodeId = selectedNodeIdEventFunctions.useValue;

/** The selected node id: the drive app's open node, else the app's selection. */
export function useSelectedNodeId() {
  const context = useDriveContext();
  const selectedNodeId = useStoreSelectedNodeId();
  return context ? context.nodeId : selectedNodeId;
}
/** Sets the selected node id without touching the URL. */
export const setSelectedNodeId = selectedNodeIdEventFunctions.setValue;
/** @deprecated `ph:setSelectedNodeId` bypasses the URL; use `setSelectedNode`. */
export const addSelectedNodeIdEventHandler =
  selectedNodeIdEventFunctions.addEventHandler;

function decodeSlug(slug: string) {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

// The selected drive's slug, else the path's: a pending navigation's path
// already names its destination, not the drive still shown.
function openDriveSlug(store: PHStore | undefined, pathname: string) {
  const selected = store?.drives?.find(
    (d) => d.header.id === store.selectedDriveId,
  );
  if (selected) return makeDriveSlug(selected);
  const driveSlug = extractDriveSlugFromPath(pathname);
  return driveSlug ? decodeSlug(driveSlug) : undefined;
}

// The node in `drive`, else in the app's open drive.
function nodeTarget(
  nodeSlug: string,
  drive?: DocumentDriveDocument,
): PHNavigationTarget | undefined {
  const driveSlug = drive
    ? makeDriveSlug(drive)
    : openDriveSlug(getPHStore(), getCurrentPathname());
  if (!driveSlug) return undefined;
  return { driveSlug, nodeSlug: nodeSlug || undefined };
}

type NodeRef = Node | string | undefined;

const toSlug = (node: NodeRef) =>
  typeof node === "string" ? node : makeNodeSlug(node);

/** Selects a node in `drive`, else in the app's open drive. */
export function selectNode(
  node: NodeRef,
  options?: PHNavigateOptions,
  drive?: DocumentDriveDocument,
) {
  const nodeSlug = toSlug(node);
  // A host router resolves the node and writes the selection itself.
  if (!hasHostNavigation()) {
    setSelectedNodeId(extractNodeIdFromSlug(nodeSlug));
  }
  const target = nodeTarget(nodeSlug, drive);
  if (target) openTarget(target, options);
}

/** Sets the selected node (file or folder) of the app's store; `search` sets
 * the params it opens with. Inside a drive app, use `useSetSelectedNode`. */
export function setSelectedNode(node: NodeRef, options?: PHNavigateOptions) {
  selectNode(node, options);
}

function findNode(drive: DocumentDriveDocument, node: NodeRef) {
  if (typeof node !== "string") return node;
  const id = extractNodeIdFromSlug(node);
  return drive.state.global.nodes.find((n) => n.id === id);
}

/** Opens a node: through the drive app's `open` when it has one, else the
 * app's navigation in the drive app's drive. */
export function useSetSelectedNode() {
  const context = useDriveContext();
  return useCallback(
    (node: NodeRef, options?: PHNavigateOptions) => {
      if (context?.open) {
        context.open(findNode(context.drive, node), options);
        return;
      }
      selectNode(node, options, context?.drive);
    },
    [context],
  );
}

/** Opens a node, or with `undefined` its drive. */
export const useOpenNode: () => (
  node: Node | undefined,
  options?: PHNavigateOptions,
) => void = useSetSelectedNode;

/** Where a node of `drive`, else of the open drive, navigates to. */
export function getNodeTarget(
  node: Node | undefined,
  drive?: DocumentDriveDocument,
) {
  return nodeTarget(makeNodeSlug(node), drive);
}

/** Where a node navigates to: in the drive app's drive, else the open drive. */
export function useNodeTarget(node: Node | undefined) {
  const context = useDriveContext();
  return getNodeTarget(node, context?.drive);
}

/** Warms a node's view before it is opened, e.g. on hover. */
export function preloadNode(
  node: Node | undefined,
  drive?: DocumentDriveDocument,
) {
  if (!node) return;
  const target = nodeTarget(makeNodeSlug(node), drive);
  if (target) preloadTarget(target);
}

/** `preloadNode` through the drive app's `preload`, if it has one. */
export function usePreloadNode() {
  const context = useDriveContext();
  return useCallback(
    (node: Node | undefined) => {
      if (context?.preload) context.preload(node);
      else if (!context?.open) preloadNode(node, context?.drive);
    },
    [context],
  );
}

export function addResetSelectedNodeEventHandler() {
  subscribeToPHValue("selectedDriveId", () => {
    setSelectedNodeId(undefined);
  });
}
