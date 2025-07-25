import { logger, type DocumentDriveDocument } from "document-drive";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { useReactor } from "../hooks/reactor.js";
import {
  extractDriveFromPath,
  extractNodeNameOrSlugOrIdFromPath,
  makeNodeSlugFromNodeName,
} from "../utils/url.js";
import {
  driveIdInitializedAtom,
  selectedDriveAtom,
  selectedNodeAtom,
  selectedNodeIdInitializedAtom,
} from "./atoms.js";
import { type Reactor } from "./types.js";

/** Sets the selected drive and node from the URL.
 *
 * Both the selected drive id and selected node id begin in the NOT_SET state, so they will suspend unless set by this function or another implementation.
 *
 * If the URL is in the format `/d/<drive-slug>`, the selected drive will be set.
 * If the URL is in the format `/d/<drive-slug>/<node-slug>`, the selected drive and node will be set.
 */
export function useSetSelectedDriveAndNodeFromUrl() {
  const setSelectedDrive = useSetAtom(selectedDriveAtom);
  const setSelectedNode = useSetAtom(selectedNodeAtom);
  const selectedDriveIdInitialized = useAtomValue(driveIdInitializedAtom);
  const selectedNodeIdInitialized = useAtomValue(selectedNodeIdInitializedAtom);
  const reactor = useReactor();

  useEffect(() => {
    async function handle() {
      if (typeof window === "undefined") return;
      if (!reactor) return;
      if (selectedDriveIdInitialized) return;
      const path = window.location.pathname;
      const drive = await handleDriveFromUrl(reactor, path, setSelectedDrive);
      if (!drive) return;
      if (selectedNodeIdInitialized) return;
      handleNodeFromUrl(drive, path, setSelectedNode);
    }

    handle().catch(logger.error);
  }, [
    reactor,
    selectedDriveIdInitialized,
    selectedNodeIdInitialized,
    setSelectedDrive,
    setSelectedNode,
  ]);
}

async function handleDriveFromUrl(
  reactor: Reactor,
  path: string,
  setSelectedDrive: (driveId: string | undefined) => void,
) {
  const driveSlug = extractDriveFromPath(path);
  const driveIds = await reactor.getDrives();
  const drives = await Promise.all(driveIds.map((id) => reactor.getDrive(id)));
  const drive = drives.find(
    (d) => d.header.slug === driveSlug || d.header.id === driveSlug,
  );
  setSelectedDrive(drive?.header.id);

  return drive;
}

function handleNodeFromUrl(
  drive: DocumentDriveDocument | undefined,
  path: string,
  setSelectedNode: (nodeId: string | undefined) => void,
) {
  const nodeIdOrSlugOrNameFromPath = extractNodeNameOrSlugOrIdFromPath(path);
  const nodes = drive?.state.global.nodes;
  const node = nodes?.find(
    (n) =>
      n.id === nodeIdOrSlugOrNameFromPath ||
      makeNodeSlugFromNodeName(n.name) === nodeIdOrSlugOrNameFromPath,
  );
  setSelectedNode(node?.id);
}
