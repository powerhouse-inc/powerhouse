import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { GqlRequestChannel } from "../../../src/sync/channels/gql-req-channel.js";
import { GqlResponseChannel } from "../../../src/sync/channels/gql-res-channel.js";
import { Mailbox } from "../../../src/sync/mailbox.js";
import { SyncOperation } from "../../../src/sync/sync-operation.js";
import { purgeMarker } from "../../purge/helpers.js";
import {
  ManualPollTimer,
  createMockCursorStorage,
  createMockFetch,
  createMockLogger,
  createMockOperationIndex,
  createMockSyncOperation,
  createTestConfig,
} from "./gql-req-channel/test-helpers.js";

function markerItem(ordinal: number, documentId = "purged"): SyncOperation {
  const op: OperationWithContext = {
    operation: purgeMarker(documentId),
    context: {
      documentId,
      documentType: "powerhouse/document-model",
      scope: "document",
      branch: "main",
      ordinal,
    },
  };
  return new SyncOperation(
    crypto.randomUUID(),
    "",
    [],
    "remote-1",
    documentId,
    ["document"],
    "main",
    [op],
  );
}

/** Received and applied, as the sync manager leaves an item before removing it. */
function applied(item: SyncOperation): SyncOperation {
  item.transported();
  item.executed();
  return item;
}

const inboxCursors = (upsert: Mock) =>
  upsert.mock.calls
    .map(([cursor]) => cursor as { cursorType: string; cursorOrdinal: number })
    .filter((cursor) => cursor.cursorType === "inbox")
    .map((cursor) => cursor.cursorOrdinal);

describe("an inbox holding a marker that awaits its load", () => {
  it("keeps its ack below the marker until the marker is applied", () => {
    const inbox = new Mailbox({ holdAckBelowMarkers: true });
    const marker = markerItem(5);
    marker.transported();
    const later = createMockSyncOperation("later", "remote-1", 7);
    inbox.add(marker, later);
    applied(later);
    inbox.remove(later);
    expect(inbox.ackOrdinal).toBe(4);

    marker.executed();
    expect(inbox.ackOrdinal).toBe(7);
  });

  it("lets the ack pass a marker that left without applying (refused)", () => {
    const inbox = new Mailbox({ holdAckBelowMarkers: true });
    const marker = markerItem(5);
    const later = createMockSyncOperation("later", "remote-1", 7);
    inbox.add(marker, later);
    applied(later);
    inbox.remove(later);
    inbox.remove(marker);
    expect(inbox.ackOrdinal).toBe(7);
  });

  /**
   * The marker hold is opt-in, but the unapplied floor is not: it is on by
   * default, so a channel cannot forget to ask for it. Only a mailbox whose ack
   * no cursor reads opts out, which is what an outbox does.
   */
  it("still holds for the unapplied marker without the marker option", () => {
    const inbox = new Mailbox();
    const marker = markerItem(5);
    const later = createMockSyncOperation("later", "remote-1", 7);
    inbox.add(marker, later);
    applied(later);
    expect(inbox.ackOrdinal).toBe(4);
  });

  it("is not held in a mailbox that opted out, as an outbox does", () => {
    const outbox = new Mailbox({ holdAckBelowUnapplied: false });
    const later = createMockSyncOperation("later", "remote-1", 7);
    outbox.add(markerItem(5), later);
    applied(later);
    expect(outbox.ackOrdinal).toBe(7);
  });

  it("holds a polling client's persisted cursor and the ack it sends", async () => {
    const polls: Array<{ outboxAck: number; outboxLatest: number }> = [];
    const fetch = createMockFetch((body) => {
      const { query, variables } = body as {
        query: string;
        variables: { outboxAck: number; outboxLatest: number };
      };
      if (query.includes("touchChannel")) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              data: { touchChannel: { success: true, ackOrdinal: 0 } },
            }),
        };
      }
      polls.push(variables);
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              pollSyncEnvelopes: {
                envelopes: [],
                ackOrdinal: 0,
                deadLetters: [],
                hasMore: false,
              },
            },
          }),
      };
    });
    const cursors = createMockCursorStorage();
    const timer = new ManualPollTimer();
    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      cursors,
      createTestConfig({
        fetchFn: fetch as unknown as typeof globalThis.fetch,
      }),
      createMockOperationIndex(),
      timer,
    );
    await channel.init();

    const marker = markerItem(5);
    marker.transported();
    const later = createMockSyncOperation("later", "remote-1", 7);
    later.transported();
    channel.inbox.add(marker, later);
    later.executed();
    channel.inbox.remove(later);
    await timer.tick();

    expect(inboxCursors(cursors.upsert as Mock)).toEqual([4]);
    expect(polls.at(-1)).toEqual(
      expect.objectContaining({ outboxAck: 4, outboxLatest: 7 }),
    );

    marker.executed();
    channel.inbox.remove(marker);
    await timer.tick();
    expect(inboxCursors(cursors.upsert as Mock)).toEqual([4, 7]);
    expect(polls.at(-1)).toEqual(expect.objectContaining({ outboxAck: 7 }));
    await channel.shutdown();
  });

  it("holds a served channel's persisted cursor and the ack it reports", async () => {
    const cursors = createMockCursorStorage();
    const channel = new GqlResponseChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      cursors,
    );
    await channel.init();

    const marker = markerItem(5);
    marker.transported();
    const later = createMockSyncOperation("later", "remote-1", 7);
    later.transported();
    channel.inbox.add(marker, later);
    later.executed();
    channel.inbox.remove(later);

    expect(channel.inbox.ackOrdinal).toBe(4);
    expect(inboxCursors(cursors.upsert as Mock)).toEqual([4]);
  });
});

describe("a pushing client with a marker the remote never acknowledged", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("pushes it again once retryMaxDelayMs has passed", async () => {
    vi.useFakeTimers();
    const pushed: string[] = [];
    const fetch = createMockFetch((body) => {
      if (body.query.includes("touchChannel")) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              data: { touchChannel: { success: true, ackOrdinal: 0 } },
            }),
        };
      }
      if (body.query.includes("pushSyncEnvelopes")) {
        pushed.push(JSON.stringify(body));
        return {
          ok: true,
          json: () => Promise.resolve({ data: { pushSyncEnvelopes: true } }),
        };
      }
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              pollSyncEnvelopes: {
                envelopes: [],
                ackOrdinal: 0,
                deadLetters: [],
                hasMore: false,
              },
            },
          }),
      };
    });
    const timer = new ManualPollTimer();
    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      createMockCursorStorage(),
      createTestConfig({
        fetchFn: fetch as unknown as typeof globalThis.fetch,
        retryMaxDelayMs: 1_000,
      }),
      createMockOperationIndex(),
      timer,
    );
    await channel.init();

    channel.outbox.add(markerItem(5), createMockSyncOperation("o", "r", 6));
    await vi.advanceTimersByTimeAsync(600);
    expect(pushed).toHaveLength(1);

    await timer.tick();
    await vi.advanceTimersByTimeAsync(10);
    expect(pushed).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1_000);
    await timer.tick();
    await vi.advanceTimersByTimeAsync(10);
    expect(pushed).toHaveLength(2);
    expect(pushed[1]).toContain("PURGE_DOCUMENT");
    expect(pushed[1]).not.toContain("TEST_OP");
    await channel.shutdown();
  });
});
