import {
  type CopyNodeInput,
  type FileNode,
  type FolderNode,
  type Node,
} from "../gen/types.js";

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

export type GenerateNodesCopySrc = {
  srcId: Node["id"];
  targetName?: Node["name"];
  targetParentFolder?: Node["parentFolder"];
};

export type GenerateNodesCopyIdGenerator = (nodeToCopy: Node) => Node["id"];

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

export function handleTargetNameCollisions(params: {
  nodes: Node[];
  targetParentFolder: string | null;
  srcName: string;
}) {
  const { nodes, targetParentFolder, srcName } = params;

  const targetNodeChildrenNames = nodes
    .filter((node) =>
      targetParentFolder === ""
        ? node.parentFolder === null
        : node.parentFolder === targetParentFolder,
    )
    .map((node) => node.name);

  const targetHasNodesWithSameName = targetNodeChildrenNames.includes(srcName);

  const targetName = targetHasNodesWithSameName
    ? `${srcName} (copy) ${getNextCopyNumber(targetNodeChildrenNames, srcName)}`
    : srcName;

  return targetName;
}

export const isValidName = (name: string) => {
  // only allow characters that are valid in a URL
  return /^[a-zA-Z0-9-_.\s()]+$/.test(name);
};
