// Sidebar order of workflows. The drive sorts nodes by id, so each workflow
// lives in a root "home" folder named "<key> · <name>" and sorts by that key.
import {
  addFolder,
  moveNode,
  updateNode,
  type DocumentDriveAction,
  type FileNode,
  type FolderNode,
  type Node,
} from "@powerhousedao/shared/document-drive";
import { generateId } from "document-model";

// Ascending in code-unit order, which is how keys compare.
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const HOME_FOLDER = /^([0-9A-Za-z]+) · (.*)$/s;

export type OrderedWorkflow = {
  node: FileNode;
  /** The home folder, when the workflow has one. */
  folder?: FolderNode;
  key?: string;
};

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Fractional digits strictly between a and b (b null: unbounded). Requires
// a < b and neither ending in "0".
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? "0") === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a ? DIGITS.indexOf(a[0]) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b[0]) : DIGITS.length;
  if (digitB - digitA > 1) return DIGITS[Math.round((digitA + digitB) / 2)];
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[digitA] + midpoint(a.slice(1), null);
}

/** A key that sorts after `before` and before `after`. */
export function keyBetween(
  before: string | null | undefined,
  after: string | null | undefined,
): string {
  return midpoint(before ?? "", after ?? null);
}

/** `count` ascending keys, evenly spread. */
export function spreadKeys(count: number): string[] {
  let width = 1;
  while (DIGITS.length ** width <= count) width++;
  const span = DIGITS.length ** width;
  return Array.from({ length: count }, (_, i) => {
    let value = Math.floor(((i + 1) * span) / (count + 1));
    let key = "";
    for (let d = 0; d < width; d++) {
      key = DIGITS[value % DIGITS.length] + key;
      value = Math.floor(value / DIGITS.length);
    }
    return key.replace(/0+$/, "");
  });
}

export function homeFolderName(key: string, name: string): string {
  return `${key} · ${name || "Workflow"}`;
}

// Sidebar order: workflows without a home folder first by id, then by key.
// A home folder is a keyed root folder holding only its workflow.
export function orderWorkflows(
  workflows: FileNode[],
  nodes: readonly Node[],
): OrderedWorkflow[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childCount = new Map<string, number>();
  for (const node of nodes) {
    if (node.parentFolder)
      childCount.set(
        node.parentFolder,
        (childCount.get(node.parentFolder) ?? 0) + 1,
      );
  }
  const ordered = workflows.map((node): OrderedWorkflow => {
    const parent = node.parentFolder ? byId.get(node.parentFolder) : undefined;
    if (
      parent?.kind !== "folder" ||
      parent.parentFolder ||
      childCount.get(parent.id) !== 1
    )
      return { node };
    const match = HOME_FOLDER.exec(parent.name);
    return match
      ? { node, folder: parent as FolderNode, key: match[1] }
      : { node };
  });
  return ordered.sort((a, b) => {
    if (a.key === undefined || b.key === undefined) {
      if (a.key !== b.key) return a.key === undefined ? -1 : 1;
    } else {
      const byKey = compareKeys(a.key, b.key);
      if (byKey !== 0) return byKey;
    }
    return compareKeys(a.node.id, b.node.id);
  });
}

/** The key for a new workflow, after every other one. */
export function nextKey(ordered: OrderedWorkflow[]): string {
  return keyBetween(ordered.at(-1)?.key, null);
}

/** The node to delete to remove a workflow: its home folder, if it has one. */
export function deletionTarget(
  workflowId: string,
  nodes: readonly Node[],
): Node | undefined {
  const node = nodes.find((n) => n.id === workflowId);
  if (node?.kind !== "file") return node;
  return orderWorkflows([node as FileNode], nodes)[0].folder ?? node;
}

// Drive node names can be stale or ids, so callers pass document names.
function folderTail(
  item: OrderedWorkflow,
  names: ReadonlyMap<string, string>,
): string {
  const name = names.get(item.node.id) || item.node.name;
  return item.folder ? (HOME_FOLDER.exec(item.folder.name)?.[2] ?? name) : name;
}

// Moves the workflow at `from` to index `to` of the list without it: one
// rename, or fresh keys and home folders for all when neighbours lack keys.
export function reorderActions(
  ordered: OrderedWorkflow[],
  from: number,
  to: number,
  names: ReadonlyMap<string, string> = new Map(),
): DocumentDriveAction[] {
  if (from === to || !ordered[from]) return [];
  const next = [...ordered];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);

  const before = to > 0 ? next[to - 1] : undefined;
  const after = to < next.length - 1 ? next[to + 1] : undefined;
  const canSplice =
    moved.folder &&
    (!before || before.key !== undefined) &&
    (!after || after.key !== undefined) &&
    (!before || !after || compareKeys(before.key!, after.key!) < 0);
  if (canSplice) {
    const key = keyBetween(before?.key, after?.key);
    return [
      updateNode({
        id: moved.folder!.id,
        name: homeFolderName(key, folderTail(moved, names)),
      }),
    ];
  }

  const keys = spreadKeys(next.length);
  return next.flatMap((item, i): DocumentDriveAction[] => {
    const name = homeFolderName(keys[i], folderTail(item, names));
    if (item.folder) {
      return item.folder.name === name
        ? []
        : [updateNode({ id: item.folder.id, name })];
    }
    const folderId = generateId();
    return [
      addFolder({ id: folderId, name, parentFolder: null }),
      moveNode({ srcFolder: item.node.id, targetParentFolder: folderId }),
    ];
  });
}
