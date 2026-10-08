import { MessageChannel } from "node:worker_threads";
import {
  messagePortTransport,
  type LocalChannelPort,
  type MessagePortLike,
} from "@powerhousedao/reactor";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LocalAttachmentServer,
  LocalAttachmentTransport,
} from "../../src/local/index.js";
import { byReference, TEST_LINK } from "./authorizers.js";
import { LOCAL_ATTACHMENT_PROTOCOL } from "../../src/local/protocol.js";
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

const indexesEverything: IAttachmentReferenceReader = {
  hasReference: () => Promise.resolve(true),
  referencingScopes: () => Promise.resolve(["global"]),
};
const allowAll = byReference(indexesEverything);

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
      link: TEST_LINK,
      store: holder,
      authorize: byReference(options.authorizeFor ?? indexesEverything),
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

  it("refuses a read when no authorizer is configured", async () => {
    const bytes = new TextEncoder().encode("held but never authorized");
    const hash = await sha256Hex(bytes);
    const holder = new LocalAttachmentStore(
      new MemoryAttachmentBackend(),
      new NullAttachmentTransport(),
    );
    await holder.putLocal(
      hash,
      metadata(bytes.byteLength),
      streamFromBytes(bytes),
    );
    const has = vi.spyOn(holder, "has");
    const channel = link();
    const server = new LocalAttachmentServer({
      port: channel.portA,
      link: TEST_LINK,
      store: holder,
    });
    const puller = new LocalAttachmentTransport({ port: channel.portB });
    cleanups.push(() => {
      server.close();
      puller.close();
      channel.dispose();
    });

    await expect(puller.fetch(hash, DOC)).resolves.toEqual({
      kind: "not-found",
    });
    expect(server.stats()).toEqual({ served: 0, bytesServed: 0, refused: 1 });
    expect(has).not.toHaveBeenCalled();
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
      link: TEST_LINK,
      store: holder,
      authorize: allowAll,
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
      link: TEST_LINK,
      store: storeA,
      authorize: allowAll,
    });
    const transportA = new LocalAttachmentTransport({ port: channel.portA });
    const serverB = new LocalAttachmentServer({
      port: channel.portB,
      link: TEST_LINK,
      store: storeB,
      authorize: allowAll,
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

  it("fails the fetch and frees the slot when the peer ends before it begins", async () => {
    // A terminal reply with no preceding `begin` left the fetch promise
    // unsettled and the pending entry leaked, hanging the fetch and starving a
    // concurrency slot forever (W3.4 review finding 8). Three such must not
    // wedge the transport: a later fetch still gets answered.
    const fake = fakePort();
    const puller = new LocalAttachmentTransport({
      port: fake.port,
      requestTimeoutMs: 10_000,
    });
    cleanups.push(() => puller.close());

    for (let i = 0; i < 3; i += 1) {
      const inFlight = puller.fetch(`${"a".repeat(64)}`, DOC);
      const request = fake.takeFetch();
      fake.deliver({
        protocol: LOCAL_ATTACHMENT_PROTOCOL,
        kind: "end",
        id: request.id,
      });
      await expect(inFlight).rejects.toThrow(/before announcing/);
    }

    // Nothing is wedged: a fresh fetch is still accepted and answered.
    const live = puller.fetch(`${"b".repeat(64)}`, DOC);
    const liveRequest = fake.takeFetch();
    fake.deliver({
      protocol: LOCAL_ATTACHMENT_PROTOCOL,
      kind: "not-found",
      id: liveRequest.id,
    });
    await expect(live).resolves.toEqual({ kind: "not-found" });
  });
});

/**
 * A `LocalChannelPort` whose outgoing messages a test can read and whose
 * incoming messages a test injects by hand, for driving raw protocol edge
 * cases a real peer would never send.
 */
function fakePort(): {
  port: LocalChannelPort;
  deliver: (message: unknown) => void;
  takeFetch: () => { id: string };
  sent: Array<Record<string, unknown>>;
} {
  let handler: ((data: unknown) => void) | undefined;
  const sent: Array<Record<string, unknown>> = [];
  return {
    port: {
      postMessage: (data: unknown) => {
        sent.push(data as Record<string, unknown>);
      },
      onMessage: (callback: (data: unknown) => void) => {
        handler = callback;
        return () => {
          handler = undefined;
        };
      },
      close: () => {
        handler = undefined;
      },
    },
    deliver: (message: unknown) => handler?.(message),
    sent,
    takeFetch: () => {
      const message = sent.find((entry) => entry.kind === "fetch");
      if (!message) {
        throw new Error("no fetch request was posted");
      }
      sent.splice(sent.indexOf(message), 1);
      return { id: message.id as string };
    },
  };
}

describe("LocalAttachmentServer cancellation tracking (W3.4 finding 9)", () => {
  type ServerState = { cancelled: Set<string>; inFlight: Set<string> };
  const state = (server: LocalAttachmentServer): ServerState =>
    server as unknown as ServerState;

  const settle = (): Promise<void> =>
    new Promise<void>((resolve) => setTimeout(resolve, 0));

  it("ignores cancels for requests that were never in flight, and close clears the set", () => {
    const fake = fakePort();
    const server = new LocalAttachmentServer({
      port: fake.port,
      link: TEST_LINK,
      store: new LocalAttachmentStore(
        new MemoryAttachmentBackend(),
        new NullAttachmentTransport(),
      ),
    });

    // Cancels for ids with no matching in-flight request used to accumulate in
    // the set forever; now they are dropped on arrival.
    for (let i = 0; i < 5; i += 1) {
      fake.deliver({
        protocol: LOCAL_ATTACHMENT_PROTOCOL,
        kind: "cancel",
        id: `ghost-${i}`,
      });
    }
    expect(state(server).cancelled.size).toBe(0);

    server.close();
    expect(state(server).cancelled.size).toBe(0);
    expect(state(server).inFlight.size).toBe(0);
  });

  it("stops posting a single-read body once the requester cancels mid-body", async () => {
    const bytes = new Uint8Array(256 * 1024);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 253;
    const hash = await sha256Hex(bytes);
    const store = new LocalAttachmentStore(
      new MemoryAttachmentBackend(),
      new NullAttachmentTransport(),
    );
    await store.putLocal(
      hash,
      metadata(bytes.byteLength),
      streamFromBytes(bytes),
    );
    const channel = link();
    let chunksPosted = 0;
    const counted: LocalChannelPort = {
      ...channel.portA,
      postMessage: (data) => {
        if ((data as { kind?: string }).kind === "chunk") chunksPosted += 1;
        channel.portA.postMessage(data);
      },
      onMessage: (callback) => channel.portA.onMessage(callback),
    };
    const chunkSizeBytes = 1024;
    const server = new LocalAttachmentServer({
      port: counted,
      link: TEST_LINK,
      store,
      authorize: allowAll,
      chunkSizeBytes,
    });
    const puller = new LocalAttachmentTransport({ port: channel.portB });

    const result = await puller.fetch(hash, DOC);
    expect(result.kind).toBe("data");
    if (result.kind !== "data") return;
    await result.response.body.cancel();

    await vi.waitFor(() => expect(state(server).inFlight.size).toBe(0));
    expect(chunksPosted).toBeLessThan(bytes.byteLength / chunkSizeBytes);
    expect(server.stats().served).toBe(0);
    server.close();
    puller.close();
    channel.dispose();
  });

  it("answers error past its concurrent serve cap", async () => {
    const fake = fakePort();
    const parked = new Promise<boolean>(() => undefined);
    const server = new LocalAttachmentServer({
      port: fake.port,
      link: TEST_LINK,
      store: new LocalAttachmentStore(
        new MemoryAttachmentBackend(),
        new NullAttachmentTransport(),
      ),
      authorize: () => parked,
      maxConcurrentServes: 2,
    });

    for (let i = 0; i < 3; i += 1) {
      fake.deliver({
        protocol: LOCAL_ATTACHMENT_PROTOCOL,
        kind: "fetch",
        id: `r${i}`,
        hash: "a".repeat(64),
        documentId: DOC,
      });
    }
    await settle();

    expect(fake.sent).toEqual([
      expect.objectContaining({ kind: "error", id: "r2" }),
    ]);
    expect(state(server).inFlight.size).toBe(2);
    server.close();
  });

  it("ignores a fetch whose id is already in flight, past the cap", async () => {
    const fake = fakePort();
    const diagnostics: string[] = [];
    const authorize = vi.fn(() => new Promise<boolean>(() => undefined));
    const server = new LocalAttachmentServer({
      port: fake.port,
      link: TEST_LINK,
      store: new LocalAttachmentStore(
        new MemoryAttachmentBackend(),
        new NullAttachmentTransport(),
      ),
      authorize,
      maxConcurrentServes: 2,
      onDiagnostic: (message) => diagnostics.push(message),
    });

    for (let i = 0; i < 5; i += 1) {
      fake.deliver({
        protocol: LOCAL_ATTACHMENT_PROTOCOL,
        kind: "fetch",
        id: "x",
        hash: i === 4 ? "bad" : "a".repeat(64),
        documentId: DOC,
      });
    }
    await settle();

    expect(authorize).toHaveBeenCalledTimes(1);
    expect(fake.sent).toEqual([]);
    expect(diagnostics).toHaveLength(4);
    expect(state(server).inFlight.size).toBe(1);
    server.close();
  });

  it.each(["authorize", "has"] as const)(
    "drops a serve cancelled while parked in %s before reading the body",
    async (parkedIn) => {
      const bytes = new TextEncoder().encode("held bytes");
      const hash = await sha256Hex(bytes);
      const store = new LocalAttachmentStore(
        new MemoryAttachmentBackend(),
        new NullAttachmentTransport(),
      );
      await store.putLocal(
        hash,
        metadata(bytes.byteLength),
        streamFromBytes(bytes),
      );
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const has = store.has.bind(store);
      vi.spyOn(store, "has").mockImplementation(async (h) => {
        if (parkedIn === "has") await gate;
        return has(h);
      });
      const get = vi.spyOn(store, "get");
      const fake = fakePort();
      const server = new LocalAttachmentServer({
        port: fake.port,
        link: TEST_LINK,
        store,
        authorize: async () => {
          if (parkedIn === "authorize") await gate;
          return true;
        },
      });

      fake.deliver({
        protocol: LOCAL_ATTACHMENT_PROTOCOL,
        kind: "fetch",
        id: "req-1",
        hash,
        documentId: DOC,
      });
      await settle();
      fake.deliver({
        protocol: LOCAL_ATTACHMENT_PROTOCOL,
        kind: "cancel",
        id: "req-1",
      });
      release();
      await settle();

      expect(get).not.toHaveBeenCalled();
      expect(fake.sent).toEqual([]);
      expect(state(server).inFlight.size).toBe(0);
      server.close();
    },
  );

  it("refuses a malformed hash or document id before the authorizer or the store sees it", async () => {
    const fake = fakePort();
    const store = new LocalAttachmentStore(
      new MemoryAttachmentBackend(),
      new NullAttachmentTransport(),
    );
    const has = vi.spyOn(store, "has");
    const authorize = vi.fn(() => Promise.resolve(true));
    const server = new LocalAttachmentServer({
      port: fake.port,
      link: TEST_LINK,
      store,
      authorize,
    });

    const probes = [
      { hash: "abc", documentId: DOC },
      { hash: "A".repeat(64), documentId: DOC },
      { hash: 42, documentId: DOC },
      { hash: "a".repeat(64), documentId: 7 },
      { hash: "a".repeat(64), documentId: "" },
    ];
    for (const [index, probe] of probes.entries()) {
      fake.deliver({
        protocol: LOCAL_ATTACHMENT_PROTOCOL,
        kind: "fetch",
        id: `bad-${index}`,
        ...probe,
      });
    }
    await settle();

    expect(authorize).not.toHaveBeenCalled();
    expect(has).not.toHaveBeenCalled();
    expect(fake.sent.map((message) => message.kind)).toEqual(
      probes.map(() => "not-found"),
    );
    expect(server.stats().refused).toBe(probes.length);
    server.close();
  });

  it("tracks a cancel only while its request is in flight and drops it when the serve ends", async () => {
    const fake = fakePort();
    let releaseAuthorize: () => void = () => undefined;
    const authorizeGate = new Promise<boolean>((resolve) => {
      releaseAuthorize = () => resolve(true);
    });
    const server = new LocalAttachmentServer({
      port: fake.port,
      link: TEST_LINK,
      store: new LocalAttachmentStore(
        new MemoryAttachmentBackend(),
        new NullAttachmentTransport(),
      ),
      authorize: () => authorizeGate,
    });

    // Parked in authorize(), so the request is in flight.
    fake.deliver({
      protocol: LOCAL_ATTACHMENT_PROTOCOL,
      kind: "fetch",
      id: "req-1",
      hash: "a".repeat(64),
      documentId: DOC,
    });
    fake.deliver({
      protocol: LOCAL_ATTACHMENT_PROTOCOL,
      kind: "cancel",
      id: "req-1",
    });
    expect(state(server).cancelled.has("req-1")).toBe(true);

    // The serve finishes (the store holds nothing, so it answers not-found),
    // and the finally drops both the in-flight marker and the tracked cancel.
    releaseAuthorize();
    await settle();
    expect(state(server).cancelled.size).toBe(0);
    expect(state(server).inFlight.size).toBe(0);
    server.close();
  });
});

describe("LocalAttachmentTransport against a misbehaving peer", () => {
  const HASH = "d".repeat(64);
  const P = LOCAL_ATTACHMENT_PROTOCOL;

  async function outcome(
    body: ReadableStream<Uint8Array>,
  ): Promise<"closed" | "errored" | "hung"> {
    return Promise.race([
      readAll(body).then(
        () => "closed" as const,
        () => "errored" as const,
      ),
      new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 100)),
    ]);
  }

  async function begun(
    options: { sizeBytes?: number; maxBytes?: number } = {},
  ): Promise<{
    fake: ReturnType<typeof fakePort>;
    id: string;
    body: ReadableStream<Uint8Array>;
  }> {
    const fake = fakePort();
    const puller = new LocalAttachmentTransport({
      port: fake.port,
      requestTimeoutMs: 10_000,
      ...(options.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {}),
    });
    const inFlight = puller.fetch(HASH, DOC);
    const { id } = fake.takeFetch();
    fake.deliver({
      protocol: P,
      kind: "begin",
      id,
      hash: HASH,
      metadata: metadata(options.sizeBytes ?? 10),
    });
    const result = await inFlight;
    if (result.kind !== "data") throw new Error("expected data");
    return { fake, id, body: result.response.body };
  }

  it("errors the body and cancels once the peer sends more than it declared", async () => {
    const { fake, id, body } = await begun({ sizeBytes: 10 });
    fake.deliver({
      protocol: P,
      kind: "chunk",
      id,
      seq: 0,
      bytes: new Uint8Array(8),
    });
    fake.deliver({
      protocol: P,
      kind: "chunk",
      id,
      seq: 1,
      bytes: new Uint8Array(8),
    });
    fake.deliver({ protocol: P, kind: "end", id });

    expect(await outcome(body)).toBe("errored");
    expect(fake.sent).toContainEqual({ protocol: P, kind: "cancel", id });
  });

  it("errors a body shorter than declared at end", async () => {
    const { fake, id, body } = await begun({ sizeBytes: 10 });
    fake.deliver({
      protocol: P,
      kind: "chunk",
      id,
      seq: 0,
      bytes: new Uint8Array(4),
    });
    fake.deliver({ protocol: P, kind: "end", id });

    expect(await outcome(body)).toBe("errored");
  });

  it("refuses a declared size above maxBytes", async () => {
    const fake = fakePort();
    const puller = new LocalAttachmentTransport({
      port: fake.port,
      maxBytes: 100,
    });
    const inFlight = puller.fetch(HASH, DOC);
    const { id } = fake.takeFetch();
    fake.deliver({
      protocol: P,
      kind: "begin",
      id,
      hash: HASH,
      metadata: metadata(1_000),
    });

    await expect(inFlight).rejects.toThrow(/exceeds/);
  });

  it.each([
    ["a second begin", { kind: "begin", hash: HASH, metadata: metadata(10) }],
    ["a not-found", { kind: "not-found" }],
    [
      "a pending",
      { kind: "pending", hash: HASH, expiresAtUtc: "x", retryAfterMs: 1 },
    ],
  ])("errors the body on %s after begin", async (_name, reply) => {
    const { fake, id, body } = await begun({ sizeBytes: 2 });
    fake.deliver({ protocol: P, id, ...reply });
    fake.deliver({
      protocol: P,
      kind: "chunk",
      id,
      seq: 0,
      bytes: new Uint8Array(2),
    });
    fake.deliver({ protocol: P, kind: "end", id });

    expect(await outcome(body)).toBe("errored");
  });

  it.each([
    ["no metadata", { hash: HASH }],
    ["a negative size", { hash: HASH, metadata: metadata(-1) }],
    ["another hash", { hash: "e".repeat(64), metadata: metadata(1) }],
  ])("rejects a begin with %s", async (_name, fields) => {
    const fake = fakePort();
    const puller = new LocalAttachmentTransport({ port: fake.port });
    const inFlight = puller.fetch(HASH, DOC);
    const { id } = fake.takeFetch();
    fake.deliver({ protocol: P, kind: "begin", id, ...fields });

    await expect(inFlight).rejects.toThrow(/malformed/);
  });

  it("rejects a chunk whose bytes are not a Uint8Array", async () => {
    const { fake, id, body } = await begun({ sizeBytes: 0 });
    fake.deliver({ protocol: P, kind: "chunk", id, seq: 0, bytes: "xx" });
    fake.deliver({ protocol: P, kind: "end", id });

    expect(await outcome(body)).toBe("errored");
  });
});
