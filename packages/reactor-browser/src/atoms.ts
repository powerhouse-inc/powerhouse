import type { DocumentDriveDocument, Node } from "document-drive";
import deepEqual from "fast-deep-equal";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import { DRIVE } from "./uiNodes/constants.js";

export type DocumentDriveNode = Node;

export const selectedDriveIdAtom = atom<string | null>(null);
export function useSelectedDriveId() {
  const selectedDriveId = useAtomValue(selectedDriveIdAtom);
  return selectedDriveId;
}

export function useSetSelectedDriveId() {
  const setSelectedDriveId = useSetAtom(selectedDriveIdAtom);
  return setSelectedDriveId;
}

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
  const nodeMap: Record<string, DocumentDriveNode> = {};

  for (const documentDrive of documentDrives) {
    const driveNode: DocumentDriveNode = {
      id: documentDrive.id,
      name: documentDrive.state.global.name,
      kind: DRIVE,
      parentFolder: null,
    };

    nodeMap[documentDrive.id] = driveNode;

    for (const node of documentDrive.state.global.nodes) {
      const childNode: DocumentDriveNode = {
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

export const nodeMapAtom = atom<Record<string, DocumentDriveNode>>({});

export const nodeAtomFamily = atomFamily(
  (id: string) =>
    atom(
      (get) => get(nodeMapAtom)[id],
      (get, set, newNode: Node) => {
        const map = get(nodeMapAtom);
        if (!deepEqual(map[id], newNode)) {
          set(nodeMapAtom, { ...map, [id]: newNode });
        }
      },
    ),
  deepEqual,
);

export const bulkUpdateNodeMapAtom = atom(
  null,
  (get, set, updatedNodes: Record<string, DocumentDriveNode>) => {
    const currentMap = get(nodeMapAtom);
    const newMap: Record<string, DocumentDriveNode> = {};
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

export function useNodeById(id: string) {
  return useAtom(nodeAtomFamily(id));
}

export function useParentNode(id: string) {
  const nodeMap = useAtomValue(nodeMapAtom);
  const node = nodeMap[id];
  const parentId = node?.parentFolder;
  return parentId ? (nodeMap[parentId] ?? null) : null;
}

export function useDriveNode(id: string) {
  const nodeMap = useAtomValue(nodeMapAtom);

  let current = nodeMap[id];
  while (current?.parentFolder) {
    current = nodeMap[current.parentFolder];
  }

  return current ?? null;
}

export function useNodePath(id: string): DocumentDriveNode[] {
  const nodeMap = useAtomValue(nodeMapAtom);

  const path: DocumentDriveNode[] = [];
  let current = nodeMap[id];

  while (current) {
    path.unshift(current);
    if (!current.parentFolder) break;
    current = nodeMap[current.parentFolder];
  }

  return path;
}
