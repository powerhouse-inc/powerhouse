import type { AttachmentHash } from "@powerhousedao/reactor";
import type {
  ILocalAttachmentBackend,
  LocalAttachmentRecord,
} from "./types.js";

/**
 * The in-realm memory twin of {@link IdbAttachmentBackend}.
 *
 * It exists so the whole {@link LocalAttachmentStore} contract -- and the
 * replicator above it -- is testable in Node without an IndexedDB shim, and so
 * a reactor that wants a deliberately ephemeral attachment store (a test, a
 * throwaway monitor reactor) has one. The backend contract suite runs against
 * this and against the IndexedDB backend, so the two answer identically.
 *
 * Records are copied in and out: a caller mutating a returned record must not
 * be able to change what the store holds, which is the behaviour a real
 * persistence layer has for free.
 */
export class MemoryAttachmentBackend implements ILocalAttachmentBackend {
  private readonly records = new Map<string, LocalAttachmentRecord>();
  private readonly blobs = new Map<string, Uint8Array>();

  readRecord(hash: AttachmentHash): Promise<LocalAttachmentRecord | undefined> {
    const record = this.records.get(hash);
    return Promise.resolve(record ? { ...record } : undefined);
  }

  write(record: LocalAttachmentRecord, bytes: Uint8Array): Promise<void> {
    this.records.set(record.hash, { ...record });
    this.blobs.set(record.hash, bytes.slice());
    return Promise.resolve();
  }

  readBytes(hash: AttachmentHash): Promise<Uint8Array | undefined> {
    const bytes = this.blobs.get(hash);
    return Promise.resolve(bytes ? bytes.slice() : undefined);
  }

  evict(record: LocalAttachmentRecord): Promise<void> {
    this.records.set(record.hash, { ...record });
    this.blobs.delete(record.hash);
    return Promise.resolve();
  }

  touch(hash: AttachmentHash, lastAccessedAtUtc: string): Promise<void> {
    const record = this.records.get(hash);
    if (record) {
      this.records.set(hash, { ...record, lastAccessedAtUtc });
    }
    return Promise.resolve();
  }

  availableBytes(): Promise<number> {
    let total = 0;
    for (const record of this.records.values()) {
      if (record.status === "available") {
        total += record.sizeBytes;
      }
    }
    return Promise.resolve(total);
  }

  close(): Promise<void> {
    this.records.clear();
    this.blobs.clear();
    return Promise.resolve();
  }
}
