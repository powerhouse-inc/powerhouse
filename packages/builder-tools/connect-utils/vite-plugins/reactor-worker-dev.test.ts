import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as reactorWorkerBuild from "../reactor-worker-build.js";
import { prebuildReactorWorker } from "../reactor-worker-build.js";
import type * as workerPackagesBuild from "../worker-packages-build.js";
import { prebuildWorkerPackages } from "../worker-packages-build.js";
import { reactorWorkerDevPlugin } from "./reactor-worker-dev.js";

vi.mock("../reactor-worker-build.js", async (importOriginal) => ({
  ...(await importOriginal<typeof reactorWorkerBuild>()),
  prebuildReactorWorker: vi.fn(),
}));

vi.mock("../worker-packages-build.js", async (importOriginal) => ({
  ...(await importOriginal<typeof workerPackagesBuild>()),
  prebuildWorkerPackages: vi.fn(),
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

function middlewareFor(
  base: string,
  projectRoot = "/project",
  options: Parameters<typeof reactorWorkerDevPlugin>[1] = {},
): Middleware {
  const plugin = reactorWorkerDevPlugin(projectRoot, options);
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
      vendorImports: {},
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

  describe("the local packages' model bundles", () => {
    let projectRoot: string;

    beforeEach(() => {
      projectRoot = mkdtempSync(join(tmpdir(), "ph-reactor-worker-dev-pkg-"));
      writeFileSync(
        join(projectRoot, "package.json"),
        JSON.stringify({ name: "my-project" }),
      );
    });

    afterEach(() => {
      rmSync(projectRoot, { recursive: true, force: true });
      vi.mocked(prebuildWorkerPackages).mockReset();
    });

    const packages = [
      { packageName: "@x/lib", provider: "local" },
      { packageName: "my-project", provider: "local" },
      { packageName: "@x/remote", provider: "registry" },
    ];

    it("serves the manifest ph connect build's prebuild writes, for the configured local packages but the project", async () => {
      const manifest = [{ name: "@x/lib", file: "x-lib.js" }];
      vi.mocked(prebuildWorkerPackages).mockImplementation((options) => {
        mkdirSync(options.outDir, { recursive: true });
        writeFileSync(
          join(options.outDir, "manifest.json"),
          JSON.stringify(manifest),
        );
        return Promise.resolve(manifest);
      });

      const served = await serve(
        middlewareFor("/", projectRoot, { packages }),
        "/__reactor_worker__/packages/manifest.json",
      );

      expect(served.status).toBe(200);
      expect(served.headers["content-type"]).toBe("application/json");
      expect(JSON.parse(served.body)).toEqual(manifest);
      expect(prebuildWorkerPackages).toHaveBeenCalledWith(
        expect.objectContaining({
          dirname: projectRoot,
          packages: ["@x/lib"],
          nodeEnv: "development",
        }),
      );
      expect(prebuildReactorWorker).not.toHaveBeenCalled();
    });

    it("answers 404 when no local package ships models", async () => {
      vi.mocked(prebuildWorkerPackages).mockResolvedValue([]);

      const served = await serve(
        middlewareFor("/", projectRoot, { packages }),
        "/__reactor_worker__/packages/manifest.json",
      );

      expect(served.status).toBe(404);
      expect(served.passed).toBe(false);
    });
  });
});
