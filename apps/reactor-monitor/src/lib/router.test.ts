import type { ManagedReactor } from "@powerhousedao/reactor-monitor";
import { describe, expect, it } from "vitest";
import { bearerOf, buildRoutingClient, routableBackend } from "./router.js";

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
