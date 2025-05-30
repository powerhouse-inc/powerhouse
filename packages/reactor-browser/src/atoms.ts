import {
  type DocumentDriveDocument,
  type FileNode,
  type FolderNode,
  type Node,
} from "document-drive";
import deepEqual from "fast-deep-equal";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import { useMemo } from "react";
import { DRIVE, LOCAL, PUBLIC } from "./uiNodes/constants.js";
import { type SharingType } from "./uiNodes/types.js";

const selectedNodeIdAtom = atom<string | null>(null);

const nodeMapAtom = atom<Record<string, Node>>({});

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

function makeNodeMap(documentDrives: DocumentDriveDocument[]) {
  console.log("making node map", documentDrives);
  const nodeMap: Record<string, Node> = {};

  for (const documentDrive of documentDrives) {
    const driveNode: Node = {
      id: documentDrive.id,
      name: documentDrive.state.global.name,
      kind: DRIVE,
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
  (get, set, updatedNodes: Record<string, Node>) => {
    const currentMap = get(nodeMapAtom);
    const newMap: Record<string, Node> = {};
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
  return useAtomValue(nodeAtomFamily(id));
}

function makeNodeSlugFromNodeName(name: string) {
  return name.replaceAll(/\s/g, "-");
}

export function useNodeBySlug(slug: string | null): Node | null {
  const nodeMap = useAtomValue(nodeMapAtom);
  if (!slug) return null;
  const nodes = Object.values(nodeMap);
  const node = nodes.find((node) => {
    const slugFromName = makeNodeSlugFromNodeName(node.name);
    return slugFromName === slug;
  });
  return node ?? null;
}

export function useParentNode(id: string | null): Node | null {
  const nodeMap = useAtomValue(nodeMapAtom);
  if (!id) return null;
  const node = nodeMap[id];
  const parentId = node?.parentFolder;
  return parentId ? (nodeMap[parentId] ?? null) : null;
}

export function useParentNodeId(id: string | null): string | null {
  const parentNode = useParentNode(id);
  return parentNode?.id ?? null;
}

export function useDriveNodeForNode(id: string | null): Node | null {
  const nodeMap = useAtomValue(nodeMapAtom);
  let current = id ? nodeMap[id] : null;
  while (current?.parentFolder) {
    current = nodeMap[current.parentFolder];
  }

  return current ?? null;
}

export function useDriveIdForNode(id: string | null): string | null {
  const driveNode = useDriveNodeForNode(id);
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

export function useNodePathIds(id: string | null): string[] {
  const nodePath = useNodePath(id);
  return nodePath.map((n) => n.id);
}

export function useSelectedNode(): Node | null {
  const selectedNodeId = useSelectedNodeId();
  return useNodeById(selectedNodeId);
}

export function useSelectedDriveId() {
  const selectedNode = useSelectedNode();
  const driveNode = useDriveNodeForNode(selectedNode?.id ?? null);
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
  return useParentNode(selectedNodeId);
}

export function useSelectedParentNodeId() {
  const selectedParentNode = useSelectedParentNode();
  return selectedParentNode?.id ?? null;
}

export function useNodeChildrenIds(id: string | null): string[] {
  const nodeMap = useAtomValue(nodeMapAtom);
  if (!id || isFileNodeKind(nodeMap[id])) return [];
  const nodes = Object.values(nodeMap);
  const childrenIds = nodes
    .filter((n) => n.parentFolder === id)
    .map((n) => n.id);
  // memoize the childrenIds because this is used to render a list of react nodes
  return useMemo(() => childrenIds, [childrenIds]);
}

export function useNodeChildren(id: string | null): Node[] {
  const nodeMap = useAtomValue(nodeMapAtom);
  const childrenIds = useNodeChildrenIds(id);
  const children = childrenIds.map((id) => nodeMap[id]);
  return children;
}

export function useNodeFileChildren(id: string | null): Node[] {
  const nodeChildren = useNodeChildren(id);
  return nodeChildren.filter((n) => isFileNodeKind(n));
}

export function useNodeFolderChildren(id: string | null): Node[] {
  const nodeChildren = useNodeChildren(id);
  return nodeChildren.filter((n) => isFolderNodeKind(n));
}

export function sortNodesByName(nodes: Node[]): Node[] {
  return nodes.sort((a, b) => a.name.localeCompare(b.name));
}

export function useNodeFileChildrenIds(id: string | null): string[] {
  const nodeFileChildren = useNodeFileChildren(id);
  // memoize the childrenIds because this is used to render a list of react nodes
  return useMemo(
    () => sortNodesByName(nodeFileChildren).map((n) => n.id),
    [nodeFileChildren],
  );
}

export function useNodeFolderChildrenIds(id: string | null): string[] {
  const nodeFolderChildren = useNodeFolderChildren(id);
  // memoize the childrenIds because this is used to render a list of react nodes
  return useMemo(
    () => sortNodesByName(nodeFolderChildren).map((n) => n.id),
    [nodeFolderChildren],
  );
}

export function isFileNodeKind(node: Node | null): node is FileNode {
  if (!node) return false;
  return node.kind.toUpperCase() === "FILE";
}

export function isFolderNodeKind(node: Node | null): node is FolderNode {
  if (!node) return false;
  return node.kind.toUpperCase() === "FOLDER";
}

export function isDriveNodeKind(node: Node | null): node is FolderNode {
  if (!node) return false;
  return node.kind.toUpperCase() === "DRIVE";
}

type NodeKind = "FILE" | "FOLDER" | "DRIVE";
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
  if (!drive) return PUBLIC;
  const isReadDrive = "readContext" in drive;
  const { sharingType: _sharingType } = !isReadDrive
    ? drive.state.local
    : { sharingType: PUBLIC };
  const __sharingType = _sharingType?.toUpperCase();
  return (__sharingType === "PRIVATE" ? LOCAL : __sharingType) as SharingType;
}

export function useNodeNameForId(id: string | null): string | null {
  const node = useNodeById(id);
  return node?.name ?? null;
}

export function useNodeKind(id: string | null): NodeKind | null {
  const node = useNodeById(id);
  return getNodeKind(node);
}

export function useSelectedNodeKind() {
  const selectedNodeId = useSelectedNodeId();
  return useNodeKind(selectedNodeId);
}

export function useDriveNodes() {
  const nodeMap = useAtomValue(nodeMapAtom);
  return Object.values(nodeMap).filter((n) => isDriveNodeKind(n));
}

export function useDriveIds() {
  const driveNodes = useDriveNodes();
  return useMemo(() => driveNodes.map((n) => n.id), [driveNodes]);
}
