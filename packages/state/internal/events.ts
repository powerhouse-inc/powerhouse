import { logger } from "document-drive";
import {
  extractDriveFromPath,
  makeDriveUrlComponent,
  makeNodeUrlComponent,
} from "../utils/url.js";
import { type PHPackage } from "./types.js";

export type SetDriveEvent = CustomEvent<{ driveId: string | undefined }>;
export type SetNodeEvent = CustomEvent<{ nodeId: string | undefined }>;
export type UpdatePHPackagesEvent = CustomEvent<{
  phPackages: PHPackage[] | undefined;
}>;

export function dispatchSetDriveEvent(driveId: string | undefined) {
  const event = new CustomEvent("ph:setDrive", { detail: { driveId } });
  window.dispatchEvent(event);
}

export function handleSetDriveEvent(
  event: SetDriveEvent,
  setSelectedDrive: (driveId: string | undefined) => void,
) {
  const driveId = event.detail.driveId;
  setSelectedDrive(driveId);
  if (typeof window === "undefined") return;
  if (!driveId) {
    window.history.pushState(null, "", "/");
    return;
  }
  const reactor = window.reactor;
  if (!reactor) return;
  reactor
    .getDrive(driveId)
    .then((drive) => {
      const newPathname = makeDriveUrlComponent(drive);
      window.history.pushState(null, "", newPathname);
    })
    .catch((error: unknown) => logger.error(error));
}

export function dispatchSetNodeEvent(nodeId: string | undefined) {
  const event = new CustomEvent("ph:setNode", { detail: { nodeId } });
  window.dispatchEvent(event);
}

export function handleSetNodeEvent(
  event: SetNodeEvent,
  setSelectedNode: (nodeId: string | undefined) => void,
) {
  const nodeId = event.detail.nodeId;
  setSelectedNode(nodeId);
  if (typeof window === "undefined") return;
  const reactor = window.reactor;
  if (!reactor) return;
  const driveSlugFromPath = extractDriveFromPath(window.location.pathname);
  if (!driveSlugFromPath) return;

  if (!nodeId) {
    window.history.pushState(null, "", `/d/${driveSlugFromPath}`);
    return;
  }

  reactor
    .getDriveBySlug(driveSlugFromPath)
    .then((drive) => {
      const nodes = drive.state.global.nodes;
      const node = nodes.find((n) => n.id === nodeId);
      const nodeSlug = makeNodeUrlComponent(node);
      window.history.pushState(null, "", `/d/${driveSlugFromPath}/${nodeSlug}`);
    })
    .catch((error: unknown) => logger.error(error));
}

export function dispatchUpdatePHPackagesEvent(
  phPackages: PHPackage[] | undefined,
) {
  const event = new CustomEvent("ph:updatePHPackages", {
    detail: { phPackages },
  });
  window.dispatchEvent(event);
}

export function handleUpdatePHPackagesEvent(
  event: UpdatePHPackagesEvent,
  setPHPackages: (phPackages: PHPackage[] | undefined) => void,
) {
  const phPackages = event.detail.phPackages;
  setPHPackages(phPackages);
}
