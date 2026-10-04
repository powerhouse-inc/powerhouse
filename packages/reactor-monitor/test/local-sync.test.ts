import { MessageChannel } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  linkLocalSync,
  provisionInProcess,
  ReactorMonitorRegistry,
  type ManagedInProcessReactor,
  type ReactorDescriptor,
} from "../src/index.js";
import type { MessagePortLike } from "@powerhousedao/reactor";

/** An in-memory PGlite reactor wired for brokered local sync. */
function descriptor(name: string): ReactorDescriptor {
  return {
    kind: "in-process",
    name,
    storage: { kind: "memory" },
    sync: { local: true },
  };
}

/**
 * A `node:worker_threads` MessageChannel in place of the browser global, so
 * the in-process path has no browser dependency. `unref()` lets the test
 * process exit without waiting on the ports.
 */
function nodeChannel(): { port1: MessagePortLike; port2: MessagePortLike } {
  const { port1, port2 } = new MessageChannel();
  port1.unref();
  port2.unref();
  return {
    port1: port1 as unknown as MessagePortLike,
    port2: port2 as unknown as MessagePortLike,
  };
}

type DriveState = { state: { global: { nodes: Array<{ name: string }> } } };

async function folderNames(
  reactor: ManagedInProcessReactor,
  driveId: string,
): Promise<string[]> {
  try {
    const doc = (await reactor.client.get(driveId)) as unknown as DriveState;
    return doc.state.global.nodes.map((node) => node.name);
  } catch {
    return [];
  }
}

async function hasDrive(
  reactor: ManagedInProcessReactor,
  driveId: string,
): Promise<boolean> {
  try {
    await reactor.client.get(driveId);
    return true;
  } catch {
    return false;
  }
}

describe("brokered local sync between two in-process reactors", () => {
  const provisioned: ManagedInProcessReactor[] = [];

  async function host(name: string): Promise<ManagedInProcessReactor> {
    const reactor = await provisionInProcess(descriptor(name));
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
    const a = await registry.provision(descriptor("reg-a"));
    const b = await registry.provision(descriptor("reg-b"));
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

  it("refuses to link a reactor that was not provisioned for local sync", async () => {
    const local = await host("mixed-local");
    const connect = await provisionInProcess({
      kind: "in-process",
      name: "mixed-connect",
      storage: { kind: "memory" },
    });
    provisioned.push(connect);

    await expect(
      linkLocalSync(local, connect, {
        driveId: "nope",
        createChannel: nodeChannel,
      }),
    ).rejects.toThrow(/not provisioned with local sync/);
  });
});
