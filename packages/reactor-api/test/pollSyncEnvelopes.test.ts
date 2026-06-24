import type { ISyncManager, SyncOperation } from "@powerhousedao/reactor";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  MAX_OPERATIONS_PER_ENVELOPE,
  MAX_OPERATIONS_PER_PAGE,
  pollSyncEnvelopes,
} from "../src/graphql/reactor/resolvers.js";

const REMOTE_NAME = "test-remote";
const CHANNEL_ID = "test-channel";
const DOCUMENT_TYPE = "powerhouse/document-model";
const SCOPE = "global";
const BRANCH = "main";

type FakeOutbox = {
  items: SyncOperation[];
};

type FakeRemote = {
  meta: { name: string };
  channel: {
    outbox: FakeOutbox;
    inbox: { ackOrdinal: number };
    deadLetter: { items: SyncOperation[] };
  };
};

function makeOp(
  documentId: string,
  ordinal: number,
  inputBytes = 0,
): OperationWithContext {
  const padding = inputBytes > 0 ? "x".repeat(inputBytes) : "";
  return {
    operation: {
      id: `op-${documentId}-${ordinal}`,
      index: ordinal,
      skip: 0,
      timestampUtcMs: String(1_700_000_000_000 + ordinal),
      hash: `h-${ordinal}`,
      action: {
        id: `act-${documentId}-${ordinal}`,
        type: "TEST",
        timestampUtcMs: String(1_700_000_000_000 + ordinal),
        input: { padding },
        scope: SCOPE,
      },
    },
    context: {
      documentId,
      documentType: DOCUMENT_TYPE,
      scope: SCOPE,
      branch: BRANCH,
      ordinal,
    },
  };
}

function makeSyncOp(
  jobId: string,
  documentId: string,
  ordinals: number[],
  jobDependencies: string[] = [],
  inputBytes = 0,
): SyncOperation {
  const operations = ordinals.map((o) => makeOp(documentId, o, inputBytes));
  return {
    id: jobId,
    jobId,
    jobDependencies,
    remoteName: REMOTE_NAME,
    documentId,
    scopes: [SCOPE],
    branch: BRANCH,
    operations,
    status: 0,
    callbacks: [],
    deliveredCount: 0,
    emittedCount: 0,
  } as unknown as SyncOperation;
}

function makeSyncManager(items: SyncOperation[]): ISyncManager {
  const remote: FakeRemote = {
    meta: { name: REMOTE_NAME },
    channel: {
      outbox: { items },
      inbox: { ackOrdinal: 0 },
      deadLetter: { items: [] },
    },
  };
  return {
    getById: (id: string) => {
      if (id !== CHANNEL_ID) {
        throw new Error(`Unknown channel: ${id}`);
      }
      return remote;
    },
  } as unknown as ISyncManager;
}

function range(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => start + i);
}

describe("pollSyncEnvelopes paging caps", () => {
  it("emits a single envelope when the SyncOp fits under the per-envelope cap", () => {
    const syncOp = makeSyncOp("job-1", "doc-1", [1, 2, 3, 4, 5]);
    const syncManager = makeSyncManager([syncOp]);

    const result = pollSyncEnvelopes(syncManager, {
      channelId: CHANNEL_ID,
      outboxAck: 0,
      outboxLatest: 0,
    });

    expect(result.envelopes).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(result.envelopes[0].operations).toHaveLength(5);
    expect(result.envelopes[0].key).toBe("job-1");
    expect(result.envelopes[0].dependsOn).toBeUndefined();
    expect(result.envelopes[0].cursor.cursorOrdinal).toBe(5);
  });

  it("propagates non-empty job dependencies on a single (unsplit) envelope", () => {
    const syncOp = makeSyncOp("job-1", "doc-1", [1, 2], ["dep-a", "dep-b"]);
    const syncManager = makeSyncManager([syncOp]);

    const result = pollSyncEnvelopes(syncManager, {
      channelId: CHANNEL_ID,
      outboxAck: 0,
      outboxLatest: 0,
    });

    expect(result.envelopes).toHaveLength(1);
    expect(result.envelopes[0].dependsOn).toEqual(["dep-a", "dep-b"]);
  });

  it("splits a SyncOp larger than MAX_OPERATIONS_PER_ENVELOPE into chained sub-envelopes", () => {
    const opCount = MAX_OPERATIONS_PER_ENVELOPE * 2 + 17;
    const syncOp = makeSyncOp("job-big", "doc-1", range(1, opCount), ["dep-x"]);
    const syncManager = makeSyncManager([syncOp]);

    const result = pollSyncEnvelopes(syncManager, {
      channelId: CHANNEL_ID,
      outboxAck: 0,
      outboxLatest: 0,
    });

    const expectedParts = Math.ceil(opCount / MAX_OPERATIONS_PER_ENVELOPE);
    expect(result.envelopes).toHaveLength(expectedParts);
    expect(result.hasMore).toBe(false);

    let totalOps = 0;
    for (let i = 0; i < expectedParts; i++) {
      const env = result.envelopes[i];
      expect(env.key).toBe(`job-big__p${i}`);
      if (i === 0) {
        expect(env.dependsOn).toEqual(["dep-x"]);
      } else {
        expect(env.dependsOn).toEqual([`job-big__p${i - 1}`]);
      }
      totalOps += env.operations.length;
    }

    expect(totalOps).toBe(opCount);

    for (let i = 0; i < expectedParts - 1; i++) {
      expect(result.envelopes[i].operations).toHaveLength(
        MAX_OPERATIONS_PER_ENVELOPE,
      );
    }
    expect(result.envelopes[expectedParts - 1].operations).toHaveLength(
      opCount - MAX_OPERATIONS_PER_ENVELOPE * (expectedParts - 1),
    );

    for (const env of result.envelopes) {
      expect(env.cursor.cursorOrdinal).toBe(opCount);
    }
  });

  it("filters operations the client has already seen via outboxLatest after a prior emission set the cursor", () => {
    const syncOp = makeSyncOp("job-1", "doc-1", range(1, 50), []);
    // Simulate prior delivery: server has previously emitted all 50 ops, but
    // client only confirmed the first 30 (outboxLatest=30 on this poll). The
    // cursor advances past the first 30 and re-emits ords 31..50.
    syncOp.emittedCount = 50;
    const syncManager = makeSyncManager([syncOp]);

    const result = pollSyncEnvelopes(syncManager, {
      channelId: CHANNEL_ID,
      outboxAck: 0,
      outboxLatest: 30,
    });

    expect(result.envelopes).toHaveLength(1);
    expect(result.envelopes[0].operations).toHaveLength(20);
    expect(result.envelopes[0].operations[0].context.ordinal).toBe(31);
    expect(result.envelopes[0].operations[19].context.ordinal).toBe(50);
    expect(result.envelopes[0].cursor.cursorOrdinal).toBe(50);
    expect(result.hasMore).toBe(false);
  });

  it("skips SyncOps where every op was previously emitted and is now confirmed by outboxLatest", () => {
    const seen = makeSyncOp("job-old", "doc-1", [1, 2, 3]);
    seen.emittedCount = 3;
    const fresh = makeSyncOp("job-new", "doc-1", [4, 5, 6]);
    fresh.emittedCount = 3;
    const syncManager = makeSyncManager([seen, fresh]);

    const result = pollSyncEnvelopes(syncManager, {
      channelId: CHANNEL_ID,
      outboxAck: 0,
      outboxLatest: 3,
    });

    // seen is fully past outboxLatest=3; fresh has all ords > 3 so cursor stays
    // at 0 and re-emits.
    expect(result.envelopes).toHaveLength(1);
    expect(result.envelopes[0].key).toBe("job-new");
    expect(
      result.envelopes[0].operations.map(
        (o: OperationWithContext) => o.context.ordinal,
      ),
    ).toEqual([4, 5, 6]);
  });

  it("re-emits a syncOp's leading ops when emittedCount is zero, even if outboxLatest covers them", () => {
    // Regression test for the orphan bug: client claims outboxLatest=300 (e.g.
    // from a different syncOp that was delivered earlier), but THIS syncOp was
    // never sent (emittedCount=0). Ops must NOT be skipped.
    const syncOp = makeSyncOp("job-orphan", "doc-orphan", [10, 20, 30, 40, 50]);
    const syncManager = makeSyncManager([syncOp]);

    const result = pollSyncEnvelopes(syncManager, {
      channelId: CHANNEL_ID,
      outboxAck: 0,
      outboxLatest: 300,
    });

    expect(result.envelopes).toHaveLength(1);
    expect(
      result.envelopes[0].operations.map(
        (o: OperationWithContext) => o.context.ordinal,
      ),
    ).toEqual([10, 20, 30, 40, 50]);
    expect(syncOp.deliveredCount).toBe(0);
    expect(syncOp.emittedCount).toBe(5);
  });

  it("truncates the page when total ops exceed MAX_OPERATIONS_PER_PAGE", () => {
    const perJob = MAX_OPERATIONS_PER_ENVELOPE;
    const jobsNeeded = Math.ceil(MAX_OPERATIONS_PER_PAGE / perJob) + 5;
    let nextOrdinal = 1;
    const syncOps: SyncOperation[] = [];
    for (let i = 0; i < jobsNeeded; i++) {
      const ordinals = range(nextOrdinal, perJob);
      nextOrdinal += perJob;
      syncOps.push(makeSyncOp(`job-${i}`, `doc-${i}`, ordinals));
    }
    const syncManager = makeSyncManager(syncOps);

    const result = pollSyncEnvelopes(syncManager, {
      channelId: CHANNEL_ID,
      outboxAck: 0,
      outboxLatest: 0,
    });

    const totalOps = result.envelopes.reduce(
      (sum, e) => sum + e.operations.length,
      0,
    );
    expect(totalOps).toBeLessThanOrEqual(MAX_OPERATIONS_PER_PAGE);
    expect(totalOps).toBe(MAX_OPERATIONS_PER_PAGE);
    expect(result.hasMore).toBe(true);
    expect(result.envelopes.length).toBeLessThan(jobsNeeded);

    for (const env of result.envelopes) {
      expect(env.key).toMatch(/^job-\d+$/);
      expect(env.key).not.toContain("__p");
    }
  });

  it("continues across polls: an oversized SyncOp restarts __p0 numbering on the next page", () => {
    const opCount = MAX_OPERATIONS_PER_PAGE + MAX_OPERATIONS_PER_ENVELOPE * 2;
    const syncOp = makeSyncOp("job-huge", "doc-1", range(1, opCount));
    const syncManager = makeSyncManager([syncOp]);

    const first = pollSyncEnvelopes(syncManager, {
      channelId: CHANNEL_ID,
      outboxAck: 0,
      outboxLatest: 0,
    });

    expect(first.hasMore).toBe(true);
    const firstOps = first.envelopes.reduce(
      (sum, e) => sum + e.operations.length,
      0,
    );
    expect(firstOps).toBe(MAX_OPERATIONS_PER_PAGE);
    expect(first.envelopes[0].key).toBe("job-huge__p0");

    const lastOrdinal =
      first.envelopes[first.envelopes.length - 1].cursor.cursorOrdinal;
    expect(lastOrdinal).toBe(MAX_OPERATIONS_PER_PAGE);

    const second = pollSyncEnvelopes(syncManager, {
      channelId: CHANNEL_ID,
      outboxAck: 0,
      outboxLatest: lastOrdinal,
    });

    expect(second.hasMore).toBe(false);
    const secondOps = second.envelopes.reduce(
      (sum, e) => sum + e.operations.length,
      0,
    );
    expect(secondOps).toBe(opCount - MAX_OPERATIONS_PER_PAGE);
    expect(second.envelopes[0].key).toBe("job-huge__p0");
    expect(second.envelopes[0].operations[0].context.ordinal).toBe(
      MAX_OPERATIONS_PER_PAGE + 1,
    );
  });

  it("emits at least one op per envelope so a single oversized SyncOp still makes progress", () => {
    const filler = makeSyncOp(
      "job-filler",
      "doc-1",
      range(1, MAX_OPERATIONS_PER_PAGE),
    );
    const tail = makeSyncOp("job-tail", "doc-2", [MAX_OPERATIONS_PER_PAGE + 1]);
    const syncManager = makeSyncManager([filler, tail]);

    const result = pollSyncEnvelopes(syncManager, {
      channelId: CHANNEL_ID,
      outboxAck: 0,
      outboxLatest: 0,
    });

    expect(result.hasMore).toBe(true);
    const totalOps = result.envelopes.reduce(
      (sum, e) => sum + e.operations.length,
      0,
    );
    expect(totalOps).toBe(MAX_OPERATIONS_PER_PAGE);
  });

  it("mixes small SyncOps and a huge one without violating either cap", () => {
    const small1 = makeSyncOp("job-small-1", "doc-a", [1, 2, 3]);
    const huge = makeSyncOp(
      "job-huge",
      "doc-b",
      range(4, MAX_OPERATIONS_PER_ENVELOPE * 2),
    );
    const small2 = makeSyncOp("job-small-2", "doc-c", [
      MAX_OPERATIONS_PER_ENVELOPE * 2 + 4,
      MAX_OPERATIONS_PER_ENVELOPE * 2 + 5,
    ]);
    const syncManager = makeSyncManager([small1, huge, small2]);

    const result = pollSyncEnvelopes(syncManager, {
      channelId: CHANNEL_ID,
      outboxAck: 0,
      outboxLatest: 0,
    });

    expect(result.hasMore).toBe(false);

    const keys = result.envelopes.map((e) => e.key);
    expect(keys).toContain("job-small-1");
    expect(keys).toContain("job-small-2");
    expect(keys).toContain("job-huge__p0");
    expect(keys).toContain("job-huge__p1");

    for (const env of result.envelopes) {
      expect(env.operations.length).toBeLessThanOrEqual(
        MAX_OPERATIONS_PER_ENVELOPE,
      );
    }

    const totalOps = result.envelopes.reduce(
      (sum, e) => sum + e.operations.length,
      0,
    );
    expect(totalOps).toBe(3 + MAX_OPERATIONS_PER_ENVELOPE * 2 + 2);
  });

  it("re-emits ops on response loss: cursor only advances when outboxLatest confirms receipt", () => {
    const syncOp = makeSyncOp("job-1", "doc-1", [10, 20, 30, 40, 50]);
    const syncManager = makeSyncManager([syncOp]);

    const first = pollSyncEnvelopes(syncManager, {
      channelId: CHANNEL_ID,
      outboxAck: 0,
      outboxLatest: 0,
    });
    expect(first.envelopes).toHaveLength(1);
    expect(
      first.envelopes[0].operations.map(
        (o: OperationWithContext) => o.context.ordinal,
      ),
    ).toEqual([10, 20, 30, 40, 50]);
    expect(syncOp.deliveredCount).toBe(0);

    // Client only confirms receipt of the first two ops (response was partial
    // or lost mid-batch). Cursor must advance to position 2 only.
    const second = pollSyncEnvelopes(syncManager, {
      channelId: CHANNEL_ID,
      outboxAck: 0,
      outboxLatest: 20,
    });
    expect(syncOp.deliveredCount).toBe(2);
    expect(
      second.envelopes[0].operations.map(
        (o: OperationWithContext) => o.context.ordinal,
      ),
    ).toEqual([30, 40, 50]);

    // Second response is dropped. Client retries with the same outboxLatest.
    // Cursor must not advance past the unconfirmed ops.
    const third = pollSyncEnvelopes(syncManager, {
      channelId: CHANNEL_ID,
      outboxAck: 0,
      outboxLatest: 20,
    });
    expect(syncOp.deliveredCount).toBe(2);
    expect(
      third.envelopes[0].operations.map(
        (o: OperationWithContext) => o.context.ordinal,
      ),
    ).toEqual([30, 40, 50]);
  });

  it("does not orphan a syncOp's leading ops when a later syncOp's ordinal sweeps past them (cross-syncOp interleaving)", () => {
    // doc-A has ords [100, 200, 300]; doc-B has ords [150, 250]. Page cap of 3
    // forces partial delivery. After the first poll the client has received
    // some doc-A ops up through ord 200, so outboxLatest=200. doc-B's first op
    // (ord 150) was delivered in that page too — but the second poll must not
    // skip it again on doc-B. Pre-fix, the per-op `ordinal > outboxLatest`
    // filter dropped doc-B's op-150 unconditionally.
    const docA = makeSyncOp("job-a", "doc-a", [100, 200, 300]);
    const docB = makeSyncOp("job-b", "doc-b", [150, 250]);
    const syncManager = makeSyncManager([docA, docB]);

    const first = pollSyncEnvelopes(syncManager, {
      channelId: CHANNEL_ID,
      outboxAck: 0,
      outboxLatest: 0,
    });
    // First poll emits all 5 ops since they fit under the page cap.
    const firstOps = first.envelopes.flatMap((e) =>
      e.operations.map((o: OperationWithContext) => o.context.ordinal),
    );
    expect(firstOps.sort((a, b) => a - b)).toEqual([100, 150, 200, 250, 300]);

    // Client confirms receipt up to ord 200.
    pollSyncEnvelopes(syncManager, {
      channelId: CHANNEL_ID,
      outboxAck: 0,
      outboxLatest: 200,
    });
    // doc-A has [100, 200] confirmed → cursor=2; doc-B has [150] confirmed →
    // cursor=1. Op 250 in doc-B (ord <= 200 is false) stays. Op 300 in doc-A
    // stays.
    expect(docA.deliveredCount).toBe(2);
    expect(docB.deliveredCount).toBe(1);

    // Client now confirms full receipt and re-polls.
    const final = pollSyncEnvelopes(syncManager, {
      channelId: CHANNEL_ID,
      outboxAck: 0,
      outboxLatest: 300,
    });
    // Both syncOps fully delivered; nothing to send.
    expect(final.envelopes).toHaveLength(0);
    expect(docA.deliveredCount).toBe(3);
    expect(docB.deliveredCount).toBe(2);
  });
});
