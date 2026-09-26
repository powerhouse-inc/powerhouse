import type {
  ISyncHoldStorage,
  SyncHoldRecord,
} from "../storage/interfaces.js";

const keyOf = (remoteName: string, documentId: string, branch: string) =>
  `${remoteName}\u0000${documentId}\u0000${branch}`;

/** For a sync manager built without a database. */
export class InMemorySyncHoldStorage implements ISyncHoldStorage {
  private readonly holds = new Map<string, SyncHoldRecord>();

  list(
    filter: { remoteName?: string; documentId?: string } = {},
  ): Promise<SyncHoldRecord[]> {
    return Promise.resolve(
      [...this.holds.values()].filter(
        (hold) =>
          (filter.remoteName === undefined ||
            hold.remoteName === filter.remoteName) &&
          (filter.documentId === undefined ||
            hold.documentId === filter.documentId),
      ),
    );
  }

  upsert(hold: SyncHoldRecord): Promise<void> {
    const key = keyOf(hold.remoteName, hold.documentId, hold.branch);
    const known = this.holds.get(key);
    this.holds.set(key, {
      ...hold,
      heldAtUtcMs: known?.heldAtUtcMs ?? hold.heldAtUtcMs,
    });
    return Promise.resolve();
  }

  remove(
    remoteName: string,
    documentId: string,
    branch: string,
  ): Promise<void> {
    this.holds.delete(keyOf(remoteName, documentId, branch));
    return Promise.resolve();
  }

  removeRemote(remoteName: string): Promise<void> {
    for (const [key, hold] of this.holds) {
      if (hold.remoteName === remoteName) this.holds.delete(key);
    }
    return Promise.resolve();
  }
}
