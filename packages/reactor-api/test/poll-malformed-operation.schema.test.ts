import { RECOVERABLE_GRAPHQL_ERROR_CODES } from "@powerhousedao/reactor";
import type { ISyncManager, SyncOperation } from "@powerhousedao/reactor";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSchema, graphql } from "graphql";
import { describe, expect, it } from "vitest";
import { pollSyncEnvelopes } from "../src/graphql/reactor/resolvers.js";

// Executed against the real SDL, because the failure this covers is the schema's
// non-null enforcement. Every other poll test calls the resolver directly, where
// nothing enforces `Action.id: String!` and the bug cannot appear.
const SDL = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../src/graphql/reactor/schema.graphql",
  ),
  "utf8",
);

const CHANNEL_ID = "test-channel";
const CODE = RECOVERABLE_GRAPHQL_ERROR_CODES.malformedStoredOperation;

const QUERY = `
  query Poll($channelId: String!, $outboxAck: Int!, $outboxLatest: Int!) {
    pollSyncEnvelopes(
      channelId: $channelId
      outboxAck: $outboxAck
      outboxLatest: $outboxLatest
    ) {
      ackOrdinal
      hasMore
      envelopes {
        type
        channelMeta { id }
        operations {
          operation {
            index
            hash
            action { id type scope timestampUtcMs input }
          }
          context { documentId documentType scope branch ordinal }
        }
      }
    }
  }
`;

function makeOp(
  ordinal: number,
  actionId: string | null,
): OperationWithContext {
  return {
    operation: {
      id: `op-${ordinal}`,
      index: ordinal,
      skip: 0,
      timestampUtcMs: String(1_700_000_000_000 + ordinal),
      hash: `h-${ordinal}`,
      action: {
        id: actionId as unknown as string,
        type: "TEST",
        timestampUtcMs: String(1_700_000_000_000 + ordinal),
        input: {},
        scope: "global",
      },
    },
    context: {
      documentId: "doc-1",
      documentType: "powerhouse/document-model",
      scope: "global",
      branch: "main",
      ordinal,
    },
  } as OperationWithContext;
}

function makeSyncManager(operations: OperationWithContext[]): ISyncManager {
  const syncOp = {
    id: "job-1",
    jobId: "job-1",
    jobDependencies: [],
    remoteName: "test-remote",
    documentId: "doc-1",
    scopes: ["global"],
    branch: "main",
    operations,
    status: 0,
    callbacks: [],
    deliveredCount: 0,
    emittedCount: 0,
  } as unknown as SyncOperation;

  const remote = {
    meta: { name: "test-remote" },
    channel: {
      outbox: { items: [syncOp] },
      inbox: { ackOrdinal: 0 },
      deadLetter: { items: [] },
    },
  };

  return {
    getById: (id: string) => {
      if (id !== CHANNEL_ID) throw new Error(`Unknown channel: ${id}`);
      return remote;
    },
  } as unknown as ISyncManager;
}

const poll = (operations: OperationWithContext[]) =>
  graphql({
    schema: buildSchema(SDL),
    source: QUERY,
    variableValues: { channelId: CHANNEL_ID, outboxAck: 0, outboxLatest: 10 },
    rootValue: {
      pollSyncEnvelopes: (args: {
        channelId: string;
        outboxAck: number;
        outboxLatest: number;
      }) => pollSyncEnvelopes(makeSyncManager(operations), args),
    },
  });

describe("polling a channel holding an operation the schema cannot represent", () => {
  it("reports one typed error naming the operation", async () => {
    const result = await poll([makeOp(1, null)]);

    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].extensions.code).toBe(CODE);
    expect(result.errors?.[0].message).toContain("op-1");
    // Not the bare non-null violation, which names no operation at all.
    expect(result.errors?.[0].message).not.toContain("Cannot return null");
  });

  it("does not report a bare non-null violation for Action.id", async () => {
    const result = await poll([makeOp(1, null)]);

    const messages = (result.errors ?? []).map((error) => error.message);
    expect(messages.some((m) => m.includes("Action.id"))).toBe(false);
  });

  it("serves a channel whose operations are all well-formed", async () => {
    const result = await poll([makeOp(1, "act-1"), makeOp(2, "act-2")]);

    expect(result.errors).toBeUndefined();
    const data = result.data as {
      pollSyncEnvelopes: {
        envelopes: {
          operations: { operation: { action: { id: string } } }[];
        }[];
      };
    };
    expect(
      data.pollSyncEnvelopes.envelopes[0].operations.map(
        (entry) => entry.operation.action.id,
      ),
    ).toEqual(["act-1", "act-2"]);
  });
});
