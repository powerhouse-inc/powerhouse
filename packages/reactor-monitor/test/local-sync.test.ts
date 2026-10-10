import { afterEach, describe, expect, it, vi } from "vitest";
import {
  linkLocalSync,
  provisionInProcess,
  ReactorMonitorRegistry,
  supportsSyncChannel,
  type ManagedInProcessReactor,
} from "../src/index.js";
import { descriptor, folderNames, hasDrive, nodeChannel } from "./helpers.js";
import {
  ChannelScheme,
  DriveCollectionId,
  GQL_CHANNEL_TYPE,
  LOCAL_CHANNEL_TYPE,
  POLLING_CHANNEL_TYPE,
  type MessagePortLike,
} from "@powerhousedao/reactor";

describe("brokered local sync between two in-process reactors", () => {
  const provisioned: ManagedInProcessReactor[] = [];

  async function host(name: string): Promise<ManagedInProcessReactor> {
    const reactor = await provisionInProcess(
      descriptor(name, { sync: { local: true } }),
    );
    provisioned.push(reactor);
    return reactor;
  }

  afterEach(async () => {
    for (const reactor of provisioned.splice(0)) {
      await reactor.kill();
    }
  });

  it("syncs documents and ops A<->B with no Switchboard and no GraphQL", async () => {
    const a = await host("link-a");
    const b = await host("link-b");

    // The drive is the collection; `drives.create` assigns its id, so create
    // it first and link on that id.
    const drive = await a.client.drives.create({ global: { name: "Shared" } });
    const driveId = drive.header.id;

    const handle = await linkLocalSync(a, b, {
      driveId,
      createChannel: nodeChannel,
    });

    // The local remote is live on both sides.
    expect(a.syncManager?.list().map((r) => r.meta.channelConfig.type)).toEqual(
      ["local"],
    );
    expect(b.syncManager?.list().map((r) => r.meta.channelConfig.type)).toEqual(
      ["local"],
    );

    // Adding the remote backfills the existing drive ops, so B receives the
    // drive over the brokered port with neither side polling.
    await vi.waitFor(
      async () => expect(await hasDrive(b, driveId)).toBe(true),
      {
        timeout: 15_000,
      },
    );

    // A -> B
    await a.client.drives.addFolder(driveId, "fromA");
    await vi.waitFor(
      async () => expect(await folderNames(b, driveId)).toContain("fromA"),
      { timeout: 15_000 },
    );

    // B -> A, over the same link, neither side polling.
    await b.client.drives.addFolder(driveId, "fromB");
    await vi.waitFor(
      async () => expect(await folderNames(a, driveId)).toContain("fromB"),
      { timeout: 15_000 },
    );
    expect((await folderNames(a, driveId)).sort()).toEqual(["fromA", "fromB"]);

    // Each side's inspection shows the local remote with advancing cursors.
    await vi.waitFor(
      async () => {
        const [inspection] = await a.syncManager!.inspectRemotes();
        expect(inspection.remoteName).toBe(handle.remoteNameA);
        // A applied what B sent (inbox) and B acked what A sent (outbox).
        expect(inspection.inboxCursor.liveLatestOrdinal).toBeGreaterThan(0);
        expect(inspection.outboxCursor.liveAckOrdinal).toBeGreaterThan(0);
      },
      { timeout: 15_000 },
    );

    // Unlink removes both remotes.
    await handle.unlink();
    expect(a.syncManager?.list()).toEqual([]);
    expect(b.syncManager?.list()).toEqual([]);
  }, 60_000);

  it("brokers the same link through the registry", async () => {
    const registry = new ReactorMonitorRegistry();
    const a = await registry.provision(
      descriptor("reg-a", { sync: { local: true } }),
    );
    const b = await registry.provision(
      descriptor("reg-b", { sync: { local: true } }),
    );
    provisioned.push(
      a as ManagedInProcessReactor,
      b as ManagedInProcessReactor,
    );

    const drive = await a.client.drives.create({ global: { name: "Reg" } });
    const driveId = drive.header.id;
    const handle = await registry.linkLocalSync("reg-a", "reg-b", {
      driveId,
      createChannel: nodeChannel,
    });

    await vi.waitFor(
      async () =>
        expect(await hasDrive(b as ManagedInProcessReactor, driveId)).toBe(
          true,
        ),
      { timeout: 15_000 },
    );

    expect(handle.remoteNameA).toBe(`local:reg-b:${handle.channelName}`);
    await handle.unlink();
  }, 60_000);

  // W3.0: connect mode gained local capability. A connect-mode reactor now
  // composes a LocalChannelFactory onto its gql scheme, so it is a valid end
  // of a brokered link -- which is what the mixed topologies in stage 3 rest
  // on, and what this suite previously asserted was impossible.
  it("links a connect-mode reactor to a local-only one and syncs over it", async () => {
    const local = await host("mixed-local");
    const connect = await provisionInProcess(descriptor("mixed-connect"));
    provisioned.push(connect);

    expect(connect.capabilities.syncChannels).toEqual([
      GQL_CHANNEL_TYPE,
      LOCAL_CHANNEL_TYPE,
    ]);

    const drive = await connect.client.drives.create({
      global: { name: "Mixed" },
    });
    const driveId = drive.header.id;
    const handle = await linkLocalSync(connect, local, {
      driveId,
      createChannel: nodeChannel,
    });

    expect(
      connect.syncManager?.list().map((r) => r.meta.channelConfig.type),
    ).toEqual(["local"]);
    await vi.waitFor(
      async () => expect(await hasDrive(local, driveId)).toBe(true),
      { timeout: 15_000 },
    );

    await connect.client.drives.addFolder(driveId, "fromConnect");
    await vi.waitFor(
      async () =>
        expect(await folderNames(local, driveId)).toContain("fromConnect"),
      { timeout: 15_000 },
    );
    await local.client.drives.addFolder(driveId, "fromLocalOnly");
    await vi.waitFor(
      async () =>
        expect(await folderNames(connect, driveId)).toContain("fromLocalOnly"),
      { timeout: 15_000 },
    );

    await handle.unlink();
  }, 60_000);

  // The composite routes on the remote's channel type, so the two remotes
  // coexist on one sync manager rather than one shadowing the other.
  it("holds a gql remote and a brokered local remote on the same connect-mode reactor", async () => {
    const local = await host("both-local");
    const connect = await provisionInProcess(descriptor("both-connect"));
    provisioned.push(connect);

    const drive = await connect.client.drives.create({
      global: { name: "Both" },
    });
    const driveId = drive.header.id;
    const handle = await linkLocalSync(connect, local, {
      driveId,
      createChannel: nodeChannel,
    });

    // A stub fetch, so adding the gql remote exercises the composite's gql
    // arm without a network: the channel registers and polls against this.
    const fetchFn = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              touchChannel: { success: true, ackOrdinal: 0 },
              pushSyncEnvelopes: true,
              pollSyncEnvelopes: {
                envelopes: [],
                ackOrdinal: 0,
                deadLetters: [],
                hasMore: false,
              },
            },
          }),
      }),
    );
    await connect.syncManager!.add(
      "gql:switchboard",
      DriveCollectionId.forDrive(driveId),
      {
        type: GQL_CHANNEL_TYPE,
        parameters: {
          url: "https://switchboard.test/graphql",
          pollIntervalMs: 50,
          fetchFn,
        },
      },
      { documentId: [], scope: [], branch: "main" },
    );

    expect(
      connect
        .syncManager!.list()
        .map((r) => r.meta.channelConfig.type)
        .sort(),
    ).toEqual([GQL_CHANNEL_TYPE, LOCAL_CHANNEL_TYPE]);
    // Both arms are actually running: the gql channel talked to its endpoint
    // while the local link kept delivering.
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalled(), {
      timeout: 15_000,
    });
    await vi.waitFor(
      async () => expect(await hasDrive(local, driveId)).toBe(true),
      { timeout: 15_000 },
    );

    await connect.syncManager!.remove("gql:switchboard");
    await handle.unlink();
  }, 60_000);

  /**
   * The SWITCHBOARD row of the contract, read off the reactor that was built
   * rather than off the scheme that asked for it.
   *
   * Its gql factory is a `GqlResponseChannelFactory`, which serves "polling"
   * channels -- resolver-driven, created when a PEER registers one against
   * this reactor, so there is nothing for the monitor's add-remote form to
   * create here. Declaring the literal type is what makes that form's gate
   * (the absence of "gql") correct without a translation layer, while the
   * local channel the builder composes on is as real as on any other scheme.
   */
  it("declares the switchboard scheme's polling channel beside local, and links locally", async () => {
    const localOnly = await host("sb-local");
    const switchboard = await provisionInProcess(
      descriptor("sb-reactor", {
        sync: { channelScheme: ChannelScheme.SWITCHBOARD },
      }),
    );
    provisioned.push(switchboard);

    expect(switchboard.capabilities.syncChannels).toEqual([
      POLLING_CHANNEL_TYPE,
      LOCAL_CHANNEL_TYPE,
    ]);
    // The two UI gates, as the Sync tab reads them: no add-remote form, but a
    // live link panel.
    expect(
      supportsSyncChannel(switchboard.capabilities, GQL_CHANNEL_TYPE),
    ).toBe(false);
    expect(
      supportsSyncChannel(switchboard.capabilities, LOCAL_CHANNEL_TYPE),
    ).toBe(true);

    const drive = await switchboard.client.drives.create({
      global: { name: "Switchboard" },
    });
    const driveId = drive.header.id;
    const handle = await linkLocalSync(switchboard, localOnly, {
      driveId,
      createChannel: nodeChannel,
    });

    await vi.waitFor(
      async () => expect(await hasDrive(localOnly, driveId)).toBe(true),
      { timeout: 15_000 },
    );
    await switchboard.client.drives.addFolder(driveId, "fromSwitchboard");
    await vi.waitFor(
      async () =>
        expect(await folderNames(localOnly, driveId)).toContain(
          "fromSwitchboard",
        ),
      { timeout: 15_000 },
    );

    await handle.unlink();
  }, 60_000);

  it("refuses a sync-less island, which declares no sync channels at all", async () => {
    const local = await host("island-local");
    const island = await provisionInProcess(
      descriptor("island", { sync: { channelScheme: null } }),
    );
    provisioned.push(island);

    expect(island.capabilities.syncChannels).toEqual([]);
    await expect(
      linkLocalSync(local, island, {
        driveId: "nope",
        createChannel: nodeChannel,
      }),
    ).rejects.toThrow(/declare sync channels \[none at all\]/);
  });

  it("refuses before opening a port, so a rejected link leaves no channel behind", async () => {
    const local = await host("fail-fast-local");
    const island = await provisionInProcess(
      descriptor("fail-fast-island", { sync: { channelScheme: null } }),
    );
    provisioned.push(island);

    let opened = 0;
    await expect(
      linkLocalSync(local, island, {
        driveId: "nope",
        createChannel: () => {
          opened++;
          return nodeChannel();
        },
      }),
    ).rejects.toThrow(/has no local sync channel/);
    expect(opened).toBe(0);
  });

  it("keeps the brokered remote out of durable storage", async () => {
    const a = await host("eph-a");
    const b = await host("eph-b");

    const drive = await a.client.drives.create({ global: { name: "Eph" } });
    const handle = await linkLocalSync(a, b, {
      driveId: drive.header.id,
      createChannel: nodeChannel,
    });

    expect(a.syncManager?.list().map((r) => r.meta.name)).toEqual([
      handle.remoteNameA,
    ]);
    // Session-scoped: live in memory, absent from the storage a restart reads.
    const storageA = a.module.reactorModule!.syncModule!.remoteStorage;
    const storageB = b.module.reactorModule!.syncModule!.remoteStorage;
    expect(await storageA.list()).toEqual([]);
    expect(await storageB.list()).toEqual([]);

    await handle.unlink();
  }, 60_000);

  it("rolls A back completely when B refuses the link", async () => {
    const a = await host("roll-a");
    const b = await host("roll-b");

    const drive = await a.client.drives.create({ global: { name: "Roll" } });
    const driveId = drive.header.id;

    const ports: MessagePortLike[] = [];
    const closed = new Set<MessagePortLike>();
    const trackingChannel = (): {
      port1: MessagePortLike;
      port2: MessagePortLike;
    } => {
      const { port1, port2 } = nodeChannel();
      for (const port of [port1, port2]) {
        ports.push(port);
        const close = port.close.bind(port);
        port.close = () => {
          closed.add(port);
          close();
        };
      }
      return { port1, port2 };
    };

    const adoptB = b.adoptLocalSyncPeer!;
    b.adoptLocalSyncPeer = () => Promise.reject(new Error("B refuses"));

    await expect(
      linkLocalSync(a, b, { driveId, createChannel: trackingChannel }),
    ).rejects.toThrow("B refuses");

    // A is fully unwound: no remote, no live registry entry, both ports closed.
    expect(a.syncManager?.list()).toEqual([]);
    expect(b.syncManager?.list()).toEqual([]);
    expect(ports).toHaveLength(2);
    expect(closed.size).toBe(2);

    b.adoptLocalSyncPeer = adoptB;

    // And the pair is linkable again afterwards.
    const handle = await linkLocalSync(a, b, {
      driveId,
      createChannel: nodeChannel,
    });
    await handle.unlink();
  }, 60_000);

  it("refuses a second link over an already-linked pair without touching the first", async () => {
    const a = await host("dup-a");
    const b = await host("dup-b");

    const drive = await a.client.drives.create({ global: { name: "Dup" } });
    const driveId = drive.header.id;
    const handle = await linkLocalSync(a, b, {
      driveId,
      createChannel: nodeChannel,
    });

    await expect(
      linkLocalSync(a, b, { driveId, createChannel: nodeChannel }),
    ).rejects.toThrow(/already has a local sync remote named/);

    // The live link survived the refusal intact.
    expect(a.syncManager?.list().map((r) => r.meta.name)).toEqual([
      handle.remoteNameA,
    ]);
    expect(b.syncManager?.list().map((r) => r.meta.name)).toEqual([
      handle.remoteNameB,
    ]);

    await handle.unlink();
  }, 60_000);

  it("refuses a drive id the collection id format cannot carry", async () => {
    const a = await host("dot-a");
    const b = await host("dot-b");

    await expect(
      linkLocalSync(a, b, {
        driveId: "drive.with.dots",
        createChannel: nodeChannel,
      }),
    ).rejects.toThrow(/contains a "\." which the collection id format/);

    await expect(
      linkLocalSync(a, b, {
        driveId: "drive-1",
        branch: "feat.x",
        createChannel: nodeChannel,
      }),
    ).rejects.toThrow(/Branch "feat\.x" contains a "\."/);
  }, 60_000);
});
