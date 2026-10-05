import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { ISigner, Operation } from "@powerhousedao/shared/document-model";
import {
  garbageCollect,
  sortOperations,
  undo,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it } from "vitest";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import type { ReactorClient } from "../../src/client/reactor-client.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { InProcessReactorModule, IReactor } from "../../src/core/types.js";
import type { ReactorFeatureFlags } from "../../src/executor/types.js";
import type { ISyncCursorStorage } from "../../src/storage/interfaces.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
import type {
  ChannelConfig,
  RemoteOptions,
  SyncEnvelope,
} from "../../src/sync/types.js";
import { TestP256Signer } from "../utils/p256-signer.js";
import { TestChannel } from "./channels/test-channel.js";

// #6: a peer never serves a trivially appended op back to its source.

const DRIVE_TYPE = "powerhouse/document-drive";
const FILTER = { documentId: [], scope: [], branch: "main" };

type Peer = {
  client: ReactorClient;
  reactor: IReactor;
  module: InProcessReactorModule;
  signer: ISigner;
};

type Harness = {
  a: Peer;
  b: Peer;
  /** Remote name -> the peer channel's remote name. */
  peerMapping: Map<string, string>;
  /** Remote names whose outgoing envelopes are held rather than delivered. */
  held: Map<string, SyncEnvelope[]>;
  channels: Map<string, TestChannel>;
};

async function buildHarness(
  featureFlags: Partial<ReactorFeatureFlags> = {},
): Promise<Harness> {
  const channels = new Map<string, TestChannel>();
  const peerMapping = new Map<string, string>();
  const held = new Map<string, SyncEnvelope[]>();

  const channelFactory = (): IChannelFactory => ({
    instance(
      remoteId: string,
      remoteName: string,
      _config: ChannelConfig,
      cursorStorage: ISyncCursorStorage,
    ): TestChannel {
      const send = (envelope: SyncEnvelope): void => {
        const queue = held.get(remoteName);
        if (queue) {
          queue.push(envelope);
          return;
        }
        const peerName = peerMapping.get(remoteName);
        const peer = peerName ? channels.get(peerName) : undefined;
        if (!peer) {
          throw new Error(`peer channel for '${remoteName}' is missing`);
        }
        peer.receive(envelope);
      };
      const channel = new TestChannel(
        remoteId,
        remoteName,
        cursorStorage,
        send,
      );
      channels.set(remoteName, channel);
      return channel;
    },
  });

  const build = async (): Promise<Peer> => {
    const signer = (await TestP256Signer.create()).asISigner();
    const built = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([driveDocumentModelModule as never])
          .withExecutorConfig({ featureFlags })
          .withSync(new SyncBuilder().withChannelFactory(channelFactory())),
      )
      .withSigner(signer)
      .buildModule();
    return {
      client: built.client,
      reactor: built.reactor,
      module: built.reactorModule!,
      signer,
    };
  };

  return {
    a: await build(),
    b: await build(),
    peerMapping,
    held,
    channels,
  };
}

function toA(id: string): string {
  return `toA-${id}`;
}
function toB(id: string): string {
  return `toB-${id}`;
}

async function connect(h: Harness, id: string): Promise<void> {
  h.peerMapping.set(toB(id), toA(id));
  h.peerMapping.set(toA(id), toB(id));
  const collectionId = DriveCollectionId.forDrive(id);
  await h.a.module.syncModule!.syncManager.add(
    toB(id),
    collectionId,
    { type: "internal", parameters: {} },
    FILTER,
  );
  await h.b.module.syncModule!.syncManager.add(
    toA(id),
    collectionId,
    { type: "internal", parameters: {} },
    FILTER,
  );
}

function hold(h: Harness, remoteName: string): void {
  if (!h.held.has(remoteName)) {
    h.held.set(remoteName, []);
  }
}

/** Delivers what was held on `remoteName`, in order, and stops holding. */
function release(h: Harness, remoteName: string): void {
  const queue = h.held.get(remoteName) ?? [];
  h.held.delete(remoteName);
  const peer = h.channels.get(h.peerMapping.get(remoteName)!)!;
  for (const envelope of queue) {
    peer.receive(envelope);
  }
}

/** Throws the held envelopes away, and stops holding. */
function discard(h: Harness, remoteName: string): void {
  h.held.delete(remoteName);
}

async function stored(peer: Peer, id: string): Promise<Operation[]> {
  const result = await peer.reactor.getOperations(id, {
    branch: "main",
    scopes: ["global"],
  });
  const byScope = result as Record<
    string,
    { results: Operation[] } | undefined
  >;
  return byScope.global?.results ?? [];
}

/** The action ids the stored global stream applies, in order. */
async function live(peer: Peer, id: string): Promise<string[]> {
  return garbageCollect(sortOperations(await stored(peer, id))).map(
    (operation) => operation.action.id,
  );
}

async function eventually(
  check: () => Promise<boolean>,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("condition not reached");
}

/** Waits until neither replica's stored stream has changed for `quietMs`. */
async function quiesce(h: Harness, id: string, quietMs = 400): Promise<void> {
  let last = "";
  let stableSince = Date.now();
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const snapshot = JSON.stringify([
      (await stored(h.a, id)).map((o) => [o.index, o.skip, o.action.id]),
      (await stored(h.b, id)).map((o) => [o.index, o.skip, o.action.id]),
    ]);
    if (snapshot !== last) {
      last = snapshot;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= quietMs) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function addFolder(folderId: string, timestampUtcMs: string) {
  return {
    ...driveDocumentModelModule.actions.addFolder({
      id: folderId,
      name: folderId,
      parentFolder: null,
    }),
    timestampUtcMs,
  };
}

async function executeOn(
  peer: Peer,
  id: string,
  folderId: string,
  timestampUtcMs: string,
): Promise<string> {
  const action = addFolder(folderId, timestampUtcMs);
  await peer.client.execute(id, "main", [action]);
  return action.id;
}

type Damaged = {
  id: string;
  collectionId: DriveCollectionId;
  base: number;
  /** A's own operation, lost on A, live on B. */
  x: string;
  /** B's backdated operation whose load on A rewound x. */
  y: string;
};

/** A as the pre-fix load of y left it; `pendingEcho` leaves its echo unsent. */
async function damaged(h: Harness, pendingEcho = false): Promise<Damaged> {
  const drive = driveDocumentModelModule.utils.createDocument();
  const id = drive.header.id;
  const collectionId = DriveCollectionId.forDrive(id);
  await connect(h, id);
  await h.a.client.create(drive);
  await eventually(() =>
    h.b.reactor.get(id, { branch: "main" }).then(
      () => true,
      () => false,
    ),
  );
  await quiesce(h, id);

  const base = Date.now();
  hold(h, toB(id));
  hold(h, toA(id));
  const x = await executeOn(h.a, id, "x", new Date(base).toISOString());
  const y = await executeOn(
    h.b,
    id,
    "y",
    new Date(base - 10_000).toISOString(),
  );

  // Trivial on B: y is older than x.
  release(h, toB(id));
  await eventually(async () => (await live(h.b, id)).includes(x));

  // Stand-in for the pre-fix load of y on A.
  discard(h, toA(id));
  const yOnB = (await stored(h.b, id)).find((o) => o.action.id === y)!;
  const module = h.a.module;
  const revisions = await module.operationStore.getRevisions(id, "main");
  const index = revisions.revision.global;
  const row: Operation = { ...yOnB, index, skip: 1 };
  await module.operationStore.apply(
    id,
    DRIVE_TYPE,
    "global",
    "main",
    index,
    (txn) => {
      txn.addOperations(row);
    },
  );
  module.writeCache.invalidate(id, "global", "main");
  if (pendingEcho) {
    const indexTxn = module.operationIndex.start();
    indexTxn.write([
      {
        ...row,
        documentId: id,
        documentType: DRIVE_TYPE,
        branch: "main",
        scope: "global",
        sourceRemote: "",
      },
    ]);
    await module.operationIndex.commit(indexTxn);
  }

  const liveA = await live(h.a, id);
  const liveB = await live(h.b, id);
  expect(liveA).not.toContain(x);
  expect(liveA).toContain(y);
  expect(liveB).toEqual(expect.arrayContaining([x, y]));

  return { id, collectionId, base, x, y };
}

async function sourceRemoteOnB(
  h: Harness,
  id: string,
  actionId: string,
): Promise<string[]> {
  const entries = await h.b.module.operationIndex.get(id);
  return entries.results
    .filter((entry) => entry.action.id === actionId)
    .map((entry) => entry.sourceRemote);
}

describe("a replica that lost a live operation of its own (#6)", () => {
  let h: Harness | undefined;

  afterEach(() => {
    h?.a.reactor.kill();
    h?.b.reactor.kill();
    h = undefined;
  });

  it("B holds x stamped with A as its source, which its outbox to A excludes", async () => {
    h = await buildHarness();
    const { id, x } = await damaged(h);

    // Excluded by find(excludeSourceRemote) at sync-manager.ts:1348.
    expect(await sourceRemoteOnB(h, id, x)).toEqual([toA(id)]);
  }, 30_000);

  // BUG #6: B never re-sends a lost op to its source; a quiet pair diverges.
  it.fails("converges once a quiet pair reaches a fixed point", async () => {
    h = await buildHarness();
    const { id, x } = await damaged(h);

    await quiesce(h, id);

    expect(await live(h.a, id)).toContain(x);
    expect(await live(h.a, id)).toEqual(await live(h.b, id));
  }, 30_000);

  // BUG #6: non-conflicting traffic in both directions does not re-send it either.
  it.fails("converges under ongoing non-conflicting traffic both ways", async () => {
    h = await buildHarness();
    const { id, x } = await damaged(h);

    for (let i = 0; i < 3; i++) {
      await executeOn(h.a, id, `a-${i}`, new Date().toISOString());
      await executeOn(h.b, id, `b-${i}`, new Date().toISOString());
    }
    await quiesce(h, id);

    expect(await live(h.a, id)).toContain(x);
    expect(await live(h.a, id)).toEqual(await live(h.b, id));
  }, 30_000);

  // BUG #6: B appends an older op from A as a predecessor; x stays unsent.
  it.fails("converges after A writes an op older than x", async () => {
    h = await buildHarness();
    const { id, base, x } = await damaged(h);

    await executeOn(h.a, id, "v", new Date(base - 5_000).toISOString());
    await quiesce(h, id);

    expect(await live(h.a, id)).toContain(x);
    expect(await live(h.a, id)).toEqual(await live(h.b, id));
  }, 30_000);

  it("is re-sent when B's own backdated write re-appends x (documentDecisions)", async () => {
    h = await buildHarness({ documentDecisions: true });
    const { id, base, x } = await damaged(h);

    await executeOn(h.b, id, "z", new Date(base - 5_000).toISOString());
    await quiesce(h, id);

    expect(await sourceRemoteOnB(h, id, x)).toContain("");
    expect(await live(h.a, id)).toContain(x);
  }, 30_000);

  // BUG (b): a trivial-append load keeps the sender's skip; z retracts A's y.
  it.fails("converges after B's own backdated write re-sends x (documentDecisions)", async () => {
    h = await buildHarness({ documentDecisions: true });
    const { id, base, y } = await damaged(h);

    await executeOn(h.b, id, "z", new Date(base - 5_000).toISOString());
    await quiesce(h, id);

    expect(await live(h.a, id)).toContain(y);
    expect(await live(h.a, id)).toEqual(await live(h.b, id));
  }, 30_000);

  it("is repaired when A's reshuffle echo reaches B after the fix", async () => {
    h = await buildHarness();
    const { id, x } = await damaged(h, true);

    // A's next write serves the echo; B reshuffles on its matching action id.
    await executeOn(h.a, id, "w", new Date().toISOString());
    await quiesce(h, id);

    expect(await sourceRemoteOnB(h, id, x)).toContain("");
    expect(await live(h.a, id)).toEqual(await live(h.b, id));
  }, 30_000);
});

describe("repair paths for a store damaged before the fix (#6c)", () => {
  let h: Harness | undefined;

  afterEach(() => {
    h?.a.reactor.kill();
    h?.b.reactor.kill();
    h = undefined;
  });

  // BUG #6: a full backfill under the old name still excludes x.
  it.fails("converges after both remotes are removed and re-added (full backfill, same names)", async () => {
    h = await buildHarness();
    const { id, collectionId, x } = await damaged(h);

    await h.a.module.syncModule!.syncManager.remove(toB(id));
    await h.b.module.syncModule!.syncManager.remove(toA(id));
    await h.a.module.syncModule!.syncManager.add(
      toB(id),
      collectionId,
      { type: "internal", parameters: {} },
      FILTER,
    );
    await h.b.module.syncModule!.syncManager.add(
      toA(id),
      collectionId,
      { type: "internal", parameters: {} },
      FILTER,
    );
    await quiesce(h, id);

    expect(await live(h.a, id)).toContain(x);
    expect(await live(h.a, id)).toEqual(await live(h.b, id));
  }, 30_000);

  it("converges when B serves A under a new remote name from timestamp 0", async () => {
    h = await buildHarness();
    const { id, collectionId, x } = await damaged(h);

    // A fresh GQL channel id, without the client's since-timestamp.
    await h.b.module.syncModule!.syncManager.remove(toA(id));
    const renamed = `toA2-${id}`;
    h.peerMapping.set(renamed, toB(id));
    h.peerMapping.set(toB(id), renamed);
    await h.b.module.syncModule!.syncManager.add(
      renamed,
      collectionId,
      { type: "internal", parameters: {} },
      FILTER,
    );
    await quiesce(h, id);

    expect(await live(h.a, id)).toContain(x);
    expect(await live(h.a, id)).toEqual(await live(h.b, id));
  }, 30_000);

  // BUG #6: touchChannel's since-timestamp (A's newest indexed op) filters x out.
  it.fails("converges when B serves A under a new remote name from the client's since-timestamp", async () => {
    h = await buildHarness();
    const { id, collectionId, x } = await damaged(h);

    await executeOn(h.a, id, "w", new Date().toISOString());
    await quiesce(h, id);

    const since =
      await h.a.module.operationIndex.getLatestTimestampForCollection(
        collectionId.key,
      );
    await h.b.module.syncModule!.syncManager.remove(toA(id));
    const renamed = `toA2-${id}`;
    h.peerMapping.set(renamed, toB(id));
    h.peerMapping.set(toB(id), renamed);
    const options: RemoteOptions = { sinceTimestampUtcMs: since ?? "0" };
    await h.b.module.syncModule!.syncManager.add(
      renamed,
      collectionId,
      { type: "internal", parameters: {} },
      FILTER,
      options,
    );
    await quiesce(h, id);

    expect(await live(h.a, id)).toContain(x);
    expect(await live(h.a, id)).toEqual(await live(h.b, id));
  }, 30_000);
});

describe("losing a live row on current main (#6b)", () => {
  let h: Harness | undefined;

  afterEach(() => {
    h?.a.reactor.kill();
    h?.b.reactor.kill();
    h = undefined;
  });

  async function connected(harness: Harness): Promise<string> {
    const drive = driveDocumentModelModule.utils.createDocument();
    const id = drive.header.id;
    await connect(harness, id);
    await harness.a.client.create(drive);
    await eventually(() =>
      harness.b.reactor.get(id, { branch: "main" }).then(
        () => true,
        () => false,
      ),
    );
    await quiesce(harness, id);
    return id;
  }

  // BUG (b): B's UNDO reaches A as a trivial append; its skip retracts a1.
  it.fails("keeps A's own op live when B undoes an op concurrently", async () => {
    h = await buildHarness();
    const id = await connected(h);
    await executeOn(h.b, id, "b1", new Date().toISOString());
    await eventually(async () => (await live(h!.a, id)).length === 1);

    hold(h, toB(id));
    const a1 = await executeOn(h.a, id, "a1", new Date().toISOString());
    await new Promise((resolve) => setTimeout(resolve, 5));
    await h.b.client.execute(id, "main", [undo()]);
    await quiesce(h, id);
    release(h, toB(id));
    await quiesce(h, id);

    expect(await live(h.a, id)).toContain(a1);
    expect(await live(h.a, id)).toEqual(await live(h.b, id));
  }, 30_000);
});
