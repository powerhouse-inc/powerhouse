import { afterEach, describe, expect, it, vi } from "vitest";
import {
  linkLocalSync,
  provisionInProcess,
  ReactorMonitorRegistry,
  type ManagedInProcessReactor,
} from "../src/index.js";
import { descriptor, folderNames, hasDrive, nodeChannel } from "./helpers.js";
import type { MessagePortLike } from "@powerhousedao/reactor";

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

  it("refuses to link a reactor whose capabilities lack the local sync channel", async () => {
    const local = await host("mixed-local");
    const connect = await provisionInProcess(descriptor("mixed-connect"));
    provisioned.push(connect);

    // The guard reads the capability contract, so the refusal names what the
    // reactor actually declares (stage 2: one place enforces it).
    expect(connect.capabilities.syncChannels).toEqual(["gql"]);
    await expect(
      linkLocalSync(local, connect, {
        driveId: "nope",
        createChannel: nodeChannel,
      }),
    ).rejects.toThrow(
      /not provisioned with local sync .*declare sync channels \[gql\]/,
    );
  });

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
    const connect = await provisionInProcess(descriptor("fail-fast-connect"));
    provisioned.push(connect);

    let opened = 0;
    await expect(
      linkLocalSync(local, connect, {
        driveId: "nope",
        createChannel: () => {
          opened++;
          return nodeChannel();
        },
      }),
    ).rejects.toThrow(/not provisioned with local sync/);
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
