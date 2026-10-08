import { describe, expect, it, vi } from "vitest";
import { AttachmentNotFound, AttachmentPending } from "../../../src/errors.js";
import type { IAttachmentTransport } from "../../../src/interfaces.js";
import {
  LocalAttachmentStore,
  MemoryAttachmentBackend,
  streamFromBytes,
} from "../../../src/storage/local/index.js";
import type {
  AttachmentMetadata,
  TransportFetchResult,
} from "../../../src/types.js";

const HASH = "c".repeat(64);
const DOC = "document-1";

function metadata(
  overrides: Partial<AttachmentMetadata> = {},
): AttachmentMetadata {
  return {
    mimeType: "text/plain",
    fileName: "note.txt",
    sizeBytes: 3,
    extension: ".txt",
    createdAtUtc: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function transport(
  result: TransportFetchResult = { kind: "not-found" },
): IAttachmentTransport & { calls: Array<[string, string]> } {
  const calls: Array<[string, string]> = [];
  return {
    calls,
    fetch: (hash: string, documentId: string) => {
      calls.push([hash, documentId]);
      return Promise.resolve(result);
    },
    announce: () => Promise.resolve(),
    push: () => Promise.resolve(),
  };
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<number[]> {
  const reader = stream.getReader();
  const out: number[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.push(...value);
  }
  return out;
}

function store(result?: TransportFetchResult): {
  store: LocalAttachmentStore;
  transport: ReturnType<typeof transport>;
} {
  const t = transport(result);
  return {
    store: new LocalAttachmentStore(new MemoryAttachmentBackend(), t),
    transport: t,
  };
}

describe("LocalAttachmentStore", () => {
  it("stat on an unknown hash throws AttachmentNotFound", async () => {
    const { store: s } = store();
    await expect(s.stat(HASH)).rejects.toBeInstanceOf(AttachmentNotFound);
  });

  it("put then has/stat/get serves the bytes locally", async () => {
    const { store: s, transport: t } = store();
    await s.put(HASH, metadata(), streamFromBytes(new Uint8Array([1, 2, 3])));

    expect(await s.has(HASH)).toBe(true);
    const header = await s.stat(HASH);
    expect(header.status).toBe("available");
    expect(header.source).toBe("sync");
    expect(header.expiresAtUtc).toBeNull();
    expect(header.createdAtUtc).toBe("2026-01-01T00:00:00.000Z");

    const response = await s.get(HASH);
    expect(await readAll(response.body)).toEqual([1, 2, 3]);
    // Nothing remote was needed.
    expect(t.calls).toEqual([]);
  });

  it("records the measured byte length rather than the declared sizeBytes", async () => {
    const { store: s } = store();
    // A lying producer: four bytes declared as 400.
    await s.put(
      HASH,
      metadata({ sizeBytes: 400 }),
      streamFromBytes(new Uint8Array([1, 2, 3, 4])),
    );
    expect((await s.stat(HASH)).sizeBytes).toBe(4);
    expect(await s.storageUsed()).toBe(4);
  });

  it("put is a dedup no-op for an already-available hash and cancels the stream", async () => {
    const { store: s } = store();
    await s.put(HASH, metadata(), streamFromBytes(new Uint8Array([1, 2, 3])));

    const cancel = vi.fn();
    const second = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([9, 9, 9, 9]));
        controller.close();
      },
      cancel,
    });
    await s.put(HASH, metadata({ fileName: "other.txt" }), second);

    expect(cancel).toHaveBeenCalledTimes(1);
    const header = await s.stat(HASH);
    expect(header.fileName).toBe("note.txt");
    expect(header.sizeBytes).toBe(3);
  });

  it("putLocal marks provenance local, and a later put does not rewrite it", async () => {
    const { store: s } = store();
    await s.putLocal(
      HASH,
      metadata(),
      streamFromBytes(new Uint8Array([1, 2, 3])),
    );
    expect((await s.stat(HASH)).source).toBe("local");

    await s.evict(HASH);
    await s.put(HASH, metadata(), streamFromBytes(new Uint8Array([1, 2, 3])));
    // Restoring an evicted row keeps the provenance it was first stored with.
    expect((await s.stat(HASH)).source).toBe("local");
  });

  it("bumps lastAccessedAtUtc on get but not on stat", async () => {
    let first = true;
    const clock = (): Date => {
      if (first) {
        first = false;
        return new Date("2026-01-01T00:00:00.000Z");
      }
      return new Date("2026-03-03T00:00:00.000Z");
    };
    const s = new LocalAttachmentStore(
      new MemoryAttachmentBackend(),
      transport(),
      clock,
    );
    await s.put(HASH, metadata(), streamFromBytes(new Uint8Array([1, 2, 3])));

    expect((await s.stat(HASH)).lastAccessedAtUtc).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    const response = await s.get(HASH);
    expect(response.header.lastAccessedAtUtc).toBe("2026-03-03T00:00:00.000Z");
    expect((await s.stat(HASH)).lastAccessedAtUtc).toBe(
      "2026-03-03T00:00:00.000Z",
    );
  });

  it("evict drops the bytes, keeps the hash known, and stops counting the size", async () => {
    const { store: s } = store();
    await s.put(HASH, metadata(), streamFromBytes(new Uint8Array([1, 2, 3])));
    expect(await s.storageUsed()).toBe(3);

    await s.evict(HASH);
    expect(await s.has(HASH)).toBe(false);
    expect((await s.stat(HASH)).status).toBe("evicted");
    expect(await s.storageUsed()).toBe(0);
  });

  it("evict is idempotent and a no-op for an unknown hash", async () => {
    const { store: s } = store();
    await s.evict(HASH);
    await s.put(HASH, metadata(), streamFromBytes(new Uint8Array([1, 2, 3])));
    await s.evict(HASH);
    await s.evict(HASH);
    expect((await s.stat(HASH)).status).toBe("evicted");
  });

  it("an in-flight read survives an eviction, because get snapshots the bytes", async () => {
    const { store: s } = store();
    await s.put(HASH, metadata(), streamFromBytes(new Uint8Array([1, 2, 3])));

    const response = await s.get(HASH);
    await s.evict(HASH);
    expect(await readAll(response.body)).toEqual([1, 2, 3]);
  });

  it("get without a documentId refuses rather than reaching the transport", async () => {
    const { store: s, transport: t } = store({
      kind: "data",
      response: {
        hash: HASH,
        metadata: metadata(),
        body: streamFromBytes(new Uint8Array([7, 7, 7])),
      },
    });
    await expect(s.get(HASH)).rejects.toBeInstanceOf(AttachmentNotFound);
    expect(t.calls).toEqual([]);
  });

  it("get of an unknown hash with a documentId restores it through the transport", async () => {
    const { store: s, transport: t } = store({
      kind: "data",
      response: {
        hash: HASH,
        metadata: metadata({ createdAtUtc: "2025-05-05T00:00:00.000Z" }),
        body: streamFromBytes(new Uint8Array([7, 7, 7])),
      },
    });

    const response = await s.get(HASH, undefined, DOC);
    expect(await readAll(response.body)).toEqual([7, 7, 7]);
    expect(t.calls).toEqual([[HASH, DOC]]);
    // Persisted, so the next read is local and keeps the origin's create time.
    expect(await s.has(HASH)).toBe(true);
    expect((await s.stat(HASH)).createdAtUtc).toBe("2025-05-05T00:00:00.000Z");
  });

  it("get of an evicted hash re-fetches and restores it", async () => {
    const { store: s, transport: t } = store({
      kind: "data",
      response: {
        hash: HASH,
        metadata: metadata(),
        body: streamFromBytes(new Uint8Array([1, 2, 3])),
      },
    });
    await s.put(HASH, metadata(), streamFromBytes(new Uint8Array([1, 2, 3])));
    await s.evict(HASH);

    const response = await s.get(HASH, undefined, DOC);
    expect(await readAll(response.body)).toEqual([1, 2, 3]);
    expect(t.calls).toEqual([[HASH, DOC]]);
    expect(await s.has(HASH)).toBe(true);
  });

  it("raises AttachmentPending for a transport pending answer", async () => {
    const { store: s } = store({
      kind: "pending",
      hash: HASH,
      expiresAtUtc: "2026-01-01T00:05:00.000Z",
      retryAfterMs: 1000,
    });
    const error = await s.get(HASH, undefined, DOC).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AttachmentPending);
    expect((error as AttachmentPending).expiresAtUtc).toBe(
      "2026-01-01T00:05:00.000Z",
    );
  });

  it("raises AttachmentNotFound for a transport not-found answer", async () => {
    const { store: s } = store({ kind: "not-found" });
    await expect(s.get(HASH, undefined, DOC)).rejects.toBeInstanceOf(
      AttachmentNotFound,
    );
  });

  it("treats an available record over missing bytes as absent and restores it", async () => {
    const backend = new MemoryAttachmentBackend();
    const t = transport({
      kind: "data",
      response: {
        hash: HASH,
        metadata: metadata(),
        body: streamFromBytes(new Uint8Array([4, 5, 6])),
      },
    });
    const s = new LocalAttachmentStore(backend, t);
    // A torn write: the record says available, the blob is gone.
    await backend.write(
      {
        hash: HASH,
        mimeType: "text/plain",
        fileName: "note.txt",
        sizeBytes: 3,
        extension: null,
        status: "available",
        source: "sync",
        createdAtUtc: "2026-01-01T00:00:00.000Z",
        lastAccessedAtUtc: "2026-01-01T00:00:00.000Z",
      },
      new Uint8Array([1, 2, 3]),
    );
    await backend.evict({
      hash: HASH,
      mimeType: "text/plain",
      fileName: "note.txt",
      sizeBytes: 3,
      extension: null,
      status: "available",
      source: "sync",
      createdAtUtc: "2026-01-01T00:00:00.000Z",
      lastAccessedAtUtc: "2026-01-01T00:00:00.000Z",
    });

    const response = await s.get(HASH, undefined, DOC);
    expect(await readAll(response.body)).toEqual([4, 5, 6]);
    expect(t.calls).toEqual([[HASH, DOC]]);
  });
});
