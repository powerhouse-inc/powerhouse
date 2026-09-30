import type { OperationIndexEntry } from "../cache/operation-index-types.js";
import type {
  ISyncCursorStorage,
  ISyncHoldStorage,
} from "../storage/interfaces.js";
import type { Remote } from "./interfaces.js";
import type { ConnectionState } from "./types.js";
import { filterOperations, toOperationWithContext } from "./utils.js";

export type PendingDelivery = {
  remote: string;
  state: ConnectionState | "held";
};

/** No sync manager while sync_remotes has rows means not converged. */
export interface IDeliveryTracking {
  /** Remotes that have not acknowledged ordinal for documentId's collections. */
  pendingDelivery(
    documentId: string,
    ordinal: number,
  ): Promise<PendingDelivery[]>;
}

export function supportsDeliveryTracking(x: unknown): x is IDeliveryTracking {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { pendingDelivery?: unknown }).pendingDelivery === "function"
  );
}

export type DeliveryMembership = {
  collectionId: string;
  joinedOrdinal: number;
  leftOrdinal: number | null;
};

export type DeliveryRow = {
  entry: OperationIndexEntry;
  memberships: DeliveryMembership[];
};

/** The index row at an ordinal and every membership of its document. */
export type DeliveryLookup = {
  at(documentId: string, ordinal: number): Promise<DeliveryRow | undefined>;
};

export type DeliveryDeps = {
  remotes: readonly Remote[];
  cursors: ISyncCursorStorage;
  holds: ISyncHoldStorage;
  lookup: DeliveryLookup;
};

/** The outbox's rule: remotes it would serve the row to, not yet acknowledged. */
export async function pendingDelivery(
  deps: DeliveryDeps,
  documentId: string,
  ordinal: number,
): Promise<PendingDelivery[]> {
  const row = await deps.lookup.at(documentId, ordinal);
  if (!row) {
    throw new Error(
      `No operation of document ${documentId} at ordinal ${ordinal}`,
    );
  }
  const { entry, memberships } = row;
  const operation = toOperationWithContext(entry);
  const holds = await deps.holds.list({ documentId });

  const pending: PendingDelivery[] = [];
  for (const remote of deps.remotes) {
    const name = remote.meta.name;
    const membership = memberships.find(
      (candidate) =>
        candidate.collectionId === remote.meta.collectionId.key &&
        (candidate.leftOrdinal === null || ordinal < candidate.leftOrdinal),
    );
    if (!membership) continue;
    if (entry.sourceRemote === name) continue;
    if (filterOperations([operation], remote.meta.filter).length === 0) {
      continue;
    }

    const held = holds.some(
      (hold) => hold.remoteName === name && hold.branch === entry.branch,
    );
    if (held) {
      pending.push({ remote: name, state: "held" });
      continue;
    }

    // A later join re-serves rows at or below the cursor (the joiner branch).
    const owedThrough = Math.max(ordinal, membership.joinedOrdinal);
    const cursor = await deps.cursors.get(name, "outbox");
    if (cursor.cursorOrdinal < owedThrough) {
      pending.push({
        remote: name,
        state: remote.channel.getConnectionState().state,
      });
    }
  }
  return pending;
}
