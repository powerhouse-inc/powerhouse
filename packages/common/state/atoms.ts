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

const baseReactorAtom = atom<UnsetAtomValue | IDocumentDriveServer | undefined>(
  NOT_SET,
);
baseReactorAtom.debugLabel = "baseReactorAtom";
export const reactorAtom = atom<Promise<IDocumentDriveServer | undefined>>(
  async (get) => {
    const reactor = get(baseReactorAtom);
    if (reactor === NOT_SET) return suspendUntilSet();
    return reactor;
  },
);
reactorAtom.debugLabel = "reactorAtom";
export const initializeReactorAtom = atom(
  null,
  (get, set, reactor: IDocumentDriveServer | undefined) => {
    const baseReactor = get(baseReactorAtom);
    if (baseReactor === NOT_SET) {
      set(baseReactorAtom, reactor);
    }
  },
);
initializeReactorAtom.debugLabel = "setReactorAtom";
export const loadableReactorAtom = loadable(reactorAtom);
loadableReactorAtom.debugLabel = "loadableReactorAtom";
export const unwrappedReactorAtom = unwrap(reactorAtom);
unwrappedReactorAtom.debugLabel = "unwrappedReactorAtom";

/* Drives */

export const drivesAtom = atomWithRefresh(async (get) => {
  const loadableReactor = get(loadableReactorAtom);
  if (loadableReactor.state !== "hasData")
    return suspendUntilSet<DocumentDriveDocument[]>();
  const reactor = loadableReactor.data;
  if (!reactor) return [];
  const driveIds = await reactor.getDrives();
  const drives = await Promise.all(driveIds.map((id) => reactor.getDrive(id)));
  return drives;
});
drivesAtom.debugLabel = "drivesAtom";
export const loadableDrivesAtom = loadable(drivesAtom);
loadableDrivesAtom.debugLabel = "loadableDrivesAtom";
export const unwrappedDrivesAtom = unwrap(drivesAtom);
unwrappedDrivesAtom.debugLabel = "unwrappedDrivesAtom";

export const selectedDriveIdAtom = atom<string | undefined>(NOT_SET);
selectedDriveIdAtom.debugLabel = "selectedDriveIdAtom";

export const selectedDriveAtom = atom(
  (get) => {
    const driveId = get(selectedDriveIdAtom);
    const loadableDrives = get(loadableDrivesAtom);
    if (driveId === NOT_SET || loadableDrives.state !== "hasData")
      return suspendUntilSet<DocumentDriveDocument | undefined>();
    const drives = loadableDrives.data;
    return drives.find((drive) => drive.id === driveId);
  },
  (_get, set, driveId: string | undefined) => {
    set(selectedDriveIdAtom, driveId);
    set(selectedNodeIdAtom, undefined);
  },
);
selectedDriveAtom.debugLabel = "selectedDriveAtom";
export const loadableSelectedDriveAtom = loadable(selectedDriveAtom);
loadableSelectedDriveAtom.debugLabel = "loadableSelectedDriveAtom";
export const unwrappedSelectedDriveAtom = unwrap(selectedDriveAtom);
unwrappedSelectedDriveAtom.debugLabel = "unwrappedSelectedDriveAtom";

/* Nodes */

export const nodesAtom = atom(async (get) => {
  const loadableSelectedDrive = get(loadableSelectedDriveAtom);
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

export const selectedNodeIdAtom = atom<string | undefined>(NOT_SET);
selectedNodeIdAtom.debugLabel = "selectedNodeIdAtom";

export const setSelectedNodeAtom = atom(
  null,
  (_get, set, nodeId: string | undefined) => {
    set(selectedNodeIdAtom, nodeId);
  },
);
setSelectedNodeAtom.debugLabel = "setSelectedNodeAtom";

export const selectedFolderAtom = atom((get) => {
  const loadableNodes = get(loadableNodesAtom);
  const nodeId = get(selectedNodeIdAtom);
  if (nodeId === NOT_SET || loadableNodes.state !== "hasData")
    return suspendUntilSet<FolderNode | undefined>();
  const nodes = loadableNodes.data;
  const folderNodes = nodes?.filter(isFolderNodeKind);
  return folderNodes?.find((node) => node.id === nodeId);
});
selectedFolderAtom.debugLabel = "selectedFolderAtom";

export const loadableSelectedFolderAtom = loadable(selectedFolderAtom);
loadableSelectedFolderAtom.debugLabel = "loadableSelectedFolderAtom";
export const unwrappedSelectedFolderAtom = unwrap(selectedFolderAtom);
unwrappedSelectedFolderAtom.debugLabel = "unwrappedSelectedFolderAtom";

/* Documents */

export const documentsAtom = atomWithRefresh(async (get) => {
  const loadableReactor = get(loadableReactorAtom);
  const loadableDrive = get(loadableSelectedDriveAtom);
  if (loadableReactor.state !== "hasData" || loadableDrive.state !== "hasData")
    return suspendUntilSet<PHDocument[]>();
  const reactor = loadableReactor.data;
  const driveId = loadableDrive.data?.id;
  if (!reactor || !driveId) return [];
  const documentIds = await reactor.getDocuments(driveId);
  const documents = await Promise.all(
    documentIds.map((id) => reactor.getDocument(driveId, id)),
  );
  return documents;
});
documentsAtom.debugLabel = "documentsAtom";
export const loadableDocumentsAtom = loadable(documentsAtom);
loadableDocumentsAtom.debugLabel = "loadableDocumentsAtom";
export const unwrappedDocumentsAtom = unwrap(documentsAtom);
unwrappedDocumentsAtom.debugLabel = "unwrappedDocumentsAtom";

export const selectedDocumentAtom = atom((get) => {
  const loadableDocuments = get(loadableDocumentsAtom);
  const nodeId = get(selectedNodeIdAtom);
  if (nodeId === NOT_SET || loadableDocuments.state !== "hasData")
    return suspendUntilSet<PHDocument | undefined>();
  const documents = loadableDocuments.data;
  return documents.find((document) => document.id === nodeId);
});
selectedDocumentAtom.debugLabel = "selectedDocumentAtom";

export const loadableSelectedDocumentAtom = loadable(selectedDocumentAtom);
loadableSelectedDocumentAtom.debugLabel = "loadableSelectedDocumentAtom";
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

/* Processor Manager */

export const processorManagerAtom = atom<ProcessorManager | undefined>(
  undefined,
);
processorManagerAtom.debugLabel = "processorManagerAtom";

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
