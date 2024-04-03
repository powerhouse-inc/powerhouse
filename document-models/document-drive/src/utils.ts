import { v4 as uuid } from 'uuid';
import { CopyNodeInput, FileNode, FolderNode, Node } from '..';

export function isFileNode(node: Node): node is FileNode {
    return node.kind === 'file';
}

export function isFolderNode(node: Node): node is FolderNode {
    return node.kind === 'folder';
}

export function getAncestors(node: Node, allNodes: Node[]): Node[] {
    if (!node.parentFolder) {
        return [];
    } else {
        const parentNode = allNodes.find(
            _node => _node.id === node.parentFolder,
        );
        if (!parentNode) {
            throw new Error(
                `Parent node with id ${node.parentFolder} not found`,
            );
        }
        return [parentNode, ...getAncestors(parentNode, allNodes)];
    }
}

export function getDescendants(node: Node, allNodes: Node[]): Node[] {
    const children = allNodes.filter(_node => _node.parentFolder === node.id);
    const descendants = children.map(child => getDescendants(child, allNodes));
    return [...children, ...descendants.flat()];
}

export type GenerateNodesCopySrc = {
    srcId: Node['id'];
    targetName?: Node['name'];
    targetParentFolder?: Node['parentFolder'];
};

export type GenerateNodesCopyIdGenerator = (prevId: Node['id']) => Node['id'];

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
    const rootNode = nodes.find(node => node.id === src.srcId);

    if (!rootNode) {
        throw new Error(`Node with id ${src.srcId} not found`);
    }

    const nodesToCopy = [
        {
            ...rootNode,
            name: src.targetName || rootNode.name,
            parentFolder: src.targetParentFolder || rootNode.parentFolder,
        },
        ...getDescendants(rootNode, nodes),
    ];

    const ids: Record<string, string | undefined> = {};

    // Add targetParentFolder to ids so that is not replaced by a new id
    if (src.targetParentFolder) {
        ids[src.targetParentFolder] = src.targetParentFolder;
    }

    const getNewNodeId = (id: string): string => {
        let newId = ids[id];

        if (!newId) {
            const oldId = id;
            newId = idGenerator(id);
            ids[oldId] = newId;
        }

        return newId;
    };

    const copyNodesInput = nodesToCopy.map<CopyNodeInput>(node => ({
        srcId: node.id,
        targetId: getNewNodeId(node.id),
        targetName: node.name,
        targetParentFolder: node.parentFolder
            ? getNewNodeId(node.parentFolder)
            : null,
    }));

    return copyNodesInput;
}

export function generateSyncId() {
    return uuid();
}
