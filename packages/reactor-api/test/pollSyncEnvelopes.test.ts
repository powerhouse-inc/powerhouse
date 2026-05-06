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
  name: string;
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
  } as unknown as SyncOperation;
}

function makeSyncManager(items: SyncOperation[]): ISyncManager {
  const remote: FakeRemote = {
    name: REMOTE_NAME,
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

  it("filters operations the client has already seen via outboxLatest before splitting", () => {
    const syncOp = makeSyncOp("job-1", "doc-1", range(1, 50), []);
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

  it("skips SyncOps where every op was already seen by outboxLatest", () => {
    const seen = makeSyncOp("job-old", "doc-1", [1, 2, 3]);
    const fresh = makeSyncOp("job-new", "doc-1", [4, 5, 6]);
    const syncManager = makeSyncManager([seen, fresh]);

    const result = pollSyncEnvelopes(syncManager, {
      channelId: CHANNEL_ID,
      outboxAck: 0,
      outboxLatest: 3,
    });

    expect(result.envelopes).toHaveLength(1);
    expect(result.envelopes[0].key).toBe("job-new");
    expect(
      result.envelopes[0].operations.map(
        (o: OperationWithContext) => o.context.ordinal,
      ),
    ).toEqual([4, 5, 6]);
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
});
