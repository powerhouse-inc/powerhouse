// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { TOKEN_HEADER, TOKEN_META_NAME, type Instance } from "./api.js";
import {
  backoffMs,
  ControllerRequestError,
  controllerFromDocument,
  createControllerClient,
} from "./client.js";

const instance: Instance = {
  id: "i1",
  project: "/p",
  host: "sb",
  status: "running",
  startedAt: "2026-10-26T00:00:00.000Z",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("controller client", () => {
  it("sends the token to a relative controller path and parses the reply", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const client = createControllerClient({
      token: "t0k",
      fetch: (url, init) => {
        calls.push({ url: url as string, init: init ?? {} });
        return Promise.resolve(json(200, { instances: [instance] }));
      },
    });
    await expect(client.list()).resolves.toEqual([instance]);
    expect(calls[0].url).toBe("/__ph-monitor/instances");
    expect(
      (calls[0].init.headers as Record<string, string>)[TOKEN_HEADER],
    ).toBe("t0k");
  });

  it("treats a 404 on stop as already gone", async () => {
    const client = createControllerClient({
      token: "t",
      fetch: () =>
        Promise.resolve(
          json(404, { error: { code: "not_found", message: "No instance." } }),
        ),
    });
    await expect(client.stop("i1")).resolves.toBeUndefined();
    await expect(client.get("i1")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("carries env_denied and check_failed details", async () => {
    const issue = { stage: "resolve", file: "f", path: "a.b", message: "m" };
    const replies = [
      json(400, {
        error: { code: "env_denied", message: "Not allowed: NODE_OPTIONS" },
      }),
      json(422, {
        error: { code: "check_failed", message: "failed", issues: [issue] },
      }),
    ];
    const client = createControllerClient({
      token: "t",
      fetch: () => Promise.resolve(replies.shift()!),
    });
    const request = { project: "/p", host: "sb" };
    await expect(client.start(request)).rejects.toMatchObject({
      code: "env_denied",
      status: 400,
      message: "Not allowed: NODE_OPTIONS",
    });
    await expect(client.start(request)).rejects.toMatchObject({
      code: "check_failed",
      issues: [issue],
    });
  });

  it("calls the draft routes and carries refused setters and rule issues", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const digest = "a".repeat(64);
    const envelope = {
      format: "ph-host-export",
      version: 1,
      project: { name: "p", root: "/p" },
      name: "sb",
      host: { name: "sb", runner: { module: "m" } },
      members: {},
    };
    const refused = { path: "host.runner.module", reason: "no" };
    const ruleIssue = { rule: "storage", path: "host", message: "m" };
    const replies = [
      json(200, { postgres: false, controller: true }),
      json(200, { export: envelope, baseDigest: digest }),
      json(200, { ruleIssues: [ruleIssue], issues: [] }),
      json(202, { ...instance, source: { project: "/src", host: "sb" } }),
      json(400, {
        error: { code: "setter_denied", message: "m", setters: [refused] },
      }),
      json(422, {
        error: { code: "check_failed", message: "m", ruleIssues: [ruleIssue] },
      }),
    ];
    const client = createControllerClient({
      token: "t",
      fetch: (url, init) => {
        calls.push({ url: url as string, init: init ?? {} });
        return Promise.resolve(replies.shift()!);
      },
    });
    const draft = {
      project: "/p",
      host: "sb",
      baseDigest: digest,
      setters: [],
    };
    await expect(client.capabilities()).resolves.toEqual({
      postgres: false,
      controller: true,
      renownSource: "remote",
    });
    await expect(client.exportHost("/p a", "sb")).resolves.toMatchObject({
      baseDigest: digest,
    });
    await expect(client.checkDraft(draft)).resolves.toEqual({
      ruleIssues: [ruleIssue],
      issues: [],
    });
    await expect(client.startDraft(draft)).resolves.toMatchObject({
      source: { project: "/src" },
    });
    await expect(client.startDraft(draft)).rejects.toMatchObject({
      code: "setter_denied",
      setters: [refused],
    });
    await expect(client.startDraft(draft)).rejects.toMatchObject({
      code: "check_failed",
      ruleIssues: [ruleIssue],
    });
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      "GET /__ph-monitor/capabilities",
      "GET /__ph-monitor/export?project=%2Fp+a&host=sb",
      "POST /__ph-monitor/drafts/check",
      "POST /__ph-monitor/drafts",
      "POST /__ph-monitor/drafts",
      "POST /__ph-monitor/drafts",
    ]);
    expect(JSON.parse(calls[2].init.body as string)).toEqual(draft);
  });

  it("maps a refused token and an unreachable controller", async () => {
    const refused = createControllerClient({
      token: "t",
      fetch: () =>
        Promise.resolve(
          json(401, { error: { code: "bad_token", message: "Wrong token." } }),
        ),
    });
    await expect(refused.list()).rejects.toThrow(/reload the page/);
    const down = createControllerClient({
      token: "t",
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    const error = await down.list().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ControllerRequestError);
    expect((error as ControllerRequestError).code).toBe("network");
  });

  it("backs off by doubling up to 30 s", () => {
    expect([0, 1, 2, 3, 4, 10].map((n) => backoffMs(3000, n))).toEqual([
      3000, 6000, 12000, 24000, 30000, 30000,
    ]);
  });

  it("exists only when the page carries the controller meta tag", () => {
    expect(controllerFromDocument(document)).toBeUndefined();
    const meta = document.createElement("meta");
    meta.name = TOKEN_META_NAME;
    meta.content = "abc";
    document.head.append(meta);
    try {
      expect(controllerFromDocument(document)).toBeDefined();
    } finally {
      meta.remove();
    }
  });
});
