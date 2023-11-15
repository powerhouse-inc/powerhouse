import { FileNode, FolderNode, Node } from '..';

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
