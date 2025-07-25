import { type FileNode, type FolderNode, type Node } from "document-drive";
import { type Reactor } from "../internal/types.js";
import { getDriveById } from "./drives.js";

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

/** Returns the nodes for a drive. */
export async function getNodes(
  reactor: Reactor | undefined,
  driveId: string | undefined,
): Promise<Node[]> {
  if (!reactor || !driveId) return [];
  const drive = await getDriveById(reactor, driveId);
  if (!drive) return [];
  return drive.state.global.nodes;
}
