import {
  extractDriveSlugFromPath,
  extractNodeIdFromSlug,
  resolveUrlPathname,
} from "@powerhousedao/reactor-browser";
import type { SetSelectedNodeIdEvent } from "./types.js";

export function dispatchSetSelectedNodeIdEvent(nodeSlug: string | undefined) {
  const event = new CustomEvent("ph:setSelectedNodeId", {
    detail: { nodeSlug },
  });
  window.dispatchEvent(event);
}
export function dispatchSelectedNodeIdUpdatedEvent() {
  const event = new CustomEvent("ph:selectedNodeIdUpdated");
  window.dispatchEvent(event);
}

export function handleSetSelectedNodeIdEvent(event: SetSelectedNodeIdEvent) {
  const nodeSlug = event.detail.nodeSlug;
  const nodeId = extractNodeIdFromSlug(nodeSlug);
  window.phSelectedNodeId = nodeId;
  dispatchSelectedNodeIdUpdatedEvent();

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

export function subscribeToSelectedNodeId(onStoreChange: () => void) {
  window.addEventListener("ph:selectedNodeIdUpdated", onStoreChange);
  return () =>
    window.removeEventListener("ph:selectedNodeIdUpdated", onStoreChange);
}

export function addSelectedNodeIdEventHandler() {
  window.addEventListener("ph:setSelectedNodeId", handleSetSelectedNodeIdEvent);
}
