import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { splitTrailingSameTimestampRun } from "../../src/sync/utils.js";

function createOp(args: {
  documentId: string;
  scope: string;
  branch: string;
  ordinal: number;
  timestampUtcMs: string;
  id?: string;
}): OperationWithContext {
  return {
    operation: {
      id: args.id ?? `op-${args.documentId}-${args.scope}-${args.ordinal}`,
      index: args.ordinal,
      skip: 0,
      hash: "hash",
      timestampUtcMs: args.timestampUtcMs,
      action: {
        type: "TEST",
        scope: args.scope,
        id: `action-${args.ordinal}`,
        timestampUtcMs: args.timestampUtcMs,
        input: {},
      },
    } as any,
    context: {
      documentId: args.documentId,
      documentType: "test",
      scope: args.scope,
      branch: args.branch,
      ordinal: args.ordinal,
    },
  };
}

describe("splitTrailingSameTimestampRun", () => {
  it("returns empty emit and carry for empty input", () => {
    const result = splitTrailingSameTimestampRun([]);
    expect(result).toEqual({ emit: [], carry: [] });
  });

  it("puts everything into carry when all ops share (docId, scope, branch, ts)", () => {
    const ts = "2026-01-01T00:00:00.000Z";
    const ops = [
      createOp({
        documentId: "doc-a",
        scope: "global",
        branch: "main",
        ordinal: 1,
        timestampUtcMs: ts,
      }),
      createOp({
        documentId: "doc-a",
        scope: "global",
        branch: "main",
        ordinal: 2,
        timestampUtcMs: ts,
      }),
      createOp({
        documentId: "doc-a",
        scope: "global",
        branch: "main",
        ordinal: 3,
        timestampUtcMs: ts,
      }),
    ];

    const result = splitTrailingSameTimestampRun(ops);
    expect(result.emit).toEqual([]);
    expect(result.carry).toEqual(ops);
  });

  it("captures a tail run of size 1 into carry", () => {
    const earlierTs = "2026-01-01T00:00:00.000Z";
    const tailTs = "2026-01-01T00:00:01.000Z";
    const ops = [
      createOp({
        documentId: "doc-a",
        scope: "global",
        branch: "main",
        ordinal: 1,
        timestampUtcMs: earlierTs,
      }),
      createOp({
        documentId: "doc-a",
        scope: "global",
        branch: "main",
        ordinal: 2,
        timestampUtcMs: earlierTs,
      }),
      createOp({
        documentId: "doc-a",
        scope: "global",
        branch: "main",
        ordinal: 3,
        timestampUtcMs: tailTs,
      }),
    ];

    const result = splitTrailingSameTimestampRun(ops);
    expect(result.emit).toEqual(ops.slice(0, 2));
    expect(result.carry).toEqual([ops[2]]);
  });

  it("captures a tail run of size N into carry", () => {
    const earlierTs = "2026-01-01T00:00:00.000Z";
    const tailTs = "2026-01-01T00:00:01.000Z";
    const ops = [
      createOp({
        documentId: "doc-a",
        scope: "global",
        branch: "main",
        ordinal: 1,
        timestampUtcMs: earlierTs,
      }),
      createOp({
        documentId: "doc-a",
        scope: "global",
        branch: "main",
        ordinal: 2,
        timestampUtcMs: tailTs,
      }),
      createOp({
        documentId: "doc-a",
        scope: "global",
        branch: "main",
        ordinal: 3,
        timestampUtcMs: tailTs,
      }),
      createOp({
        documentId: "doc-a",
        scope: "global",
        branch: "main",
        ordinal: 4,
        timestampUtcMs: tailTs,
      }),
    ];

    const result = splitTrailingSameTimestampRun(ops);
    expect(result.emit).toEqual([ops[0]]);
    expect(result.carry).toEqual(ops.slice(1));
  });

  it("does not pull earlier same-ts ops from a different (docId, scope) into carry", () => {
    const ts = "2026-01-01T00:00:00.000Z";
    const ops = [
      createOp({
        documentId: "doc-a",
        scope: "global",
        branch: "main",
        ordinal: 1,
        timestampUtcMs: ts,
      }),
      createOp({
        documentId: "doc-a",
        scope: "global",
        branch: "main",
        ordinal: 2,
        timestampUtcMs: ts,
      }),
      createOp({
        documentId: "doc-b",
        scope: "global",
        branch: "main",
        ordinal: 1,
        timestampUtcMs: ts,
      }),
      createOp({
        documentId: "doc-b",
        scope: "global",
        branch: "main",
        ordinal: 2,
        timestampUtcMs: ts,
      }),
    ];

    const result = splitTrailingSameTimestampRun(ops);
    expect(result.emit).toEqual(ops.slice(0, 2));
    expect(result.carry).toEqual(ops.slice(2));
  });

  it("treats different scopes on the same doc as boundaries", () => {
    const ts = "2026-01-01T00:00:00.000Z";
    const ops = [
      createOp({
        documentId: "doc-a",
        scope: "document",
        branch: "main",
        ordinal: 1,
        timestampUtcMs: ts,
      }),
      createOp({
        documentId: "doc-a",
        scope: "global",
        branch: "main",
        ordinal: 1,
        timestampUtcMs: ts,
      }),
      createOp({
        documentId: "doc-a",
        scope: "global",
        branch: "main",
        ordinal: 2,
        timestampUtcMs: ts,
      }),
    ];

    const result = splitTrailingSameTimestampRun(ops);
    expect(result.emit).toEqual([ops[0]]);
    expect(result.carry).toEqual(ops.slice(1));
  });

  it("treats different branches as boundaries even with matching ts/scope/doc", () => {
    const ts = "2026-01-01T00:00:00.000Z";
    const ops = [
      createOp({
        documentId: "doc-a",
        scope: "global",
        branch: "dev",
        ordinal: 1,
        timestampUtcMs: ts,
      }),
      createOp({
        documentId: "doc-a",
        scope: "global",
        branch: "main",
        ordinal: 1,
        timestampUtcMs: ts,
      }),
      createOp({
        documentId: "doc-a",
        scope: "global",
        branch: "main",
        ordinal: 2,
        timestampUtcMs: ts,
      }),
    ];

    const result = splitTrailingSameTimestampRun(ops);
    expect(result.emit).toEqual([ops[0]]);
    expect(result.carry).toEqual(ops.slice(1));
  });
});
