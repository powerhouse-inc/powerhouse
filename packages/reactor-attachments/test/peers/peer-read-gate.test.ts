import { MessageChannel } from "node:worker_threads";
import {
  messagePortTransport,
  type AttachmentHash,
  type LocalChannelPort,
  type MessagePortLike,
} from "@powerhousedao/reactor";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it } from "vitest";
import type {
  AttachmentReadGate,
  IDocumentScopeGate,
} from "../../src/access/attachment-read-gate.js";
import { readGateAttachmentAuthorizer } from "../../src/local/index.js";
import { LocalAttachmentTransport } from "../../src/local/local-attachment-transport.js";
import { NullAttachmentTransport } from "../../src/null-attachment-transport.js";
import {
  AttachmentPeerLinks,
  PeeredAttachmentTransport,
} from "../../src/peers/index.js";
import type { IAttachmentReferenceReader } from "../../src/read-models/attachment-reference/types.js";
import { createRef } from "../../src/ref.js";
import { sha256Hex } from "../../src/replication/hash.js";
import {
  LocalAttachmentStore,
  MemoryAttachmentBackend,
  streamFromBytes,
} from "../../src/storage/local/index.js";

const DOC = "document-d";
const READER = "0xreader";
const OUTSIDER = "0xoutsider";

const SUBJECTS: Record<string, { address: string }> = {
  "peer-reader": { address: READER },
  "peer-outsider": { address: OUTSIDER },
};

type Gates = {
  readGate: AttachmentReadGate;
  scopeGate: IDocumentScopeGate;
  references: IAttachmentReferenceReader;
};

/** D references `referenced`; only READER may read D. */
function gates(referenced: AttachmentHash): Gates {
  const readable = (address: string | undefined): boolean => address === READER;
  return {
    readGate: {
      isServed: (identifier, view) =>
        Promise.resolve(identifier === DOC && readable(view?.subject?.address)),
      get: <TDocument extends PHDocument>(
        _identifier: string,
        view?: {
          scopes?: string[] | null;
          subject?: { address?: string };
        },
      ) => {
        const scopes = readable(view?.subject?.address)
          ? (view?.scopes ?? [])
          : [];
        const state = Object.fromEntries(scopes.map((scope) => [scope, {}]));
        return Promise.resolve({ state } as unknown as TDocument);
      },
    },
    scopeGate: {
      scopePredicateById: (_documentId, subject) =>
        Promise.resolve(
          (scope: string) => readable(subject.address) && scope === "global",
        ),
    },
    references: {
      hasReference: (documentId, ref) =>
        Promise.resolve(documentId === DOC && ref === createRef(referenced)),
      referencingScopes: (documentId, ref) =>
        Promise.resolve(
          documentId === DOC && ref === createRef(referenced) ? ["global"] : [],
        ),
    },
  };
}

function authorizerFor(g: Gates) {
  return readGateAttachmentAuthorizer({
    ...g,
    subjectOf: (link) => SUBJECTS[link.peerId],
  });
}

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("peer reads through the reactor read gate", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  async function holder(): Promise<{
    referenced: AttachmentHash;
    unreferenced: AttachmentHash;
    links: AttachmentPeerLinks;
  }> {
    const store = new LocalAttachmentStore(
      new MemoryAttachmentBackend(),
      new NullAttachmentTransport(),
    );
    const a = bytesOf("referenced by D");
    const b = bytesOf("held, referenced by nothing");
    const referenced = await sha256Hex(a);
    const unreferenced = await sha256Hex(b);
    const meta = (size: number) => ({
      mimeType: "text/plain",
      fileName: "x.txt",
      sizeBytes: size,
      extension: ".txt",
      createdAtUtc: "2026-01-01T00:00:00.000Z",
    });
    await store.putLocal(referenced, meta(a.byteLength), streamFromBytes(a));
    await store.putLocal(unreferenced, meta(b.byteLength), streamFromBytes(b));

    const links = new AttachmentPeerLinks({
      store,
      transport: new PeeredAttachmentTransport(),
      authorize: authorizerFor(gates(referenced)),
    });
    cleanups.push(() => links.close());
    return { referenced, unreferenced, links };
  }

  /** Links `peerId` to the holder; returns the peer's transport and raw replies. */
  function connect(
    links: AttachmentPeerLinks,
    peerId: string,
  ): { puller: LocalAttachmentTransport; replies: unknown[] } {
    const channel = new MessageChannel();
    channel.port1.unref();
    channel.port2.unref();
    const holderPort = messagePortTransport(
      channel.port1 as unknown as MessagePortLike,
    );
    const peerPort: LocalChannelPort = messagePortTransport(
      channel.port2 as unknown as MessagePortLike,
    );
    const replies: unknown[] = [];
    peerPort.onMessage((data) => replies.push(data));
    links.addPeer(peerId, "chan", holderPort);
    const puller = new LocalAttachmentTransport({ port: peerPort });
    cleanups.push(() => {
      puller.close();
      peerPort.close();
    });
    return { puller, replies };
  }

  it("refuses a peer whose subject cannot read D even though D references H", async () => {
    const { referenced, links } = await holder();
    const reader = connect(links, "peer-reader");
    const outsider = connect(links, "peer-outsider");

    const allowed = await reader.puller.fetch(referenced, DOC);
    expect(allowed.kind).toBe("data");
    if (allowed.kind === "data") await allowed.response.body.cancel();

    await expect(outsider.puller.fetch(referenced, DOC)).resolves.toEqual({
      kind: "not-found",
    });
  });

  it("answers an unindexed pair and a denied pair identically", async () => {
    const { referenced, unreferenced, links } = await holder();
    const outsider = connect(links, "peer-outsider");

    const denied = await outsider.puller.fetch(referenced, DOC);
    const unindexed = await outsider.puller.fetch(unreferenced, DOC);

    expect(denied).toEqual({ kind: "not-found" });
    expect(unindexed).toEqual(denied);
    const shape = (reply: unknown) => {
      const { id: _id, ...rest } = reply as Record<string, unknown>;
      return rest;
    };
    expect(outsider.replies.map(shape)).toEqual([
      { protocol: "ph-attachment/v1", kind: "not-found" },
      { protocol: "ph-attachment/v1", kind: "not-found" },
    ]);
  });
});
