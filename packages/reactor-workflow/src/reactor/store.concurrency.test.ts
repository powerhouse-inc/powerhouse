// Two callers racing the same claim or the same piece_store key: only one
// insert should win, and the loser must be told so rather than fire twice.
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import { beforeAll, describe, expect, it } from "vitest";
import { WorkflowRunStore } from "./store.js";

describe("store concurrency", () => {
  let store: WorkflowRunStore;

  beforeAll(async () => {
    store = await WorkflowRunStore.create(createTestRelationalDb());
  });

  it("claimDedupe grants the claim to exactly one racing caller", async () => {
    const now = new Date().toISOString();
    const results = await Promise.all([
      store.claimDedupe("wf-race", "k-race", 30_000, now),
      store.claimDedupe("wf-race", "k-race", 30_000, now),
      store.claimDedupe("wf-race", "k-race", 30_000, now),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("setPieceStoreValue upserts a shared key without racing to a PK error", async () => {
    await Promise.all([
      store.setPieceStoreValue("PROJECT", "reactor", "shared", "a"),
      store.setPieceStoreValue("PROJECT", "reactor", "shared", "b"),
      store.setPieceStoreValue("PROJECT", "reactor", "shared", "c"),
    ]);
    // No assertion on which value wins — only that all three land as one
    // row rather than throwing or duplicating.
    const value = await store.getPieceStoreValue(
      "PROJECT",
      "reactor",
      "shared",
    );
    expect(["a", "b", "c"]).toContain(value);
  });

  it("setPieceStoreValue still updates an existing row in place", async () => {
    await store.setPieceStoreValue("FLOW", "wf-upsert", "k", "first");
    await store.setPieceStoreValue("FLOW", "wf-upsert", "k", "second");
    expect(await store.getPieceStoreValue("FLOW", "wf-upsert", "k")).toBe(
      "second",
    );
  });
});
