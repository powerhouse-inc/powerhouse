import { type FileNode, type FolderNode, type Node } from "document-drive";

/** Sorts nodes by name. */
export function sortNodesByName<TNode extends Node>(nodes: TNode[]): TNode[] {
  return nodes.toSorted((a, b) => a.name.localeCompare(b.name));
}

/** Returns whether a node is a file. */
export function isFileNodeKind(
  node: Node | null | undefined,
): node is FileNode {
  if (!node) return false;
  return node.kind.toUpperCase() === "FILE";
}

/** Returns whether a node is a folder. */
export function isFolderNodeKind(
  node: Node | null | undefined,
): node is FolderNode {
  if (!node) return false;
  return node.kind.toUpperCase() === "FOLDER";
}
