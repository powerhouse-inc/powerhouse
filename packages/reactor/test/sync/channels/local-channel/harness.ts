import {
  localPeerManifest,
  mergePeerCapabilities,
  PEER_CAPABILITIES,
  type PeerCapability,
  type PeerManifest,
} from "@powerhousedao/shared/document-model";
import { MessageChannel, type MessagePort } from "node:worker_threads";
import { DriveCollectionId } from "../../../../src/cache/operation-index-types.js";
import type { ISyncCursorStorage } from "../../../../src/storage/interfaces.js";
import { LocalChannel } from "../../../../src/sync/channels/local-channel.js";
import { messagePortTransport } from "../../../../src/sync/channels/local-channel-transport.js";
import { SyncOperation } from "../../../../src/sync/sync-operation.js";
import type { RemoteCursor, RemoteFilter } from "../../../../src/sync/types.js";
import { createMockLogger } from "../../../factories.js";

export const FILTER: RemoteFilter = {
  documentId: [],
  scope: [],
  branch: "main",
};

/** Baseline [1]; a `wide` reactor also runs 2 and prefers it. */
export const TEST_PROTOCOL = (versions: number[]): PeerCapability => ({
  kind: "protocol",
  name: "local-test-protocol",
  baseline: [1],
  supported: () => versions,
  preferred: () => Math.max(...versions),
  optional: true,
});

export const manifestFor = (versions: number[]): PeerManifest =>
  localPeerManifest(
    mergePeerCapabilities(PEER_CAPABILITIES, [TEST_PROTOCOL(versions)]),
    {},
  );

/**
 * An in-memory {@link ISyncCursorStorage} that actually persists, so a channel
 * restart can read back what the previous instance wrote.
 */
export class MemoryCursorStorage implements ISyncCursorStorage {
  private readonly rows = new Map<string, RemoteCursor>();

  private key(remoteName: string, cursorType: string): string {
    return `${remoteName}\u0000${cursorType}`;
  }

  list(remoteName: string): Promise<RemoteCursor[]> {
    const out: RemoteCursor[] = [];
    for (const row of this.rows.values()) {
      if (row.remoteName === remoteName) out.push({ ...row });
    }
    return Promise.resolve(out);
  }

  get(
    remoteName: string,
    cursorType: "inbox" | "outbox",
  ): Promise<RemoteCursor> {
    const row = this.rows.get(this.key(remoteName, cursorType));
    return Promise.resolve(
      row ? { ...row } : { remoteName, cursorType, cursorOrdinal: 0 },
    );
  }

  upsert(cursor: RemoteCursor): Promise<void> {
    this.rows.set(this.key(cursor.remoteName, cursor.cursorType), {
      ...cursor,
    });
    return Promise.resolve();
  }

  remove(remoteName: string): Promise<void> {
    for (const [key, row] of [...this.rows]) {
      if (row.remoteName === remoteName) this.rows.delete(key);
    }
    return Promise.resolve();
  }
}

export type PairOptions = {
  collectionId?: DriveCollectionId;
  manifestA?: PeerManifest | null;
  manifestB?: PeerManifest | null;
  cursorsA?: ISyncCursorStorage;
  cursorsB?: ISyncCursorStorage;
};

export type ChannelPair = {
  a: LocalChannel;
  b: LocalChannel;
  heardA: Array<PeerManifest | null>;
  heardB: Array<PeerManifest | null>;
  port1: MessagePort;
  port2: MessagePort;
  cursorsA: ISyncCursorStorage;
  cursorsB: ISyncCursorStorage;
  close(): Promise<void>;
};

/**
 * Two LocalChannels joined by the two ends of one `node:worker_threads`
 * MessageChannel, so every message really crosses a structured-clone boundary.
 * The channels are not initialised: the caller inits them to control when the
 * handshake runs.
 */
export function makePair(options: PairOptions = {}): ChannelPair {
  const collectionId =
    options.collectionId ?? DriveCollectionId.forDrive("drive-1");
  const cursorsA = options.cursorsA ?? new MemoryCursorStorage();
  const cursorsB = options.cursorsB ?? new MemoryCursorStorage();
  const { port1, port2 } = new MessageChannel();
  // The ports must not keep the test process alive on their own.
  port1.unref();
  port2.unref();

  const a = new LocalChannel(
    createMockLogger(),
    "channel-a",
    "a->b",
    cursorsA,
    messagePortTransport(port1),
    collectionId,
    FILTER,
  );
  const b = new LocalChannel(
    createMockLogger(),
    "channel-b",
    "b->a",
    cursorsB,
    messagePortTransport(port2),
    collectionId,
    FILTER,
  );

  const heardA: Array<PeerManifest | null> = [];
  const heardB: Array<PeerManifest | null> = [];
  // null is a silent peer: it announces nothing, so no provider is set.
  const announceA =
    "manifestA" in options ? options.manifestA : manifestFor([1]);
  const announceB =
    "manifestB" in options ? options.manifestB : manifestFor([1]);
  if (announceA) a.setLocalManifest(() => announceA);
  if (announceB) b.setLocalManifest(() => announceB);
  a.onPeerManifest((manifest) => {
    heardA.push(manifest);
  });
  b.onPeerManifest((manifest) => {
    heardB.push(manifest);
  });

  return {
    a,
    b,
    heardA,
    heardB,
    port1,
    port2,
    cursorsA,
    cursorsB,
    async close(): Promise<void> {
      await a.shutdown();
      await b.shutdown();
    },
  };
}

let opCounter = 0;

/** A single-operation inbox/outbox sync op at the given ordinal. */
export function syncOp(
  remoteName: string,
  ordinal: number,
  documentId = "doc-1",
): SyncOperation {
  const timestamp = new Date().toISOString();
  return new SyncOperation(
    `syncop-${ordinal}-${opCounter++}`,
    "",
    [],
    remoteName,
    documentId,
    ["global"],
    "main",
    [
      {
        operation: {
          index: ordinal - 1,
          skip: 0,
          id: `op-${documentId}-${ordinal}`,
          timestampUtcMs: timestamp,
          hash: `hash-${ordinal}`,
          action: {
            type: "TEST_OP",
            id: `action-${documentId}-${ordinal}`,
            scope: "global",
            timestampUtcMs: timestamp,
            input: {},
          },
        },
        context: {
          documentId,
          documentType: "test/document",
          scope: "global",
          branch: "main",
          ordinal,
        },
      },
    ],
  );
}

/** Marks every inbox item applied and removes it, as the sync manager would. */
export function applyInbox(channel: LocalChannel): void {
  const items = [...channel.inbox.items];
  for (const item of items) item.executed();
  if (items.length > 0) channel.inbox.remove(...items);
}

export async function waitFor(
  check: () => boolean | Promise<boolean>,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("condition not reached before timeout");
}
