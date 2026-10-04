import type { IReactorClient } from "@powerhousedao/reactor";
import { RoutingReactorClient } from "@powerhousedao/reactor-router";
import { describe, expect, it, vi } from "vitest";
import {
  buildMultiReactorClient,
  deriveSwitchboardGraphqlUrl,
  LOCAL_BACKEND_NAME,
  localReactorCapabilities,
  REMOTE_BACKEND_NAME,
  selectAppReactorClient,
} from "../../src/store/multi-reactor.js";
import { remoteSwitchboardCapabilities } from "../../src/store/remote-switchboard-backend.js";

// A stand-in for the in-browser reactor client. The default-path assertions only
// need object identity and "is not a RoutingReactorClient".
// A stand-in local client. withOwnershipGuard proxies `client.drives`, so the
// fake carries one; the default-path assertions only need object identity.
function fakeLocalClient(): IReactorClient {
  return { marker: "local", drives: {} } as unknown as IReactorClient;
}

describe("selectAppReactorClient (default path is unchanged)", () => {
  it("returns the single in-browser client verbatim when the flag is off", () => {
    const localClient = fakeLocalClient();
    const buildRouter = vi.fn(() => {
      throw new Error("the router must not be built when the flag is off");
    });

    const client = selectAppReactorClient({
      enabled: false,
      localClient,
      buildRouter,
    });

    // The exact same client, and provably NOT a router: flag-off Connect
    // constructs the same single client it always did.
    expect(client).toBe(localClient);
    expect(client).not.toBeInstanceOf(RoutingReactorClient);
    expect(buildRouter).not.toHaveBeenCalled();
  });

  it("returns the router when the flag is on", () => {
    const localClient = fakeLocalClient();
    const router = buildMultiReactorClient({
      localClient,
      localKind: "worker",
      remoteGraphqlUrl: "http://localhost:4001/graphql",
    });

    const client = selectAppReactorClient({
      enabled: true,
      localClient,
      buildRouter: () => router,
    });

    expect(client).toBe(router);
    expect(client).toBeInstanceOf(RoutingReactorClient);
  });

  it("falls back to the single client when the router cannot be built", () => {
    const localClient = fakeLocalClient();
    const client = selectAppReactorClient({
      enabled: true,
      localClient,
      buildRouter: () => undefined,
    });

    expect(client).toBe(localClient);
    expect(client).not.toBeInstanceOf(RoutingReactorClient);
  });
});

describe("buildMultiReactorClient", () => {
  it("builds a RoutingReactorClient over the local and remote backends", () => {
    const router = buildMultiReactorClient({
      localClient: fakeLocalClient(),
      localKind: "worker",
      remoteGraphqlUrl: "http://localhost:4001/graphql",
    });

    expect(router).toBeInstanceOf(RoutingReactorClient);
    const snapshot = router.describeRouting();
    expect(snapshot.backends).toEqual([
      LOCAL_BACKEND_NAME,
      REMOTE_BACKEND_NAME,
    ]);
  });
});

describe("deriveSwitchboardGraphqlUrl", () => {
  it("derives the reactor GraphQL endpoint from a drive URL origin", () => {
    expect(deriveSwitchboardGraphqlUrl("http://localhost:4001/d/abc")).toBe(
      "http://localhost:4001/graphql",
    );
    expect(
      deriveSwitchboardGraphqlUrl("https://switchboard.example.com/d/xyz"),
    ).toBe("https://switchboard.example.com/graphql");
  });

  it("preserves a reverse-proxy path prefix instead of collapsing to the origin", () => {
    // A Switchboard mounted under /team-a: the reactor GraphQL endpoint lives
    // under the same prefix, so <origin>/graphql would 404.
    expect(deriveSwitchboardGraphqlUrl("https://host/team-a/d/slug")).toBe(
      "https://host/team-a/graphql",
    );
  });

  it("returns undefined for an unparseable URL", () => {
    expect(deriveSwitchboardGraphqlUrl("not a url")).toBeUndefined();
  });
});

describe("backend capabilities", () => {
  it("a worker local reactor cannot host processors and is reached over rpc", () => {
    const caps = localReactorCapabilities("worker");
    expect(caps.hosting).toBe("worker");
    expect(caps.processors).toBe(false);
    expect(caps.inspection).toBe("rpc");
    expect(caps.storage).toEqual({ kind: "idb", durable: true });
    expect(caps.syncChannels).toContain("gql");
    expect(caps.syncChannels).toContain("local");
    expect(caps.selfHeal).toBe(true);
    expect(caps.workflows).toBe(false);
  });

  it("a main-thread local reactor can host processors and is reached directly", () => {
    const caps = localReactorCapabilities("browser");
    expect(caps.hosting).toBe("in-process");
    expect(caps.processors).toBe(true);
    expect(caps.inspection).toBe("direct");
  });

  it("the remote Switchboard backend is a durable remote polling reactor", () => {
    const caps = remoteSwitchboardCapabilities();
    expect(caps.hosting).toBe("remote");
    expect(caps.storage).toEqual({ kind: "remote", durable: true });
    expect(caps.inspection).toBe("none");
    expect(caps.syncChannels).toEqual(["polling"]);
    expect(caps.selfHeal).toBe(false);
  });
});
