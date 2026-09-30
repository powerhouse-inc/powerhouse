import type {
  ISyncPurgeRefusalStorage,
  PurgeRefusalRecord,
} from "../storage/interfaces.js";

const keyOf = (refusal: PurgeRefusalRecord) =>
  `${refusal.remoteName}\u0000${refusal.documentId}\u0000${refusal.branch}`;

/** For a sync manager built without a database. */
export class InMemorySyncPurgeRefusalStorage implements ISyncPurgeRefusalStorage {
  private readonly records = new Map<string, PurgeRefusalRecord>();

  list(documentId: string): Promise<PurgeRefusalRecord[]> {
    return Promise.resolve(
      [...this.records.values()].filter(
        (record) => record.documentId === documentId,
      ),
    );
  }

  record(refusals: readonly PurgeRefusalRecord[]): Promise<void> {
    for (const refusal of refusals) {
      const key = keyOf(refusal);
      if (!this.records.has(key)) this.records.set(key, refusal);
    }
    return Promise.resolve();
  }
}
