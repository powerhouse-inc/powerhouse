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
import {
  messagePortTransport,
  type LocalChannelPort,
  type MessagePortLike,
} from "../../../../src/sync/channels/local-channel-transport.js";
import { createMockLogger } from "../../../factories.js";

type FakePort = LocalChannelPort & { close: Mock<() => void> };

function fakePort(): FakePort {
  return {
    postMessage: vi.fn(),
    onMessage: vi.fn(() => () => {}),
    close: vi.fn<() => void>(),
  };
}

/** A started browser MessagePort drops what arrives while it has no listener. */
class BrowserPortLike implements MessagePortLike {
  readonly listeners = new Set<(event: unknown) => void>();
  closed = false;
  private started = false;
  private readonly beforeStart: unknown[] = [];

  postMessage(): void {}

  close(): void {
    this.closed = true;
  }

  addEventListener(_type: "message", listener: (event: unknown) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(
    _type: "message",
    listener: (event: unknown) => void,
  ): void {
    this.listeners.delete(listener);
  }

  start(): void {
    this.started = true;
    for (const data of this.beforeStart.splice(0)) this.receive(data);
  }

  /** A frame from the peer. */
  receive(data: unknown): void {
    if (!this.started) {
      this.beforeStart.push(data);
      return;
    }
    for (const listener of this.listeners) listener({ data });
  }
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

  it("replays frames that arrive while no channel is attached", () => {
    const registry = new LocalChannelPortRegistry();
    const raw = new BrowserPortLike();
    registry.register("peer", "chan", messagePortTransport(raw));
    const port = registry.provider("peer", "chan")!;

    const first: unknown[] = [];
    const detach = port.onMessage((data) => first.push(data));
    raw.receive("one");
    detach();
    raw.receive("two");

    const second: unknown[] = [];
    port.onMessage((data) => second.push(data));
    raw.receive("three");

    expect(first).toEqual(["one"]);
    expect(second).toEqual(["two", "three"]);
  });

  it("drops the oldest queued frame past its bound, with a warning", () => {
    const warn = vi.fn();
    const logger = { ...createMockLogger(), warn };
    const registry = new LocalChannelPortRegistry({
      logger,
      maxQueuedFrames: 2,
    });
    const raw = new BrowserPortLike();
    registry.register("peer", "chan", messagePortTransport(raw));

    raw.receive("one");
    raw.receive("two");
    raw.receive("three");

    const received: unknown[] = [];
    registry.provider("peer", "chan")!.onMessage((data) => received.push(data));
    expect(received).toEqual(["two", "three"]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("delivers only to the latest attach, and an older detach is a no-op", () => {
    const registry = new LocalChannelPortRegistry();
    const raw = new BrowserPortLike();
    registry.register("peer", "chan", messagePortTransport(raw));
    const port = registry.provider("peer", "chan")!;

    const older: unknown[] = [];
    const newer: unknown[] = [];
    const detachOlder = port.onMessage((data) => older.push(data));
    port.onMessage((data) => newer.push(data));
    detachOlder();
    raw.receive("one");

    expect(older).toEqual([]);
    expect(newer).toEqual(["one"]);
  });

  it("holds one raw listener for the port's registered life", () => {
    const registry = new LocalChannelPortRegistry();
    const raw = new BrowserPortLike();
    registry.register("peer", "chan", messagePortTransport(raw));
    const port = registry.provider("peer", "chan")!;

    port.onMessage(() => {})();
    port.onMessage(() => {});
    port.close();
    expect(raw.listeners.size).toBe(1);
    expect(raw.closed).toBe(false);

    registry.unregister("peer", "chan");
    expect(raw.listeners.size).toBe(0);
    expect(raw.closed).toBe(true);
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
