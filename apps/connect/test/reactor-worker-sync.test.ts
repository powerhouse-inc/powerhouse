import {
  DriveCollectionId,
  type ISyncManager,
  type LocalChannelPort,
  type Remote,
} from "@powerhousedao/reactor";
import { describe, expect, it, vi } from "vitest";
import {
  assertCollectionIdParts,
  collectionIdFromKey,
  DEFAULT_LOCAL_FILTER,
  localChannelConfig,
  LocalChannelPortRegistry,
  registerLocalPeer,
} from "../src/reactor-worker-sync.js";

function fakePort(): LocalChannelPort & {
  close: ReturnType<typeof vi.fn>;
} {
  return {
    postMessage: vi.fn(),
    onMessage: vi.fn(() => () => undefined),
    close: vi.fn(),
  } as unknown as LocalChannelPort & { close: ReturnType<typeof vi.fn> };
}

describe("LocalChannelPortRegistry (inert until a peer is adopted)", () => {
  it("resolves to undefined when nothing is registered", () => {
    const registry = new LocalChannelPortRegistry();
    expect(registry.provider("peer", "chan")).toBeUndefined();
    expect(registry.has("peer", "chan")).toBe(false);
  });

  it("resolves a registered port and forgets it when the channel closes it", () => {
    const registry = new LocalChannelPortRegistry();
    const port = fakePort();
    registry.register("peer", "chan", port);

    expect(registry.has("peer", "chan")).toBe(true);
    const resolved = registry.provider("peer", "chan");
    expect(resolved).toBeDefined();

    // The channel owns the port and closes it on shutdown; that must forget the
    // entry and then refuse the key loudly rather than hand back a dead port.
    resolved?.close();
    expect(port.close).toHaveBeenCalledTimes(1);
    expect(registry.has("peer", "chan")).toBe(false);
    expect(registry.isClosed("peer", "chan")).toBe(true);
    expect(() => registry.provider("peer", "chan")).toThrow(/severed/);
  });

  it("refuses to replace a live entry", () => {
    const registry = new LocalChannelPortRegistry();
    registry.register("peer", "chan", fakePort());
    expect(() => registry.register("peer", "chan", fakePort())).toThrow(
      /already registered/,
    );
  });
});

function fakeSyncManager(): {
  manager: ISyncManager;
  add: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  remotes: { meta: { name: string } }[];
} {
  const remotes: { meta: { name: string } }[] = [];
  const add = vi.fn((...args: unknown[]) => {
    const remote = { meta: { name: args[0] as string } };
    remotes.push(remote);
    return Promise.resolve(remote as unknown as Remote);
  });
  const remove = vi.fn((..._args: unknown[]) => Promise.resolve(undefined));
  const manager = {
    list: () => remotes,
    add,
    remove,
  } as unknown as ISyncManager;
  return { manager, add, remove, remotes };
}

describe("registerLocalPeer (adopt-sync-peer handler wiring)", () => {
  const collectionId = collectionIdFromKey("drive.main.testdrive");

  it("registers the port, then adds the local remote over it", async () => {
    const registry = new LocalChannelPortRegistry();
    const { manager, add } = fakeSyncManager();
    const port = fakePort();

    await registerLocalPeer(
      manager,
      registry,
      {
        peerId: "peerA",
        channelName: "chanA",
        collectionId,
        remoteName: "remoteA",
        filter: DEFAULT_LOCAL_FILTER,
      },
      port,
    );

    expect(registry.has("peerA", "chanA")).toBe(true);
    expect(add).toHaveBeenCalledTimes(1);
    const call = add.mock.calls[0] ?? [];
    expect(call[0]).toBe("remoteA");
    expect(call[1]).toBe(collectionId);
    expect(call[2]).toEqual(localChannelConfig("peerA", "chanA"));
  });

  it("refuses a duplicate remote name", async () => {
    const registry = new LocalChannelPortRegistry();
    const { manager } = fakeSyncManager();
    await registerLocalPeer(
      manager,
      registry,
      {
        peerId: "peerA",
        channelName: "chanA",
        collectionId,
        remoteName: "dup",
        filter: DEFAULT_LOCAL_FILTER,
      },
      fakePort(),
    );

    await expect(
      registerLocalPeer(
        manager,
        registry,
        {
          peerId: "peerB",
          channelName: "chanB",
          collectionId,
          remoteName: "dup",
          filter: DEFAULT_LOCAL_FILTER,
        },
        fakePort(),
      ),
    ).rejects.toThrow(/already has a remote named/);
  });

  it("unregisters and closes the port when the add fails", async () => {
    const registry = new LocalChannelPortRegistry();
    const manager = {
      list: () => [],
      add: vi.fn((..._args: unknown[]): Promise<Remote> =>
        Promise.reject(new Error("add failed")),
      ),
      remove: vi.fn(),
    } as unknown as ISyncManager;
    const port = fakePort();

    await expect(
      registerLocalPeer(
        manager,
        registry,
        {
          peerId: "peerA",
          channelName: "chanA",
          collectionId,
          remoteName: "remoteA",
          filter: DEFAULT_LOCAL_FILTER,
        },
        port,
      ),
    ).rejects.toThrow(/add failed/);

    expect(port.close).toHaveBeenCalledTimes(1);
    expect(registry.has("peerA", "chanA")).toBe(false);
  });
});

describe("collection id guards", () => {
  it("round-trips a dot-free collection id key", () => {
    const id = collectionIdFromKey("drive.main.testdrive");
    expect(id.driveId).toBe("testdrive");
    expect(id.branch).toBe("main");
    expect(id).toBeInstanceOf(DriveCollectionId);
  });

  it("refuses a dotted drive id or branch", () => {
    expect(() => assertCollectionIdParts("drive.one", "main")).toThrow(/"\."/);
    expect(() => assertCollectionIdParts("one", "main.draft")).toThrow(/"\."/);
  });
});
