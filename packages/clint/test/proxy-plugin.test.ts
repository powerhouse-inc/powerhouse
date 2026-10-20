import { describe, expect, it } from "vitest";
import {
  buildProxyRouteTable,
  declaredProxyPluginConfigSchema,
  proxyPluginConfigSchema,
  type ProxyPluginConfig,
} from "../src/runners/proxy-plugin.js";

// R5 — the proxy route table is pure: each resolved upstream (+ path) passes
// through. Member addresses come from output tokens resolved before the
// runner, never from declared ports.
describe("buildProxyRouteTable", () => {
  it("passes each upstream through (trailing slash trimmed + path)", () => {
    const cfg: ProxyPluginConfig = {
      port: 8490,
      routes: {
        "/graphql": { upstream: "http://127.0.0.1:7064", ws: true },
        "/ext": { upstream: "https://api.x.com/", path: "/v2" },
      },
    };
    expect(buildProxyRouteTable(cfg)).toEqual([
      {
        prefix: "/graphql",
        upstream: "http://127.0.0.1:7064",
        ws: true,
        source: "upstream:http://127.0.0.1:7064",
      },
      {
        prefix: "/ext",
        upstream: "https://api.x.com/v2",
        ws: false,
        source: "upstream:https://api.x.com/",
      },
    ]);
  });
});

describe("proxy config schemas", () => {
  const assistantOrigin = {
    $output: { host: "assistant", path: ["origin"] },
  };

  it("declared form: an upstream may be an output token", () => {
    expect(
      declaredProxyPluginConfigSchema.safeParse({
        port: 8490,
        routes: { "/agent": { upstream: assistantOrigin, path: "/v1" } },
      }).success,
    ).toBe(true);
  });

  it("resolved form: upstream is a URL, tokens are rejected", () => {
    expect(
      proxyPluginConfigSchema.safeParse({
        port: 8490,
        routes: { "/agent": { upstream: assistantOrigin } },
      }).success,
    ).toBe(false);
    expect(
      proxyPluginConfigSchema.safeParse({
        port: 8490,
        routes: { "/agent": { upstream: "assistant" } },
      }).success,
    ).toBe(false);
  });

  it("rejects the removed member reference naming the token form", () => {
    for (const schema of [
      proxyPluginConfigSchema,
      declaredProxyPluginConfigSchema,
    ]) {
      const result = schema.safeParse({
        port: 8490,
        routes: { "/agent": { member: "assistant", path: "/v1" } },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues).toContainEqual(
        expect.objectContaining({
          path: ["routes", "/agent"],
          message: expect.stringMatching(
            /`member` was removed; point `upstream` at the member host's output: .*\{ \$output: \{ host: "<member's host>", member: "assistant", path: \["origin"\] \} \}/,
          ) as unknown,
        }),
      );
    }
  });
});
