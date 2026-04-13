import { describe, expect, it } from "vitest";
import { chunkSyncOperations } from "../../src/sync/utils.js";

type TestItem = {
  syncOp: { jobId: string; jobDependencies: string[] };
  label: string;
};

function item(jobId: string, deps: string[] = [], label?: string): TestItem {
  return {
    syncOp: { jobId, jobDependencies: deps },
    label: label ?? jobId,
  };
}

function jobIds(chunk: TestItem[]): string[] {
  return chunk.map((i) => i.syncOp.jobId);
}

describe("chunkSyncOperations", () => {
  it("should return empty array for empty input", () => {
    expect(chunkSyncOperations([], 32)).toEqual([]);
  });

  it("should return a single chunk when all items fit", () => {
    const items = [item("a"), item("b"), item("c")];
    const chunks = chunkSyncOperations(items, 10);
    expect(chunks).toHaveLength(1);
    expect(jobIds(chunks[0])).toEqual(["a", "b", "c"]);
  });

  it("should return a single chunk for one item", () => {
    const items = [item("a")];
    const chunks = chunkSyncOperations(items, 1);
    expect(chunks).toHaveLength(1);
    expect(jobIds(chunks[0])).toEqual(["a"]);
  });

  it("should chunk independent SyncOps by maxSize", () => {
    const items = [item("a"), item("b"), item("c"), item("d"), item("e")];
    const chunks = chunkSyncOperations(items, 2);
    expect(chunks).toHaveLength(3);
    expect(jobIds(chunks[0])).toEqual(["a", "b"]);
    expect(jobIds(chunks[1])).toEqual(["c", "d"]);
    expect(jobIds(chunks[2])).toEqual(["e"]);
  });

  it("should keep a dependency chain in the same chunk", () => {
    // A -> B -> C forms a chain
    const items = [item("a"), item("b", ["a"]), item("c", ["b"])];
    const chunks = chunkSyncOperations(items, 3);
    expect(chunks).toHaveLength(1);
    expect(jobIds(chunks[0])).toEqual(["a", "b", "c"]);
  });

  it("should keep two independent per-document chains in separate components", () => {
    // Chain 1: A1 -> A2 (doc-a)
    // Chain 2: B1 -> B2 (doc-b)
    const items = [
      item("a1"),
      item("a2", ["a1"]),
      item("b1"),
      item("b2", ["b1"]),
    ];
    const chunks = chunkSyncOperations(items, 2);
    expect(chunks).toHaveLength(2);
    expect(jobIds(chunks[0])).toEqual(["a1", "a2"]);
    expect(jobIds(chunks[1])).toEqual(["b1", "b2"]);
  });

  it("should keep cross-document batch-chained SyncOps in the same chunk", () => {
    // Simulates createDocumentInDrive: doc depends on drive via batch chain
    // A(doc) -> B(drive) linked by dependency
    const items = [item("doc-op"), item("drive-op", ["doc-op"])];
    const chunks = chunkSyncOperations(items, 10);
    expect(chunks).toHaveLength(1);
    expect(jobIds(chunks[0])).toEqual(["doc-op", "drive-op"]);
  });

  it("should pack small independent components greedily", () => {
    // Components: {a}, {b}, {c, d}, {e}
    const items = [
      item("a"),
      item("b"),
      item("c"),
      item("d", ["c"]),
      item("e"),
    ];
    const chunks = chunkSyncOperations(items, 3);
    // a + b = 2, c+d = 2 so 2+2=4 > 3, so {a,b} fits in chunk 1 (room for 1 more)
    // but {c,d} has 2 items, 2+2=4 > 3, so flush {a,b} then {c,d} starts new chunk with room for 1
    // {e} has 1 item, 2+1=3 <= 3, so {c,d,e} in chunk 2
    expect(chunks).toHaveLength(2);
    expect(jobIds(chunks[0])).toEqual(["a", "b"]);
    expect(jobIds(chunks[1])).toEqual(["c", "d", "e"]);
  });

  it("should split an oversized connected component", () => {
    // Chain of 5 with maxSize 2
    const items = [
      item("a"),
      item("b", ["a"]),
      item("c", ["b"]),
      item("d", ["c"]),
      item("e", ["d"]),
    ];
    const chunks = chunkSyncOperations(items, 2);
    expect(chunks).toHaveLength(3);
    // Topological order: a, b, c, d, e -> split into [a,b], [c,d], [e]
    expect(jobIds(chunks[0])).toEqual(["a", "b"]);
    expect(jobIds(chunks[1])).toEqual(["c", "d"]);
    expect(jobIds(chunks[2])).toEqual(["e"]);
  });

  it("should not include cross-chunk dependency references within each chunk", () => {
    // Chain a -> b -> c -> d, maxSize 2
    // Chunk 1: [a, b] -- b depends on a (valid within chunk)
    // Chunk 2: [c, d] -- c originally depends on b (cross-chunk, should be pruned by caller)
    // This test verifies the chunks are structured correctly for the caller's filter
    const items = [
      item("a"),
      item("b", ["a"]),
      item("c", ["b"]),
      item("d", ["c"]),
    ];
    const chunks = chunkSyncOperations(items, 2);
    expect(chunks).toHaveLength(2);

    // Verify chunk structure
    const chunk1Keys = new Set(jobIds(chunks[0]));
    const chunk2Keys = new Set(jobIds(chunks[1]));

    // Chunk 1's deps should all be within chunk 1
    for (const chunkItem of chunks[0]) {
      for (const dep of chunkItem.syncOp.jobDependencies) {
        expect(chunk1Keys.has(dep) || !chunk2Keys.has(dep)).toBe(true);
      }
    }
  });

  it("should handle a complex mixed scenario", () => {
    // Component 1: a -> b (size 2)
    // Component 2: c (size 1)
    // Component 3: d -> e -> f (size 3)
    // Component 4: g (size 1)
    // maxSize = 3
    const items = [
      item("a"),
      item("b", ["a"]),
      item("c"),
      item("d"),
      item("e", ["d"]),
      item("f", ["e"]),
      item("g"),
    ];
    const chunks = chunkSyncOperations(items, 3);
    // {a,b}=2 + {c}=1 = 3 fits in one chunk
    // {d,e,f}=3 fits in one chunk
    // {g}=1 fits in one chunk
    expect(chunks).toHaveLength(3);
    expect(jobIds(chunks[0])).toEqual(["a", "b", "c"]);
    expect(jobIds(chunks[1])).toEqual(["d", "e", "f"]);
    expect(jobIds(chunks[2])).toEqual(["g"]);
  });

  it("should handle deps referencing items outside the input (no crash)", () => {
    // Item b depends on "external" which is not in the input
    const items = [item("a"), item("b", ["external"])];
    const chunks = chunkSyncOperations(items, 2);
    expect(chunks).toHaveLength(1);
    expect(jobIds(chunks[0])).toEqual(["a", "b"]);
  });

  it("should handle items exactly at maxSize boundary", () => {
    const items = [item("a"), item("b")];
    const chunks = chunkSyncOperations(items, 2);
    expect(chunks).toHaveLength(1);
    expect(jobIds(chunks[0])).toEqual(["a", "b"]);
  });

  it("should preserve insertion order within components", () => {
    const items = [item("z"), item("y"), item("x")];
    const chunks = chunkSyncOperations(items, 2);
    expect(chunks).toHaveLength(2);
    expect(jobIds(chunks[0])).toEqual(["z", "y"]);
    expect(jobIds(chunks[1])).toEqual(["x"]);
  });

  it("should split oversized component with topological order", () => {
    // Star pattern: b->a, c->a, d->a (all depend on a)
    const items = [
      item("a"),
      item("b", ["a"]),
      item("c", ["a"]),
      item("d", ["a"]),
    ];
    const chunks = chunkSyncOperations(items, 2);
    // Topological: a first, then b,c,d in some order
    expect(chunks).toHaveLength(2);
    expect(chunks[0][0].syncOp.jobId).toBe("a");
    expect(chunks[0]).toHaveLength(2);
    expect(chunks[1]).toHaveLength(2);
  });
});
