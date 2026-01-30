import { describe, expect, it } from "vitest";
import { collectAllPages } from "../../src/shared/collect-all-pages.js";
import type { PagedResults } from "../../src/shared/types.js";

describe("collectAllPages", () => {
  it("should collect all results from multiple pages", async () => {
    const page3: PagedResults<number> = {
      results: [5],
      options: { cursor: "4", limit: 2 },
    };
    const page2: PagedResults<number> = {
      results: [3, 4],
      options: { cursor: "2", limit: 2 },
      nextCursor: "4",
      next: () => Promise.resolve(page3),
    };
    const page1: PagedResults<number> = {
      results: [1, 2],
      options: { cursor: "0", limit: 2 },
      nextCursor: "2",
      next: () => Promise.resolve(page2),
    };

    const results = await collectAllPages(page1);

    expect(results).toEqual([1, 2, 3, 4, 5]);
  });

  it("should handle single page results", async () => {
    const page: PagedResults<string> = {
      results: ["a", "b"],
      options: { cursor: "0", limit: 10 },
    };

    const results = await collectAllPages(page);

    expect(results).toEqual(["a", "b"]);
  });

  it("should handle empty results", async () => {
    const page: PagedResults<string> = {
      results: [],
      options: { cursor: "0", limit: 10 },
    };

    const results = await collectAllPages(page);

    expect(results).toEqual([]);
  });

  it("should throw when signal is aborted during pagination", async () => {
    const controller = new AbortController();
    const page3: PagedResults<number> = {
      results: [5, 6],
      options: { cursor: "4", limit: 2 },
    };
    const page2: PagedResults<number> = {
      results: [3, 4],
      options: { cursor: "2", limit: 2 },
      nextCursor: "4",
      next: () => Promise.resolve(page3),
    };
    const page1: PagedResults<number> = {
      results: [1, 2],
      options: { cursor: "0", limit: 2 },
      nextCursor: "2",
      next: () => {
        controller.abort();
        return Promise.resolve(page2);
      },
    };

    await expect(collectAllPages(page1, controller.signal)).rejects.toThrow(
      "Operation aborted",
    );
  });
});
