import {
  addRelationshipAction,
  type IReactorClient,
} from "@powerhousedao/reactor";
import type { FileNode, Node } from "@powerhousedao/shared/document-drive";
import type { Action } from "@powerhousedao/shared/document-model";
import { addFolderAction } from "../actions.js";
import { DRIVE_CHILD_RELATIONSHIP_TYPE } from "../constants.js";
import type { IDriveReadModel } from "../read-model/interfaces.js";
import type { DriveChildFileMetadata } from "../types.js";

export interface MigrateLegacyDriveStateArgs {
  reactor: IReactorClient;
  readModel: IDriveReadModel;
  driveId: string;
  nodes: Node[];
  branch?: string;
  signal?: AbortSignal;
}

export interface MigrateLegacyDriveStateResult {
  emittedActions: number;
  skippedExisting: number;
}

/**
 * Translates a legacy `document-drive` `state.global.nodes` array into the
 * action vocabulary used by the new reactor-drive module.
 *
 * Folder nodes are emitted as `ADD_FOLDER` actions targeting the drive
 * document. File nodes are emitted as `ADD_RELATIONSHIP` actions on the drive
 * with `drive/child` metadata carrying the parent folder id. File nodes
 * assume the underlying PHDocument still exists under the same id — the
 * migration only re-links it into the new drive, it does not recreate
 * documents.
 *
 * Re-running the migration is safe: existing `DriveNode` rows are skipped
 * so already-migrated nodes are left untouched.
 */
export async function migrateLegacyDriveState(
  args: MigrateLegacyDriveStateArgs,
): Promise<MigrateLegacyDriveStateResult> {
  const { reactor, readModel, driveId, nodes, signal } = args;
  const branch = args.branch ?? "main";

  const ordered = orderLegacyNodes(nodes);
  const actions: Action[] = [];
  let skippedExisting = 0;

  for (const node of ordered) {
    const existing = await readModel.getNode(driveId, node.id, signal);
    if (existing) {
      skippedExisting += 1;
      continue;
    }
    actions.push(toAction(driveId, node));
  }

  if (actions.length === 0) {
    return { emittedActions: 0, skippedExisting };
  }

  await reactor.execute(driveId, branch, actions, signal);
  return { emittedActions: actions.length, skippedExisting };
}

function toAction(driveId: string, node: Node): Action {
  if (node.kind === "folder") {
    return addFolderAction({
      folderId: node.id,
      parentFolderId: node.parentFolder ?? null,
      name: node.name,
    });
  }
  const fileNode = node as FileNode;
  const metadata: DriveChildFileMetadata = {
    kind: "file",
    parentFolderId: fileNode.parentFolder ?? null,
    documentType: fileNode.documentType,
  };
  return addRelationshipAction(
    driveId,
    fileNode.id,
    DRIVE_CHILD_RELATIONSHIP_TYPE,
    metadata,
  );
}

/**
 * Sorts legacy nodes so that any folder appears before its children. The
 * legacy state stores nodes in insertion order, which usually already
 * satisfies that property, but defensive sorting keeps replay deterministic
 * if the input was constructed out of order.
 */
function orderLegacyNodes(nodes: Node[]): Node[] {
  const byId = new Map<string, Node>();
  for (const node of nodes) {
    byId.set(node.id, node);
  }
  const visited = new Set<string>();
  const ordered: Node[] = [];

  for (const start of nodes) {
    if (visited.has(start.id)) continue;
    const chain: Node[] = [];
    const seenInWalk = new Set<string>();
    let current: Node | undefined = start;
    while (current && !visited.has(current.id) && !seenInWalk.has(current.id)) {
      seenInWalk.add(current.id);
      chain.push(current);
      const parentId: string | null | undefined = current.parentFolder;
      current = parentId ? byId.get(parentId) : undefined;
    }
    while (chain.length > 0) {
      const node = chain.pop()!;
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      ordered.push(node);
    }
  }
  return ordered;
}
