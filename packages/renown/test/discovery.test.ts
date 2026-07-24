import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSwitchboardEndpoint } from "../src/discovery.js";

describe("resolveSwitchboardEndpoint", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the explicit switchboardUrl without any request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await resolveSwitchboardEndpoint({
      switchboardUrl: "http://sb.test/graphql",
      baseUrl: "http://renown.test",
    });
    expect(result).toBe("http://sb.test/graphql");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("discovers the endpoint from the base URL", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ endpoint: "http://sb.test/graphql" }), {
        status: 200,
      }),
    );
    const result = await resolveSwitchboardEndpoint({
      baseUrl: "http://renown.test",
    });
    expect(result).toBe("http://sb.test/graphql");
  });

  it("falls back (undefined) when the endpoint is missing (old Renown)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Not found", { status: 404 }),
    );
    const result = await resolveSwitchboardEndpoint({
      baseUrl: "http://renown.test",
    });
    expect(result).toBeUndefined();
  });

  it("falls back (undefined) on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    const result = await resolveSwitchboardEndpoint({
      baseUrl: "http://renown.test",
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when neither url is provided", async () => {
    const result = await resolveSwitchboardEndpoint({});
    expect(result).toBeUndefined();
  });

  it("falls back (undefined) when a legacy instance never responds", async () => {
    // Simulate a socket that accepts the connection but never replies: the
    // fetch only settles when the abort signal fires.
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal;
          signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const result = await resolveSwitchboardEndpoint({
      baseUrl: "http://renown.test",
      timeoutMs: 20,
    });
    expect(result).toBeUndefined();
  });
});
