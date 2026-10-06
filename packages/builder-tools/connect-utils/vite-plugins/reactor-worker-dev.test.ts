import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as reactorWorkerBuild from "../reactor-worker-build.js";
import { prebuildReactorWorker } from "../reactor-worker-build.js";
import { reactorWorkerDevPlugin } from "./reactor-worker-dev.js";

vi.mock("../reactor-worker-build.js", async (importOriginal) => ({
  ...(await importOriginal<typeof reactorWorkerBuild>()),
  prebuildReactorWorker: vi.fn(),
}));

type Middleware = (
  req: { url?: string; method?: string },
  res: Writable,
  next: () => void,
) => void;

type Served = {
  status: number;
  headers: Record<string, string>;
  body: string;
  passed: boolean;
};

function middlewareFor(base: string): Middleware {
  const plugin = reactorWorkerDevPlugin("/project");
  let middleware: Middleware | undefined;
  (plugin.configResolved as (config: { base: string }) => void)({ base });
  (plugin.configureServer as (server: unknown) => void)({
    middlewares: { use: (fn: Middleware) => (middleware = fn) },
  });
  if (!middleware) throw new Error("plugin registered no middleware");
  return middleware;
}

function serve(middleware: Middleware, url: string): Promise<Served> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const headers: Record<string, string> = {};
    const res = new Writable({
      write(chunk: Buffer, _enc, cb) {
        chunks.push(chunk);
        cb();
      },
    }) as Writable & {
      statusCode: number;
      headersSent: boolean;
      setHeader: (k: string, v: string) => void;
    };
    res.statusCode = 200;
    res.headersSent = false;
    res.setHeader = (k, v) => {
      headers[k.toLowerCase()] = v;
    };
    const done = (passed: boolean) =>
      resolve({
        status: res.statusCode,
        headers,
        body: Buffer.concat(chunks).toString("utf8"),
        passed,
      });
    res.on("finish", () => done(false));
    middleware({ url, method: "GET" }, res, () => done(true));
  });
}

describe("reactorWorkerDevPlugin", () => {
  let outDir: string;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), "ph-reactor-worker-dev-"));
    writeFileSync(
      join(outDir, "worker-meta.json"),
      JSON.stringify({ sourceDigest: "abc123", nodeEnv: "development" }),
    );
    vi.mocked(prebuildReactorWorker).mockResolvedValue({
      outDir,
      entry: "reactor.worker.js",
      sourceDigest: "abc123",
    });
  });

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
    vi.mocked(prebuildReactorWorker).mockReset();
  });

  it("serves worker-meta.json as uncached JSON carrying the digest", async () => {
    const served = await serve(
      middlewareFor("/app/"),
      "/app/__reactor_worker__/worker-meta.json?x=1",
    );

    expect(served.passed).toBe(false);
    expect(served.headers["content-type"]).toBe("application/json");
    expect(served.headers["cache-control"]).toBe("no-cache");
    expect(JSON.parse(served.body)).toMatchObject({ sourceDigest: "abc123" });
    expect(prebuildReactorWorker).toHaveBeenCalledOnce();
  });

  it("answers 503 text when the build fails, so the tab sees no JSON", async () => {
    vi.mocked(prebuildReactorWorker).mockResolvedValue(null);

    const served = await serve(
      middlewareFor("/"),
      "/__reactor_worker__/worker-meta.json",
    );

    expect(served.status).toBe(503);
    expect(served.headers["content-type"]).toBe("text/plain");
  });
});
