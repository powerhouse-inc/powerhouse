import { describe, expect, it, vi, type Mock } from "vitest";
import { DriveCollectionId } from "../../../../src/cache/operation-index-types.js";
import {
  assertCollectionIdParts,
  collectionIdFromKey,
  DEFAULT_LOCAL_FILTER,
  LocalChannelPortRegistry,
  registerLocalPeer,
  removeLocalPeer,
  type LocalPeerSyncManager,
} from "../../../../src/sync/channels/local-channel-registry.js";
import type { LocalChannelPort } from "../../../../src/sync/channels/local-channel-transport.js";

type FakePort = LocalChannelPort & { close: Mock<() => void> };

function fakePort(): FakePort {
  return {
    postMessage: vi.fn(),
    onMessage: vi.fn(() => () => {}),
    close: vi.fn<() => void>(),
  };
}

function failingSyncManager(failure: "add" | "remove"): LocalPeerSyncManager & {
  add: Mock<LocalPeerSyncManager["add"]>;
  remove: Mock<LocalPeerSyncManager["remove"]>;
} {
  return {
    list: () => [],
    add: vi.fn<LocalPeerSyncManager["add"]>(() =>
      failure === "add"
        ? Promise.reject(new Error("add failed"))
        : Promise.reject(new Error("unexpected add")),
    ),
    remove: vi.fn<LocalPeerSyncManager["remove"]>(() =>
      failure === "remove"
        ? Promise.reject(new Error("remove failed"))
        : Promise.resolve(),
    ),
  };
}

const spec = {
  peerId: "peer-a",
  channelName: "chan-a",
  collectionId: DriveCollectionId.forDrive("drive-1"),
  remoteName: "remote-a",
  filter: DEFAULT_LOCAL_FILTER,
};

describe("LocalChannelPortRegistry", () => {
  it("answers undefined for a key nothing registered", () => {
    const registry = new LocalChannelPortRegistry();
    expect(registry.provider("peer", "chan")).toBeUndefined();
    expect(registry.has("peer", "chan")).toBe(false);
  });

  it("resolves a registered port", () => {
    const registry = new LocalChannelPortRegistry();
    registry.register("peer", "chan", fakePort());
    expect(registry.has("peer", "chan")).toBe(true);
    expect(registry.provider("peer", "chan")).toBeDefined();
  });

  it("refuses to replace a live entry", () => {
    const registry = new LocalChannelPortRegistry();
    registry.register("peer", "chan", fakePort());
    expect(() => registry.register("peer", "chan", fakePort())).toThrow(
      /already registered/,
    );
  });

  it("closes the port it unregisters", () => {
    const registry = new LocalChannelPortRegistry();
    const port = fakePort();
    registry.register("peer", "chan", port);

    registry.unregister("peer", "chan");

    expect(port.close).toHaveBeenCalledTimes(1);
  });

  it("refuses an unregistered key loudly, and takes a re-link under it", () => {
    const registry = new LocalChannelPortRegistry();
    registry.register("peer", "chan", fakePort());
    registry.unregister("peer", "chan");

    expect(registry.isClosed("peer", "chan")).toBe(true);
    expect(() => registry.provider("peer", "chan")).toThrow(/severed/);

    registry.register("peer", "chan", fakePort());
    expect(registry.isClosed("peer", "chan")).toBe(false);
    expect(registry.provider("peer", "chan")).toBeDefined();
  });

  it("keeps keys whose halves contain the separator of a joined key apart", () => {
    const registry = new LocalChannelPortRegistry();
    registry.register("a\u0000b", "c", fakePort());
    expect(registry.has("a", "b\u0000c")).toBe(false);
  });
});

describe("registerLocalPeer", () => {
  it("unregisters and closes the port when the add fails", async () => {
    const registry = new LocalChannelPortRegistry();
    const port = fakePort();

    await expect(
      registerLocalPeer(failingSyncManager("add"), registry, spec, port),
    ).rejects.toThrow(/add failed/);

    expect(port.close).toHaveBeenCalledTimes(1);
    expect(registry.has(spec.peerId, spec.channelName)).toBe(false);
  });

  it("refuses a key that already holds a port", async () => {
    const registry = new LocalChannelPortRegistry();
    registry.register(spec.peerId, spec.channelName, fakePort());
    const manager = failingSyncManager("add");

    await expect(
      registerLocalPeer(manager, registry, spec, fakePort()),
    ).rejects.toThrow(/already holds a local sync port/);
    expect(manager.add).not.toHaveBeenCalled();
  });
});

describe("removeLocalPeer", () => {
  it("frees the key even when remove rejects", async () => {
    const registry = new LocalChannelPortRegistry();
    registry.register(spec.peerId, spec.channelName, fakePort());

    await expect(
      removeLocalPeer(failingSyncManager("remove"), registry, spec),
    ).rejects.toThrow(/remove failed/);

    expect(registry.has(spec.peerId, spec.channelName)).toBe(false);
  });
});

describe("collection id guards", () => {
  it("round-trips a dot-free collection id key", () => {
    const id = collectionIdFromKey("drive.main.testdrive");
    expect(id).toBeInstanceOf(DriveCollectionId);
    expect(id.driveId).toBe("testdrive");
    expect(id.branch).toBe("main");
  });

  it("refuses a dotted drive id or branch", () => {
    expect(() => assertCollectionIdParts("drive.one", "main")).toThrow(/"\."/);
    expect(() => assertCollectionIdParts("one", "main.draft")).toThrow(/"\."/);
    expect(() => collectionIdFromKey("drive.main.drive.one")).toThrow(/"\."/);
  });
});
