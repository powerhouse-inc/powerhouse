import type { Node } from "document-drive";
import {
  extractDriveSlugFromPath,
  extractNodeIdFromSlug,
  makeNodeSlug,
  resolveUrlPathname,
} from "../utils/url.js";
import { useNodesInSelectedDrive } from "./items-in-selected-drive.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const selectedNodeIdEventFunctions = makePHEventFunctions("selectedNodeId");
const useSelectedNodeId = selectedNodeIdEventFunctions.useValue;
const setSelectedNodeId = selectedNodeIdEventFunctions.setValue;
export const addSelectedNodeIdEventHandler =
  selectedNodeIdEventFunctions.addEventHandler;

/** Returns the selected node. */
export function useSelectedNode(): Node | undefined {
  const selectedNodeId = useSelectedNodeId();
  const nodes = useNodesInSelectedDrive();
  return nodes?.find((n) => n.id === selectedNodeId);
}

/** Sets the selected node (file or folder). */
export function setSelectedNode(nodeOrNodeSlug: Node | string | undefined) {
  const nodeSlug =
    typeof nodeOrNodeSlug === "string"
      ? nodeOrNodeSlug
      : makeNodeSlug(nodeOrNodeSlug);
  const nodeId = extractNodeIdFromSlug(nodeSlug);
  setSelectedNodeId(nodeId);
  const driveSlugFromPath = extractDriveSlugFromPath(window.location.pathname);
  if (!driveSlugFromPath) {
    return;
  }
  if (!nodeSlug) {
    window.history.pushState(
      null,
      "",
      resolveUrlPathname(`/d/${driveSlugFromPath}`),
    );
    return;
  }
  window.history.pushState(
    null,
    "",
    resolveUrlPathname(`/d/${driveSlugFromPath}/${nodeSlug}`),
  );
}
