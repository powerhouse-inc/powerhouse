import {
  DriveCollectionId,
  LOCAL_CHANNEL_TYPE,
  RemotePersistence,
  type ISyncManager,
  type LocalChannelPort,
  type Remote,
} from "@powerhousedao/reactor";
import { describe, expect, it, vi } from "vitest";
import {
  assertCollectionIdParts,
  collectionIdFromKey,
  DEFAULT_LOCAL_FILTER,
  LOCAL_REMOTE_OPTIONS,
  localChannelConfig,
  registerLocalPeer,
} from "../src/sync/adopt-sync-peer.js";
import { LocalChannelPortRegistry } from "../src/sync/local-channel-registry.js";

/**
 * A port whose traffic is observable. Plain closures rather than mocks, so the
 * assertions read the recorded calls instead of referencing a port method.
 */
type FakePort = {
  port: LocalChannelPort;
  posted: unknown[];
  closeCount: () => number;
};

function fakePort(): FakePort {
  const posted: unknown[] = [];
  let closes = 0;
  return {
    port: {
      postMessage: (data: unknown) => {
        posted.push(data);
      },
      onMessage: () => () => {},
      close: () => {
        closes += 1;
      },
    },
    posted,
    closeCount: () => closes,
  };
}

type FakeSyncManager = ISyncManager & {
  add: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
};

function fakeSyncManager(existing: string[] = []): FakeSyncManager {
  const add = vi.fn((name: string): Promise<Remote> =>
    Promise.resolve({ meta: { name } } as unknown as Remote),
  );
  const list = vi.fn(() =>
    existing.map((name) => ({ meta: { name } }) as unknown as Remote),
  );
  return { add, list } as unknown as FakeSyncManager;
}

const SPEC = {
  peerId: "peer-b",
  channelName: "chan-1",
  collectionId: DriveCollectionId.forDrive("drive-1"),
  remoteName: "local:peer-b:chan-1",
  filter: DEFAULT_LOCAL_FILTER,
};

describe("registerLocalPeer (adopt-sync-peer handler core)", () => {
  it("registers the port under (peerId, channelName) and adds the local remote", async () => {
    const registry = new LocalChannelPortRegistry();
    const syncManager = fakeSyncManager();
    const port = fakePort();

    const remote = await registerLocalPeer(
      syncManager,
      registry,
      SPEC,
      port.port,
    );

    // The factory's transport provider resolves this registration; it hands out
    // a wrapper over the port, not the port itself, so that closing the
    // channel's transport also drops the entry. Identity is not the contract --
    // forwarding is.
    const resolved = registry.provider("peer-b", "chan-1");
    expect(resolved).toBeDefined();
    resolved!.postMessage("ping");
    expect(port.posted).toEqual(["ping"]);
    expect(registry.has("peer-b", "chan-1")).toBe(true);

    // The remote was added with the local channel config the factory keys on,
    // and marked session-scoped so it is never persisted.
    expect(syncManager.add).toHaveBeenCalledWith(
      "local:peer-b:chan-1",
      SPEC.collectionId,
      {
        type: LOCAL_CHANNEL_TYPE,
        parameters: { peerId: "peer-b", channelName: "chan-1" },
      },
      DEFAULT_LOCAL_FILTER,
      LOCAL_REMOTE_OPTIONS,
    );
    expect(LOCAL_REMOTE_OPTIONS.persistence).toBe(RemotePersistence.Session);
    expect(remote.meta.name).toBe("local:peer-b:chan-1");
  });

  it("syncs every branch by default, like any other remote", () => {
    expect(DEFAULT_LOCAL_FILTER).toEqual({
      documentId: [],
      scope: [],
      branch: "",
    });
  });

  it("builds a local channel config the LocalChannelFactory can resolve", () => {
    expect(localChannelConfig("b", "c")).toEqual({
      type: LOCAL_CHANNEL_TYPE,
      parameters: { peerId: "b", channelName: "c" },
    });
  });

  it("keys ports by both peer and channel so distinct links do not collide", () => {
    const registry = new LocalChannelPortRegistry();
    const first = fakePort();
    const second = fakePort();

    registry.register("peer-b", "drive-1", first.port);
    registry.register("peer-b", "drive-2", second.port);

    registry.provider("peer-b", "drive-1")!.postMessage("to-first");
    registry.provider("peer-b", "drive-2")!.postMessage("to-second");
    expect(first.posted).toEqual(["to-first"]);
    expect(second.posted).toEqual(["to-second"]);
  });

  it("refuses to adopt a peer this reactor already holds a port for", async () => {
    const registry = new LocalChannelPortRegistry();
    const syncManager = fakeSyncManager();
    registry.register("peer-b", "chan-1", fakePort().port);
    const second = fakePort();

    await expect(
      registerLocalPeer(syncManager, registry, SPEC, second.port),
    ).rejects.toThrow(/already holds a local sync port/);

    // Nothing was mutated: the live entry is untouched and no remote was added.
    expect(syncManager.add).not.toHaveBeenCalled();
    expect(second.closeCount()).toBe(0);
  });

  it("refuses to adopt a peer whose remote name is already taken", async () => {
    const registry = new LocalChannelPortRegistry();
    const syncManager = fakeSyncManager(["local:peer-b:chan-1"]);
    const port = fakePort();

    await expect(
      registerLocalPeer(syncManager, registry, SPEC, port.port),
    ).rejects.toThrow(/already has a remote named/);

    expect(registry.has("peer-b", "chan-1")).toBe(false);
    expect(syncManager.add).not.toHaveBeenCalled();
  });

  it("unregisters and closes the port when adding the remote fails", async () => {
    const registry = new LocalChannelPortRegistry();
    const syncManager = fakeSyncManager();
    syncManager.add.mockRejectedValue(new Error("add boom"));
    const port = fakePort();

    await expect(
      registerLocalPeer(syncManager, registry, SPEC, port.port),
    ).rejects.toThrow("add boom");

    expect(registry.has("peer-b", "chan-1")).toBe(false);
    expect(port.closeCount()).toBe(1);
  });
});

describe("LocalChannelPortRegistry dead-port contract", () => {
  it("forgets its entry when the channel closes the port it was handed", () => {
    const registry = new LocalChannelPortRegistry();
    const port = fakePort();
    registry.register("peer-b", "chan-1", port.port);

    // What LocalChannel.shutdown() does.
    registry.provider("peer-b", "chan-1")!.close();

    expect(port.closeCount()).toBe(1);
    expect(registry.has("peer-b", "chan-1")).toBe(false);
    expect(registry.isClosed("peer-b", "chan-1")).toBe(true);
  });

  it("refuses a closed key loudly rather than answering undefined", () => {
    const registry = new LocalChannelPortRegistry();
    registry.register("peer-b", "chan-1", fakePort().port);
    registry.unregister("peer-b", "chan-1");

    expect(() => registry.provider("peer-b", "chan-1")).toThrow(
      /has been closed; the link is severed/,
    );
  });

  it("answers undefined for a key it never knew", () => {
    const registry = new LocalChannelPortRegistry();

    expect(registry.provider("peer-b", "chan-1")).toBeUndefined();
  });

  it("allows a re-link under a key it had closed", () => {
    const registry = new LocalChannelPortRegistry();
    registry.register("peer-b", "chan-1", fakePort().port);
    registry.unregister("peer-b", "chan-1");

    const fresh = fakePort();
    registry.register("peer-b", "chan-1", fresh.port);

    registry.provider("peer-b", "chan-1")!.postMessage("again");
    expect(fresh.posted).toEqual(["again"]);
    expect(registry.isClosed("peer-b", "chan-1")).toBe(false);
  });
});

describe("collection id boundary validation", () => {
  it("rejects a dotted drive id", () => {
    expect(() => assertCollectionIdParts("drive.one", "main")).toThrow(
      /contains a "\." which the collection id format cannot carry/,
    );
  });

  it("rejects a dotted branch", () => {
    expect(() => assertCollectionIdParts("drive-1", "feat.x")).toThrow(
      /Branch "feat\.x" contains a "\."/,
    );
  });

  it("accepts dot-free parts", () => {
    expect(() => assertCollectionIdParts("drive-1", "main")).not.toThrow();
  });

  // The key of a dotted drive id re-serialises byte-for-byte, so the key alone
  // proves nothing; what gives it away is the dotted branch it parses into.
  it("rejects a wire key a dotted drive id produced", () => {
    const dotted = DriveCollectionId.forDrive("drive.one", "main");

    expect(() => collectionIdFromKey(dotted.key)).toThrow(
      /Branch "main\.drive" contains a "\."/,
    );
  });

  it("rehydrates a well-formed wire key", () => {
    const id = DriveCollectionId.forDrive("drive-1", "main");
    const parsed = collectionIdFromKey(id.key);

    expect(parsed.driveId).toBe("drive-1");
    expect(parsed.branch).toBe("main");
  });
});
