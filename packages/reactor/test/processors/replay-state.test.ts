import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import {
  startReplayState,
  type ReplaySnapshotRow,
  type ReplayStateSources,
} from "../../src/processors/replay-state.js";

function op(
  documentId: string,
  index: number,
  ordinal: number,
  fields: { scope?: string; branch?: string; resultingState?: string } = {},
): OperationWithContext {
  return {
    operation: {
      id: `${documentId}-${index}`,
      index,
      skip: 0,
      timestampUtcMs: "2026-10-23T00:00:00.000Z",
      hash: "",
      action: {
        id: `a-${documentId}-${index}`,
        type: "SET",
        timestampUtcMs: "2026-10-23T00:00:00.000Z",
        input: {},
        scope: fields.scope ?? "global",
      },
    },
    context: {
      documentId,
      documentType: "t",
      scope: fields.scope ?? "global",
      branch: fields.branch ?? "main",
      ordinal,
      resultingState: fields.resultingState,
    },
  };
}

function snapshot(
  documentId: string,
  globalIndex: number,
  fields: { content?: unknown; isDeleted?: boolean } = {},
): ReplaySnapshotRow[] {
  return [
    {
      documentId,
      scope: "header",
      branch: "main",
      content: { id: documentId },
      lastOperationIndex: 0,
      isDeleted: fields.isDeleted ?? false,
    },
    {
      documentId,
      scope: "global",
      branch: "main",
      content: fields.content ?? { at: globalIndex },
      lastOperationIndex: globalIndex,
      isDeleted: fields.isDeleted ?? false,
    },
  ];
}

function sources(rows: ReplaySnapshotRow[]): ReplayStateSources & {
  exact: ReturnType<typeof vi.fn>;
  snapshots: ReturnType<typeof vi.fn>;
} {
  return {
    snapshots: vi.fn((ids: string[]) =>
      Promise.resolve(rows.filter((row) => ids.includes(row.documentId))),
    ),
    exact: vi.fn((ops: OperationWithContext[]) =>
      Promise.resolve(
        ops.map((o) => ({
          operation: o.operation,
          context: {
            ...o.context,
            resultingState: `exact:${o.operation.index}`,
          },
        })),
      ),
    ),
  };
}

const stateOf = (o: OperationWithContext): unknown =>
  o.context.resultingState?.startsWith("{")
    ? JSON.parse(o.context.resultingState)
    : o.context.resultingState;

describe("startReplayState", () => {
  it("leaves a replay untouched in operations mode", () => {
    expect(startReplayState("operations", sources([]))).toBeUndefined();
  });

  it("gives every operation the latest snapshot state in latest mode", async () => {
    const src = sources(snapshot("d", 5));
    const page = startReplayState("latest", src)!;

    const out = await page([op("d", 3, 10), op("d", 4, 11), op("d", 5, 12)]);

    expect(out.map((o) => o.context.ordinal)).toEqual([10, 11, 12]);
    for (const o of out) {
      expect(stateOf(o)).toEqual({ global: { at: 5 }, header: { id: "d" } });
    }
    expect(src.snapshots).toHaveBeenCalledTimes(1);
    expect(src.exact).not.toHaveBeenCalled();
  });

  it("keeps a state an operation already carries", async () => {
    const page = startReplayState("latest", sources(snapshot("d", 5)))!;

    const [out] = await page([op("d", 5, 12, { resultingState: "live" })]);

    expect(out!.context.resultingState).toBe("live");
  });

  it("delivers one operation per stream and skips what the snapshot covers in collapse mode", async () => {
    const page = startReplayState(
      "collapse",
      sources([...snapshot("d", 6), ...snapshot("e", 1)]),
    )!;

    const first = await page([
      op("d", 1, 1),
      op("e", 1, 2),
      op("d", 2, 3),
      op("d", 3, 4),
    ]);
    expect(first.map((o) => [o.context.documentId, o.operation.index])).toEqual(
      [
        ["e", 1],
        ["d", 3],
      ],
    );
    expect(stateOf(first[1]!)).toEqual({
      global: { at: 6 },
      header: { id: "d" },
    });

    const second = await page([op("d", 4, 5), op("d", 6, 6), op("d", 7, 7)]);
    expect(second.map((o) => o.operation.index)).toEqual([7]);
  });

  it("falls back to the exact state when the snapshot is behind", async () => {
    const src = sources(snapshot("d", 2));
    const latest = startReplayState("latest", src)!;

    const out = await latest([op("d", 2, 1), op("d", 3, 2)]);

    expect(out.map((o) => o.context.resultingState)).toEqual([
      "exact:2",
      "exact:3",
    ]);

    const collapse = startReplayState("collapse", sources(snapshot("d", 2)))!;
    const collapsed = await collapse([op("d", 2, 1), op("d", 3, 2)]);
    expect(collapsed.map((o) => o.context.resultingState)).toEqual(["exact:3"]);
  });

  it("falls back to the exact state for a document without a snapshot", async () => {
    const page = startReplayState("latest", sources([]))!;

    const out = await page([op("d", 0, 1)]);

    expect(out[0]!.context.resultingState).toBe("exact:0");
  });

  it("passes a deleted document's operations as read", async () => {
    const src = sources(snapshot("d", 4, { isDeleted: true }));
    const page = startReplayState("collapse", src)!;

    const out = await page([op("d", 3, 1), op("d", 4, 2)]);

    expect(out.map((o) => o.context.resultingState)).toEqual([
      undefined,
      undefined,
    ]);
    expect(src.exact).not.toHaveBeenCalled();
  });

  it("passes an operation as read when its exact state cannot be rebuilt", async () => {
    const src = sources([]);
    src.exact.mockImplementation((ops: OperationWithContext[]) =>
      ops.some((o) => o.operation.index === 1)
        ? Promise.reject(new Error("gone"))
        : Promise.resolve(
            ops.map((o) => ({
              operation: o.operation,
              context: { ...o.context, resultingState: "ok" },
            })),
          ),
    );
    const page = startReplayState("exact", src)!;

    const out = await page([op("d", 0, 1), op("d", 1, 2)]);

    expect(out.map((o) => o.context.resultingState)).toEqual(["ok", undefined]);
  });

  it("rebuilds only what lacks a state in exact mode, keeping ordinal order", async () => {
    const src = sources([]);
    const page = startReplayState("exact", src)!;

    const out = await page([
      op("d", 0, 1),
      op("d", 1, 2, { resultingState: "live" }),
      op("d", 2, 3),
    ]);

    expect(out.map((o) => o.context.resultingState)).toEqual([
      "exact:0",
      "live",
      "exact:2",
    ]);
    expect(src.exact).toHaveBeenCalledTimes(1);
  });
});
