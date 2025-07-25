import { type FileNode, type FolderNode, type Node } from "document-drive";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import {
  loadableNodesAtom,
  loadableSelectedFolderAtom,
  unwrappedNodesAtom,
  unwrappedSelectedFolderAtom,
} from "../internal/atoms.js";
import { dispatchSetNodeEvent } from "../internal/events.js";
import { type Loadable, type NodeKind } from "../internal/types.js";
import { makeFolderNodeFromDrive } from "../utils/drives.js";
import {
  isFileNodeKind,
  isFolderNodeKind,
  sortNodesByName,
} from "../utils/nodes.js";
import { useSelectedDocument } from "./documents.js";
import { useDrives, useSelectedDrive } from "./drives.js";

/** Returns the nodes for a drive. */
export function useNodes() {
  return useAtomValue(unwrappedNodesAtom);
}

/** Returns a loadable of the nodes for a drive. */
export function useLoadableNodes(): Loadable<Node[] | undefined> {
  return useAtomValue(loadableNodesAtom);
}

/** Returns a function that sets the selected node (document or folder) with a node id. */
export function useSetSelectedNode() {
  return useCallback((nodeId: string | undefined) => {
    dispatchSetNodeEvent(nodeId);
  }, []);
}

/** Returns a node in the selected drive by id. */
export function useNodeById(id: string | null | undefined) {
  const nodes = useNodes();
  return nodes?.find((n) => n.id === id);
}

/** Returns the parent folder id of a node by id */
export function useParentFolderId(id: string | null | undefined) {
  const node = useNodeById(id);
  return node?.parentFolder ?? undefined;
}

/** Returns the parent folder of a node by id */
export function useParentFolder(id: string | null | undefined) {
  const parentFolderId = useParentFolderId(id);
  const nodes = useNodes();
  const parentFolder = nodes
    ?.filter((n): n is FolderNode => isFolderNodeKind(n))
    .find((n) => n.id === parentFolderId);
  return parentFolder;
}

/** Returns the selected folder or document's parent folder. */
export function useSelectedParentFolder() {
  const selectedFolder = useSelectedFolder();
  const selectedDocument = useSelectedDocument();
  const selectedNodeId = selectedDocument?.header.id ?? selectedFolder?.id;
  return useParentFolder(selectedNodeId);
}

/** Returns the path to a node. */
export function useNodePath(id: string | null | undefined): Node[] {
  const nodes = useNodes();
  const selectedDrive = useSelectedDrive();
  if (!nodes || !selectedDrive) return [];
  const driveFolderNode = makeFolderNodeFromDrive(selectedDrive);

  const path: Node[] = [];
  if (driveFolderNode) {
    path.unshift(driveFolderNode);
  }
  let current = nodes.find((n) => n.id === id);

  while (current) {
    path.unshift(current);
    if (!current.parentFolder) break;
    current = nodes.find((n) => n.id === current?.parentFolder);
  }

  return path.reverse();
}

/** Returns the selected folder. */
export function useSelectedFolder(): FolderNode | undefined {
  return useAtomValue(unwrappedSelectedFolderAtom);
}

/** Returns a loadable of the selected folder. */
export function useLoadableSelectedFolder() {
  return useAtomValue(loadableSelectedFolderAtom);
}

/** Returns the path to the selected node. */
export function useSelectedNodePath() {
  const selectedFolder = useSelectedFolder();
  const selectedDocument = useSelectedDocument();
  const selectedNodeId = selectedDocument?.header.id ?? selectedFolder?.id;
  return useNodePath(selectedNodeId);
}

/** Returns the child nodes for the selected drive or folder. */
export function useChildNodes(): Node[] {
  const nodes = useNodes();
  const selectedFolder = useSelectedFolder();
  const selectedFolderId = selectedFolder?.id;
  if (!nodes) return [];
  if (!selectedFolderId) return sortNodesByName(nodes);
  return sortNodesByName(
    nodes.filter((n) => n.parentFolder === selectedFolderId),
  );
}

/** Returns the folder child nodes for the selected drive or folder. */
export function useFolderChildNodes(): FolderNode[] {
  const childNodes = useChildNodes();
  return sortNodesByName(childNodes.filter((n) => isFolderNodeKind(n)));
}

/** Returns the file (document) child nodes for the selected drive or folder. */
export function useFileChildNodes(): FileNode[] {
  const childNodes = useChildNodes();
  return sortNodesByName(childNodes.filter((n) => isFileNodeKind(n)));
}

/** Returns the child nodes for a node by id. */
export function useChildNodesForId(id: string | null | undefined) {
  const nodes = useNodes();
  const drives = useDrives();
  if (!nodes || !drives) return [];
  const isDrive = drives.some((d) => d.header.id === id);
  const childNodes = isDrive
    ? nodes
    : nodes.filter((n) => n.parentFolder === id);
  return sortNodesByName(childNodes);
}

/** Returns the folder child nodes for a node by id. */
export function useFolderChildNodesForId(
  id: string | null | undefined,
): FolderNode[] {
  const childNodes = useChildNodesForId(id);
  return sortNodesByName(childNodes.filter((n) => isFolderNodeKind(n)));
}

/** Returns the file (document) child nodes for a node by id. */
export function useFileChildNodesForId(
  id: string | null | undefined,
): FileNode[] {
  const childNodes = useChildNodesForId(id);
  return sortNodesByName(childNodes.filter((n) => isFileNodeKind(n)));
}

/** Returns the name of a node. */
export function useNodeName(id: string | null | undefined) {
  const unwrappedNodes = useNodes();
  if (!unwrappedNodes) return undefined;
  const node = unwrappedNodes.find((n) => n.id === id);
  return node?.name;
}

/** Returns the kind of a node. */
export function useNodeKind(id: string | null | undefined) {
  const unwrappedNodes = useNodes();
  if (!unwrappedNodes) return undefined;
  const node = unwrappedNodes.find((n) => n.id === id);
  if (!node) return undefined;
  return node.kind.toUpperCase() as NodeKind;
}
