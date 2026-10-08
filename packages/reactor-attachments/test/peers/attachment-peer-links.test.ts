import { MessageChannel } from "node:worker_threads";
import {
  messagePortTransport,
  type LocalChannelPort,
  type MessagePortLike,
} from "@powerhousedao/reactor";
import { afterEach, describe, expect, it } from "vitest";
import type { IAttachmentTransport } from "../../src/interfaces.js";
import { attachmentReferenceAuthorizer } from "../../src/local/index.js";
import { LOCAL_ATTACHMENT_PROTOCOL } from "../../src/local/protocol.js";
import { NullAttachmentTransport } from "../../src/null-attachment-transport.js";
import {
  AttachmentPeerLinks,
  PeeredAttachmentTransport,
} from "../../src/peers/index.js";
import type { IAttachmentReferenceReader } from "../../src/read-models/attachment-reference/types.js";
import { sha256Hex } from "../../src/replication/hash.js";
import {
  collectStream,
  LocalAttachmentStore,
  MemoryAttachmentBackend,
  streamFromBytes,
} from "../../src/storage/local/index.js";

const DOC = "document-1";

const indexesEverything: IAttachmentReferenceReader = {
  hasReference: () => Promise.resolve(true),
  referencingScopes: () => Promise.resolve(["global"]),
};

type FakePort = {
  port: LocalChannelPort;
  listeners: () => number;
  closed: () => boolean;
  posted: unknown[];
  deliver: (data: unknown) => void;
};

function fakePort(): FakePort {
  const listeners = new Set<(data: unknown) => void>();
  const posted: unknown[] = [];
  let closed = false;
  return {
    port: {
      postMessage: (data) => {
        posted.push(data);
      },
      onMessage: (callback) => {
        listeners.add(callback);
        return () => {
          listeners.delete(callback);
        };
      },
      close: () => {
        closed = true;
      },
    },
    listeners: () => listeners.size,
    closed: () => closed,
    posted,
    deliver: (data) => {
      for (const listener of [...listeners]) listener(data);
    },
  };
}

function emptyStore(): LocalAttachmentStore {
  return new LocalAttachmentStore(
    new MemoryAttachmentBackend(),
    new NullAttachmentTransport(),
  );
}

const unanswered: IAttachmentTransport = {
  fetch: () => new Promise(() => undefined),
  announce: () => Promise.resolve(),
  push: () => Promise.resolve(),
};

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("AttachmentPeerLinks", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it("holds one listener on the port for both halves", () => {
    const fake = fakePort();
    const links = new AttachmentPeerLinks({
      store: emptyStore(),
      transport: new PeeredAttachmentTransport(),
    });
    links.addPeer("peer", "bytes", fake.port);
    expect(fake.listeners()).toBe(1);
    links.close();
  });

  it("closes server and transport and leaves the port with its caller when addPeer fails", async () => {
    const fake = fakePort();
    const peered = new PeeredAttachmentTransport();
    peered.addPeer("peer", "bytes", unanswered);
    const links = new AttachmentPeerLinks({
      store: emptyStore(),
      transport: peered,
      authorize: attachmentReferenceAuthorizer(indexesEverything),
    });

    expect(() => links.addPeer("peer", "bytes", fake.port)).toThrow(
      /already registered/,
    );
    expect(links.has("peer", "bytes")).toBe(false);
    expect(fake.listeners()).toBe(0);
    expect(fake.closed()).toBe(false);

    fake.deliver({
      protocol: LOCAL_ATTACHMENT_PROTOCOL,
      kind: "fetch",
      id: "req-1",
      hash: "a".repeat(64),
      documentId: DOC,
    });
    await settle();
    expect(fake.posted).toEqual([]);
  });

  it("closes server, transport and port on remove, and a second remove is a no-op", async () => {
    const fake = fakePort();
    const peered = new PeeredAttachmentTransport();
    const links = new AttachmentPeerLinks({
      store: emptyStore(),
      transport: peered,
      authorize: attachmentReferenceAuthorizer(indexesEverything),
    });
    links.addPeer("peer", "bytes", fake.port);

    const inFlight = peered.fetch("b".repeat(64), DOC);
    expect(fake.posted).toHaveLength(1);

    expect(links.removePeer("peer", "bytes")).toBe(true);
    await expect(inFlight).rejects.toThrow(
      /closed while a fetch was in flight/,
    );
    expect(fake.listeners()).toBe(0);
    expect(fake.closed()).toBe(true);
    expect(peered.peerNames()).toEqual([]);

    fake.deliver({
      protocol: LOCAL_ATTACHMENT_PROTOCOL,
      kind: "fetch",
      id: "req-2",
      hash: "a".repeat(64),
      documentId: DOC,
    });
    await settle();
    expect(fake.posted).toHaveLength(1);

    expect(links.removePeer("peer", "bytes")).toBe(false);
  });

  it("keys links by (peerId, channelName), so dropping one channel keeps the other", () => {
    const peered = new PeeredAttachmentTransport();
    const links = new AttachmentPeerLinks({
      store: emptyStore(),
      transport: peered,
    });
    const first = fakePort();
    const second = fakePort();
    links.addPeer("peer", "col-1", first.port);
    links.addPeer("peer", "col-2", second.port);
    expect(() => links.addPeer("peer", "col-1", fakePort().port)).toThrow(
      /already holds an attachment link/,
    );
    expect(peered.peerNames()).toEqual(["peer"]);

    links.removePeer("peer", "col-1");
    expect(first.closed()).toBe(true);
    expect(second.closed()).toBe(false);
    expect(links.has("peer", "col-2")).toBe(true);
    expect(peered.peerNames()).toEqual(["peer"]);
    links.close();
    expect(second.closed()).toBe(true);
  });

  it("serves and pulls bytes between two linked reactors", async () => {
    const bytes = new TextEncoder().encode("bytes only A holds");
    const hash = await sha256Hex(bytes);
    const storeA = emptyStore();
    await storeA.putLocal(
      hash,
      {
        mimeType: "text/plain",
        fileName: "a.txt",
        sizeBytes: bytes.byteLength,
        extension: ".txt",
        createdAtUtc: "2026-01-01T00:00:00.000Z",
      },
      streamFromBytes(bytes),
    );

    const added: string[] = [];
    const peeredA = new PeeredAttachmentTransport();
    const peeredB = new PeeredAttachmentTransport();
    const linksA = new AttachmentPeerLinks({
      store: storeA,
      transport: peeredA,
      authorize: attachmentReferenceAuthorizer(indexesEverything),
    });
    const linksB = new AttachmentPeerLinks({
      store: emptyStore(),
      transport: peeredB,
      authorize: attachmentReferenceAuthorizer(indexesEverything),
      onPeerAdded: (peerId) => added.push(peerId),
    });

    const channel = new MessageChannel();
    channel.port1.unref();
    channel.port2.unref();
    linksA.addPeer(
      "b",
      "bytes",
      messagePortTransport(channel.port1 as unknown as MessagePortLike),
    );
    linksB.addPeer(
      "a",
      "bytes",
      messagePortTransport(channel.port2 as unknown as MessagePortLike),
    );
    cleanups.push(() => {
      linksA.close();
      linksB.close();
    });
    expect(added).toEqual(["a"]);

    const result = await peeredB.fetch(hash, DOC);
    expect(result.kind).toBe("data");
    if (result.kind !== "data") return;
    expect([...(await collectStream(result.response.body))]).toEqual([
      ...bytes,
    ]);
    expect(linksA.servedStats()).toEqual({
      served: 1,
      bytesServed: bytes.byteLength,
      refused: 0,
    });

    await expect(peeredA.fetch(hash, DOC)).resolves.toEqual({
      kind: "not-found",
    });
    expect(linksB.servedStats().refused).toBe(1);
  });
});
