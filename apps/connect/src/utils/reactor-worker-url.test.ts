import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchReactorWorkerBuildDigest } from "./reactor-worker-url.js";

describe("fetchReactorWorkerBuildDigest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches nothing and returns null when there is no worker URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchReactorWorkerBuildDigest(null)).toBeNull();
    expect(await fetchReactorWorkerBuildDigest(undefined)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches the sibling metadata file and returns its sourceDigest", async () => {
    const fetchMock = vi.fn((url: string | URL) => {
      expect(String(url)).toBe(
        "https://example.test/__reactor_worker__/worker-meta.json",
      );
      return {
        ok: true,
        json: () => ({ sourceDigest: "abc123", nodeEnv: "development" }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const digest = await fetchReactorWorkerBuildDigest(
      "https://example.test/__reactor_worker__/reactor.worker.js",
    );
    expect(digest).toBe("abc123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => ({ ok: false, json: () => ({}) })),
    );
    expect(
      await fetchReactorWorkerBuildDigest(
        "https://example.test/__reactor_worker__/reactor.worker.js",
      ),
    ).toBeNull();
  });

  it("returns null when sourceDigest is missing, empty, or the wrong type", async () => {
    for (const body of [{}, { sourceDigest: "" }, { sourceDigest: 7 }]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => ({ ok: true, json: () => body })),
      );
      expect(
        await fetchReactorWorkerBuildDigest(
          "https://example.test/__reactor_worker__/reactor.worker.js",
        ),
      ).toBeNull();
    }
  });

  it("returns null when the fetch throws (offline, network error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("network down");
      }),
    );
    expect(
      await fetchReactorWorkerBuildDigest(
        "https://example.test/__reactor_worker__/reactor.worker.js",
      ),
    ).toBeNull();
  });

  it("returns null when the body isn't valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => ({
        ok: true,
        json: () => {
          throw new SyntaxError("Unexpected token");
        },
      })),
    );
    expect(
      await fetchReactorWorkerBuildDigest(
        "https://example.test/__reactor_worker__/reactor.worker.js",
      ),
    ).toBeNull();
  });
});
