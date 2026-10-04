import { describe, expect, it } from "vitest";
import {
  IdbAttachmentBackend,
  MemoryAttachmentBackend,
  type ILocalAttachmentBackend,
  type LocalAttachmentRecord,
} from "../../../src/storage/local/index.js";

/**
 * The {@link ILocalAttachmentBackend} contract, run against every backend.
 *
 * The memory twin runs in Node unconditionally. The IndexedDB backend runs in
 * the SAME suite whenever the realm has an `indexedDB` -- a browser pass, or a
 * Node run with a shim registered -- so the two can never answer differently
 * without a test failing. The repo has no `fake-indexeddb`, so in a plain Node
 * run the IndexedDB rows are skipped and reported as skipped rather than
 * silently absent; that is the browser-pass item for W3.4.
 */
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function record(
  hash: string,
  overrides: Partial<LocalAttachmentRecord> = {},
): LocalAttachmentRecord {
  return {
    hash,
    mimeType: "text/plain",
    fileName: "note.txt",
    sizeBytes: 3,
    extension: ".txt",
    status: "available",
    source: "sync",
    createdAtUtc: "2026-01-01T00:00:00.000Z",
    lastAccessedAtUtc: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const hasIndexedDb = typeof globalThis.indexedDB !== "undefined";

const backends: Array<{
  name: string;
  skip: boolean;
  create: () => ILocalAttachmentBackend;
}> = [
  { name: "memory", skip: false, create: () => new MemoryAttachmentBackend() },
  {
    name: "indexeddb",
    skip: !hasIndexedDb,
    create: () =>
      new IdbAttachmentBackend({
        databaseName: `ph-attachments-contract-${Math.random().toString(36).slice(2)}`,
      }),
  },
];

for (const backend of backends) {
  const suite = backend.skip ? describe.skip : describe;

  suite(`ILocalAttachmentBackend contract (${backend.name})`, () => {
    it("returns undefined for an unknown hash", async () => {
      const store = backend.create();
      expect(await store.readRecord(HASH_A)).toBeUndefined();
      expect(await store.readBytes(HASH_A)).toBeUndefined();
      await store.close();
    });

    it("writes a record and its bytes together and reads both back", async () => {
      const store = backend.create();
      const bytes = new Uint8Array([1, 2, 3]);
      await store.write(record(HASH_A), bytes);

      const read = await store.readRecord(HASH_A);
      expect(read?.hash).toBe(HASH_A);
      expect(read?.status).toBe("available");
      expect(read?.fileName).toBe("note.txt");
      expect([...(await store.readBytes(HASH_A))!]).toEqual([1, 2, 3]);
      await store.close();
    });

    it("replaces a record and its bytes on a second write", async () => {
      const store = backend.create();
      await store.write(record(HASH_A), new Uint8Array([1]));
      await store.write(
        record(HASH_A, { fileName: "replaced.txt", sizeBytes: 2 }),
        new Uint8Array([9, 9]),
      );

      expect((await store.readRecord(HASH_A))?.fileName).toBe("replaced.txt");
      expect([...(await store.readBytes(HASH_A))!]).toEqual([9, 9]);
      await store.close();
    });

    it("evict keeps the record and drops the bytes", async () => {
      const store = backend.create();
      await store.write(record(HASH_A), new Uint8Array([1, 2, 3]));
      await store.evict(record(HASH_A, { status: "evicted" }));

      expect((await store.readRecord(HASH_A))?.status).toBe("evicted");
      expect(await store.readBytes(HASH_A)).toBeUndefined();
      await store.close();
    });

    it("touch updates only the access time of an existing record", async () => {
      const store = backend.create();
      await store.write(record(HASH_A), new Uint8Array([1]));
      await store.touch(HASH_A, "2026-02-02T00:00:00.000Z");

      const read = await store.readRecord(HASH_A);
      expect(read?.lastAccessedAtUtc).toBe("2026-02-02T00:00:00.000Z");
      expect(read?.createdAtUtc).toBe("2026-01-01T00:00:00.000Z");
      await store.close();
    });

    it("touch on an unknown hash is a no-op", async () => {
      const store = backend.create();
      await store.touch(HASH_A, "2026-02-02T00:00:00.000Z");
      expect(await store.readRecord(HASH_A)).toBeUndefined();
      await store.close();
    });

    it("availableBytes sums only available records", async () => {
      const store = backend.create();
      expect(await store.availableBytes()).toBe(0);

      await store.write(record(HASH_A, { sizeBytes: 10 }), new Uint8Array(10));
      await store.write(record(HASH_B, { sizeBytes: 7 }), new Uint8Array(7));
      expect(await store.availableBytes()).toBe(17);

      await store.evict(record(HASH_B, { sizeBytes: 7, status: "evicted" }));
      expect(await store.availableBytes()).toBe(10);
      await store.close();
    });

    it("does not hand out a record a caller can mutate in place", async () => {
      const store = backend.create();
      await store.write(record(HASH_A), new Uint8Array([1]));

      const first = await store.readRecord(HASH_A);
      first!.fileName = "tampered.txt";
      expect((await store.readRecord(HASH_A))?.fileName).toBe("note.txt");
      await store.close();
    });
  });
}

describe("IdbAttachmentBackend without a realm IndexedDB", () => {
  it("fails by naming the missing capability rather than on a bare undefined", async () => {
    const store = new IdbAttachmentBackend({
      indexedDB: undefined,
      databaseName: "ph-attachments-missing",
    });
    // Only reachable in a realm that genuinely has none; where one exists the
    // explicit `undefined` still falls back to the global, so assert on the
    // branch that actually applies.
    if (hasIndexedDb) {
      expect(await store.readRecord(HASH_A)).toBeUndefined();
      await store.close();
      return;
    }
    await expect(store.readRecord(HASH_A)).rejects.toThrow(
      /No IndexedDB in this realm/,
    );
  });

  it("refuses to reopen after close", async () => {
    const store = new MemoryAttachmentBackend();
    await store.close();
    // The memory twin has nothing to refuse; the IndexedDB one does.
    expect(await store.readRecord(HASH_A)).toBeUndefined();

    const idb = new IdbAttachmentBackend({ databaseName: "ph-closed" });
    await idb.close();
    await expect(idb.readRecord(HASH_A)).rejects.toThrow(/is closed/);
  });
});
