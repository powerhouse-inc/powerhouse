import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { switchboardProxy } from "../src/utils/switchboard-proxy.js";

describe("switchboardProxy", () => {
  const rules = switchboardProxy("http://127.0.0.1:7540/graphql");

  it("sends each switchboard path to the target origin, keeping the browser's Host", () => {
    expect(Object.keys(rules)).toEqual([
      "^/graphql(/|$)",
      "^/d/",
      "^/attachments(/|$)",
      "^/mcp(/|$)",
      "^/api/",
    ]);
    for (const rule of Object.values(rules)) {
      expect(rule.target).toBe("http://127.0.0.1:7540");
      expect(rule.changeOrigin).toBe(false);
    }
  });

  it("upgrades websockets on graphql only", () => {
    expect(rules["^/graphql(/|$)"].ws).toBe(true);
    expect(rules["^/d/"].ws).toBeUndefined();
  });

  it("leaves a browser navigation under /d/ to Connect and proxies the rest", () => {
    const bypass = rules["^/d/"].bypass!;
    const req = (accept?: string) =>
      ({ url: "/d/sektar", headers: { accept } }) as IncomingMessage;
    expect(
      bypass(req("text/html,application/xhtml+xml"), {} as never, {} as never),
    ).toBe("/d/sektar");
    expect(bypass(req("application/json"), {} as never, {} as never)).toBe(
      undefined,
    );
    expect(bypass(req(undefined), {} as never, {} as never)).toBe(undefined);
    expect(rules["^/graphql(/|$)"].bypass).toBeUndefined();
  });

  it("matches the paths as the switchboard serves them", () => {
    const matches = (path: string) =>
      Object.keys(rules).some((key) => new RegExp(key).test(path));
    for (const p of [
      "/graphql",
      "/graphql/portle",
      "/d/x",
      "/attachments/a",
      "/mcp",
      "/api/p/r",
    ]) {
      expect(matches(p), p).toBe(true);
    }
    for (const p of ["/", "/graphqlx", "/dx", "/d", "/productivity", "/api"]) {
      expect(matches(p), p).toBe(false);
    }
  });
});
