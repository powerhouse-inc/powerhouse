import { FileNode, FolderNode, Node } from '..';

export function isFileNode(node: Node): node is FileNode {
    return node.kind === 'file';
}

export function isFolderNode(node: Node): node is FolderNode {
    return node.kind === 'folder';
}
