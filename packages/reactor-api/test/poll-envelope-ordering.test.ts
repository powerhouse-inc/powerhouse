import type { ISyncManager, SyncOperation } from "@powerhousedao/reactor";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { pollSyncEnvelopes } from "../src/graphql/reactor/resolvers.js";

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
  timestampUtcMs: string,
): OperationWithContext {
  return {
    operation: {
      id: `op-${documentId}-${ordinal}`,
      index: ordinal,
      skip: 0,
      timestampUtcMs,
      hash: `h-${ordinal}`,
      action: {
        id: `act-${documentId}-${ordinal}`,
        type: "TEST",
        timestampUtcMs,
        input: {},
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
  } as unknown as OperationWithContext;
}

function makeSyncOp(
  jobId: string,
  documentId: string,
  ordinals: number[],
  firstTimestampUtcMs: string,
  jobDependencies: string[] = [],
): SyncOperation {
  const operations = ordinals.map((o, idx) =>
    makeOp(
      documentId,
      o,
      idx === 0 ? firstTimestampUtcMs : new Date().toISOString(),
    ),
  );
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

describe("pollSyncEnvelopes ordering invariants", () => {
  // Seed two SyncOps for the same document where the second one (higher
  // ordinals) has an earlier first-op timestamp than the first. Under the
  // pre-fix code, sortEnvelopesByFirstOperationTimestamp would place J2
  // (earlier timestamp, higher ordinals) before J1, breaking ordinal order
  // and leaving J2's dependsOn pointing forward to J1.
  function seed(): ISyncManager {
    const j1 = makeSyncOp(
      "j1",
      "doc-1",
      [101, 102, 103],
      "2026-01-01T12:00:00.000Z",
    );
    const j2 = makeSyncOp(
      "j2",
      "doc-1",
      [104, 105, 106],
      "2026-01-01T11:00:00.000Z",
      ["j1"],
    );
    return makeSyncManager([j1, j2]);
  }

  it("returns envelopes for the same document in ordinal order", () => {
    const result = pollSyncEnvelopes(seed(), {
      channelId: CHANNEL_ID,
      outboxAck: 0,
      outboxLatest: 100,
    });

    const byDoc = new Map<string, number[]>();
    for (const env of result.envelopes) {
      const docId = env.operations[0].context.documentId;
      const firstOrd = env.operations[0].context.ordinal;
      const list = byDoc.get(docId) ?? [];
      list.push(firstOrd);
      byDoc.set(docId, list);
    }

    for (const [docId, firstOrdinals] of byDoc) {
      if (firstOrdinals.length < 2) continue;
      const sorted = [...firstOrdinals].sort((a, b) => a - b);
      expect(firstOrdinals, `doc ${docId} envelope order`).toEqual(sorted);
    }
  });

  it("returns envelopes such that every dependsOn target appears earlier in the array", () => {
    const result = pollSyncEnvelopes(seed(), {
      channelId: CHANNEL_ID,
      outboxAck: 0,
      outboxLatest: 100,
    });

    const indexByKey = new Map<string, number>();
    result.envelopes.forEach((env, i) => {
      if (env.key) indexByKey.set(env.key, i);
    });

    result.envelopes.forEach((env, i) => {
      if (!env.dependsOn) return;
      for (const dep of env.dependsOn) {
        const depIndex = indexByKey.get(dep);
        if (depIndex === undefined) continue;
        expect(
          depIndex,
          `envelope[${i}].dependsOn=${dep} must appear earlier in array`,
        ).toBeLessThan(i);
      }
    });
  });
});
