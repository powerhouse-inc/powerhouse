import { afterEach, describe, expect, it } from "vitest";
import { ChannelError } from "../../../../src/sync/errors.js";
import { ChannelErrorSource } from "../../../../src/sync/types.js";
import { deriveConnectionHealth } from "../../../../src/sync/sync-inspection.js";
import {
  applyInbox,
  makePair,
  manifestFor,
  MemoryCursorStorage,
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
    it("is not connected before the handshake, and never falsely connected", async () => {
      pair = makePair();
      const before = pair.a.getConnectionState();
      expect(before.state).toBe("connecting");
      expect(before.lastSuccessUtcMs).toBe(0);
      // The neverSucceeded guard only fires on a channel claiming "connected".
      expect(deriveConnectionHealth(before).neverSucceeded).toBe(false);

      await pair.a.init();
      await pair.b.init();
      await waitFor(() => pair!.a.getConnectionState().state === "connected");

      const after = pair.a.getConnectionState();
      expect(after.state).toBe("connected");
      expect(after.lastSuccessUtcMs).toBeGreaterThan(0);
      expect(deriveConnectionHealth(after).neverSucceeded).toBe(false);
    });

    it("reports disconnected after shutdown", async () => {
      pair = makePair();
      await pair.a.init();
      await pair.b.init();
      await waitFor(() => pair!.a.getConnectionState().state === "connected");

      await pair.a.shutdown();
      expect(pair.a.getConnectionState().state).toBe("disconnected");
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

  describe("inbox ack-floor invariant", () => {
    it("does not advance the inbox cursor past an unapplied op", async () => {
      pair = makePair();
      await pair.a.init();

      const op1 = syncOp("a->b", 1);
      const op2 = syncOp("a->b", 2, "doc-2");
      op1.transported();
      op2.transported();
      pair.a.inbox.add(op1, op2);

      // Apply only the higher ordinal; the lower one is still in flight.
      op2.executed();
      pair.a.inbox.remove(op2);

      expect(pair.a.inbox.ackOrdinal).toBe(0);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect((await pair.cursorsA.get("a->b", "inbox")).cursorOrdinal).toBe(0);

      // Applying the lower op releases the floor.
      op1.executed();
      pair.a.inbox.remove(op1);
      expect(pair.a.inbox.ackOrdinal).toBe(2);
      await waitFor(
        async () =>
          (await pair!.cursorsA.get("a->b", "inbox")).cursorOrdinal === 2,
      );
    });

    it("lets the cursor past a dead-lettered op", async () => {
      pair = makePair();
      await pair.a.init();

      const op1 = syncOp("a->b", 1);
      const op2 = syncOp("a->b", 2, "doc-2");
      op1.transported();
      op2.transported();
      pair.a.inbox.add(op1, op2);

      // op1 dead-letters (never applied); op2 applies.
      op1.failed(
        new ChannelError(
          ChannelErrorSource.Inbox,
          new Error("refused"),
          "UNSUPPORTED_PROTOCOL",
        ),
      );
      pair.a.inbox.remove(op1);
      op2.executed();
      pair.a.inbox.remove(op2);

      expect(pair.a.inbox.ackOrdinal).toBe(2);
      await waitFor(
        async () =>
          (await pair!.cursorsA.get("a->b", "inbox")).cursorOrdinal === 2,
      );
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
});
