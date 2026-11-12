import type { ILogger } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createVetraAccessGate,
  type VetraAccessGateOptions,
} from "../src/services/access-gate.js";

const URL_ =
  "https://vetra.test/api/@powerhousedao/vetra-cloud-package/apps/gate/check";
const TOKEN = "vgt_" + "ab".repeat(32);
const ADDR = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

function stubLogger() {
  const logger = {
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const allowed = (ttlSeconds?: number) =>
  json(200, { allowed: true, reason: "licence", until: null, ttlSeconds });
const denied = () =>
  json(200, { allowed: false, reason: "none", until: null, ttlSeconds: 15 });

function setup(
  responder: (call: number) => Response | Promise<Response>,
  options: Partial<VetraAccessGateOptions> = {},
) {
  let now = 1_000_000;
  let calls = 0;
  const fetch = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      responder(++calls),
  );
  const logger = stubLogger();
  const gate = createVetraAccessGate({
    url: URL_,
    token: TOKEN,
    fetch: fetch as unknown as typeof globalThis.fetch,
    now: () => now,
    logger: logger as unknown as ILogger,
    ...options,
  });
  return {
    gate,
    fetch,
    logger,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function loggedText(logger: ReturnType<typeof stubLogger>): string {
  return JSON.stringify([
    ...logger.warn.mock.calls,
    ...logger.error.mock.calls,
    ...logger.info.mock.calls,
    ...logger.debug.mock.calls,
  ]);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createVetraAccessGate", () => {
  it("posts the address with the bearer token and the app id", async () => {
    const { gate, fetch } = setup(() => allowed(60), { appId: "app-1" });

    const verdict = await gate.check(ADDR);

    expect(verdict).toEqual({ allowed: true, source: "gate" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(URL_);
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-vetra-app-id")).toBe("app-1");
    expect(JSON.parse(String(init?.body))).toEqual({ address: ADDR });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("omits x-vetra-app-id when no app id is set", async () => {
    const { gate, fetch } = setup(() => allowed(60));
    await gate.check(ADDR);
    const headers = new Headers(fetch.mock.calls[0]![1]?.headers);
    expect(headers.has("x-vetra-app-id")).toBe(false);
  });

  it("answers an allowed address from the cache until its ttl lapses", async () => {
    const { gate, fetch, advance } = setup(() => allowed(30));

    await gate.check(ADDR);
    advance(29_999);
    expect(await gate.check(ADDR)).toEqual({ allowed: true, source: "cache" });
    expect(fetch).toHaveBeenCalledTimes(1);

    advance(1);
    expect(await gate.check(ADDR)).toEqual({ allowed: true, source: "gate" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("caches a denial for its ttl too", async () => {
    const { gate, fetch, advance } = setup(() => denied());

    expect(await gate.check(ADDR)).toEqual({ allowed: false, source: "gate" });
    advance(14_000);
    expect(await gate.check(ADDR)).toEqual({ allowed: false, source: "cache" });
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(1_000);
    await gate.check(ADDR);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keys the cache by address", async () => {
    const { gate, fetch } = setup(() => allowed(60));
    await gate.check(ADDR);
    await gate.check(OTHER);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    [undefined, 60_000],
    ["soon", 60_000],
    [0, 1_000],
    [-5, 1_000],
    [10_000, 300_000],
    [2.5, 2_500],
  ])("clamps ttlSeconds=%s to %s ms", async (ttl, expectedMs) => {
    const { gate, fetch, advance } = setup(() =>
      json(200, { allowed: true, ttlSeconds: ttl }),
    );
    await gate.check(ADDR);
    advance(expectedMs - 1);
    await gate.check(ADDR);
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(1);
    await gate.check(ADDR);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shares one fetch among concurrent checks of an address", async () => {
    let release!: (response: Response) => void;
    const { gate, fetch } = setup(
      () => new Promise<Response>((resolve) => (release = resolve)),
    );

    const first = gate.check(ADDR);
    const second = gate.check(ADDR);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    release(allowed(60));

    expect(await first).toEqual({ allowed: true, source: "gate" });
    expect(await second).toEqual({ allowed: true, source: "gate" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  describe("when Vetra is unavailable", () => {
    const unavailable: Array<[string, () => Response | Promise<Response>]> = [
      ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
      ["a 429", () => json(429, { error: "RATE_LIMITED" })],
      ["a 503", () => json(503, { error: "SERVICE_UNAVAILABLE" })],
      ["a 500", () => json(500, {})],
      ["a 302", () => new Response(null, { status: 302 })],
      [
        "a body that is not JSON",
        () => new Response("<html>", { status: 200 }),
      ],
      ["a body without allowed", () => json(200, { ttlSeconds: 60 })],
    ];

    it.each(unavailable)(
      "refuses a never-seen caller on %s",
      async (_name, failure) => {
        const { gate } = setup(() => failure());
        expect(await gate.check(ADDR)).toEqual({
          allowed: false,
          source: "refused",
        });
      },
    );

    it.each(unavailable)(
      "admits a caller allowed within the grace period on %s",
      async (_name, failure) => {
        const { gate, advance } = setup((call) =>
          call === 1 ? allowed(60) : failure(),
        );
        await gate.check(ADDR);
        advance(23 * 60 * 60 * 1000);
        expect(await gate.check(ADDR)).toEqual({
          allowed: true,
          source: "grace",
        });
      },
    );

    it("refuses once the last positive answer is older than the grace period", async () => {
      const { gate, advance } = setup((call) =>
        call === 1 ? allowed(60) : json(503, {}),
      );
      await gate.check(ADDR);
      advance(24 * 60 * 60 * 1000 + 1);
      expect(await gate.check(ADDR)).toEqual({
        allowed: false,
        source: "refused",
      });
    });

    it("honours a custom grace period", async () => {
      const { gate, advance } = setup(
        (call) => (call === 1 ? allowed(60) : json(503, {})),
        { graceMs: 120_000 },
      );
      await gate.check(ADDR);
      advance(120_001);
      expect((await gate.check(ADDR)).allowed).toBe(false);
    });

    it("does not revive a caller Vetra denied after their last positive answer", async () => {
      const { gate, advance } = setup((call) =>
        call === 1 ? allowed(1) : call === 2 ? denied() : json(503, {}),
      );
      await gate.check(ADDR);
      advance(1_000);
      expect((await gate.check(ADDR)).allowed).toBe(false);
      advance(15_000);
      expect(await gate.check(ADDR)).toEqual({
        allowed: false,
        source: "refused",
      });
    });

    it("does not cache a grace answer as fresh, but backs off 5 s per address", async () => {
      const { gate, fetch, advance } = setup((call) =>
        call === 1 ? allowed(1) : json(503, {}),
      );
      await gate.check(ADDR);
      advance(1_000);
      expect((await gate.check(ADDR)).source).toBe("grace");
      expect(fetch).toHaveBeenCalledTimes(2);

      advance(4_999);
      expect((await gate.check(ADDR)).source).toBe("grace");
      expect(fetch).toHaveBeenCalledTimes(2);

      advance(1);
      await gate.check(ADDR);
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it("goes back to Vetra's answer once it recovers", async () => {
      const { gate, advance } = setup((call) =>
        call === 1 ? allowed(1) : call === 2 ? json(503, {}) : denied(),
      );
      await gate.check(ADDR);
      advance(1_000);
      expect((await gate.check(ADDR)).source).toBe("grace");
      advance(5_000);
      expect(await gate.check(ADDR)).toEqual({
        allowed: false,
        source: "gate",
      });
    });

    it("aborts a request that takes longer than the timeout", async () => {
      vi.useFakeTimers();
      let signal: AbortSignal | undefined;
      const hanging = createVetraAccessGate({
        url: URL_,
        token: TOKEN,
        timeoutMs: 5_000,
        logger: stubLogger() as unknown as ILogger,
        fetch: ((_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            signal = init?.signal ?? undefined;
            signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          })) as unknown as typeof globalThis.fetch,
      });
      const verdict = hanging.check(ADDR);
      await vi.advanceTimersByTimeAsync(4_999);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(signal?.aborted).toBe(true);
      expect(await verdict).toEqual({ allowed: false, source: "refused" });
    });

    it("warns at most once a minute", async () => {
      const { gate, logger, advance } = setup(() => json(503, {}));
      await gate.check(ADDR);
      await gate.check(OTHER);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      advance(60_000);
      await gate.check(ADDR);
      expect(logger.warn).toHaveBeenCalledTimes(2);
    });
  });

  describe("when Vetra refuses the request (401 or 400)", () => {
    it.each([401, 400])(
      "refuses even a caller allowed a moment ago on a %s",
      async (status) => {
        const { gate, advance } = setup((call) =>
          call === 1 ? allowed(1) : json(status, { error: "x" }),
        );
        await gate.check(ADDR);
        advance(1_000);
        expect(await gate.check(ADDR)).toEqual({
          allowed: false,
          source: "refused",
        });
      },
    );

    it("drops the last positive answer, so a later outage does not revive it", async () => {
      const { gate, advance } = setup((call) =>
        call === 1 ? allowed(1) : call === 2 ? json(401, {}) : json(503, {}),
      );
      await gate.check(ADDR);
      advance(1_000);
      await gate.check(ADDR);
      advance(5_000);
      expect(await gate.check(ADDR)).toEqual({
        allowed: false,
        source: "refused",
      });
    });

    it("logs a 401 as an error, at most once a minute", async () => {
      const { gate, logger, advance } = setup(() => json(401, {}));
      await gate.check(ADDR);
      await gate.check(OTHER);
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(String(logger.error.mock.calls[0]![0])).toContain(
        "Vetra refused the gate token (401): only ADMINS can sign in",
      );
      advance(60_000);
      await gate.check(ADDR);
      expect(logger.error).toHaveBeenCalledTimes(2);
    });
  });

  it("evicts the oldest entries beyond maxEntries", async () => {
    const { gate, fetch } = setup(() => allowed(60), { maxEntries: 2 });
    const third = "0x3333333333333333333333333333333333333333";
    await gate.check(ADDR);
    await gate.check(OTHER);
    await gate.check(third);
    expect(fetch).toHaveBeenCalledTimes(3);

    await gate.check(OTHER);
    await gate.check(third);
    expect(fetch).toHaveBeenCalledTimes(3);
    await gate.check(ADDR);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("never throws, even when fetch throws synchronously", async () => {
    const { gate } = setup(() => {
      throw new Error("boom");
    });
    await expect(gate.check(ADDR)).resolves.toEqual({
      allowed: false,
      source: "refused",
    });
  });

  it("never writes the token into a log line", async () => {
    const responses = [
      () => Promise.reject(new TypeError(`fetch failed ${TOKEN}`)),
      () => json(401, {}),
      () => json(400, {}),
      () => json(503, {}),
    ];
    for (const respond of responses) {
      const { gate, logger } = setup(() => respond());
      await gate.check(ADDR);
      expect(loggedText(logger)).not.toContain(TOKEN);
      expect(loggedText(logger)).not.toContain(TOKEN.slice(4, 20));
    }
  });
});
