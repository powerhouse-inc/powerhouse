import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GqlRequestChannel } from "../../../../src/sync/channels/gql-req-channel.js";
import { SyncOperation } from "../../../../src/sync/sync-operation.js";
import { SyncOperationStatus } from "../../../../src/sync/types.js";
import { syncOperationErrorType } from "../../../../src/sync/utils.js";
import { purgeMarker } from "../../../purge/helpers.js";
import {
  ManualPollTimer,
  createMockCursorStorage,
  createMockFetch,
  createMockLogger,
  createMockOperationIndex,
  createTestConfig,
} from "./test-helpers.js";

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

function refusal(documentId: string, errorType = "MARKER_REFUSED") {
  return {
    documentId,
    error: "Failed to apply operations: forged",
    errorType,
    jobId: "0",
    branch: "main",
    scopes: ["document"],
    operationCount: 1,
  };
}

function setup(deadLetters: () => unknown[]) {
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
              ackOrdinal: 4,
              deadLetters: deadLetters(),
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
  return { channel, timer, pushed };
}

async function pollRounds(timer: ManualPollTimer, rounds: number) {
  for (let i = 0; i < rounds; i++) {
    await vi.advanceTimersByTimeAsync(1_100);
    await timer.tick();
    await vi.advanceTimersByTimeAsync(10);
  }
}

describe("a pushed marker the remote refused", () => {
  afterEach(() => vi.useRealTimers());

  it("is not pushed again, and its refusal is reported once", async () => {
    vi.useFakeTimers();
    let refused = false;
    const { channel, timer, pushed } = setup(() =>
      refused ? [refusal("purged")] : [],
    );
    const reported: SyncOperation[] = [];
    channel.deadLetter.onAdded((items) => reported.push(...items));
    await channel.init();
    const marker = markerItem(5);
    channel.outbox.add(marker);
    await vi.advanceTimersByTimeAsync(600);
    expect(pushed).toHaveLength(1);
    refused = true;

    await pollRounds(timer, 5);

    expect(pushed).toHaveLength(1);
    expect(channel.outbox.get(marker.id)).toBeUndefined();
    expect(marker.status).toBe(SyncOperationStatus.Error);
    expect(reported).toHaveLength(1);
    expect(syncOperationErrorType(reported[0].error)).toBe("MARKER_REFUSED");
    await channel.shutdown();
  });

  it("keeps re-pushing a marker whose document was refused for another reason", async () => {
    vi.useFakeTimers();
    let refused = false;
    const { channel, timer, pushed } = setup(() =>
      refused ? [refusal("purged", "UNCLASSIFIED")] : [],
    );
    await channel.init();
    const marker = markerItem(5);
    channel.outbox.add(marker);
    await vi.advanceTimersByTimeAsync(600);
    refused = true;

    await pollRounds(timer, 3);

    expect(pushed.length).toBeGreaterThan(1);
    expect(channel.outbox.get(marker.id)).toBe(marker);
    await channel.shutdown();
  });
});
