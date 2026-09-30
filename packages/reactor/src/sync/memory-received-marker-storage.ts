import type {
  ISyncReceivedMarkerStorage,
  ReceivedMarkerRecord,
} from "../storage/interfaces.js";

const keyOf = (remoteName: string, markerId: string) =>
  `${remoteName}\u0000${markerId}`;

/** For a sync manager built without a database. */
export class InMemorySyncReceivedMarkerStorage implements ISyncReceivedMarkerStorage {
  private readonly records = new Map<string, ReceivedMarkerRecord>();

  list(remoteName: string): Promise<ReceivedMarkerRecord[]> {
    return Promise.resolve(
      [...this.records.values()].filter(
        (record) => record.remoteName === remoteName,
      ),
    );
  }

  upsert(record: ReceivedMarkerRecord): Promise<void> {
    const key = keyOf(record.remoteName, record.markerId);
    if (!this.records.has(key)) this.records.set(key, record);
    return Promise.resolve();
  }

  remove(remoteName: string, markerId: string): Promise<void> {
    this.records.delete(keyOf(remoteName, markerId));
    return Promise.resolve();
  }

  removeRemote(remoteName: string): Promise<void> {
    for (const [key, record] of this.records) {
      if (record.remoteName === remoteName) this.records.delete(key);
    }
    return Promise.resolve();
  }
}
