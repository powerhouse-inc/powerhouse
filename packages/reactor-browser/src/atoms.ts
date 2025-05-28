import type { DocumentDriveDocument, Node } from "document-drive";
import deepEqual from "fast-deep-equal";
import {
  atom,
  useAtom,
  useAtomValue,
  useSetAtom,
  type WritableAtom,
} from "jotai";
import { atomFamily } from "jotai/utils";
import { type AtomFamily } from "jotai/vanilla/utils/atomFamily";
import { DRIVE } from "./uiNodes/constants.js";

export const selectedNodeIdAtom = atom<string | null>(null);
export function useSelectedNodeId() {
  const selectedDocumentId = useAtomValue(selectedNodeIdAtom);
  return selectedDocumentId;
}

export function useSetSelectedNodeId() {
  const setSelectedNodeId = useSetAtom(selectedNodeIdAtom);
  return setSelectedNodeId;
}

export function makeNodeMap(documentDrives: DocumentDriveDocument[]) {
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
        kind: node.kind,
        parentFolder: node.parentFolder || documentDrive.id,
      };

      nodeMap[childNode.id] = childNode;
    }
  }

  return nodeMap;
}

export const nodeMapAtom = atom<Record<string, Node>>({});

export const nodeAtomFamily: AtomFamily<
  string | null,
  WritableAtom<Node | null, [newNode: Node], void>
> = atomFamily(
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

export const bulkUpdateNodeMapAtom = atom(
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

export function useUpdateNodeMap() {
  const update = useSetAtom(bulkUpdateNodeMapAtom);
  return (drives: DocumentDriveDocument[]) => {
    const nodeMap = makeNodeMap(drives);
    update(nodeMap);
  };
}

export function useNodeById(id: string | null) {
  return useAtom(nodeAtomFamily(id));
}

export function useParentNode(id: string | null): Node | null {
  const nodeMap = useAtomValue(nodeMapAtom);
  if (!id) return null;
  const node = nodeMap[id];
  const parentId = node?.parentFolder;
  return parentId ? (nodeMap[parentId] ?? null) : null;
}

export function useDriveNodeForNode(id: string | null): Node | null {
  const nodeMap = useAtomValue(nodeMapAtom);
  let current = id ? nodeMap[id] : null;
  while (current?.parentFolder) {
    current = nodeMap[current.parentFolder];
  }

  return current ?? null;
}

export function useNodePath(id: string | null): string[] {
  const nodeMap = useAtomValue(nodeMapAtom);
  if (!id) return [];
  const path: string[] = [];
  let current = nodeMap[id];

  while (current) {
    path.unshift(current.id);
    if (!current.parentFolder) break;
    current = nodeMap[current.parentFolder];
  }

  return path;
}

export function useSelectedNode() {
  const selectedNodeId = useSelectedNodeId();
  return useNodeById(selectedNodeId);
}

export function useSelectedDriveId() {
  const [selectedNode] = useSelectedNode();
  const driveNode = useDriveNodeForNode(selectedNode?.id ?? null);
  return driveNode?.id ?? null;
}

export function useSelectedNodePath() {
  const selectedNodeId = useSelectedNodeId();
  return useNodePath(selectedNodeId);
}

export function useIsInSelectedNodePath(id: string) {
  const selectedNodePath = useSelectedNodePath();
  return selectedNodePath.includes(id);
}

export function useSelectedParentNode() {
  const selectedNodeId = useSelectedNodeId();
  return useParentNode(selectedNodeId);
}
