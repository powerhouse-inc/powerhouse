import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  declaredHostSchema,
  hostSchema,
  outputsSchema,
  run,
  verbs,
  build,
  type ProxyHandle,
} from "../src/runners/proxy-runner.js";

// A7 — the proxy as a compound member: the host schemas, and the verb over a
// real upstream (in-process sockets only; the stack test covers the
// processes).

const ctx = { projectRoot: process.cwd(), env: {}, verb: "run" };

const host = (upstream: unknown) => ({
  name: "proxy",
  runner: { module: "@powerhousedao/clint/proxy-runner", port: 0 },
  config: { routes: { "/up": { upstream } } },
});

describe("proxy-runner host schemas", () => {
  const token = { $output: { host: "switchboard", path: ["origin"] } };

  it("declared form: an upstream may be an output token", () => {
    expect(declaredHostSchema.safeParse(host(token)).success).toBe(true);
  });

  it("resolved form: an upstream is a URL, a token is rejected", () => {
    expect(hostSchema.safeParse(host("http://127.0.0.1:7064")).success).toBe(
      true,
    );
    expect(hostSchema.safeParse(host(token)).success).toBe(false);
  });

  it("rejects an unknown route key, a missing config and an unknown runner key", () => {
    const base = host("http://127.0.0.1:7064");
    expect(
      hostSchema.safeParse({
        ...base,
        config: {
          routes: { "/up": { upstream: "http://x.test", member: "a" } },
        },
      }).success,
    ).toBe(false);
    expect(
      hostSchema.safeParse({ name: "proxy", runner: base.runner }).success,
    ).toBe(false);
    expect(
      hostSchema.safeParse({
        ...base,
        runner: { ...base.runner, lifecycle: "detached" },
      }).success,
    ).toBe(false);
  });

  it("outputs are the proxy's address; every verb a compound forwards is there", () => {
    expect(outputsSchema.safeParse({ url: "http://localhost:1" }).success).toBe(
      true,
    );
    expect(outputsSchema.safeParse({}).success).toBe(false);
    expect([...verbs].toSorted()).toEqual(["build", "dev", "run", "serve"]);
  });
});

describe("proxy-runner run", () => {
  let upstream: Server | undefined;
  let handle: ProxyHandle | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await handle?.shutdown();
    handle = undefined;
    const server = upstream;
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    upstream = undefined;
  });

  async function startUpstream(): Promise<string> {
    const server = createServer((req, res) => res.end(`saw ${req.url}`));
    upstream = server;
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it("answers on its address through a path route, and stops with its shutdown", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const origin = await startUpstream();
    const parsed = hostSchema.parse({
      ...host(origin),
      runner: {
        module: "@powerhousedao/clint/proxy-runner",
        port: 0,
        host: "127.0.0.1",
      },
    });
    handle = await run(parsed, ctx);
    await handle.ready;
    const { url } = outputsSchema.parse(handle.outputs);
    expect(url).toMatch(/^http:\/\/[^/]+:\d+$/);

    const answer = await fetch(`${url}/up/hello`);
    expect(await answer.text()).toBe("saw /hello");
    expect((await fetch(`${url}/elsewhere`)).status).toBe(404);

    await handle.shutdown();
    await handle.shutdown(); // idempotent
    await expect(fetch(`${url}/up/hello`)).rejects.toThrow();
  });

  it("build does nothing", async () => {
    await expect(build()).resolves.toBeUndefined();
  });
});
