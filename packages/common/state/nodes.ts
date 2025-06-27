import { type FileNode, type FolderNode, type Node } from "document-drive";
import { useAtomValue, useSetAtom } from "jotai";
import { type Loadable } from "jotai/vanilla/utils/loadable";
import { useCallback } from "react";
import {
  loadableNodesAtom,
  setSelectedNodeAtom,
  unwrappedNodesAtom,
} from "./atoms.js";
import { useSelectedDrive } from "./drives.js";
import { useSelectedFolder } from "./folders.js";
import { type NodeKind } from "./types.js";
import { extractDriveFromPath, makeNodeUrlComponent } from "./utils.js";

export function useNodes(): Loadable<Node[] | undefined> {
  return useAtomValue(loadableNodesAtom);
}

export function useSetSelectedNode() {
  const nodes = useUnwrappedNodes();
  const setSelectedNode = useSetAtom(setSelectedNodeAtom);

  return useCallback(
    (nodeId: string | undefined, shouldNavigate = true) => {
      setSelectedNode(nodeId);

      if (typeof window !== "undefined" && shouldNavigate) {
        const driveSlugFromPath = extractDriveFromPath(
          window.location.pathname,
        );
        const node = nodes?.find((n) => n.id === nodeId);
        if (!node) {
          window.history.pushState(null, "", `/d/${driveSlugFromPath}`);
        } else {
          const nodeSlug = makeNodeUrlComponent(node);
          window.history.pushState(
            null,
            "",
            `/d/${driveSlugFromPath}/${nodeSlug}`,
          );
        }
      }
    },
    [setSelectedNode, nodes],
  );
}

export function useUnwrappedNodes() {
  return useAtomValue(unwrappedNodesAtom);
}

export function useNodeById(id: string | null | undefined) {
  const unwrappedNodes = useUnwrappedNodes();
  return unwrappedNodes?.find((n) => n.id === id);
}

export function useParentFolder(id: string | null | undefined) {
  const node = useNodeById(id);
  return node?.parentFolder ?? undefined;
}

export function useNodePath(
  id: string | null | undefined,
): Loadable<Node[] | undefined> {
  const loadableNodes = useNodes();
  const loadableSelectedDrive = useSelectedDrive();
  if (loadableSelectedDrive.state !== "hasData") return loadableSelectedDrive;
  if (loadableNodes.state !== "hasData") return loadableNodes;
  const nodes = loadableNodes.data;
  const selectedDrive = loadableSelectedDrive.data;
  if (!nodes || !selectedDrive) return { state: "hasData", data: undefined };
  const driveFolderNode: FolderNode = {
    id: selectedDrive.header.id,
    name: selectedDrive.state.global.name,
    kind: "FOLDER",
    parentFolder: null,
  };

  const path: Node[] = [driveFolderNode];
  let current = nodes.find((n) => n.id === id);

  while (current) {
    path.unshift(current);
    if (!current.parentFolder) break;
    current = nodes.find((n) => n.id === current?.parentFolder);
  }

  return { state: "hasData", data: path.reverse() };
}

export function useChildNodes(): Loadable<Node[] | undefined> {
  const nodes = useNodes();
  const selectedFolder = useSelectedFolder();
  if (nodes.state !== "hasData") return nodes;
  if (selectedFolder.state !== "hasData") return selectedFolder;
  const selectedFolderId = selectedFolder.data?.id;
  if (!selectedFolderId)
    return {
      state: "hasData",
      data: sortNodesByName(nodes.data ?? []),
    };
  return {
    state: "hasData",
    data: sortNodesByName(
      nodes.data?.filter((n) => n.parentFolder === selectedFolderId) ?? [],
    ),
  };
}

export function useNodeKind(id: string | null | undefined) {
  const unwrappedNodes = useUnwrappedNodes();
  if (!unwrappedNodes) return undefined;
  const node = unwrappedNodes.find((n) => n.id === id);
  if (!node) return undefined;
  return node.kind.toUpperCase() as NodeKind;
}
export function sortNodesByName<TNode extends Node>(nodes: TNode[]): TNode[] {
  return nodes.toSorted((a, b) => a.name.localeCompare(b.name));
}
export function isFileNodeKind(
  node: Node | null | undefined,
): node is FileNode {
  if (!node) return false;
  return node.kind.toUpperCase() === "FILE";
}

export function isFolderNodeKind(
  node: Node | null | undefined,
): node is FolderNode {
  if (!node) return false;
  return node.kind.toUpperCase() === "FOLDER";
}
