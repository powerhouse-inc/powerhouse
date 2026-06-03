import type { Node } from "@powerhousedao/shared/document-drive";
import {
  createUrlWithPreservedParams,
  extractDriveSlugFromPath,
  extractNodeIdFromSlug,
  extractNodeSlugFromPath,
  makeNodeSlug,
  resolveUrlPathname,
} from "../utils/url.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const selectedNodeIdEventFunctions = makePHEventFunctions("selectedNodeId");
export const useSelectedNodeId = selectedNodeIdEventFunctions.useValue;
const setSelectedNodeId = selectedNodeIdEventFunctions.setValue;
export const addSelectedNodeIdEventHandler =
  selectedNodeIdEventFunctions.addEventHandler;

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
    const pathname = resolveUrlPathname(`/d/${driveSlugFromPath}`);
    if (pathname === window.location.pathname) {
      return;
    }
    window.history.pushState(null, "", createUrlWithPreservedParams(pathname));
    return;
  }
  const pathname = resolveUrlPathname(`/d/${driveSlugFromPath}/${nodeSlug}`);
  if (pathname === window.location.pathname) {
    return;
  }
  window.history.pushState(null, "", createUrlWithPreservedParams(pathname));
}

export function addResetSelectedNodeEventHandler() {
  window.addEventListener("ph:selectedDriveIdUpdated", () => {
    setSelectedNodeId(undefined);
  });
}

export function addSetSelectedNodeOnPopStateEventHandler() {
  window.addEventListener("popstate", () => {
    const pathname = window.location.pathname;
    const nodeSlug = extractNodeSlugFromPath(pathname);
    // The slug embeds the id (`<name>-<uuid>`); compare ids, not slug vs id.
    const nodeId = extractNodeIdFromSlug(nodeSlug);
    const selectedNodeId = window.ph?.selectedNodeId;
    if (nodeId !== selectedNodeId) {
      setSelectedNode(nodeSlug);
    }
  });
}
