import { describe, expect, it } from "vitest";
import {
  buildProxyRouteTable,
  type MemberEndpoints,
  type ProxyPluginConfig,
} from "../src/runners/proxy-plugin.js";

// R5 — the proxy route table is pure: member refs resolve through member
// endpoints, explicit upstreams pass through, unresolvable refs fail loudly.
const members: MemberEndpoints = {
  switchboard: { host: "0.0.0.0", port: 7064 },
  assistant: { host: "127.0.0.1", port: 4910 },
};

describe("buildProxyRouteTable", () => {
  it("resolves a member ref to its host:port (0.0.0.0 -> loopback) + path", () => {
    const cfg: ProxyPluginConfig = {
      port: 8490,
      routes: {
        "/graphql": { member: "switchboard", ws: true },
        "/agents/assistant": { member: "assistant", path: "/v1" },
      },
    };
    const table = buildProxyRouteTable(cfg, members);
    expect(table).toEqual([
      {
        prefix: "/graphql",
        upstream: "http://127.0.0.1:7064",
        ws: true,
        source: "member:switchboard",
      },
      {
        prefix: "/agents/assistant",
        upstream: "http://127.0.0.1:4910/v1",
        ws: false,
        source: "member:assistant",
      },
    ]);
  });

  it("passes an explicit upstream through (trailing slash trimmed + path)", () => {
    const table = buildProxyRouteTable(
      {
        port: 1,
        routes: { "/ext": { upstream: "https://api.x.com/", path: "/v2" } },
      },
      members,
    );
    expect(table[0].upstream).toBe("https://api.x.com/v2");
    expect(table[0].source).toBe("upstream:https://api.x.com/");
  });

  it("throws naming the member when its endpoint is unknown", () => {
    expect(() =>
      buildProxyRouteTable(
        { port: 1, routes: { "/x": { member: "ghost" } } },
        members,
      ),
    ).toThrow(/member "ghost"/);
  });

  it("throws when a route names neither member nor upstream", () => {
    expect(() =>
      buildProxyRouteTable({ port: 1, routes: { "/x": {} } }, members),
    ).toThrow(/neither a member nor an upstream/);
  });
});
