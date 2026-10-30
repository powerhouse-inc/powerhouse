import type * as GraphQLClient from "@powerhousedao/reactor-browser/graphql-client";
import type { ManagedReactor } from "@powerhousedao/reactor-monitor";
import { describe, expect, it, vi } from "vitest";
import { bearerOf, buildRoutingClient, routableBackend } from "./router.js";

const descriptors = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock(
  "@powerhousedao/reactor-browser/graphql-client",
  async (importOriginal) => {
    const actual = await importOriginal<typeof GraphQLClient>();
    return {
      ...actual,
      createSwitchboardBackend: (
        descriptor: Parameters<typeof actual.createSwitchboardBackend>[0],
      ) => {
        descriptors.push({ ...descriptor });
        return actual.createSwitchboardBackend(descriptor);
      },
    };
  },
);

const URL_ = "http://sb.test/graphql";

/** A remote handle whose switchboard answers through `fetch`. */
function remoteHandle(
  fetch: typeof globalThis.fetch,
  headers?: () => Record<string, string>,
): ManagedReactor {
  return {
    name: "sb-1",
    kind: "remote",
    url: URL_,
    reach: { hosting: "remote", inspection: "rpc" },
    ...(headers ? { headers } : {}),
    fetch,
  } as unknown as ManagedReactor;
}

describe("bearerOf", () => {
  it("reads the bearer of an Authorization header in any case", async () => {
    expect(
      await bearerOf({ headers: () => ({ authorization: "Bearer abc" }) }),
    ).toBe("abc");
    expect(await bearerOf({ headers: () => ({}) })).toBeUndefined();
    expect(await bearerOf({})).toBeUndefined();
  });
});

describe("routableBackend for a remote handle", () => {
  it("routes over the switchboard's GraphQL with the inspection bearer", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({
        url: String(input instanceof Request ? input.url : input),
        auth: new Headers(init?.headers).get("authorization"),
      });
      return Promise.resolve(
        new Response(JSON.stringify({ data: { documentServed: true } }), {
          headers: { "content-type": "application/json" },
        }),
      );
    }) as typeof globalThis.fetch;
    const handle = routableBackend(
      remoteHandle(fetch, () => ({ Authorization: "Bearer t0k" })),
    );
    expect(handle.config.name).toBe("sb-1");
    expect(handle.config.reach.hosting).toBe("remote");
    await handle.config.backend.isServed("drive-1").catch(() => undefined);
    expect(seen.at(0)).toEqual({ url: URL_, auth: "Bearer t0k" });
    handle.dispose();
  });

  it("builds a router whose backends include the switchboard", () => {
    const fetch = (() =>
      Promise.reject(new Error("offline"))) as typeof globalThis.fetch;
    const built = buildRoutingClient([
      remoteHandle(fetch),
      { ...(remoteHandle(fetch) as object), name: "sb-2" } as ManagedReactor,
    ]);
    expect(built.client.describeRouting().backends).toEqual(["sb-1", "sb-2"]);
    built.dispose();
  });
});

describe("a remote's connection settings", () => {
  const offline = (() =>
    Promise.reject(new Error("offline"))) as typeof globalThis.fetch;

  async function failures(
    handle: ReturnType<typeof routableBackend>,
    count: number,
  ) {
    for (let index = 0; index < count; index++) {
      await handle.config.backend.isServed("drive-1").catch(() => undefined);
    }
    return handle.config.backend.health?.();
  }

  it("keeps the switchboard defaults and live updates off when built by hand", async () => {
    descriptors.length = 0;
    const handle = routableBackend(remoteHandle(offline));
    expect(descriptors.at(-1)).not.toHaveProperty("requestTimeoutMs");
    expect(descriptors.at(-1)).not.toHaveProperty("breaker");
    expect(descriptors.at(-1)?.realtime).toBe(false);
    expect(await failures(handle, 1)).toBe("up");
    handle.dispose();
  });

  it("takes the host config's wait, breaker and live updates", async () => {
    descriptors.length = 0;
    const handle = routableBackend(remoteHandle(offline), {
      requestTimeoutMs: 10_000,
      breaker: { failures: 1, openMs: 60_000 },
      realtime: true,
    });
    expect(descriptors.at(-1)).toMatchObject({
      requestTimeoutMs: 10_000,
      breaker: { failures: 1, openMs: 60_000 },
      realtime: true,
    });
    expect(await failures(handle, 1)).toBe("down");
    handle.dispose();
  });

  it("never stops trying with breaker false", async () => {
    const handle = routableBackend(remoteHandle(offline), { breaker: false });
    expect(await failures(handle, 5)).toBe("up");
    handle.dispose();
  });

  it("applies a reactor's settings by name when building a router", () => {
    descriptors.length = 0;
    const built = buildRoutingClient(
      [
        remoteHandle(offline),
        {
          ...(remoteHandle(offline) as object),
          name: "sb-2",
        } as ManagedReactor,
      ],
      {},
      { "sb-2": { requestTimeoutMs: 120_000 } },
    );
    expect(descriptors.map((entry) => entry.requestTimeoutMs)).toEqual([
      undefined,
      120_000,
    ]);
    built.dispose();
  });
});
