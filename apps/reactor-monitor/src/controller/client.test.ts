// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { TOKEN_HEADER, TOKEN_META_NAME, type Instance } from "./api.js";
import {
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
