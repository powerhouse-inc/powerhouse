import {
  addRelationshipAction,
  type IReactorClient,
} from "@powerhousedao/reactor";
import type { Node } from "@powerhousedao/shared/document-drive";
import type { Action } from "@powerhousedao/shared/document-model";
import { DRIVE_CHILD_RELATIONSHIP_TYPE } from "../constants.js";
import type { IDriveReadModel } from "../read-model/interfaces.js";

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
 * relationship-action vocabulary used by the new reactor-drive module.
 *
 * For every legacy node not already present in the drive's projection a
 * single `ADD_RELATIONSHIP` action is emitted on the target drive. File
 * nodes assume the underlying PHDocument still exists under the same id —
 * the migration only re-links it into the new drive, it does not recreate
 * documents.
 *
 * Re-running the migration is safe: existing `DriveNode` rows are skipped
 * so already-migrated edges are left untouched.
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
    actions.push(toAddRelationshipAction(driveId, node));
  }

  if (actions.length === 0) {
    return { emittedActions: 0, skippedExisting };
  }

  await reactor.execute(driveId, branch, actions, signal);
  return { emittedActions: actions.length, skippedExisting };
}

function toAddRelationshipAction(driveId: string, node: Node): Action {
  const parentId = node.parentFolder ?? driveId;
  const metadata: Record<string, unknown> =
    node.kind === "folder"
      ? { kind: "folder", name: node.name }
      : { kind: "file" };
  return addRelationshipAction(
    parentId,
    node.id,
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

  function visit(node: Node): void {
    if (visited.has(node.id)) return;
    if (node.parentFolder) {
      const parent = byId.get(node.parentFolder);
      if (parent) visit(parent);
    }
    visited.add(node.id);
    ordered.push(node);
  }

  for (const node of nodes) {
    visit(node);
  }
  return ordered;
}
