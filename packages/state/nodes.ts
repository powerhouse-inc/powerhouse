import {
  type DocumentDriveDocument,
  type FileNode,
  type FolderNode,
  type Node,
} from "document-drive";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import {
  loadableNodesAtom,
  loadableSelectedFolderAtom,
  unwrappedNodesAtom,
  unwrappedSelectedFolderAtom,
} from "./atoms.js";
import { useUnwrappedSelectedDocument } from "./documents.js";
import { useUnwrappedDrives, useUnwrappedSelectedDrive } from "./drives.js";
import { dispatchSetNodeEvent } from "./events.js";
import { type Loadable, type NodeKind } from "./types.js";

/** Returns a loadable of the nodes for a reactor. */
export function useNodes(): Loadable<Node[] | undefined> {
  return useAtomValue(loadableNodesAtom);
}

/** Returns a function that sets the selected node with a node id.
 *
 * If `shouldNavigate` is true, the URL will be updated to the new node.
 * `shouldNavigate` can be overridden by passing a different value to the callback.
 */
export function useSetSelectedNode() {
  return useCallback((nodeId: string | undefined) => {
    dispatchSetNodeEvent(nodeId);
  }, []);
}

/** Returns a resolved promise of the nodes for a reactor. */
export function useUnwrappedNodes() {
  return useAtomValue(unwrappedNodesAtom);
}

/** Returns a resolved promise of a node for a reactor by id. */
export function useNodeById(id: string | null | undefined) {
  const unwrappedNodes = useUnwrappedNodes();
  return unwrappedNodes?.find((n) => n.id === id);
}

/** Returns a resolved promise of the parent folder for a node. */
export function useParentFolderId(id: string | null | undefined) {
  const node = useNodeById(id);
  return node?.parentFolder ?? undefined;
}

/** Returns a resolved promise of the parent folder for a node. */
export function useParentFolder(id: string | null | undefined) {
  const parentFolderId = useParentFolderId(id);
  const nodes = useUnwrappedNodes();
  const parentFolder = nodes
    ?.filter((n): n is FolderNode => isFolderNodeKind(n))
    .find((n) => n.id === parentFolderId);
  return parentFolder;
}

/** Returns the selected folder or document's parent folder. */
export function useSelectedParentFolder() {
  const selectedFolder = useUnwrappedSelectedFolder();
  const selectedDocument = useUnwrappedSelectedDocument();
  const selectedNodeId = selectedDocument?.header.id ?? selectedFolder?.id;
  return useParentFolder(selectedNodeId);
}

/** Returns a loadable of the path to a node. */
export function useNodePath(id: string | null | undefined): Node[] {
  const nodes = useUnwrappedNodes();
  const selectedDrive = useUnwrappedSelectedDrive();
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

/** Returns a loadable of the selected folder. */
export function useSelectedFolder() {
  return useAtomValue(loadableSelectedFolderAtom);
}

/** Returns a resolved promise of the selected folder. */
export function useUnwrappedSelectedFolder(): FolderNode | undefined {
  return useAtomValue(unwrappedSelectedFolderAtom);
}

export function useSelectedNodePath() {
  const selectedFolder = useUnwrappedSelectedFolder();
  const selectedDocument = useUnwrappedSelectedDocument();
  const selectedNodeId = selectedDocument?.header.id ?? selectedFolder?.id;
  return useNodePath(selectedNodeId);
}

/** Returns a loadable of the child nodes for the selected drive or folder. */
export function useChildNodes(): Node[] {
  const nodes = useUnwrappedNodes();
  const selectedFolder = useUnwrappedSelectedFolder();
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
  const nodes = useUnwrappedNodes();
  const drives = useUnwrappedDrives();
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
  const unwrappedNodes = useUnwrappedNodes();
  if (!unwrappedNodes) return undefined;
  const node = unwrappedNodes.find((n) => n.id === id);
  return node?.name;
}

/** Returns the kind of a node. */
export function useNodeKind(id: string | null | undefined) {
  const unwrappedNodes = useUnwrappedNodes();
  if (!unwrappedNodes) return undefined;
  const node = unwrappedNodes.find((n) => n.id === id);
  if (!node) return undefined;
  return node.kind.toUpperCase() as NodeKind;
}

/** Sorts nodes by name. */
export function sortNodesByName<TNode extends Node>(nodes: TNode[]): TNode[] {
  return nodes.toSorted((a, b) => a.name.localeCompare(b.name));
}

/** Returns whether a node is a file. */
export function isFileNodeKind(
  node: Node | null | undefined,
): node is FileNode {
  if (!node) return false;
  return node.kind.toUpperCase() === "FILE";
}

/** Returns whether a node is a folder. */
export function isFolderNodeKind(
  node: Node | null | undefined,
): node is FolderNode {
  if (!node) return false;
  return node.kind.toUpperCase() === "FOLDER";
}

export function makeFolderNodeFromDrive(
  drive: DocumentDriveDocument | null | undefined,
): FolderNode | undefined {
  if (!drive) return undefined;
  return {
    id: drive.header.id,
    name: drive.state.global.name,
    kind: "FOLDER",
    parentFolder: null,
  };
}
