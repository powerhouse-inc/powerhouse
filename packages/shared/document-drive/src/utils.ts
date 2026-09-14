import type {
  CopyNodeInput,
  FileNode,
  FolderNode,
  Node,
} from "../gen/schema/types.js";
import type {
  GenerateNodesCopyIdGenerator,
  GenerateNodesCopySrc,
} from "./types.js";
import { isDraft, original } from "mutative";

export function isFileNode(node: Node): node is FileNode {
  return node.kind === "file";
}

export function isFolderNode(node: Node): node is FolderNode {
  return node.kind === "folder";
}

export function getAncestors(node: Node, allNodes: Node[]): Node[] {
  if (!node.parentFolder) {
    return [];
  } else {
    const parentNode = allNodes.find((_node) => _node.id === node.parentFolder);
    if (!parentNode) {
      throw new Error(`Parent node with id ${node.parentFolder} not found`);
    }
    return [parentNode, ...getAncestors(parentNode, allNodes)];
  }
}

export function getDescendants(node: Node, allNodes: Node[]): Node[] {
  const children = allNodes.filter((_node) => _node.parentFolder === node.id);
  const descendants = children.map((child) => getDescendants(child, allNodes));
  return [...children, ...descendants.flat()];
}

/**
 * Generates a copy of nodes based on the provided source and target information.
 * @param src - The source information for generating the copy.
 * @param idGenerator - The function used to generate new IDs for the copied nodes.
 * @param nodes - The array of nodes to copy from.
 * @returns An array of copied nodes with updated IDs and parent folders.
 * @throws Error if the root node with the specified ID is not found.
 */
export function generateNodesCopy(
  src: GenerateNodesCopySrc,
  idGenerator: GenerateNodesCopyIdGenerator,
  nodes: Node[],
): CopyNodeInput[] {
  const rootNode = nodes.find((node) => node.id === src.srcId);

  if (!rootNode) {
    throw new Error(`Node with id ${src.srcId} not found`);
  }

  const nodesToCopy = [
    {
      ...rootNode,
      name: src.targetName || rootNode.name,
      parentFolder: src.targetParentFolder || null,
    },
    ...getDescendants(rootNode, nodes),
  ];

  const ids: Record<string, string | undefined> = {};

  // Add targetParentFolder to ids so that is not replaced by a new id
  if (src.targetParentFolder) {
    ids[src.targetParentFolder] = src.targetParentFolder;
  }

  const getNewNodeId = (node: Node): string => {
    let newId = ids[node.id];

    if (!newId) {
      const oldId = node.id;
      newId = idGenerator(node);
      ids[oldId] = newId;
    }

    return newId;
  };

  const copyNodesInput = nodesToCopy.map<CopyNodeInput>((node) => ({
    srcId: node.id,
    targetId: getNewNodeId(node),
    targetName: node.name,
    targetParentFolder: node.parentFolder ? ids[node.parentFolder] : null,
  }));

  return copyNodesInput;
}

export function getNextCopyNumber(
  files: string[],
  baseFilename: string,
): number {
  let maxNumber = 0; // Start by assuming no copies exist

  // Regex to find files that match the base filename followed by " (copy)" and possibly a number
  const regex = new RegExp(
    `^${escapeRegExp(baseFilename)} \\(copy\\)(?: (\\d+))?$`,
  );

  for (const file of files) {
    const match = file.match(regex);
    if (match) {
      const number = match[1] ? parseInt(match[1], 10) : 1;
      if (number > maxNumber) {
        maxNumber = number;
      }
    }
  }

  return maxNumber + 1;
}

export function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A plain, unfrozen copy of the node list for read-only scans. Inside a
 * mutative draft the copy is taken from the untouched base list, so a find or
 * filter over it does not create a child draft per element it visits, and it is
 * a copy because the stored list is frozen and V8 scans a frozen array several
 * times slower than a normal one. Callers must read before they write: the base
 * list does not see mutations made earlier in the same action.
 */
export function readNodes(state: { nodes: Node[] }): Node[] {
  return [...(isDraft(state) ? original(state).nodes : state.nodes)];
}

/**
 * The given list sorted by id and frozen, the only shape state.nodes is ever
 * assigned. The freeze is what makes that assignment cheap: assigning a
 * draftable value to a mutative draft property queues a finalize pass that
 * walks every element of the assigned value, and the walk exits at its
 * Object.isFrozen check instead. Callers own the array they pass and its
 * elements must be plain nodes -- read the list with readNodes, build the new
 * list from it, and assign what this returns once. An element that is still a
 * draft would never be replaced by its final value, because the walk that does
 * that replacement is the one being skipped.
 */
export function sortNodesById(nodes: Node[]): Node[] {
  nodes.sort((a, b) => a.id.localeCompare(b.id));
  Object.freeze(nodes);
  return nodes;
}

/**
 * The node list with a node added, ordered by id and frozen by sortNodesById.
 * The list is built and sorted as plain objects, so inside a mutative draft the
 * comparator never reads an element through the draft proxy. Pass the list read
 * with readNodes: the draft's own list would put child drafts in the result,
 * which the freeze then keeps mutative from resolving.
 */
export function insertNodeSorted(nodes: readonly Node[], node: Node): Node[] {
  return sortNodesById([...nodes, node]);
}

export function handleTargetNameCollisions(params: {
  nodes: Node[];
  targetParentFolder: string | null;
  srcName: string;
  srcKind: "file" | "folder";
}) {
  const { nodes, targetParentFolder, srcName, srcKind } = params;

  const targetNodeChildrenNames = nodes
    .filter((node) =>
      targetParentFolder === ""
        ? node.parentFolder === null
        : node.parentFolder === targetParentFolder,
    )
    .filter((node) => node.kind === srcKind)
    .map((node) => node.name);

  const targetHasNodesWithSameName = targetNodeChildrenNames.includes(srcName);

  const targetName = targetHasNodesWithSameName
    ? `${srcName} (copy) ${getNextCopyNumber(targetNodeChildrenNames, srcName)}`
    : srcName;

  return targetName;
}

export const isValidName = (name: string) => {
  // Names are display labels (URLs use a slugified id), so allow any unicode;
  // reject only empty/whitespace-only names and control characters.
  // eslint-disable-next-line no-control-regex
  return name.trim().length > 0 && !/[\u0000-\u001F\u007F]/.test(name);
};
