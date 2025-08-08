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
import type { ViteHotContext } from "vite/types/hot.js";
import { type VetraPackage } from "../types.js";
import { getDocumentsForDriveId, getDrives } from "../utils/drives.js";
import { isFolderNodeKind } from "../utils/nodes.js";
import { NOT_SET } from "./constants.js";
import { suspendUntilSet } from "./suspend.js";
import { type UnsetAtomValue } from "./types.js";

/* Processor Manager */

/** Holds the processor manager instance.
 *
 * Like all base atoms, it is not meant to be accessed or updated directly.
 * Starts off with the sentinel value NOT_SET.
 */
const baseProcessorManagerAtom = atom<
  UnsetAtomValue | ProcessorManager | undefined
>(NOT_SET);
baseProcessorManagerAtom.debugLabel = "baseProcessorManagerAtom";

export const processorManagerInitializedAtom = atom((get) => {
  const processorManager = get(baseProcessorManagerAtom);
  return processorManager !== NOT_SET;
});
processorManagerInitializedAtom.debugLabel = "processorManagerInitializedAtom";

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
const baseDrivesAtom = atom<
  UnsetAtomValue | DocumentDriveDocument[] | undefined
>(NOT_SET);
baseDrivesAtom.debugLabel = "baseDrivesAtom";

/** Returns a boolean indicating if the drives are initialized. */
export const drivesInitializedAtom = atom((get) => {
  const drives = get(baseDrivesAtom);
  return drives !== NOT_SET;
});
drivesInitializedAtom.debugLabel = "drivesInitializedAtom";

/** Returns a promise of the drives for a given reactor.
 *
 * Suspends until the drives are set.
 *
 * If the drives are set to undefined, returns an empty array.
 */
export const drivesAtom = atom(
  async (get) => {
    const drives = get(baseDrivesAtom);
    if (drives === NOT_SET) return suspendUntilSet<DocumentDriveDocument[]>();
    return drives;
  },
  async (get, set) => {
    const oldDrives = get(baseDrivesAtom);
    const reactor = window.reactor;
    const newDrives = await getDrives(reactor);
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
const selectedDriveIdAtom = atom<string | undefined>(NOT_SET);
selectedDriveIdAtom.debugLabel = "selectedDriveIdAtom";

export const driveIdInitializedAtom = atom((get) => {
  const driveId = get(selectedDriveIdAtom);
  return driveId !== NOT_SET;
});
driveIdInitializedAtom.debugLabel = "driveIdInitializedAtom";

/** Returns a promise of the selected drive.
 *
 * Provides a setter which receives a drive id and updates the selectedDriveIdAtom.
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
    const driveId = get(selectedDriveIdAtom);
    const drives = await get(drivesAtom);
    if (driveId === NOT_SET) return suspendUntilSet<DocumentDriveDocument>();
    const drive = drives?.find((drive) => drive.header.id === driveId);
    return drive;
  },
  (_get, set, driveId: string | undefined) => {
    // Updates the selectedDriveIdAtom.
    set(selectedDriveIdAtom, driveId);
    // Resets the selected node id.
    set(selectedNodeIdAtom, undefined);
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
export const nodesAtom = atom<Promise<Node[] | undefined>>(async (get) => {
  const selectedDrive = await get(selectedDriveAtom);
  const nodes = selectedDrive?.state.global.nodes;
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
const selectedNodeIdAtom = atom<string | undefined>(NOT_SET);
selectedNodeIdAtom.debugLabel = "selectedNodeIdAtom";

export const selectedNodeIdInitializedAtom = atom((get) => {
  const nodeId = get(selectedNodeIdAtom);
  return nodeId !== NOT_SET;
});
selectedNodeIdInitializedAtom.debugLabel = "selectedNodeIdInitializedAtom";

/** Sets the selected node via a node id. */
export const selectedNodeAtom = atom(
  async (get) => {
    const nodeId = get(selectedNodeIdAtom);
    const nodes = await get(nodesAtom);
    if (nodeId === NOT_SET) return suspendUntilSet<Node>();
    return nodes?.find((node) => node.id === nodeId);
  },
  (_get, set, nodeId: string | undefined) => {
    set(selectedNodeIdAtom, nodeId);
  },
);
selectedNodeAtom.debugLabel = "selectedNodeAtom";

/** Returns a promise of the selected folder.
 *
 * A "folder" is a meta item that contains other nodes. It is not a document itself. Folder nodes have a `kind` of `folder` or `FOLDER`.
 *
 * Suspends until the nodes are set and the selected node id is set.
 * If the selected node id is set as undefined, returns a resolved promise of undefined.
 *
 * Does not provide a setter, since it is derived from the selected node id.
 */
export const selectedFolderAtom = atom<Promise<FolderNode | undefined>>(
  async (get) => {
    const nodes = await get(nodesAtom);
    const selectedNode = await get(selectedNodeAtom);
    const folderNodes = nodes?.filter(isFolderNodeKind);
    return folderNodes?.find((node) => node.id === selectedNode?.id);
  },
);
selectedFolderAtom.debugLabel = "selectedFolderAtom";

/** Returns a Loadable of the selected folder. */
export const loadableSelectedFolderAtom = loadable(selectedFolderAtom);
loadableSelectedFolderAtom.debugLabel = "loadableSelectedFolderAtom";

/** Returns a resolved promise of the selected folder. */
export const unwrappedSelectedFolderAtom = unwrap(selectedFolderAtom);
unwrappedSelectedFolderAtom.debugLabel = "unwrappedSelectedFolderAtom";

/* Documents */

const baseDocumentsAtom = atom<UnsetAtomValue | PHDocument[] | undefined>(
  NOT_SET,
);
baseDocumentsAtom.debugLabel = "baseDocumentsAtom";

export const documentsInitializedAtom = atom((get) => {
  const documents = get(baseDocumentsAtom);
  return documents !== NOT_SET;
});
documentsInitializedAtom.debugLabel = "documentsInitializedAtom";

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
    return baseDocuments;
  },
  async (get, set, driveId: string | undefined) => {
    const oldDocuments = get(baseDocumentsAtom);
    const reactor = window.reactor;
    const newDocuments = await getDocumentsForDriveId(reactor, driveId);
    if (isEqual(newDocuments, oldDocuments)) return;
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
export const selectedDocumentAtom = atom(async (get) => {
  const documents = await get(documentsAtom);
  const selectedNode = await get(selectedNodeAtom);
  return documents?.find((document) => document.header.id === selectedNode?.id);
});
selectedDocumentAtom.debugLabel = "selectedDocumentAtom";

/** Returns a Loadable of the selected document. */
export const loadableSelectedDocumentAtom = loadable(selectedDocumentAtom);
loadableSelectedDocumentAtom.debugLabel = "loadableSelectedDocumentAtom";

/** Returns a resolved promise of the selected document. */
export const unwrappedSelectedDocumentAtom = unwrap(selectedDocumentAtom);
unwrappedSelectedDocumentAtom.debugLabel = "unwrappedSelectedDocumentAtom";

const baseVetraPackagesAtom = atom<UnsetAtomValue | VetraPackage[] | undefined>(
  NOT_SET,
);
baseVetraPackagesAtom.debugLabel = "baseVetraPackagesAtom";

export const vetraPackagesInitializedAtom = atom((get) => {
  const vetraPackages = get(baseVetraPackagesAtom);
  return vetraPackages !== NOT_SET;
});
vetraPackagesInitializedAtom.debugLabel = "vetraPackagesInitializedAtom";

export const vetraPackagesAtom = atom(
  (get) => {
    const vetraPackages = get(baseVetraPackagesAtom);
    if (vetraPackages === NOT_SET) return suspendUntilSet<VetraPackage[]>();
    return vetraPackages;
  },
  async (
    get,
    set,
    vetraPackages:
      | Promise<VetraPackage[] | undefined>
      | VetraPackage[]
      | undefined,
  ) => {
    const oldVetraPackages = get(baseVetraPackagesAtom);
    if (isEqual(vetraPackages, oldVetraPackages)) return;
    set(baseVetraPackagesAtom, await vetraPackages);
  },
);
vetraPackagesAtom.debugLabel = "vetraPackagesAtom";

export const loadableVetraPackagesAtom = loadable(vetraPackagesAtom);
loadableVetraPackagesAtom.debugLabel = "loadableVetraPackagesAtom";

export const unwrappedVetraPackagesAtom = unwrap(vetraPackagesAtom);
unwrappedVetraPackagesAtom.debugLabel = "unwrappedVetraPackagesAtom";

const documentModelModulesAtom = atom(async (get) => {
  const vetraPackages = await get(vetraPackagesAtom);
  const documentModelModules = vetraPackages
    ?.map((pkg) => pkg.modules.documentModelModules)
    .filter((m) => m !== undefined)
    .flat();
  return documentModelModules ?? [];
});
documentModelModulesAtom.debugLabel = "documentModelModulesAtom";

export const unwrappedDocumentModelModulesAtom = unwrap(
  documentModelModulesAtom,
);
unwrappedDocumentModelModulesAtom.debugLabel =
  "unwrappedDocumentModelModulesAtom";

export const loadableDocumentModelModulesAtom = loadable(
  documentModelModulesAtom,
);
loadableDocumentModelModulesAtom.debugLabel =
  "loadableDocumentModelModulesAtom";

const editorModulesAtom = atom(async (get) => {
  const vetraPackages = await get(vetraPackagesAtom);
  const allEditorModules = vetraPackages
    ?.map((pkg) => pkg.modules.editorModules)
    .filter((m) => m !== undefined)
    .flat();
  const documentEditorModules = allEditorModules?.filter(
    (m) => !m.documentTypes.includes("powerhouse/document-drive"),
  );
  return documentEditorModules ?? [];
});
editorModulesAtom.debugLabel = "editorModulesAtom";

export const unwrappedEditorModulesAtom = unwrap(editorModulesAtom);
unwrappedEditorModulesAtom.debugLabel = "unwrappedEditorModulesAtom";

export const loadableEditorModulesAtom = loadable(editorModulesAtom);
loadableEditorModulesAtom.debugLabel = "loadableEditorModulesAtom";

export const driveEditorModulesAtom = atom(async (get) => {
  const vetraPackages = await get(vetraPackagesAtom);
  const allEditorModules = vetraPackages
    ?.map((pkg) => pkg.modules.editorModules)
    .filter((m) => m !== undefined)
    .flat();
  const driveEditorModules = allEditorModules?.filter((m) =>
    m.documentTypes.includes("powerhouse/document-drive"),
  );
  return driveEditorModules ?? [];
});
driveEditorModulesAtom.debugLabel = "driveEditorModulesAtom";

export const loadableDriveEditorModulesAtom = loadable(driveEditorModulesAtom);
loadableDriveEditorModulesAtom.debugLabel = "loadableDriveEditorModulesAtom";

export const unwrappedDriveEditorModulesAtom = unwrap(driveEditorModulesAtom);
unwrappedDriveEditorModulesAtom.debugLabel = "unwrappedDriveEditorModulesAtom";

export const processorModulesAtom = atom(async (get) => {
  const vetraPackages = await get(vetraPackagesAtom);
  const processorModules = vetraPackages
    ?.map((pkg) => pkg.modules.processorModules)
    .filter((p) => p !== undefined)
    .flat();
  return processorModules ?? [];
});
processorModulesAtom.debugLabel = "processorModulesAtom";

export const loadableProcessorModulesAtom = loadable(processorModulesAtom);
loadableProcessorModulesAtom.debugLabel = "loadableProcessorModulesAtom";

export const unwrappedProcessorModulesAtom = unwrap(processorModulesAtom);
unwrappedProcessorModulesAtom.debugLabel = "unwrappedProcessorModulesAtom";

const baseHmrAtom = atom<UnsetAtomValue | ViteHotContext | undefined>(NOT_SET);
baseHmrAtom.debugLabel = "baseHmrAtom";

export const hmrInitializedAtom = atom((get) => {
  const hmr = get(baseHmrAtom);
  return hmr !== NOT_SET;
});
hmrInitializedAtom.debugLabel = "hmrInitializedAtom";

export const hmrAtom = atom(
  async (get) => {
    const hmr = get(baseHmrAtom);
    if (hmr === NOT_SET) return suspendUntilSet<ViteHotContext>();
    return hmr;
  },
  (_get, set, hmr: ViteHotContext | undefined) => {
    set(baseHmrAtom, hmr);
  },
);
hmrAtom.debugLabel = "hmrAtom";

export const loadableHmrAtom = loadable(hmrAtom);
loadableHmrAtom.debugLabel = "loadableHmrAtom";

export const unwrappedHmrAtom = unwrap(hmrAtom);
unwrappedHmrAtom.debugLabel = "unwrappedHmrAtom";
