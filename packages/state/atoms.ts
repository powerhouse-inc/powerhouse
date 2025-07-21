import {
  type DocumentDriveDocument,
  type FolderNode,
  type IDocumentDriveServer,
  type Node,
} from "document-drive";
import { type ProcessorManager } from "document-drive/processors/processor-manager";
import {
  type DocumentModelModule,
  type EditorModule,
  type PHDocument,
} from "document-model";
import { atom } from "jotai";
import { atomWithRefresh, loadable, unwrap } from "jotai/utils";
import { isFolderNodeKind } from "./nodes.js";
import type { PHPackage } from "./ph-packages.js";
import { type ConnectConfig, type UnsetAtomValue } from "./types.js";
import { NOT_SET, suspendUntilSet } from "./utils.js";

/* Reactor */

/** Holds the reactor instance.
 *
 * Like all base atoms, it is not meant to be accessed or updated directly.
 * Starts off with the sentinel value NOT_SET.
 */
const baseReactorAtom = atom<UnsetAtomValue | IDocumentDriveServer | undefined>(
  NOT_SET,
);
baseReactorAtom.debugLabel = "baseReactorAtom";

/** Returns a promise of the reactor instance if it is set, otherwise suspends until it is set. */
export const reactorAtom = atom<Promise<IDocumentDriveServer | undefined>>(
  async (get) => {
    const reactor = get(baseReactorAtom);

    // Suspends until the reactor is set.
    if (reactor === NOT_SET) return suspendUntilSet();

    return reactor;
  },
);
reactorAtom.debugLabel = "reactorAtom";

/** Sets the reactor instance. Only runs if the baseReactorAtom is NOT_SET. */
export const initializeReactorAtom = atom(
  null,
  (get, set, reactor: IDocumentDriveServer | undefined) => {
    const baseReactor = get(baseReactorAtom);

    // Only runs if the baseReactorAtom is NOT_SET.
    if (baseReactor === NOT_SET) {
      set(baseReactorAtom, reactor);
    }
  },
);
initializeReactorAtom.debugLabel = "setReactorAtom";

/** Returns a Loadable of the reactor instance. */
export const loadableReactorAtom = loadable(reactorAtom);
loadableReactorAtom.debugLabel = "loadableReactorAtom";

/** Returns a resolved promise of the reactor instance. */
export const unwrappedReactorAtom = unwrap(reactorAtom);
unwrappedReactorAtom.debugLabel = "unwrappedReactorAtom";

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

/** Returns a promise of the processor manager instance if it is set, otherwise suspends until it is set. */
export const processorManagerAtom = atom<Promise<ProcessorManager | undefined>>(
  async (get) => {
    const processorManager = get(baseProcessorManagerAtom);
    if (processorManager === NOT_SET) return suspendUntilSet();
    return processorManager;
  },
);
processorManagerAtom.debugLabel = "processorManagerAtom";

/** Sets the processor manager instance. Only runs if the baseProcessorManagerAtom is NOT_SET. */
export const initializeProcessorManagerAtom = atom(
  null,
  (get, set, processorManager: ProcessorManager | undefined) => {
    const baseProcessorManager = get(baseProcessorManagerAtom);
    if (baseProcessorManager === NOT_SET) {
      set(baseProcessorManagerAtom, processorManager);
    }
  },
);
initializeProcessorManagerAtom.debugLabel = "initializeProcessorManagerAtom";

/** Returns a Loadable of the processor manager instance. */
export const loadableProcessorManagerAtom = loadable(processorManagerAtom);
loadableProcessorManagerAtom.debugLabel = "loadableProcessorManagerAtom";

/** Returns a resolved promise of the processor manager instance. */
export const unwrappedProcessorManagerAtom = unwrap(processorManagerAtom);
unwrappedProcessorManagerAtom.debugLabel = "unwrappedProcessorManagerAtom";

/* Drives */

/** Holds a promise of the drives for a given reactor.
 *
 * Suspends until the reactor is set.
 *
 * Does not provide a direct setter, instead it uses `atomWithRefresh` which will refetch the drives from the reactor when called.
 * See https://jotai.org/docs/utilities/resettable#atomwithrefresh for more details.
 */
export const drivesAtom = atomWithRefresh<Promise<DocumentDriveDocument[]>>(
  async (get) => {
    const loadableReactor = get(loadableReactorAtom);

    // Suspends until the reactor is set.
    if (loadableReactor.state !== "hasData")
      return suspendUntilSet<DocumentDriveDocument[]>();

    const reactor = loadableReactor.data;

    // If the reactor is not set, returns an empty array.
    if (!reactor) return [];

    const driveIds = (await reactor.getDrives()) ?? [];
    const drives = await Promise.all(
      driveIds.map((id) => reactor.getDrive(id)),
    );

    return drives;
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
const baseSelectedDriveIdAtom = atom<string | undefined>(NOT_SET);
baseSelectedDriveIdAtom.debugLabel = "baseSelectedDriveIdAtom";

/** Returns a promise of the selected drive.
 *
 * Provides a setter which receives a drive id and updates the baseSelectedDriveIdAtom.
 *
 * Suspends until the reactor's drives are set and the selected drive id is set.
 * If the selected drive id is set as undefined, returns a resolved promise of undefined.
 *
 * When the selected drive is set, the selected node id is also set to undefined, since by definition selecting a new drive means navigating to the root of the new drive.
 */
export const selectedDriveAtom = atom(
  (get) => {
    const driveId = get(baseSelectedDriveIdAtom);
    const loadableDrives = get(loadableDrivesAtom);

    // Suspends until the reactor's drives are set and the selected drive id is set.
    if (driveId === NOT_SET || loadableDrives.state !== "hasData")
      return suspendUntilSet<DocumentDriveDocument | undefined>();

    const drives = loadableDrives.data;

    return drives.find((drive) => drive.header.id === driveId);
  },
  (_get, set, driveId: string | undefined) => {
    // Updates the baseSelectedDriveIdAtom.
    set(baseSelectedDriveIdAtom, driveId);

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
export const nodesAtom = atom(async (get) => {
  const loadableSelectedDrive = get(loadableSelectedDriveAtom);

  // Suspends until the selected drive is set.
  if (loadableSelectedDrive.state !== "hasData")
    return suspendUntilSet<Node[]>();

  const drive = loadableSelectedDrive.data;

  return drive?.state.global.nodes;
});
nodesAtom.debugLabel = "nodesAtom";
export const loadableNodesAtom = loadable(nodesAtom);
loadableNodesAtom.debugLabel = "loadableNodesAtom";
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
export const selectedNodeIdAtom = atom<string | undefined>(NOT_SET);
selectedNodeIdAtom.debugLabel = "selectedNodeIdAtom";

/** Sets the selected node via a node id. */
export const setSelectedNodeAtom = atom(
  null,
  (_get, set, nodeId: string | undefined) => {
    set(selectedNodeIdAtom, nodeId);
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
export const selectedFolderAtom = atom((get) => {
  const loadableNodes = get(loadableNodesAtom);
  const nodeId = get(selectedNodeIdAtom);

  // Suspends until the nodes are set and the selected node id is set.
  if (nodeId === NOT_SET || loadableNodes.state !== "hasData")
    return suspendUntilSet<FolderNode | undefined>();

  const nodes = loadableNodes.data;

  // Filters the nodes to only include folder nodes.
  const folderNodes = nodes?.filter(isFolderNodeKind);

  // Returns the folder node with the selected node id.
  return folderNodes?.find((node) => node.id === nodeId);
});
selectedFolderAtom.debugLabel = "selectedFolderAtom";

/** Returns a Loadable of the selected folder. */
export const loadableSelectedFolderAtom = loadable(selectedFolderAtom);
loadableSelectedFolderAtom.debugLabel = "loadableSelectedFolderAtom";

/** Returns a resolved promise of the selected folder. */
export const unwrappedSelectedFolderAtom = unwrap(selectedFolderAtom);
unwrappedSelectedFolderAtom.debugLabel = "unwrappedSelectedFolderAtom";

/* Documents */

/** Holds a promise of the documents for the selected drive.
 *
 * Suspends until the selected drive is set.
 *
 * If the selected drive is set as undefined, returns a resolved promise of undefined.
 *
 * Does not provide a setter, instead it uses `atomWithRefresh` which will refetch the documents from the reactor when called.
 * See https://jotai.org/docs/utilities/resettable#atomwithrefresh for more details.
 */
export const documentsAtom = atomWithRefresh(async (get) => {
  const loadableReactor = get(loadableReactorAtom);
  const loadableDrive = get(loadableSelectedDriveAtom);

  // Suspends until the selected drive is set.
  if (loadableReactor.state !== "hasData" || loadableDrive.state !== "hasData")
    return suspendUntilSet<PHDocument[]>();

  const reactor = loadableReactor.data;
  const driveId = loadableDrive.data?.header.id;

  // If the reactor or drive id is not set, returns an empty array.
  if (!reactor || !driveId) return [];

  const documentIds = (await reactor.getDocuments(driveId)) ?? [];
  const documents = (
    await Promise.all(documentIds.map((id) => reactor.getDocument(driveId, id)))
  ).filter((d) => d !== undefined);
  return documents;
});
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
export const selectedDocumentAtom = atom((get) => {
  const loadableDocuments = get(loadableDocumentsAtom);
  const nodeId = get(selectedNodeIdAtom);

  // Suspends until the documents are set and the selected node id is set.
  if (nodeId === NOT_SET || loadableDocuments.state !== "hasData")
    return suspendUntilSet<PHDocument | undefined>();

  const documents = loadableDocuments.data;

  return documents.find((document) => document.header.id === nodeId);
});
selectedDocumentAtom.debugLabel = "selectedDocumentAtom";

/** Returns a Loadable of the selected document. */
export const loadableSelectedDocumentAtom = loadable(selectedDocumentAtom);
loadableSelectedDocumentAtom.debugLabel = "loadableSelectedDocumentAtom";

/** Returns a resolved promise of the selected document. */
export const unwrappedSelectedDocumentAtom = unwrap(selectedDocumentAtom);
unwrappedSelectedDocumentAtom.debugLabel = "unwrappedSelectedDocumentAtom";

/* PH Packages */

export const phPackagesAtom = atom<Promise<PHPackage[] | undefined>>(
  Promise.resolve(undefined),
);
phPackagesAtom.debugLabel = "phPackagesAtom";
export const setPhPackagesAtom = atom(
  null,
  (
    _get,
    set,
    phPackages: Promise<PHPackage[] | undefined> | PHPackage[] | undefined,
  ) => {
    set(phPackagesAtom, Promise.resolve(phPackages));
  },
);
setPhPackagesAtom.debugLabel = "setPhPackagesAtom";
export const loadablePhPackagesAtom = loadable(phPackagesAtom);
loadablePhPackagesAtom.debugLabel = "loadablePhPackagesAtom";
export const unwrappedPhPackagesAtom = unwrap(phPackagesAtom);
unwrappedPhPackagesAtom.debugLabel = "unwrappedPhPackagesAtom";

/* Document Model Modules */

export const documentModelModulesAtom = atomWithRefresh(async (get) => {
  const loadablePhPackages = get(loadablePhPackagesAtom);
  if (loadablePhPackages.state !== "hasData")
    return suspendUntilSet<DocumentModelModule[]>();
  const phPackages = loadablePhPackages.data;
  return phPackages?.map((p) => p.documentModels).flat();
});
documentModelModulesAtom.debugLabel = "documentModelModulesAtom";
export const loadableDocumentModelModulesAtom = loadable(
  documentModelModulesAtom,
);
loadableDocumentModelModulesAtom.debugLabel =
  "loadableDocumentModelModulesAtom";
export const unwrappedDocumentModelModulesAtom = unwrap(
  documentModelModulesAtom,
);
unwrappedDocumentModelModulesAtom.debugLabel =
  "unwrappedDocumentModelModulesAtom";

/* Editors */

export const editorModulesAtom = atomWithRefresh(async (get) => {
  const loadablePhPackages = get(loadablePhPackagesAtom);
  if (loadablePhPackages.state !== "hasData")
    return suspendUntilSet<EditorModule[]>();
  const phPackages = loadablePhPackages.data;
  return phPackages?.map((p) => p.editors).flat();
});
editorModulesAtom.debugLabel = "editorModulesAtom";

export const loadableEditorModulesAtom = loadable(editorModulesAtom);
loadableEditorModulesAtom.debugLabel = "loadableEditorModulesAtom";
export const unwrappedEditorModulesAtom = unwrap(editorModulesAtom);
unwrappedEditorModulesAtom.debugLabel = "unwrappedEditorModulesAtom";

/* Config */

export const configAtom = atom<ConnectConfig>({
  appVersion: undefined,
  studioMode: false,
  warnOutdatedApp: false,
  routerBasename: undefined,
  analyticsDatabaseName: undefined,
  sentry: {
    dsn: undefined,
    env: undefined,
    tracing: undefined,
  },
  content: {
    showSearchBar: true,
    showDocumentModelSelectionSetting: true,
  },
  drives: {
    addDriveEnabled: true,
    sections: {
      LOCAL: {
        enabled: true,
        allowAdd: true,
        allowDelete: true,
      },
      CLOUD: {
        enabled: true,
        allowAdd: true,
        allowDelete: true,
      },
      PUBLIC: {
        enabled: true,
        allowAdd: true,
        allowDelete: true,
      },
    },
  },
  gaTrackingId: undefined,
  phCliVersion: undefined,
});
configAtom.debugLabel = "configAtom";
