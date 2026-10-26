import type { IDriveReadClient } from "@powerhousedao/reactor";
import type {
  FileNode,
  FolderNode,
  Node,
} from "@powerhousedao/shared/document-drive";

/** Sorts nodes by name. */
export function sortNodesByName<T extends Node>(nodes: T[]) {
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

const NODE_PAGE_SIZE = 1000;

/** Every node of a drive from `read.drives`, paged until the last page;
 * `parentFolder` narrows it as `listNodes` does (null: the root level). */
export async function listAllDriveNodes(
  reader: IDriveReadClient,
  driveId: string,
  options: { parentFolder?: string | null; signal?: AbortSignal } = {},
): Promise<Node[]> {
  const nodes: Node[] = [];
  let cursor = "";
  for (;;) {
    const page = await reader.listNodes(
      driveId,
      options.parentFolder,
      { limit: NODE_PAGE_SIZE, cursor },
      options.signal,
    );
    nodes.push(...page.results);
    if (!page.nextCursor || page.results.length === 0) return nodes;
    cursor = page.nextCursor;
  }
}
