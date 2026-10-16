import type {
  PHNavigateOptions,
  PHNavigationTarget,
} from "@powerhousedao/reactor-browser";
import type { Node } from "@powerhousedao/shared/document-drive";
import {
  extractDriveSlugFromPath,
  extractNodeIdFromSlug,
  makeNodeSlug,
} from "../utils/url.js";
import {
  makePHEventFunctions,
  subscribeToPHValue,
} from "./make-ph-event-functions.js";
import { useCallback } from "react";
import {
  getCurrentPathname,
  hasHostNavigation,
  openTarget,
  openTargetWith,
  preloadTarget,
} from "./navigation.js";
import type { PHStore } from "./ph-store.js";
import {
  getPHStore,
  isScopedPHStore,
  usePHStore,
  warnGlobalSetterInScope,
} from "./ph-store.js";

const selectedNodeIdEventFunctions = makePHEventFunctions("selectedNodeId");
export const useSelectedNodeId = selectedNodeIdEventFunctions.useValue;
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
  if (selected) return selected.header.slug;
  const driveSlug = extractDriveSlugFromPath(pathname);
  return driveSlug ? decodeSlug(driveSlug) : undefined;
}

// The node in the app's open drive.
function nodeTarget(nodeSlug: string): PHNavigationTarget | undefined {
  const driveSlug = openDriveSlug(getPHStore(), getCurrentPathname());
  if (!driveSlug) return undefined;
  return { driveSlug, nodeSlug: nodeSlug || undefined };
}

type NodeRef = Node | string | undefined;

const toSlug = (node: NodeRef) =>
  typeof node === "string" ? node : makeNodeSlug(node);

// The node in a scope's open drive.
function scopedNodeTarget(store: PHStore, nodeSlug: string) {
  const pathname = store.navigation?.location().pathname ?? "";
  const driveSlug = openDriveSlug(store, pathname);
  if (!driveSlug) return undefined;
  return { driveSlug, nodeSlug: nodeSlug || undefined };
}

/** Selects a node in the app's store, without the scope warning. */
export function selectNode(node: NodeRef, options?: PHNavigateOptions) {
  const nodeSlug = toSlug(node);
  // A host router resolves the node and writes the selection itself.
  if (!hasHostNavigation()) {
    setSelectedNodeId(extractNodeIdFromSlug(nodeSlug));
  }
  const target = nodeTarget(nodeSlug);
  if (target) openTarget(target, options);
}

/** Selects a node in `store`: a scope's own selection, else the app's. */
export function selectNodeIn(
  store: PHStore | undefined,
  node: NodeRef,
  options?: PHNavigateOptions,
) {
  if (!store || !isScopedPHStore(store)) {
    selectNode(node, options);
    return;
  }
  const nodeSlug = toSlug(node);
  const navigation = store.navigation;
  if (!navigation) {
    store.selectedNodeId =
      typeof node === "object" ? node.id : extractNodeIdFromSlug(nodeSlug);
    return;
  }
  const target = scopedNodeTarget(store, nodeSlug);
  if (target) openTargetWith(navigation, target, options);
}

/** Sets the selected node (file or folder) of the app's store; `search` sets
 * the params it opens with. Inside a scoped store, use `useSetSelectedNode`. */
export function setSelectedNode(node: NodeRef, options?: PHNavigateOptions) {
  warnGlobalSetterInScope("setSelectedNode", "useSetSelectedNode");
  selectNode(node, options);
}

/** `setSelectedNode` for the store in context, e.g. a scoped editor's. */
export function useSetSelectedNode() {
  const store = usePHStore();
  return useCallback(
    (node: NodeRef, options?: PHNavigateOptions) =>
      selectNodeIn(store, node, options),
    [store],
  );
}

/** Opens a node, or with `undefined` its drive, in the store in context. */
export const useOpenNode: () => (
  node: Node | undefined,
  options?: PHNavigateOptions,
) => void = useSetSelectedNode;

/** Where a node of `store`'s open drive navigates to. */
export function getNodeTargetIn(store: PHStore | undefined, node: Node) {
  const nodeSlug = makeNodeSlug(node);
  return store && isScopedPHStore(store)
    ? scopedNodeTarget(store, nodeSlug)
    : nodeTarget(nodeSlug);
}

/** Where a node of the open drive navigates to. */
export function getNodeTarget(node: Node | undefined) {
  return nodeTarget(makeNodeSlug(node));
}

function preloadNodeIn(store: PHStore | undefined, node: Node | undefined) {
  if (!node) return;
  if (!store || !isScopedPHStore(store)) {
    const target = nodeTarget(makeNodeSlug(node));
    if (target) preloadTarget(target);
    return;
  }
  const target = scopedNodeTarget(store, makeNodeSlug(node));
  if (target) store.navigation?.preload?.(target);
}

/** Warms a node's view before it is opened, e.g. on hover. */
export function preloadNode(node: Node | undefined) {
  warnGlobalSetterInScope("preloadNode", "usePreloadNode");
  preloadNodeIn(undefined, node);
}

/** `preloadNode` for the store in context. */
export function usePreloadNode() {
  const store = usePHStore();
  return useCallback(
    (node: Node | undefined) => preloadNodeIn(store, node),
    [store],
  );
}

export function addResetSelectedNodeEventHandler() {
  subscribeToPHValue("selectedDriveId", () => {
    setSelectedNodeId(undefined);
  });
}
