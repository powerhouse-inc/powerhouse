import { MessageChannel } from "node:worker_threads";
import {
  messagePortTransport,
  type LocalChannelPort,
  type MessagePortLike,
} from "@powerhousedao/reactor";
import { afterEach, describe, expect, it } from "vitest";
import {
  attachmentReferenceAuthorizer,
  LocalAttachmentServer,
  LocalAttachmentTransport,
} from "../../src/local/index.js";
import { sha256Hex } from "../../src/replication/hash.js";
import {
  LocalAttachmentStore,
  MemoryAttachmentBackend,
  streamFromBytes,
} from "../../src/storage/local/index.js";
import { NullAttachmentTransport } from "../../src/null-attachment-transport.js";
import type { AttachmentMetadata } from "../../src/types.js";
import type { IAttachmentReferenceReader } from "../../src/read-models/attachment-reference/types.js";

const DOC = "document-1";

function metadata(sizeBytes: number): AttachmentMetadata {
  return {
    mimeType: "application/octet-stream",
    fileName: "blob.bin",
    sizeBytes,
    extension: null,
    createdAtUtc: "2026-01-01T00:00:00.000Z",
  };
}

async function readAll(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

type Link = {
  portA: LocalChannelPort;
  portB: LocalChannelPort;
  dispose: () => void;
};

/** A real `node:worker_threads` MessageChannel pair, wrapped as the reactor's port. */
function link(): Link {
  const channel = new MessageChannel();
  channel.port1.unref();
  channel.port2.unref();
  const portA = messagePortTransport(
    channel.port1 as unknown as MessagePortLike,
  );
  const portB = messagePortTransport(
    channel.port2 as unknown as MessagePortLike,
  );
  return {
    portA,
    portB,
    dispose: () => {
      portA.close();
      portB.close();
    },
  };
}

describe("LocalAttachmentTransport over a MessageChannel", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  async function pair(options: {
    bytes: Uint8Array;
    seed?: boolean;
    authorizeFor?: IAttachmentReferenceReader;
    chunkSizeBytes?: number;
  }): Promise<{
    hash: string;
    holder: LocalAttachmentStore;
    puller: LocalAttachmentTransport;
    server: LocalAttachmentServer;
  }> {
    const hash = await sha256Hex(options.bytes);
    const holder = new LocalAttachmentStore(
      new MemoryAttachmentBackend(),
      new NullAttachmentTransport(),
    );
    if (options.seed !== false) {
      await holder.putLocal(
        hash,
        metadata(options.bytes.byteLength),
        streamFromBytes(options.bytes),
      );
    }

    const channel = link();
    cleanups.push(channel.dispose);

    const server = new LocalAttachmentServer({
      port: channel.portA,
      store: holder,
      ...(options.authorizeFor
        ? { authorize: attachmentReferenceAuthorizer(options.authorizeFor) }
        : {}),
      ...(options.chunkSizeBytes !== undefined
        ? { chunkSizeBytes: options.chunkSizeBytes }
        : {}),
    });
    const puller = new LocalAttachmentTransport({ port: channel.portB });
    cleanups.push(() => {
      server.close();
      puller.close();
    });

    return { hash, holder, puller, server };
  }

  it("round-trips bytes from the peer that holds them", async () => {
    const bytes = new TextEncoder().encode("a local attachment payload");
    const { hash, puller, server } = await pair({ bytes });

    const result = await puller.fetch(hash, DOC);
    expect(result.kind).toBe("data");
    if (result.kind !== "data") return;

    expect(result.response.hash).toBe(hash);
    expect(result.response.metadata.fileName).toBe("blob.bin");
    expect([...(await readAll(result.response.body))]).toEqual([...bytes]);
    expect(server.stats().served).toBe(1);
    expect(server.stats().bytesServed).toBe(bytes.byteLength);
  });

  it("reassembles a body that crosses many chunk messages", async () => {
    const bytes = new Uint8Array(5_000);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = i % 251;
    }
    const { hash, puller } = await pair({ bytes, chunkSizeBytes: 512 });

    const result = await puller.fetch(hash, DOC);
    expect(result.kind).toBe("data");
    if (result.kind !== "data") return;

    const received = await readAll(result.response.body);
    expect(received.byteLength).toBe(bytes.byteLength);
    expect(await sha256Hex(received)).toBe(hash);
  });

  it("answers not-found for a hash the peer does not hold", async () => {
    const bytes = new TextEncoder().encode("never stored");
    const { hash, puller } = await pair({ bytes, seed: false });

    await expect(puller.fetch(hash, DOC)).resolves.toEqual({
      kind: "not-found",
    });
  });

  it("answers not-found when the peer's reference index does not authorize the document", async () => {
    const bytes = new TextEncoder().encode("authorized payload");
    const indexed = new Set<string>();
    const reader: IAttachmentReferenceReader = {
      hasReference: (documentId, ref) =>
        Promise.resolve(indexed.has(`${documentId}|${ref}`)),
      referencingScopes: () => Promise.resolve([]),
    };
    const { hash, puller } = await pair({ bytes, authorizeFor: reader });

    // The lagging-index case: the peer HOLDS the bytes but has not indexed the
    // reference yet, which is answered as not-found, exactly as an absent hash.
    await expect(puller.fetch(hash, DOC)).resolves.toEqual({
      kind: "not-found",
    });

    indexed.add(`${DOC}|attachment://v1:${hash}`);
    const result = await puller.fetch(hash, DOC);
    expect(result.kind).toBe("data");
  });

  it("keeps two concurrent fetches apart", async () => {
    const first = new TextEncoder().encode("first payload");
    const second = new TextEncoder().encode("the second, different payload");
    const holder = new LocalAttachmentStore(
      new MemoryAttachmentBackend(),
      new NullAttachmentTransport(),
    );
    const hashA = await sha256Hex(first);
    const hashB = await sha256Hex(second);
    await holder.putLocal(
      hashA,
      metadata(first.byteLength),
      streamFromBytes(first),
    );
    await holder.putLocal(
      hashB,
      metadata(second.byteLength),
      streamFromBytes(second),
    );

    const channel = link();
    cleanups.push(channel.dispose);
    const server = new LocalAttachmentServer({
      port: channel.portA,
      store: holder,
      chunkSizeBytes: 4,
    });
    const puller = new LocalAttachmentTransport({ port: channel.portB });
    cleanups.push(() => {
      server.close();
      puller.close();
    });

    const [resultA, resultB] = await Promise.all([
      puller.fetch(hashA, DOC),
      puller.fetch(hashB, DOC),
    ]);
    expect(resultA.kind).toBe("data");
    expect(resultB.kind).toBe("data");
    if (resultA.kind !== "data" || resultB.kind !== "data") return;

    const [bodyA, bodyB] = await Promise.all([
      readAll(resultA.response.body),
      readAll(resultB.response.body),
    ]);
    expect(await sha256Hex(bodyA)).toBe(hashA);
    expect(await sha256Hex(bodyB)).toBe(hashB);
  });

  it("does not match the peer's own replies to its own requests", async () => {
    // Both ends run both halves on one port, and both id counters start at 1.
    // The per-instance nonce is what keeps one side's reply out of the other
    // side's pending map.
    const bytesA = new TextEncoder().encode("held by A");
    const bytesB = new TextEncoder().encode("held by B, a different payload");
    const hashA = await sha256Hex(bytesA);
    const hashB = await sha256Hex(bytesB);

    const storeA = new LocalAttachmentStore(
      new MemoryAttachmentBackend(),
      new NullAttachmentTransport(),
    );
    const storeB = new LocalAttachmentStore(
      new MemoryAttachmentBackend(),
      new NullAttachmentTransport(),
    );
    await storeA.putLocal(
      hashA,
      metadata(bytesA.byteLength),
      streamFromBytes(bytesA),
    );
    await storeB.putLocal(
      hashB,
      metadata(bytesB.byteLength),
      streamFromBytes(bytesB),
    );

    const channel = link();
    cleanups.push(channel.dispose);
    const serverA = new LocalAttachmentServer({
      port: channel.portA,
      store: storeA,
    });
    const transportA = new LocalAttachmentTransport({ port: channel.portA });
    const serverB = new LocalAttachmentServer({
      port: channel.portB,
      store: storeB,
    });
    const transportB = new LocalAttachmentTransport({ port: channel.portB });
    cleanups.push(() => {
      serverA.close();
      transportA.close();
      serverB.close();
      transportB.close();
    });

    const [fromB, fromA] = await Promise.all([
      transportA.fetch(hashB, DOC),
      transportB.fetch(hashA, DOC),
    ]);
    expect(fromB.kind).toBe("data");
    expect(fromA.kind).toBe("data");
    if (fromB.kind !== "data" || fromA.kind !== "data") return;

    expect(await sha256Hex(await readAll(fromB.response.body))).toBe(hashB);
    expect(await sha256Hex(await readAll(fromA.response.body))).toBe(hashA);
  });

  it("refuses an abort before the request leaves and after it is in flight", async () => {
    const bytes = new TextEncoder().encode("abortable payload");
    const { hash, puller } = await pair({ bytes });

    const aborted = new AbortController();
    aborted.abort();
    await expect(puller.fetch(hash, DOC, aborted.signal)).rejects.toThrow(
      /aborted/,
    );

    const live = new AbortController();
    const inFlight = puller.fetch(hash, DOC, live.signal);
    live.abort();
    await expect(inFlight).rejects.toThrow(/aborted/);
  });

  it("fails an in-flight fetch when the transport is closed", async () => {
    const bytes = new TextEncoder().encode("payload");
    const channel = link();
    cleanups.push(channel.dispose);
    const puller = new LocalAttachmentTransport({ port: channel.portB });
    const hash = await sha256Hex(bytes);

    // No server on the other end, so nothing ever answers.
    const inFlight = puller.fetch(hash, DOC);
    puller.close();
    await expect(inFlight).rejects.toThrow(/closed/);
    await expect(puller.fetch(hash, DOC)).rejects.toThrow(/closed/);
  });

  it("gives up on a silent peer at the request timeout", async () => {
    const bytes = new TextEncoder().encode("payload");
    const hash = await sha256Hex(bytes);
    const channel = link();
    cleanups.push(channel.dispose);
    const puller = new LocalAttachmentTransport({
      port: channel.portB,
      requestTimeoutMs: 10,
    });
    cleanups.push(() => puller.close());

    await expect(puller.fetch(hash, DOC)).rejects.toThrow(/went silent/);
  });

  it("is pull-only: announce is a no-op and push refuses by name", async () => {
    const bytes = new TextEncoder().encode("payload");
    const { puller } = await pair({ bytes });
    await expect(puller.announce()).resolves.toBeUndefined();
    await expect(puller.push()).rejects.toThrow(/pull-only/);
  });
});
