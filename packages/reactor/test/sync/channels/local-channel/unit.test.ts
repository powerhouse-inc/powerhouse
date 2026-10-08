import { afterEach, describe, expect, it } from "vitest";
import { ChannelError } from "../../../../src/sync/errors.js";
import type { SyncOperation } from "../../../../src/sync/sync-operation.js";
import {
  ChannelErrorSource,
  SyncOperationStatus,
} from "../../../../src/sync/types.js";
import {
  applyInbox,
  FakeTransport,
  makeChannel,
  makePair,
  manifestFor,
  MemoryCursorStorage,
  pushFrame,
  syncOp,
  waitFor,
  type ChannelPair,
} from "./harness.js";

describe("LocalChannel", () => {
  let pair: ChannelPair | undefined;

  afterEach(async () => {
    await pair?.close();
    pair = undefined;
  });

  describe("handshake and manifests", () => {
    it("exchanges peer manifests on the handshake", async () => {
      pair = makePair({
        manifestA: manifestFor([1, 2]),
        manifestB: manifestFor([1]),
      });
      await pair.a.init();
      await pair.b.init();

      await waitFor(() => pair!.heardA.length > 0 && pair!.heardB.length > 0);

      // Each side hears the OTHER's manifest -- the version skew is delivered.
      expect(pair.heardA).toEqual([manifestFor([1])]);
      expect(pair.heardB).toEqual([manifestFor([1, 2])]);
    });

    it("hears a silent peer as a null manifest", async () => {
      pair = makePair({ manifestA: manifestFor([1]), manifestB: null });
      await pair.a.init();
      await pair.b.init();

      await waitFor(() => pair!.heardA.length > 0);
      expect(pair.heardA).toEqual([null]);
    });

    it("does not re-fire for a reconnect that re-announces the same manifest", async () => {
      pair = makePair();
      await pair.a.init();
      await pair.b.init();
      await waitFor(() => pair!.heardA.length > 0);

      // A second HELLO carrying the same revision is deduped.
      pair.b.triggerPull();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(pair.heardA).toHaveLength(1);
    });
  });

  describe("connection state", () => {
    it("is not connected before the handshake", async () => {
      pair = makePair();
      const before = pair.a.getConnectionState();
      expect(before.state).toBe("connecting");
      expect(before.lastSuccessUtcMs).toBe(0);

      await pair.a.init();
      await pair.b.init();
      await waitFor(() => pair!.a.getConnectionState().state === "connected");

      const after = pair.a.getConnectionState();
      expect(after.state).toBe("connected");
      expect(after.lastSuccessUtcMs).toBeGreaterThan(0);
    });

    it("reports disconnected after shutdown", async () => {
      pair = makePair();
      await pair.a.init();
      await pair.b.init();
      await waitFor(() => pair!.a.getConnectionState().state === "connected");

      await pair.a.shutdown();
      expect(pair.a.getConnectionState().state).toBe("disconnected");
    });

    it("returns to connected on good traffic after a malformed frame", async () => {
      const transport = new FakeTransport();
      const channel = makeChannel({ transport });
      try {
        await channel.init();
        transport.deliver({
          kind: "resend",
          channelId: "peer",
          sinceOrdinal: 0,
        });
        transport.deliver({ kind: "nonsense" });
        expect(channel.getConnectionState().state).toBe("error");

        transport.deliver({ kind: "ack", channelId: "peer", ackOrdinal: 0 });

        expect(channel.getConnectionState().state).toBe("connected");
      } finally {
        await channel.shutdown();
      }
    });

    it("answers an opening hello once, and never answers an answer", async () => {
      const transport = new FakeTransport();
      const channel = makeChannel({ transport });
      try {
        await channel.init();
        expect(transport.sentOfKind("hello")).toHaveLength(1);
        const hello = {
          kind: "hello",
          channelId: "peer",
          collectionId: "drive.main.drive-1",
          filter: { documentId: [], scope: [], branch: "main" },
          sinceOrdinal: 0,
          manifest: null,
        };

        transport.deliver(hello);
        transport.deliver({ ...hello, reply: true });

        const hellos = transport.sentOfKind("hello");
        expect(hellos).toHaveLength(2);
        expect(hellos[1].reply).toBe(true);
      } finally {
        await channel.shutdown();
      }
    });

    it("leaves its port open on shutdown, for its registrant to close", async () => {
      const transport = new FakeTransport();
      const channel = makeChannel({ transport });
      await channel.init();

      await channel.shutdown();

      expect(transport.closed).toBe(false);
    });
  });

  describe("symmetric push and ack", () => {
    it("pushes an outbox op to the peer's inbox and trims on the ack", async () => {
      pair = makePair();
      await pair.a.init();
      await pair.b.init();
      await waitFor(() => pair!.a.getConnectionState().state === "connected");

      pair.a.outbox.add(syncOp("a->b", 5));
      await waitFor(() => pair!.b.inbox.items.length === 1);

      // The sync manager would apply and trim; that advances B's inbox ack,
      // which it reports back so A can trim its outbox.
      applyInbox(pair.b);
      await waitFor(() => pair!.a.outbox.items.length === 0);
      expect(pair.b.inbox.ackOrdinal).toBe(5);
    });

    it("re-announces its ack for a push it drops as already applied", async () => {
      const cursorsB = new MemoryCursorStorage();
      await cursorsB.upsert({
        remoteName: "b->a",
        cursorType: "inbox",
        cursorOrdinal: 10,
        lastSyncedAtUtcMs: Date.now(),
      });
      pair = makePair({ cursorsB });
      await pair.a.init();
      await pair.b.init();
      await waitFor(() => pair!.a.getConnectionState().state === "connected");

      pair.a.outbox.add(syncOp("a->b", 5));

      await waitFor(() => pair!.a.outbox.items.length === 0);
      expect(pair.b.inbox.items).toHaveLength(0);
    });

    it("re-pushes unacked items on a resend request", async () => {
      pair = makePair();
      await pair.a.init();
      await pair.b.init();
      await waitFor(() => pair!.a.getConnectionState().state === "connected");

      pair.a.outbox.add(syncOp("a->b", 7));
      await waitFor(() => pair!.b.inbox.items.length === 1);
      // Drop B's copy without acking, as a transport blip would.
      pair.b.inbox.remove(...pair.b.inbox.items);
      expect(pair.a.outbox.items).toHaveLength(1);

      pair.b.triggerPull();
      await waitFor(() => pair!.b.inbox.items.length === 1);
    });
  });

  describe("cursor persistence across a restart", () => {
    it("resumes the inbox and outbox cursors from storage", async () => {
      const cursorsA = new MemoryCursorStorage();
      pair = makePair({ cursorsA });
      await pair.a.init();
      await pair.b.init();

      const inboxOp = syncOp("a->b", 3);
      inboxOp.transported();
      pair.a.inbox.add(inboxOp);
      inboxOp.executed();
      pair.a.inbox.remove(inboxOp);

      const outboxOp = syncOp("a->b", 8);
      pair.a.outbox.add(outboxOp);
      outboxOp.executed();
      pair.a.outbox.remove(outboxOp);

      await waitFor(
        async () =>
          (await cursorsA.get("a->b", "inbox")).cursorOrdinal === 3 &&
          (await cursorsA.get("a->b", "outbox")).cursorOrdinal === 8,
      );

      // A fresh channel over the same storage resumes from the persisted rows.
      const restart = makePair({ cursorsA });
      try {
        await restart.a.init();
        expect(restart.a.inbox.ackOrdinal).toBe(3);
        expect(restart.a.outbox.ackOrdinal).toBe(8);
      } finally {
        await restart.close();
      }
    });
  });

  describe("init ordering race", () => {
    it("drops a push delivered at subscribe time for ops already acked", async () => {
      const cursors = new MemoryCursorStorage();
      await cursors.upsert({
        remoteName: "a->b",
        cursorType: "inbox",
        cursorOrdinal: 10,
        lastSyncedAtUtcMs: Date.now(),
      });

      // The transport flushes its buffered frame synchronously the instant a
      // listener subscribes -- the moment a real MessagePort releases what was
      // posted before the listener attached, and the window the race lives in.
      const transport = new FakeTransport();
      transport.deliverOnSubscribe = true;
      transport.enqueue(pushFrame("channel-peer", [syncOp("a->b", 5)]));

      const channel = makeChannel({ transport, cursors });
      try {
        await channel.init();

        // init loaded the cursor and initialised the mailbox before it
        // subscribed, so the stale op is dropped rather than re-loaded, and the
        // ack floor is never dragged below the persisted cursor.
        expect(channel.inbox.items).toHaveLength(0);
        expect(channel.inbox.ackOrdinal).toBe(10);
        expect((await cursors.get("a->b", "inbox")).cursorOrdinal).toBe(10);
        expect(
          transport.sentOfKind("ack").map((frame) => frame.ackOrdinal),
        ).toEqual([10]);
      } finally {
        await channel.shutdown();
      }
    });

    it("ingests a genuinely new push delivered at subscribe time", async () => {
      const cursors = new MemoryCursorStorage();
      await cursors.upsert({
        remoteName: "a->b",
        cursorType: "inbox",
        cursorOrdinal: 10,
        lastSyncedAtUtcMs: Date.now(),
      });

      const transport = new FakeTransport();
      transport.deliverOnSubscribe = true;
      transport.enqueue(pushFrame("channel-peer", [syncOp("a->b", 11)]));

      const channel = makeChannel({ transport, cursors });
      try {
        await channel.init();

        // An op past the persisted cursor is real work and is still ingested.
        expect(channel.inbox.items).toHaveLength(1);
        expect(channel.inbox.ackOrdinal).toBe(10);
      } finally {
        await channel.shutdown();
      }
    });
  });

  describe("malformed frames", () => {
    it("records a malformed push as a failure instead of throwing", async () => {
      const transport = new FakeTransport();
      const channel = makeChannel({ transport });
      try {
        await channel.init();

        // Both frames pass the top-level object/kind check but carry no usable
        // envelopes array; the old code threw a TypeError out of the callback.
        expect(() => transport.deliver({ kind: "push" })).not.toThrow();
        expect(() =>
          transport.deliver({ kind: "push", envelopes: "not-an-array" }),
        ).not.toThrow();

        const state = channel.getConnectionState();
        expect(state.failureCount).toBe(2);
        expect(state.state).toBe("error");
      } finally {
        await channel.shutdown();
      }
    });
  });

  describe("malformed envelopes", () => {
    const wireOps = (): unknown[] => {
      const frame = pushFrame("channel-peer", [syncOp("b->a", 1)]);
      return (frame.envelopes[0] as { operations: unknown[] }).operations;
    };

    it.each([
      ["no channelMeta", () => ({ operations: wireOps() })],
      [
        "an operation without context",
        () => ({
          channelMeta: { id: "peer" },
          operations: [{ operation: {} }],
        }),
      ],
      [
        "a signer whose signatures cannot be read",
        () => {
          const [op] = wireOps() as Array<{
            operation: { action: Record<string, unknown> };
          }>;
          op.operation.action.context = { signer: { signatures: "x" } };
          return { channelMeta: { id: "peer" }, operations: [op] };
        },
      ],
    ])("records a push with %s as a failure", async (_label, envelope) => {
      const transport = new FakeTransport();
      const channel = makeChannel({ transport });
      try {
        await channel.init();

        expect(() =>
          transport.deliver({
            kind: "push",
            channelId: "peer",
            envelopes: [envelope()],
          }),
        ).not.toThrow();

        expect(channel.inbox.items).toHaveLength(0);
        expect(channel.getConnectionState().state).toBe("error");
      } finally {
        await channel.shutdown();
      }
    });
  });

  describe("push failure classification", () => {
    it("keeps an op in the outbox on a transient post failure and re-pushes on recovery", async () => {
      const transport = new FakeTransport();
      const channel = makeChannel({ transport });
      try {
        await channel.init();

        const op = syncOp("a->b", 5);
        transport.throwOnPost = new Error("port temporarily unusable");
        channel.outbox.add(op);

        // A transient throw must not dead-letter: the op stays in the outbox.
        expect(channel.outbox.items).toHaveLength(1);
        expect(channel.deadLetter.items).toHaveLength(0);
        expect(op.status).not.toBe(SyncOperationStatus.Error);
        expect(transport.sentOfKind("push")).toHaveLength(0);

        // Recovery: the transport works again and a resend re-pushes it.
        transport.throwOnPost = undefined;
        transport.deliver({
          kind: "resend",
          channelId: "channel-peer",
          sinceOrdinal: 0,
        });

        expect(transport.sentOfKind("push")).toHaveLength(1);
        expect(channel.outbox.items).toHaveLength(1);
      } finally {
        await channel.shutdown();
      }
    });

    it("keeps its push retry armed when the peer pushes to it", async () => {
      const transport = new FakeTransport();
      const channel = makeChannel({ transport });
      try {
        await channel.init();
        transport.throwOnPost = new Error("port temporarily unusable");
        channel.outbox.add(syncOp("a->b", 5));
        expect(channel.getConnectionState().pushBlocked).toBe(true);
        transport.throwOnPost = undefined;

        transport.deliver(pushFrame("channel-peer", [syncOp("b->a", 1)]));

        expect(channel.inbox.items).toHaveLength(1);
        const state = channel.getConnectionState();
        expect(state.pushBlocked).toBe(true);
        expect(state.pushFailureCount).toBe(1);
      } finally {
        await channel.shutdown();
      }
    });

    it("dead-letters an op on an unrecoverable serialization failure", async () => {
      const transport = new FakeTransport();
      const channel = makeChannel({ transport });
      try {
        await channel.init();

        const op = syncOp("a->b", 5);
        const cloneError = new Error("value could not be cloned");
        cloneError.name = "DataCloneError";
        transport.throwOnPost = cloneError;
        channel.outbox.add(op);

        expect(channel.outbox.items).toHaveLength(0);
        expect(channel.deadLetter.items).toHaveLength(1);
        expect(op.status).toBe(SyncOperationStatus.Error);
      } finally {
        await channel.shutdown();
      }
    });
  });

  describe("ack posting", () => {
    it("posts an ack only when the floor advances across a burst of removals", async () => {
      const transport = new FakeTransport();
      const channel = makeChannel({ transport });
      try {
        await channel.init();

        const add = (...ops: SyncOperation[]): void => {
          for (const op of ops) op.transported();
          channel.inbox.add(...ops);
        };
        const applyRemove = (...ops: SyncOperation[]): void => {
          for (const op of ops) op.executed();
          channel.inbox.remove(...ops);
        };

        // Advancing removal: the floor moves to 2 and posts one ack.
        add(syncOp("a->b", 1), syncOp("a->b", 2, "doc-2"));
        const [op1, op2] = [...channel.inbox.items];
        applyRemove(op1, op2);

        // Non-advancing removal: op4 is removed while op3 is still unapplied,
        // so the floor stays at 2 and no ack is posted despite the removal.
        add(syncOp("a->b", 3, "doc-3"), syncOp("a->b", 4, "doc-4"));
        const held = [...channel.inbox.items];
        const op3 = held.find((op) => op.documentId === "doc-3")!;
        const op4 = held.find((op) => op.documentId === "doc-4")!;
        applyRemove(op4);

        // Releasing op3 advances the floor to 4 and posts the second ack.
        applyRemove(op3);

        const acks = transport
          .sentOfKind("ack")
          .map((frame) => frame.ackOrdinal as number);
        expect(acks).toEqual([2, 4]);
      } finally {
        await channel.shutdown();
      }
    });
  });
});
