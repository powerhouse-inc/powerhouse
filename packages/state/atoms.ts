import {
  type DocumentDriveDocument,
  type FolderNode,
  type Node,
} from "document-drive";
import { type ProcessorManager } from "document-drive/processors/processor-manager";
import { type PHDocument } from "document-model";
import isEqual from "fast-deep-equal";
import { atom } from "jotai";
import { loadable, unwrap } from "jotai/utils";
import { isFolderNodeKind } from "./nodes.js";
import { type UnsetAtomValue } from "./types.js";
import { NOT_SET, suspendUntilSet } from "./utils.js";

/* Processor Manager */

/** Holds the processor manager instance.
 *
 * Like all base atoms, it is not meant to be accessed or updated directly.
 * Starts off with the sentinel value NOT_SET.
 */
export const baseProcessorManagerAtom = atom<
  UnsetAtomValue | ProcessorManager | undefined
>(NOT_SET);
baseProcessorManagerAtom.debugLabel = "baseProcessorManagerAtom";

/** Returns the processor manager instance if it is set, a promise of the processor manager if it is loading. */
export const processorManagerAtom = atom(
  (get) => {
    const processorManager = get(baseProcessorManagerAtom);
    if (processorManager === NOT_SET)
      return suspendUntilSet<ProcessorManager>();
    return processorManager;
  },
  (_get, set, processorManager: ProcessorManager | undefined) => {
    set(baseProcessorManagerAtom, processorManager);
  },
);
processorManagerAtom.debugLabel = "processorManagerAtom";

/** Returns a Loadable of the processor manager instance. */
export const loadableProcessorManagerAtom = loadable(processorManagerAtom);
loadableProcessorManagerAtom.debugLabel = "loadableProcessorManagerAtom";

/** Returns a resolved promise of the processor manager instance. */
export const unwrappedProcessorManagerAtom = unwrap(processorManagerAtom);
unwrappedProcessorManagerAtom.debugLabel = "unwrappedProcessorManagerAtom";

/* Drives */

/** Base atom for the drives.
 *
 * Like all base atoms, it is not meant to be accessed or updated directly.
 * Starts off with the sentinel value NOT_SET.
 */
export const baseDrivesAtom = atom<
  UnsetAtomValue | DocumentDriveDocument[] | undefined
>(NOT_SET);
baseDrivesAtom.debugLabel = "baseDrivesAtom";

/** Returns a promise of the drives for a given reactor.
 *
 * Suspends until the drives are set.
 *
 * If the drives are set to undefined, returns an empty array.
 */
export const drivesAtom = atom(
  async (get) => {
    const drives = get(baseDrivesAtom);
    // Suspends until the reactor is set.
    if (drives === NOT_SET) return suspendUntilSet<DocumentDriveDocument[]>();

    // If the drives are set to undefined, returns an empty array.
    if (!drives) return [];

    return drives;
  },
  (get, set, newDrives: DocumentDriveDocument[] | undefined) => {
    const oldDrives = get(baseDrivesAtom);
    if (isEqual(newDrives, oldDrives)) return;
    set(baseDrivesAtom, newDrives);
  },
);
drivesAtom.debugLabel = "drivesAtom";

/** Returns a Loadable of the drives for a given reactor. */
export const loadableDrivesAtom = loadable(drivesAtom);
loadableDrivesAtom.debugLabel = "loadableDrivesAtom";

/** Returns a resolved promise of the drives for a given reactor. */
export const unwrappedDrivesAtom = unwrap(drivesAtom);
unwrappedDrivesAtom.debugLabel = "unwrappedDrivesAtom";

/** Holds the selected drive id.
 *
 * Like all base atoms, it is not meant to be accessed or updated directly.
 * Starts off with the sentinel value NOT_SET.
 *
 * When this value changes, the data for the selected drive is re-fetched from the drives atom.
 */
export const baseSelectedDriveIdAtom = atom<string | undefined>(NOT_SET);
baseSelectedDriveIdAtom.debugLabel = "baseSelectedDriveIdAtom";

/** Returns a promise of the selected drive.
 *
 * Provides a setter which receives a drive id and updates the baseSelectedDriveIdAtom.
 *
 * When changing to a different drive, we also fetch its documents (nodes) and set the documents atom.
 *
 * Suspends until the reactor's drives are set and the selected drive id is set.
 * If the selected drive id is set as undefined, returns a resolved promise of undefined.
 *
 * When the selected drive is set, the selected node id is also set to undefined, since by definition selecting a new drive means navigating to the root of the new drive.
 */
export const selectedDriveAtom = atom(
  async (get) => {
    const driveId = get(baseSelectedDriveIdAtom);

    if (driveId === NOT_SET) return suspendUntilSet<DocumentDriveDocument>();

    const reactor = window.reactor;
    if (!reactor || !driveId) return;

    const drive = await reactor.getDrive(driveId);
    return drive;
  },
  async (get, set, driveId: string | undefined) => {
    // Updates the baseSelectedDriveIdAtom.
    set(baseSelectedDriveIdAtom, driveId);
    // Resets the selected node id.
    set(baseSelectedNodeIdAtom, undefined);
    const reactor = window.reactor;
    if (!reactor || !driveId) return;
    const oldDocuments = get(baseDocumentsAtom);
    const newDocumentIds = await reactor.getDocuments(driveId);
    const newDocuments = await Promise.all(
      newDocumentIds.map((id) => reactor.getDocument(id)),
    );
    if (isEqual(newDocuments, oldDocuments)) return;
    set(baseDocumentsAtom, newDocuments);
  },
);
selectedDriveAtom.debugLabel = "selectedDriveAtom";

/** Returns a Loadable of the selected drive. */
export const loadableSelectedDriveAtom = loadable(selectedDriveAtom);
loadableSelectedDriveAtom.debugLabel = "loadableSelectedDriveAtom";

/** Returns a resolved promise of the selected drive. */
export const unwrappedSelectedDriveAtom = unwrap(selectedDriveAtom);
unwrappedSelectedDriveAtom.debugLabel = "unwrappedSelectedDriveAtom";

/* Nodes */

/** Holds a promise of the nodes for the selected drive.
 *
 * Derived from selectedDrive.state.global.nodes.
 *
 * Suspends until the selected drive is set.
 *
 * If the selected drive is set as undefined, returns a resolved promise of undefined.
 *
 * Does not provide a setter, since it is derived from the selected drive.
 */
export const nodesAtom = atom<Promise<Node[]>>(async (get) => {
  const selectedDriveId = get(baseSelectedDriveIdAtom);
  const reactor = window.reactor;
  if (!reactor || !selectedDriveId) return [];
  const drive = await reactor.getDrive(selectedDriveId);
  const nodes = drive.state.global.nodes;
  return nodes;
});
nodesAtom.debugLabel = "nodesAtom";

/** Returns a Loadable of the nodes for the selected drive. */
export const loadableNodesAtom = loadable(nodesAtom);
loadableNodesAtom.debugLabel = "loadableNodesAtom";

/** Returns a resolved promise of the nodes for the selected drive. */
export const unwrappedNodesAtom = unwrap(nodesAtom);
unwrappedNodesAtom.debugLabel = "unwrappedNodesAtom";

/** Holds the selected node id.
 *
 * This id comes from the drive's nodes, which can be the id for a document or for a meta item such as a folder.
 *
 * Like all base atoms, it is not meant to be accessed or updated directly.
 * Starts off with the sentinel value NOT_SET.
 *
 * When this value changes, the data for the selected node is re-fetched from the nodes atom.
 */
export const baseSelectedNodeIdAtom = atom<string | undefined>(NOT_SET);
baseSelectedNodeIdAtom.debugLabel = "baseSelectedNodeIdAtom";

/** Sets the selected node via a node id. */
export const setSelectedNodeAtom = atom(
  null,
  (_get, set, nodeId: string | undefined) => {
    set(baseSelectedNodeIdAtom, nodeId);
  },
);
setSelectedNodeAtom.debugLabel = "setSelectedNodeAtom";

/** Returns a promise of the selected folder.
 *
 * A "folder" is a meta item that contains other nodes. It is not a document itself. Folder nodes have a `kind` of `folder` or `FOLDER`.
 *
 * Suspends until the nodes are set and the selected node id is set.
 * If the selected node id is set as undefined, returns a resolved promise of undefined.
 *
 * Does not provide a setter, since it is derived from the selected node id.
 */
export const selectedFolderAtom = atom(async (get) => {
  const nodes = await get(nodesAtom);
  const nodeId = get(baseSelectedNodeIdAtom);

  // Suspends until the nodes are set and the selected node id is set.
  if (nodeId === NOT_SET) return suspendUntilSet<FolderNode>();

  // Filters the nodes to only include folder nodes.
  const folderNodes = nodes.filter(isFolderNodeKind);

  // Returns the folder node with the selected node id.
  return folderNodes.find((node) => node.id === nodeId);
});
selectedFolderAtom.debugLabel = "selectedFolderAtom";

/** Returns a Loadable of the selected folder. */
export const loadableSelectedFolderAtom = loadable(selectedFolderAtom);
loadableSelectedFolderAtom.debugLabel = "loadableSelectedFolderAtom";

/** Returns a resolved promise of the selected folder. */
export const unwrappedSelectedFolderAtom = unwrap(selectedFolderAtom);
unwrappedSelectedFolderAtom.debugLabel = "unwrappedSelectedFolderAtom";

/* Documents */

export const baseDocumentsAtom = atom<
  UnsetAtomValue | PHDocument[] | undefined
>(NOT_SET);
baseDocumentsAtom.debugLabel = "baseDocumentsAtom";

/** Holds a promise of the documents for the selected drive.
 *
 * Suspends until the selected drive is set.
 *
 * If the selected drive is set as undefined, returns a resolved promise of undefined.
 */
export const documentsAtom = atom(
  (get) => {
    const baseDocuments = get(baseDocumentsAtom);
    if (baseDocuments === NOT_SET) return suspendUntilSet<PHDocument[]>();

    return baseDocuments ?? [];
  },
  (get, set, documents: PHDocument[] | undefined) => {
    const newDocuments = documents;
    const baseDocuments = get(baseDocumentsAtom);
    if (isEqual(newDocuments, baseDocuments)) return;
    set(baseDocumentsAtom, newDocuments);
  },
);
documentsAtom.debugLabel = "documentsAtom";

/** Returns a Loadable of the documents for the selected drive. */
export const loadableDocumentsAtom = loadable(documentsAtom);
loadableDocumentsAtom.debugLabel = "loadableDocumentsAtom";

/** Returns a resolved promise of the documents for the selected drive. */
export const unwrappedDocumentsAtom = unwrap(documentsAtom);
unwrappedDocumentsAtom.debugLabel = "unwrappedDocumentsAtom";

/** Returns a promise of the selected document.
 *
 * A "document" is a PHDocument. This id is the document's id, and this id will also be found in the drive's nodes. We use the same id for finding a node in a drive and for identifying a document in the reactor.
 *
 * Suspends until the documents are set and the selected node id is set.
 * If the selected node id is set as undefined, returns a resolved promise of undefined.
 *
 * Does not provide a setter, since it is derived from the selected node id.
 */
export const selectedDocumentAtom = atom<Promise<PHDocument | undefined>>(
  async (get) => {
    const documents = get(baseDocumentsAtom);
    const nodeId = get(baseSelectedNodeIdAtom);

    // Suspends until the documents are set and the selected node id is set.
    if (nodeId === NOT_SET || documents === NOT_SET)
      return suspendUntilSet<PHDocument>();

    if (!nodeId) return undefined;
    if (!documents) return undefined;

    const document = documents.find(
      (document) => document.header.id === nodeId,
    );
    return document;
  },
);
selectedDocumentAtom.debugLabel = "selectedDocumentAtom";

/** Returns a Loadable of the selected document. */
export const loadableSelectedDocumentAtom = loadable(selectedDocumentAtom);
loadableSelectedDocumentAtom.debugLabel = "loadableSelectedDocumentAtom";

/** Returns a resolved promise of the selected document. */
export const unwrappedSelectedDocumentAtom = unwrap(selectedDocumentAtom);
unwrappedSelectedDocumentAtom.debugLabel = "unwrappedSelectedDocumentAtom";
