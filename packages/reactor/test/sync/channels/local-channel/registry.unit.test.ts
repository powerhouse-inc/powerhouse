import { MessageChannel } from "node:worker_threads";
import { describe, expect, it, vi, type Mock } from "vitest";
import { DriveCollectionId } from "../../../../src/cache/operation-index-types.js";
import { LocalChannel } from "../../../../src/sync/channels/local-channel.js";
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
import type { Remote } from "../../../../src/sync/interfaces.js";
import { createMockLogger } from "../../../factories.js";
import {
  applyInbox,
  FILTER,
  MemoryCursorStorage,
  syncOp,
  waitFor,
} from "./harness.js";

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

  it("past its bound, drops every queued push and keeps the latest control frames", () => {
    const warn = vi.fn();
    const logger = { ...createMockLogger(), warn };
    const registry = new LocalChannelPortRegistry({
      logger,
      maxQueuedFrames: 3,
    });
    const raw = new BrowserPortLike();
    registry.register("peer", "chan", messagePortTransport(raw));
    const push = (n: number) => ({ kind: "push", channelId: "p", n });
    const ack = (n: number) => ({ kind: "ack", channelId: "p", ackOrdinal: n });
    const resend = { kind: "resend", channelId: "p", sinceOrdinal: 0 };

    raw.receive(push(1));
    raw.receive(ack(1));
    raw.receive(resend);
    raw.receive(push(2));
    raw.receive(ack(2));
    raw.receive(push(3));

    const received: unknown[] = [];
    registry.provider("peer", "chan")!.onMessage((data) => received.push(data));
    expect(received).toEqual([ack(1), resend, ack(2)]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("detaches a subscriber whose receive throws during replay, keeping the rest queued", () => {
    const registry = new LocalChannelPortRegistry();
    const raw = new BrowserPortLike();
    registry.register("peer", "chan", messagePortTransport(raw));
    const port = registry.provider("peer", "chan")!;
    raw.receive("one");
    raw.receive("two");

    const failing: unknown[] = [];
    expect(() =>
      port.onMessage((data) => {
        failing.push(data);
        if (data === "one") throw new Error("receive failed");
      }),
    ).toThrow(/receive failed/);
    raw.receive("three");

    const next: unknown[] = [];
    port.onMessage((data) => next.push(data));
    expect(failing).toEqual(["one"]);
    expect(next).toEqual(["two", "three"]);
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

describe("removeLocalPeer around a live remote", () => {
  const live = { meta: { name: spec.remoteName } } as Remote;

  it("keeps the port open when remove fails and the remote is still live", async () => {
    const registry = new LocalChannelPortRegistry();
    const port = fakePort();
    registry.register(spec.peerId, spec.channelName, port);
    const manager = { ...failingSyncManager("remove"), list: () => [live] };

    await expect(removeLocalPeer(manager, registry, spec)).rejects.toThrow(
      /remove failed/,
    );

    expect(port.close).not.toHaveBeenCalled();
    expect(registry.has(spec.peerId, spec.channelName)).toBe(true);
  });

  it("waits for an in-flight reset before it removes", async () => {
    const registry = new LocalChannelPortRegistry();
    const port = fakePort();
    registry.register(spec.peerId, spec.channelName, port);
    let settle!: () => void;
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const remove = vi.fn<LocalPeerSyncManager["remove"]>(() =>
      Promise.resolve(),
    );
    const manager: LocalPeerSyncManager = {
      list: () => [live],
      add: vi.fn<LocalPeerSyncManager["add"]>(),
      remove,
      resetSettled: () => settled,
    };

    const removing = removeLocalPeer(manager, registry, spec);
    await Promise.resolve();
    expect(remove).not.toHaveBeenCalled();

    settle();
    await removing;
    expect(remove).toHaveBeenCalledWith(spec.remoteName);
    expect(port.close).toHaveBeenCalledTimes(1);
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

describe("LocalChannel over a registered port", () => {
  const collectionId = DriveCollectionId.forDrive("drive-1");

  function link(maxQueuedFrames?: number) {
    const { port1, port2 } = new MessageChannel();
    port1.unref();
    port2.unref();
    const registry = new LocalChannelPortRegistry({
      logger: createMockLogger(),
      maxQueuedFrames,
    });
    registry.register("a", "drive-1", messagePortTransport(port2));
    const a = new LocalChannel(
      createMockLogger(),
      "channel-a",
      "a->b",
      new MemoryCursorStorage(),
      messagePortTransport(port1),
      collectionId,
      FILTER,
    );
    const cursorsB = new MemoryCursorStorage();
    const makeB = (cursors = cursorsB): LocalChannel =>
      new LocalChannel(
        createMockLogger(),
        "channel-b",
        "b->a",
        cursors,
        registry.provider("a", "drive-1")!,
        collectionId,
        FILTER,
      );
    return {
      registry,
      a,
      makeB,
      close: () => {
        registry.unregister("a", "drive-1");
        port1.close();
      },
    };
  }

  class GatedCursorStorage extends MemoryCursorStorage {
    private readonly gate: Promise<void>;
    open!: () => void;

    constructor() {
      super();
      this.gate = new Promise((resolve) => {
        this.open = resolve;
      });
    }

    override async list(
      remoteName: string,
    ): ReturnType<MemoryCursorStorage["list"]> {
      await this.gate;
      return super.list(remoteName);
    }
  }

  it("does not hand the queue to a channel shut down mid-init", async () => {
    const { a, makeB, close } = link();
    try {
      const gated = new GatedCursorStorage();
      const dead = makeB(gated);
      const initing = dead.init();
      await dead.shutdown();

      await a.init();
      a.outbox.add(syncOp("a->b", 1));
      await new Promise((resolve) => setTimeout(resolve, 50));
      gated.open();
      await initing;

      const live = makeB();
      await live.init();
      expect(live.inbox.items).toHaveLength(1);
      await live.shutdown();
    } finally {
      await a.shutdown();
      close();
    }
  });

  it("keeps the live channel subscribed when a channel shut down mid-init resumes", async () => {
    const { a, makeB, close } = link();
    try {
      const gated = new GatedCursorStorage();
      const dead = makeB(gated);
      const initing = dead.init();
      await dead.shutdown();

      const live = makeB();
      await a.init();
      await live.init();
      await waitFor(() => live.getConnectionState().state === "connected");
      gated.open();
      await initing;

      a.outbox.add(syncOp("a->b", 1));
      await waitFor(() => live.inbox.items.length === 1);
      await live.shutdown();
    } finally {
      await a.shutdown();
      close();
    }
  });

  it("loses no push when the attach queue overflows while detached", async () => {
    const { a, makeB, close } = link(2);
    try {
      const b1 = makeB();
      await a.init();
      await b1.init();
      await waitFor(
        () =>
          a.getConnectionState().state === "connected" &&
          b1.getConnectionState().state === "connected",
      );
      await b1.shutdown();

      a.outbox.add(syncOp("a->b", 1, "doc-x"));
      a.outbox.add(syncOp("a->b", 2, "doc-y"));
      a.outbox.add(syncOp("a->b", 3, "doc-z"));
      await new Promise((resolve) => setTimeout(resolve, 50));

      const b2 = makeB();
      const seen = new Set<number>();
      b2.inbox.onAdded((items) => {
        for (const item of items) {
          for (const op of item.operations) seen.add(op.context.ordinal);
        }
        queueMicrotask(() => applyInbox(b2));
      });
      await b2.init();
      await waitFor(() => a.outbox.items.length === 0);

      expect([...seen].sort((x, y) => x - y)).toEqual([1, 2, 3]);
      expect(b2.inbox.ackOrdinal).toBe(3);
      await b2.shutdown();
    } finally {
      await a.shutdown();
      close();
    }
  });
});
