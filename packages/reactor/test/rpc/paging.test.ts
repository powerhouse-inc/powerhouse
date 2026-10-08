import { describe, expect, it, vi } from "vitest";
import {
  dehydratePage,
  hasNextToken,
  isPageableResult,
  rehydratePage,
} from "../../src/rpc/paging.js";

describe("paging codec", () => {
  it("dehydrates a pageable result, registering the cursor and swapping next for a token", () => {
    const next = vi.fn(() => Promise.resolve("page2"));
    const register = vi.fn(() => "p1");

    const wire = dehydratePage({ results: [1, 2], next }, register);

    expect(register).toHaveBeenCalledWith(next);
    expect(wire).toEqual({ results: [1, 2], nextToken: "p1" });
    expect((wire as Record<string, unknown>).next).toBeUndefined();
  });

  it("rehydrates a tokenized page, swapping nextToken for a next() that fetches the page", async () => {
    const fetchPage = vi.fn((token: string) =>
      Promise.resolve(`fetched:${token}`),
    );

    const result = rehydratePage(
      { results: [1, 2], nextToken: "p1" },
      fetchPage,
    );

    expect((result as Record<string, unknown>).nextToken).toBeUndefined();
    const next = (result as { next: () => Promise<unknown> }).next;
    await expect(next()).resolves.toBe("fetched:p1");
    expect(fetchPage).toHaveBeenCalledWith("p1");
  });

  it("round-trips: rehydrated next() reaches the original host-side continuation", async () => {
    // host side: cache the cursor keyed by the minted token
    const cursors = new Map<string, () => Promise<unknown>>();
    let counter = 0;
    const originalNext = vi.fn(() => Promise.resolve({ results: ["more"] }));

    const wire = dehydratePage(
      { results: ["first"], next: originalNext },
      (n) => {
        const token = `p${++counter}`;
        cursors.set(token, n);
        return token;
      },
    );

    // tab side: rehydrate, wiring next() back through the host's cursor cache
    const result = rehydratePage(wire, (token) => cursors.get(token)!());
    const next = (result as { next: () => Promise<unknown> }).next;

    await expect(next()).resolves.toEqual({ results: ["more"] });
    expect(originalNext).toHaveBeenCalledTimes(1);
  });

  it("passes through values with no continuation untouched", () => {
    const plain = { results: [1, 2, 3] };
    expect(dehydratePage(plain, () => "p1")).toBe(plain);
    expect(rehydratePage(plain, () => Promise.resolve())).toBe(plain);
    expect(dehydratePage(null, () => "p1")).toBeNull();
    expect(rehydratePage(undefined, () => Promise.resolve())).toBeUndefined();
  });

  it("guards distinguish the two shapes", () => {
    expect(isPageableResult({ next: () => Promise.resolve() })).toBe(true);
    expect(isPageableResult({ nextToken: "p1" })).toBe(false);
    expect(hasNextToken({ nextToken: "p1" })).toBe(true);
    expect(hasNextToken({ next: () => Promise.resolve() })).toBe(false);
    expect(isPageableResult(null)).toBe(false);
    expect(hasNextToken(undefined)).toBe(false);
  });
});
