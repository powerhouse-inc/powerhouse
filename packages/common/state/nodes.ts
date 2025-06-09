import { type NodeKind, type SharingType } from "@powerhousedao/design-system";
import {
  type DocumentDriveDocument,
  type FileNode,
  type FolderNode,
  type Node,
} from "document-drive";
import deepEqual from "fast-deep-equal";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import { useCallback, useMemo } from "react";

const selectedNodeIdAtom = atom<string | null>(null);

const nodeMapAtom = atom<Record<string, Node | undefined>>({});

const nodeAtomFamily = atomFamily(
  (id: string | null) =>
    atom(
      (get) => (id ? get(nodeMapAtom)[id] : null),
      (get, set, newNode: Node) => {
        const map = get(nodeMapAtom);
        if (id && !deepEqual(map[id], newNode)) {
          set(nodeMapAtom, { ...map, [id]: newNode });
        }
      },
    ),
  deepEqual,
);

export function makeNodeMap(
  input: DocumentDriveDocument[] | DocumentDriveDocument,
) {
  console.log("making node map", input);
  const nodeMap: Record<string, Node> = {};
  const documentDrives = Array.isArray(input) ? input : [input];

  for (const documentDrive of documentDrives) {
    const driveNode: Node = {
      id: documentDrive.id,
      name: documentDrive.state.global.name,
      kind: "DRIVE",
      parentFolder: null,
    };

    nodeMap[documentDrive.id] = driveNode;

    for (const node of documentDrive.state.global.nodes) {
      const childNode: Node = {
        id: node.id,
        name: node.name,
        kind: node.kind.toUpperCase(),
        parentFolder: node.parentFolder || documentDrive.id,
      };

      nodeMap[childNode.id] = childNode;
    }
  }

  return nodeMap;
}

const bulkUpdateNodeMapAtom = atom(
  null,
  (get, set, updatedNodes: Record<string, Node | undefined>) => {
    const currentMap = get(nodeMapAtom);
    const newMap: Record<string, Node | undefined> = {};
    const updatedIds = new Set(Object.keys(updatedNodes));

    let changed = false;

    // Apply updates
    for (const [id, node] of Object.entries(updatedNodes)) {
      if (!deepEqual(currentMap[id], node)) {
        newMap[id] = node;
        changed = true;
      } else {
        newMap[id] = currentMap[id];
      }
    }

    // Remove stale nodes
    for (const id of Object.keys(currentMap)) {
      if (!updatedIds.has(id)) {
        nodeAtomFamily.remove(id); // Clean up atom
        changed = true;
      }
    }

    if (changed) {
      set(nodeMapAtom, newMap);
    }
  },
);

export function useSelectedNodeId() {
  const selectedDocumentId = useAtomValue(selectedNodeIdAtom);
  return selectedDocumentId;
}

export function useSetSelectedNodeId() {
  const setSelectedNodeId = useSetAtom(selectedNodeIdAtom);
  return setSelectedNodeId;
}

export function useSelectedNodeName() {
  const selectedNodeId = useSelectedNodeId();
  const node = useNodeById(selectedNodeId);
  return node?.name ?? null;
}

export function useUpdateNodeMap() {
  const update = useSetAtom(bulkUpdateNodeMapAtom);
  return (drives: DocumentDriveDocument[]) => {
    const nodeMap = makeNodeMap(drives);
    update(nodeMap);
  };
}

export function useNodeById(id: string | null): Node | null {
  return useAtomValue(nodeAtomFamily(id)) ?? null;
}

function makeNodeSlugFromNodeName(name: string) {
  return name.replaceAll(/\s/g, "-");
}

export function useNodeBySlug(slug: string | null): Node | null {
  const nodeMap = useAtomValue(nodeMapAtom);
  if (!slug) return null;
  const nodes = Object.values(nodeMap);
  const node = nodes.find((node) => {
    if (node === undefined) return false;
    const slugFromName = makeNodeSlugFromNodeName(node.name);
    return slugFromName === slug;
  });
  return node ?? null;
}

export function useNodeParentNode(id: string | null): Node | null {
  const nodeMap = useAtomValue(nodeMapAtom);
  if (!id) return null;
  const node = nodeMap[id];
  const parentId = node?.parentFolder;
  return parentId ? (nodeMap[parentId] ?? null) : null;
}

export function useNodeParentId(id: string | null): string | null {
  const parentNode = useNodeParentNode(id);
  return parentNode?.id ?? null;
}

export function useSelectParentNodeId(id: string | null) {
  const parentNodeId = useNodeParentId(id);
  const setSelectedNodeId = useSetSelectedNodeId();

  return useCallback(() => {
    setSelectedNodeId(parentNodeId);
  }, [parentNodeId, setSelectedNodeId]);
}

export function useNodeDriveNode(id: string | null): Node | null {
  const nodeMap = useAtomValue(nodeMapAtom);
  let current = id ? nodeMap[id] : null;
  while (current?.parentFolder) {
    current = nodeMap[current.parentFolder];
  }

  return current ?? null;
}

export function useNodeDriveId(id: string | null): string | null {
  const driveNode = useNodeDriveNode(id);
  return driveNode?.id ?? null;
}

export function useNodeDocumentType(id: string | null): string | null {
  const node = useNodeById(id);
  if (!node) return null;
  if (isFileNodeKind(node)) return node.documentType;
  if (isDriveNodeKind(node)) return "powerhouse/document-drive";
  return null;
}

export function useSelectedNodeDocumentType() {
  const selectedNodeId = useSelectedNodeId();
  return useNodeDocumentType(selectedNodeId);
}

export function useSelectedNodeKind() {
  const selectedNode = useSelectedNode();
  return getNodeKind(selectedNode);
}

export function useNodePath(id: string | null): Node[] {
  const nodeMap = useAtomValue(nodeMapAtom);
  if (!id) return [];
  const path: Node[] = [];
  let current = nodeMap[id];

  while (current) {
    path.unshift(current);
    if (!current.parentFolder) break;
    current = nodeMap[current.parentFolder];
  }

  return path;
}

export function useSelectedNode(): Node | null {
  const selectedNodeId = useSelectedNodeId();
  return useNodeById(selectedNodeId);
}

export function useSelectedDriveId() {
  const selectedNode = useSelectedNode();
  const driveNode = useNodeDriveNode(selectedNode?.id ?? null);
  return driveNode?.id ?? null;
}

export function useSelectedNodePath() {
  const selectedNodeId = useSelectedNodeId();
  return useNodePath(selectedNodeId);
}

export function useSelectedNodePathIds() {
  const selectedNodePath = useSelectedNodePath();
  return selectedNodePath.map((n) => n.id);
}

export function useIsInSelectedNodePath(id: string) {
  const selectedNodePathIds = useSelectedNodePathIds();
  return selectedNodePathIds.includes(id);
}

export function useIsSelected(id: string | null) {
  const selectedNodeId = useSelectedNodeId();
  if (!id) return false;
  return selectedNodeId === id;
}

export function useSelectedParentNode() {
  const selectedNodeId = useSelectedNodeId();
  return useNodeParentNode(selectedNodeId);
}

export function useSelectedParentNodeId() {
  const selectedParentNode = useSelectedParentNode();
  return selectedParentNode?.id ?? null;
}

export function useNodeChildrenIds(id: string | null): string[] {
  const nodeMap = useAtomValue(nodeMapAtom);
  if (!id) return [];
  const node = nodeMap[id];
  if (!node || isFileNodeKind(node)) return [];
  const nodes = Object.values(nodeMap);
  const childrenIds = nodes
    .filter((n) => n?.parentFolder === id)
    .map((n) => n?.id)
    .filter((id) => id !== undefined);
  // memoize the childrenIds because this is used to render a list of react nodes
  return useMemo(() => childrenIds, [childrenIds]);
}

export function useNodeChildren(id: string | null): Node[] {
  const nodeMap = useAtomValue(nodeMapAtom);
  const childrenIds = useNodeChildrenIds(id);
  return useMemo(
    () => childrenIds.map((id) => nodeMap[id]).filter((n) => n !== undefined),
    [childrenIds, nodeMap],
  );
}

export function useNodeFileChildren(id: string | null): FileNode[] {
  const nodeChildren = useNodeChildren(id);
  return useMemo(
    () => nodeChildren.filter((n) => isFileNodeKind(n)),
    [nodeChildren],
  );
}

export function useNodeFolderChildren(id: string | null): FolderNode[] {
  const nodeChildren = useNodeChildren(id);
  return useMemo(
    () => nodeChildren.filter((n) => isFolderNodeKind(n)),
    [nodeChildren],
  );
}

export function useNodeHasFolderChildren(id: string | null): boolean {
  const nodeFolderChildren = useNodeFolderChildren(id);
  return nodeFolderChildren.length > 0;
}

export function useNodeHasFileChildren(id: string | null): boolean {
  const nodeChildren = useNodeChildren(id);
  return useMemo(
    () => nodeChildren.some((n) => isFileNodeKind(n)),
    [nodeChildren],
  );
}

export function nodeHasFileChildren(id: string | null): boolean {
  const nodeFileChildren = useNodeFileChildren(id);
  return nodeFileChildren.length > 0;
}

export function sortNodesByName(nodes: Node[]): Node[] {
  return nodes.sort((a, b) => a.name.localeCompare(b.name));
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

export function isDriveNodeKind(
  node: Node | null | undefined,
): node is FolderNode {
  if (!node) return false;
  return node.kind.toUpperCase() === "DRIVE";
}

export function getNodeKind(node: Node | null): NodeKind | null {
  if (isDriveNodeKind(node)) return "DRIVE";
  if (isFolderNodeKind(node)) return "FOLDER";
  if (isFileNodeKind(node)) return "FILE";
  return null;
}

export function getDriveSharingType(
  drive:
    | {
        state: {
          local: {
            sharingType?: string | null;
          };
        };
        readContext?: {
          sharingType?: string | null;
        };
      }
    | undefined
    | null,
) {
  if (!drive) return "PUBLIC";
  const isReadDrive = "readContext" in drive;
  const { sharingType: _sharingType } = !isReadDrive
    ? drive.state.local
    : { sharingType: "PUBLIC" };
  const __sharingType = _sharingType?.toUpperCase();
  return (__sharingType === "PRIVATE" ? "LOCAL" : __sharingType) as SharingType;
}

export function useNodeKind(id: string | null): NodeKind | null {
  const node = useNodeById(id);
  return getNodeKind(node);
}

export function useDriveNodes() {
  const nodeMap = useAtomValue(nodeMapAtom);
  return Object.values(nodeMap).filter((n) => isDriveNodeKind(n));
}
